const test = require('node:test');
const assert = require('node:assert/strict');

require('../docs/assets/live-plots.js');

const { cdsSegments } = globalThis.AgamCsPlots;

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
