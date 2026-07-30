const REFERENCE_URL = 'data/score-reference.json';
const ARRAYS = ['Cs', 'snp_density'];
const cache = new Map();
let referencePromise;

function parseMetadata(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

async function loadReference() {
  if (!referencePromise) {
    referencePromise = fetch(REFERENCE_URL).then((response) => {
      if (!response.ok) throw new Error(`Reference index request failed (${response.status}).`);
      return response.json();
    });
  }
  return referencePromise;
}

async function inflate(buffer) {
  if (!globalThis.DecompressionStream) {
    throw new Error('This browser does not provide the native deflate decoder required by the feasibility reader.');
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Response(stream).arrayBuffer();
}

async function readChunk(reference, key, expectedBytes, metrics) {
  if (cache.has(key)) {
    metrics.cacheHits += 1;
    return cache.get(key);
  }
  const entry = reference.refs[key];
  if (!Array.isArray(entry) || entry.length !== 3) {
    throw new Error(`The reference index has no byte range for ${key}.`);
  }
  const [sourceTemplate, offset, length] = entry;
  const source = sourceTemplate === '{{source}}' ? reference.templates.source : sourceTemplate;
  const started = performance.now();
  const response = await fetch(source, {
    headers: { Range: `bytes=${offset}-${offset + length - 1}` },
    cache: 'no-store',
  });
  if (response.status !== 206) {
    throw new Error(`The data host returned HTTP ${response.status}, not a partial-content response. Full-file downloads are refused.`);
  }
  const compressed = await response.arrayBuffer();
  if (compressed.byteLength !== length) {
    throw new Error(`Range ${key} returned ${compressed.byteLength} bytes; expected ${length}.`);
  }
  const decoded = await inflate(compressed);
  if (decoded.byteLength !== expectedBytes) {
    throw new Error(`Chunk ${key} decoded to ${decoded.byteLength} bytes; expected ${expectedBytes}.`);
  }
  metrics.requests += 1;
  metrics.transferredBytes += compressed.byteLength;
  metrics.networkAndDecodeMs += performance.now() - started;
  cache.set(key, decoded);
  return decoded;
}

async function readArray(reference, chromosome, name, start, end, metrics) {
  const path = `${chromosome}/${name}`;
  const metadataValue = reference.refs[`${path}/.zarray`];
  if (!metadataValue) throw new Error(`Array ${name} is unavailable for chromosome ${chromosome}.`);
  const metadata = parseMetadata(metadataValue);
  if (metadata.dtype !== '<f4' || metadata.shape[0] !== 1) {
    throw new Error(`Array ${path} does not have the expected little-endian float32 layout.`);
  }
  if (end > metadata.shape[1]) {
    throw new Error(`End coordinate ${end.toLocaleString()} exceeds ${chromosome} length ${metadata.shape[1].toLocaleString()}.`);
  }

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
    const decoded = await readChunk(reference, key, chunkLength * 4, metrics);
    const chunk = new Float32Array(decoded);
    const sliceStart = Math.max(startIndex, chunkStart) - chunkStart;
    const sliceEnd = Math.min(endIndex, chunkStart + chunkLength) - chunkStart;
    const selected = chunk.subarray(sliceStart, sliceEnd);
    output.set(selected, outputOffset);
    outputOffset += selected.length;
  }
  return output;
}

async function query(chromosome, start, end) {
  const reference = await loadReference();
  const metrics = { requests: 0, cacheHits: 0, transferredBytes: 0, networkAndDecodeMs: 0 };
  const started = performance.now();
  const values = {};
  for (const name of ARRAYS) {
    values[name] = await readArray(reference, chromosome, name, start, end, metrics);
  }
  metrics.totalMs = performance.now() - started;
  metrics.decodedCacheBytes = [...cache.values()].reduce((total, item) => total + item.byteLength, 0);
  return { values, metrics };
}

async function digest(values) {
  const hash = await crypto.subtle.digest('SHA-256', values.buffer);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

self.addEventListener('message', async ({ data }) => {
  if (data.action !== 'benchmark') return;
  try {
    cache.clear();
    const cold = await query(data.chromosome, data.start, data.end);
    const warm = await query(data.chromosome, data.start, data.end);
    const hashes = {};
    for (const name of ARRAYS) hashes[name] = await digest(cold.values[name]);
    const transfer = ARRAYS.map((name) => cold.values[name].buffer);
    self.postMessage({
      ok: true,
      chromosome: data.chromosome,
      start: data.start,
      end: data.end,
      values: cold.values,
      hashes,
      cold: cold.metrics,
      warm: warm.metrics,
    }, transfer);
  } catch (error) {
    self.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) });
  }
});
