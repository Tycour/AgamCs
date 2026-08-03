const test = require('node:test');
const assert = require('node:assert/strict');

require('../docs/assets/live-plots.js');

const { cdsSegments, summarizeQuery } = globalThis.AgamCsPlots;

test('CDS segments intersect exon bounds in plus-strand plot coordinates', () => {
  const annotation = {
    start: 100,
    end: 500,
    strand: 1,
    cds_start: 150,
    cds_end: 350,
    exons: [{ start: 100, end: 200 }, { start: 300, end: 400 }],
  };
  assert.deepEqual(cdsSegments(annotation), [[50, 100], [200, 250]]);
});

test('CDS segments stay ordered from 5-prime to 3-prime on the minus strand', () => {
  const annotation = {
    start: 100,
    end: 500,
    strand: -1,
    cds_start: 150,
    cds_end: 350,
    exons: [{ start: 100, end: 200 }, { start: 300, end: 400 }],
  };
  assert.deepEqual(cdsSegments(annotation), [[150, 200], [300, 350]]);
});

test('query summaries distinguish the full span from the union of exons', () => {
  const result = {
    chromosome: '2L',
    start: 100,
    end: 105,
    values: {
      Cs: Float64Array.from([1, 2, 3, 4, 5, 6]),
      snp_density: Float64Array.from([10, 20, 30, 40, 50, 60]),
      status: Uint8Array.from([1, 0, 1, 1, 1, 0]),
    },
  };
  const annotation = {
    chromosome: '2L',
    start: 100,
    end: 105,
    exons: [{ start: 100, end: 102 }, { start: 102, end: 104 }],
  };
  assert.deepEqual(summarizeQuery(result, annotation), {
    queryBasePairs: 6,
    queryMeanCs: 3.5,
    queryMeanSnp: 32.5,
    exonBasePairs: 5,
    exonMeanCs: 3,
    exonMeanSnp: 32.5,
  });
});

test('manual coordinate summaries omit exon metrics', () => {
  const result = {
    chromosome: 'X',
    start: 10,
    end: 11,
    values: {
      Cs: Float64Array.from([0.25, 0.75]),
      snp_density: Float64Array.from([0.2, 0.8]),
      status: Uint8Array.from([1, 0]),
    },
  };
  const summary = summarizeQuery(result);
  assert.equal(summary.queryBasePairs, 2);
  assert.equal(summary.queryMeanCs, 0.5);
  assert.equal(summary.queryMeanSnp, 0.2);
  assert.equal(summary.exonBasePairs, null);
  assert.ok(Number.isNaN(summary.exonMeanCs));
  assert.ok(Number.isNaN(summary.exonMeanSnp));
});
