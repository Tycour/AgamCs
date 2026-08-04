const WORKER_RELEASE = '2026-08-04-rc10';
const SCORE_REFERENCE_URL = `data/score-reference.json?v=${WORKER_RELEASE}`;
const ACCESSIBILITY_REFERENCE_URL = `data/accessibility-reference.json?v=${WORKER_RELEASE}`;
const HASH_ARRAYS = ['Cs', 'snp_density', 'stack', 'status'];
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const MAX_CONCURRENT_RANGE_REQUESTS = 4;
const MAX_RANGE_ATTEMPTS = 6;
const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const cache = new Map();
const referencePromises = new Map();
const rangeQueue = [];
let cacheBytes = 0;
let activeRangeRequests = 0;

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withRangeSlot(task) {
  if (activeRangeRequests >= MAX_CONCURRENT_RANGE_REQUESTS) {
    await new Promise((resolve) => rangeQueue.push(resolve));
  }
  activeRangeRequests += 1;
  try {
    return await task();
  } finally {
    activeRangeRequests -= 1;
    const next = rangeQueue.shift();
    if (next) next();
  }
}

function retryDelay(response, attempt) {
  const exponential = 500 * (2 ** attempt);
  const retryAfter = Number(response?.headers?.get?.('Retry-After'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.max(exponential, Math.min(15_000, retryAfter * 1_000));
  }
  return exponential;
}

async function fetchRange(source, offset, length, metrics) {
  let lastError;
  for (let attempt = 0; attempt < MAX_RANGE_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetch(source, {
        headers: { Range: `bytes=${offset}-${offset + length - 1}` },
        cache: 'no-store',
      });
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RANGE_ATTEMPTS - 1) throw error;
      metrics.retries += 1;
      await wait(500 * (2 ** attempt));
      continue;
    }
    if (response.status === 206) return response;
    if (!TRANSIENT_HTTP_STATUSES.has(response.status) || attempt === MAX_RANGE_ATTEMPTS - 1) {
      return response;
    }
    metrics.retries += 1;
    await wait(retryDelay(response, attempt));
  }
  throw lastError || new Error('The data range request failed without a response.');
}

function parseMetadata(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

async function loadReference(url) {
  if (!referencePromises.has(url)) {
    referencePromises.set(url, fetch(url).then((response) => {
      if (!response.ok) throw new Error(`Reference index request failed (${response.status}).`);
      return response.json();
    }));
  }
  return referencePromises.get(url);
}

async function inflate(buffer) {
  if (!globalThis.DecompressionStream) {
    throw new Error('This browser does not provide the native deflate decoder required by the live reader.');
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Response(stream).arrayBuffer();
}

function usesDeflate(metadata) {
  const filters = metadata.filters || [];
  const unsupported = filters.filter((filter) => !['zlib', 'shuffle'].includes(filter.id));
  if (unsupported.length) {
    throw new Error(`Unsupported HDF5 filter: ${unsupported.map((filter) => filter.id).join(', ')}.`);
  }
  const shuffle = filters.find((filter) => filter.id === 'shuffle');
  if (shuffle && shuffle.elementsize !== 1) {
    throw new Error(`Unsupported shuffle element size ${shuffle.elementsize}.`);
  }
  return filters.some((filter) => filter.id === 'zlib');
}

async function decodeChunk(compressed, metadata) {
  return usesDeflate(metadata) ? inflate(compressed) : compressed;
}

async function readChunk(reference, key, expectedBytes, metadata, metrics) {
  const entry = reference.refs[key];
  if (!Array.isArray(entry) || entry.length !== 3) {
    throw new Error(`The reference index has no byte range for ${key}.`);
  }
  const [sourceTemplate, offset, length] = entry;
  const source = sourceTemplate === '{{source}}' ? reference.templates.source : sourceTemplate;
  const cacheKey = `${source}|${key}`;
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    cache.delete(cacheKey);
    cache.set(cacheKey, cached);
    metrics.cacheHits += 1;
    return cached;
  }

  const started = performance.now();
  const response = await withRangeSlot(() => fetchRange(source, offset, length, metrics));
  if (response.status !== 206) {
    if (response.status === 200) {
      throw new Error('The data host returned HTTP 200, not a partial-content response. Full-file downloads are refused.');
    }
    throw new Error(`The data host returned HTTP ${response.status} after transient range-request retries.`);
  }
  const compressed = await response.arrayBuffer();
  if (compressed.byteLength !== length) {
    throw new Error(`Range ${key} returned ${compressed.byteLength} bytes; expected ${length}.`);
  }
  const decoded = await decodeChunk(compressed, metadata);
  if (decoded.byteLength !== expectedBytes) {
    throw new Error(`Chunk ${key} decoded to ${decoded.byteLength} bytes; expected ${expectedBytes}.`);
  }
  metrics.requests += 1;
  metrics.transferredBytes += compressed.byteLength;
  metrics.networkAndDecodeMs += performance.now() - started;
  while (cache.size && cacheBytes + decoded.byteLength > MAX_CACHE_BYTES) {
    const oldestKey = cache.keys().next().value;
    cacheBytes -= cache.get(oldestKey).byteLength;
    cache.delete(oldestKey);
  }
  cache.set(cacheKey, decoded);
  cacheBytes += decoded.byteLength;
  return decoded;
}

function validateBounds(metadata, chromosome, end, lengthAxis) {
  const chromosomeLength = metadata.shape[lengthAxis];
  if (end > chromosomeLength) {
    throw new Error(`End coordinate ${end.toLocaleString()} exceeds ${chromosome} length ${chromosomeLength.toLocaleString()}.`);
  }
}

async function readScoreVector(reference, chromosome, name, start, end, metrics) {
  const path = `${chromosome}/${name}`;
  const metadataValue = reference.refs[`${path}/.zarray`];
  if (!metadataValue) throw new Error(`Array ${name} is unavailable for chromosome ${chromosome}.`);
  const metadata = parseMetadata(metadataValue);
  if (metadata.dtype !== '<f4' || metadata.shape[0] !== 1 || metadata.chunks[0] !== 1) {
    throw new Error(`Array ${path} does not have the expected little-endian float32 layout.`);
  }
  validateBounds(metadata, chromosome, end, 1);

  const startIndex = start - 1;
  const endIndex = end;
  const chunkBases = metadata.chunks[1];
  const firstChunk = Math.floor(startIndex / chunkBases);
  const lastChunk = Math.floor((endIndex - 1) / chunkBases);
  const output = new Float32Array(end - start + 1);
  let outputOffset = 0;

  for (let chunkIndex = firstChunk; chunkIndex <= lastChunk; chunkIndex += 1) {
    const chunkStart = chunkIndex * chunkBases;
    const chunkLength = Math.min(chunkBases, metadata.shape[1] - chunkStart);
    const key = `${path}/0.${chunkIndex}`;
    const decoded = await readChunk(reference, key, chunkBases * 4, metadata, metrics);
    const chunk = new Float32Array(decoded);
    const sliceStart = Math.max(startIndex, chunkStart) - chunkStart;
    const sliceEnd = Math.min(endIndex, chunkStart + chunkLength) - chunkStart;
    const selected = chunk.subarray(sliceStart, sliceEnd);
    output.set(selected, outputOffset);
    outputOffset += selected.length;
  }
  return output;
}

async function readStackRow(reference, path, metadata, rowIndex, startIndex, endIndex, metrics) {
  const chunkBases = metadata.chunks[1];
  const firstChunk = Math.floor(startIndex / chunkBases);
  const lastChunk = Math.floor((endIndex - 1) / chunkBases);
  const output = new Float32Array(endIndex - startIndex);
  let outputOffset = 0;
  for (let chunkIndex = firstChunk; chunkIndex <= lastChunk; chunkIndex += 1) {
    const chunkStart = chunkIndex * chunkBases;
    const chunkLength = Math.min(chunkBases, metadata.shape[1] - chunkStart);
    const key = `${path}/${rowIndex}.${chunkIndex}`;
    const decoded = await readChunk(reference, key, chunkBases * 4, metadata, metrics);
    const chunk = new Float32Array(decoded);
    const sliceStart = Math.max(startIndex, chunkStart) - chunkStart;
    const sliceEnd = Math.min(endIndex, chunkStart + chunkLength) - chunkStart;
    const selected = chunk.subarray(sliceStart, sliceEnd);
    output.set(selected, outputOffset);
    outputOffset += selected.length;
  }
  return output;
}

async function readStack(reference, chromosome, start, end, metrics) {
  const path = `${chromosome}/stack`;
  const metadata = parseMetadata(reference.refs[`${path}/.zarray`]);
  const attributes = parseMetadata(reference.refs[`${path}/.zattrs`]);
  if (!metadata || metadata.dtype !== '<f4' || metadata.chunks[0] !== 1) {
    throw new Error(`Array ${path} does not have the expected row-chunked float32 layout.`);
  }
  if (!Array.isArray(attributes?.rows) || attributes.rows.length !== metadata.shape[0]) {
    throw new Error(`Array ${path} is missing its species-row metadata.`);
  }
  validateBounds(metadata, chromosome, end, 1);
  const startIndex = start - 1;
  const endIndex = end;
  const rows = await Promise.all(Array.from(
    { length: metadata.shape[0] },
    (_, rowIndex) => readStackRow(reference, path, metadata, rowIndex, startIndex, endIndex, metrics),
  ));
  const width = end - start + 1;
  const output = new Float32Array(metadata.shape[0] * width);
  rows.forEach((row, index) => output.set(row, index * width));
  return { values: output, rows: attributes.rows, species: attributes.species || attributes.rows };
}

async function readStatus(reference, chromosome, start, end, metrics) {
  const path = `${chromosome}/status`;
  const metadata = parseMetadata(reference.refs[`${path}/.zarray`]);
  const attributes = parseMetadata(reference.refs[`${path}/.zattrs`]);
  if (!metadata || metadata.dtype !== '|u1' || metadata.shape.length !== 1) {
    throw new Error(`Array ${path} does not have the expected uint8 status layout.`);
  }
  validateBounds(metadata, chromosome, end, 0);
  const startIndex = start - 1;
  const endIndex = end;
  const chunkBases = metadata.chunks[0];
  const firstChunk = Math.floor(startIndex / chunkBases);
  const lastChunk = Math.floor((endIndex - 1) / chunkBases);
  const output = new Uint8Array(end - start + 1);
  let outputOffset = 0;
  for (let chunkIndex = firstChunk; chunkIndex <= lastChunk; chunkIndex += 1) {
    const chunkStart = chunkIndex * chunkBases;
    const chunkLength = Math.min(chunkBases, metadata.shape[0] - chunkStart);
    const decoded = await readChunk(reference, `${path}/${chunkIndex}`, chunkBases, metadata, metrics);
    const chunk = new Uint8Array(decoded);
    const sliceStart = Math.max(startIndex, chunkStart) - chunkStart;
    const sliceEnd = Math.min(endIndex, chunkStart + chunkLength) - chunkStart;
    const selected = chunk.subarray(sliceStart, sliceEnd);
    output.set(selected, outputOffset);
    outputOffset += selected.length;
  }
  return { values: output, fields: attributes.status_fields || [] };
}

async function query(chromosome, start, end) {
  const [scoreReference, accessibilityReference] = await Promise.all([
    loadReference(SCORE_REFERENCE_URL),
    loadReference(ACCESSIBILITY_REFERENCE_URL),
  ]);
  const metrics = {
    requests: 0, retries: 0, cacheHits: 0, transferredBytes: 0, networkAndDecodeMs: 0,
  };
  const started = performance.now();
  const [Cs, snpDensity, stack, status] = await Promise.all([
    readScoreVector(scoreReference, chromosome, 'Cs', start, end, metrics),
    readScoreVector(scoreReference, chromosome, 'snp_density', start, end, metrics),
    readStack(scoreReference, chromosome, start, end, metrics),
    readStatus(accessibilityReference, chromosome, start, end, metrics),
  ]);
  metrics.totalMs = performance.now() - started;
  metrics.decodedCacheBytes = cacheBytes;
  return {
    values: { Cs, snp_density: snpDensity, stack: stack.values, status: status.values },
    stackRows: stack.rows,
    stackSpecies: stack.species,
    statusFields: status.fields,
    metrics,
  };
}

async function digest(values) {
  const hash = await globalThis.crypto.subtle.digest('SHA-256', values.buffer);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

self.addEventListener('message', async ({ data }) => {
  if (data.action === 'clear-cache') {
    cache.clear();
    cacheBytes = 0;
    self.postMessage({ ok: true, action: data.action, requestId: data.requestId });
    return;
  }
  if (!['query', 'benchmark'].includes(data.action)) return;
  try {
    if (data.action === 'benchmark') {
      cache.clear();
      cacheBytes = 0;
    }
    const result = await query(data.chromosome, data.start, data.end);
    const warm = data.action === 'benchmark'
      ? await query(data.chromosome, data.start, data.end)
      : null;
    const canHash = Boolean(globalThis.crypto?.subtle?.digest);
    const hashes = {};
    if (canHash) {
      for (const name of HASH_ARRAYS) hashes[name] = await digest(result.values[name]);
    }
    const transfer = HASH_ARRAYS.map((name) => result.values[name].buffer);
    const response = {
      ok: true,
      action: data.action,
      requestId: data.requestId,
      chromosome: data.chromosome,
      start: data.start,
      end: data.end,
      values: result.values,
      stackRows: result.stackRows,
      stackSpecies: result.stackSpecies,
      statusFields: result.statusFields,
      hashes,
      hashAvailable: canHash,
      metrics: result.metrics,
    };
    if (data.action === 'benchmark') {
      response.cold = result.metrics;
      response.warm = warm.metrics;
    }
    self.postMessage(response, transfer);
  } catch (error) {
    self.postMessage({
      ok: false,
      action: data.action,
      requestId: data.requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
