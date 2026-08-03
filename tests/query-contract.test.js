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
