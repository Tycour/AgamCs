const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const workerSource = fs.readFileSync(
  path.join(__dirname, '../docs/assets/query-worker.js'),
  'utf8',
);

function harness(fetchImplementation) {
  let messageHandler;
  const messages = [];
  const context = vm.createContext({
    Blob,
    DecompressionStream,
    Error,
    Float32Array,
    JSON,
    Map,
    Promise,
    Response,
    Uint8Array,
    crypto: globalThis.crypto,
    fetch: fetchImplementation,
    performance: globalThis.performance,
    setTimeout: (callback) => callback(),
    self: {
      addEventListener(type, handler) {
        if (type === 'message') messageHandler = handler;
      },
      postMessage(message) {
        messages.push(message);
      },
    },
  });
  vm.runInContext(workerSource, context, { filename: 'query-worker.js' });
  return {
    messages,
    message: (data) => messageHandler({ data }),
    readChunk: vm.runInContext('readChunk', context),
    readScoreVector: vm.runInContext('readScoreVector', context),
    usesDeflate: vm.runInContext('usesDeflate', context),
  };
}

function reference() {
  return {
    templates: { source: 'https://example.test/archive.h5' },
    refs: { '2L/Cs/0.0': ['{{source}}', 100, 4] },
  };
}

function metrics() {
  return { requests: 0, retries: 0, cacheHits: 0, transferredBytes: 0, networkAndDecodeMs: 0 };
}

const uncompressed = { filters: [] };

test('refuses a host response that could be a full-file download', async () => {
  const worker = harness(async () => ({ status: 200 }));
  await assert.rejects(
    worker.readChunk(reference(), '2L/Cs/0.0', 4, uncompressed, metrics()),
    /HTTP 200, not a partial-content response\. Full-file downloads are refused/,
  );
});

test('surfaces a simulated network interruption', async () => {
  const worker = harness(async () => { throw new Error('simulated network interruption'); });
  await assert.rejects(
    worker.readChunk(reference(), '2L/Cs/0.0', 4, uncompressed, metrics()),
    /simulated network interruption/,
  );
});

test('retries a transient HTTP 429 before accepting a byte range', async () => {
  let attempts = 0;
  const bytes = Uint8Array.from([1, 2, 3, 4]);
  const worker = harness(async () => {
    attempts += 1;
    if (attempts === 1) return { status: 429 };
    return { status: 206, arrayBuffer: async () => bytes.buffer.slice(0) };
  });
  const requestMetrics = metrics();

  await worker.readChunk(reference(), '2L/Cs/0.0', 4, uncompressed, requestMetrics);

  assert.equal(attempts, 2);
  assert.equal(requestMetrics.retries, 1);
  assert.equal(requestMetrics.requests, 1);
});

test('reuses decoded chunks and clear-cache forces a new range request', async () => {
  let requests = 0;
  const bytes = Uint8Array.from([1, 2, 3, 4]);
  const worker = harness(async () => {
    requests += 1;
    return { status: 206, arrayBuffer: async () => bytes.buffer.slice(0) };
  });

  const cold = metrics();
  await worker.readChunk(reference(), '2L/Cs/0.0', 4, uncompressed, cold);
  assert.equal(requests, 1);
  assert.equal(cold.requests, 1);

  const warm = metrics();
  await worker.readChunk(reference(), '2L/Cs/0.0', 4, uncompressed, warm);
  assert.equal(requests, 1);
  assert.equal(warm.cacheHits, 1);

  await worker.message({ action: 'clear-cache', requestId: 7 });
  assert.equal(worker.messages.at(-1).ok, true);
  assert.equal(worker.messages.at(-1).requestId, 7);

  const refreshed = metrics();
  await worker.readChunk(reference(), '2L/Cs/0.0', 4, uncompressed, refreshed);
  assert.equal(requests, 2);
  assert.equal(refreshed.requests, 1);
});

test('rejects unsupported HDF5 filters before decoding', () => {
  const worker = harness(async () => { throw new Error('fetch should not run'); });
  assert.throws(
    () => worker.usesDeflate({ filters: [{ id: 'blosc' }] }),
    /Unsupported HDF5 filter: blosc/,
  );
});

test('accepts a full physical chunk at the right chromosome boundary', async () => {
  const physicalChunk = new Float32Array([6, 7, 8, 9, -1, -1]);
  const worker = harness(async () => ({
    status: 206,
    arrayBuffer: async () => physicalChunk.buffer.slice(0),
  }));
  const finalChunkReference = {
    templates: { source: 'https://example.test/archive.h5' },
    refs: {
      '2L/Cs/.zarray': JSON.stringify({
        chunks: [1, 6], dtype: '<f4', filters: [], shape: [1, 10],
      }),
      '2L/Cs/0.1': ['{{source}}', 100, physicalChunk.byteLength],
    },
  };

  const result = await worker.readScoreVector(
    finalChunkReference, '2L', 'Cs', 10, 10, metrics(),
  );

  assert.equal(result.length, 1);
  assert.equal(result[0], 9);
});
