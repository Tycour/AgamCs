const test = require('node:test');
const assert = require('node:assert/strict');

const contract = require('../docs/assets/query-contract.js');

const manifest = {
  assembly: 'AgamP4',
  maximum_query_bases: 20_000,
  chromosomes: {
    '2L': { length: 49_364_325 },
    X: { length: 24_393_108 },
  },
};

test('accepts single-base queries at both chromosome boundaries', () => {
  assert.deepEqual(contract.validateCoordinates(manifest, '2L', 1, 1), {
    chromosome: '2L', start: 1, end: 1, length: 1,
  });
  assert.deepEqual(contract.validateCoordinates(manifest, 'X', 24_393_108, 24_393_108), {
    chromosome: 'X', start: 24_393_108, end: 24_393_108, length: 1,
  });
});

test('accepts the exact maximum query length', () => {
  assert.equal(contract.validateCoordinates(manifest, '2L', 10, 20_009).length, 20_000);
});

test('rejects unknown chromosomes and invalid coordinate order', () => {
  assert.throws(
    () => contract.validateCoordinates(manifest, 'Y', 1, 10),
    (error) => error.code === 'chromosome' && /not available/.test(error.message),
  );
  for (const [start, end] of [[0, 1], [10, 9], [1.5, 10]]) {
    assert.throws(
      () => contract.validateCoordinates(manifest, '2L', start, end),
      (error) => error.code === 'coordinate-order',
    );
  }
});

test('rejects chromosome overflow and over-limit intervals', () => {
  assert.throws(
    () => contract.validateCoordinates(manifest, 'X', 24_393_108, 24_393_109),
    (error) => error.code === 'chromosome-bound',
  );
  assert.throws(
    () => contract.validateCoordinates(manifest, '2L', 1, 20_001),
    (error) => error.code === 'maximum-length',
  );
});

test('pads accession coordinates symmetrically', () => {
  assert.deepEqual(contract.padCoordinates(manifest, '2L', 100, 200, 25), {
    chromosome: '2L', start: 75, end: 225, length: 151,
    requestedPadding: 25, leftPadding: 25, rightPadding: 25,
  });
});

test('clips accession padding at chromosome boundaries', () => {
  assert.deepEqual(contract.padCoordinates(manifest, '2L', 10, 20, 25), {
    chromosome: '2L', start: 1, end: 45, length: 45,
    requestedPadding: 25, leftPadding: 9, rightPadding: 25,
  });
  assert.deepEqual(
    contract.padCoordinates(manifest, 'X', 24_393_100, 24_393_108, 20),
    {
      chromosome: 'X', start: 24_393_080, end: 24_393_108, length: 29,
      requestedPadding: 20, leftPadding: 20, rightPadding: 0,
    },
  );
});

test('rejects invalid padding and padded intervals over the query limit', () => {
  for (const padding of [-1, 1.5, 'many']) {
    assert.throws(
      () => contract.padCoordinates(manifest, '2L', 100, 200, padding),
      (error) => error.code === 'padding',
    );
  }
  assert.throws(
    () => contract.padCoordinates(manifest, '2L', 20_000, 20_100, 10_000),
    (error) => error.code === 'maximum-length',
  );
});
