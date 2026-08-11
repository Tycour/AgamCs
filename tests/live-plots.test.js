const test = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../docs/assets/data/query-manifest.json');

require('../docs/assets/live-plots.js');

const {
  annotationMatches,
  cdsSegments,
  summarizeQuery,
  transcriptModelGeometry,
  transcriptAnnotationsForDisplay,
  abbreviatedSpeciesName,
  topologyTipCodes,
  validateSpeciesTopology,
} = globalThis.AgamCsPlots;

test('annotations remain active when the query includes flanking padding', () => {
  const annotation = { chromosome: '2L', start: 100, end: 200 };
  assert.equal(annotationMatches({ chromosome: '2L', start: 75, end: 225 }, annotation), true);
  assert.equal(annotationMatches({ chromosome: '2L', start: 125, end: 225 }, annotation), false);
  assert.equal(annotationMatches({ chromosome: '3R', start: 75, end: 225 }, annotation), false);
});

test('species labels use established genus abbreviations', () => {
  assert.equal(abbreviatedSpeciesName('Anopheles coluzzii'), 'An. coluzzii');
  assert.equal(abbreviatedSpeciesName('Aedes aegypti '), 'Ae. aegypti');
  assert.equal(abbreviatedSpeciesName('Culex quinquefasciatus'), 'Cx. quinquefasciatus');
  assert.equal(abbreviatedSpeciesName('Drosophila melanogaster'), 'D. melanogaster');
});

test('browser topology contains every metadata genome code exactly once', () => {
  const tips = topologyTipCodes(manifest.stack.topology.tree);

  assert.deepEqual(tips, manifest.stack.rows);
  assert.equal(new Set(tips).size, tips.length);
  assert.equal(
    validateSpeciesTopology(manifest.stack.topology, manifest.stack.rows),
    manifest.stack.topology.tree,
  );
});

test('browser rejects topology drift from the metadata row order', () => {
  assert.throws(
    () => validateSpeciesTopology(
      manifest.stack.topology,
      [...manifest.stack.rows].reverse(),
    ),
    /does not match the metadata genome-code order/,
  );
});

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

test('padded query summaries retain exon metrics from the contained annotation', () => {
  const result = {
    chromosome: '2L',
    start: 99,
    end: 106,
    values: {
      Cs: Float64Array.from([0, 1, 2, 3, 4, 5, 6, 7]),
      snp_density: Float64Array.from([0, 10, 20, 30, 40, 50, 60, 70]),
      status: Uint8Array.from([1, 1, 1, 1, 1, 1, 1, 1]),
    },
  };
  const annotation = {
    chromosome: '2L',
    start: 100,
    end: 105,
    exons: [{ start: 101, end: 102 }, { start: 104, end: 104 }],
  };
  assert.deepEqual(summarizeQuery(result, annotation), {
    queryBasePairs: 8,
    queryMeanCs: 3.5,
    queryMeanSnp: 35,
    exonBasePairs: 3,
    exonMeanCs: 10 / 3,
    exonMeanSnp: 100 / 3,
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

test('transcript models align to a shared plus-strand gene coordinate frame', () => {
  const display = { chromosome: 'X', start: 100, end: 500, strand: 1 };
  const transcript = {
    chromosome: 'X', start: 150, end: 450, strand: 1,
    exons: [{ start: 150, end: 200 }, { start: 400, end: 450 }],
    cds_start: 175, cds_end: 425,
  };
  assert.deepEqual(transcriptModelGeometry(transcript, display), {
    transcript: [50, 350],
    exons: [[50, 100], [300, 350]],
    cds: [[75, 100], [300, 325]],
  });
});

test('transcript models stay aligned in a shared minus-strand gene frame', () => {
  const display = { chromosome: '3R', start: 100, end: 500, strand: -1 };
  const transcript = {
    chromosome: '3R', start: 150, end: 450, strand: -1,
    exons: [{ start: 400, end: 450 }, { start: 150, end: 200 }],
    cds_start: 175, cds_end: 425,
  };
  assert.deepEqual(transcriptModelGeometry(transcript, display), {
    transcript: [50, 350],
    exons: [[50, 100], [300, 350]],
    cds: [[75, 100], [300, 325]],
  });
});

test('multi-transcript tracks retain unique overlapping models on the same strand', () => {
  const display = {
    chromosome: '2L', start: 100, end: 500, strand: 1,
    transcript_id: 'AGAP000001-RB', exons: [{ start: 100, end: 500 }],
  };
  const annotations = [
    { ...display, transcript_id: 'AGAP000001-RB' },
    { ...display, transcript_id: 'AGAP000001-RA', start: 150, end: 450 },
    { ...display, transcript_id: 'AGAP000001-RA', start: 150, end: 450 },
    { ...display, transcript_id: 'AGAP000001-RC', chromosome: '3R' },
    { ...display, transcript_id: 'AGAP000001-RD', strand: -1 },
  ];
  assert.deepEqual(
    transcriptAnnotationsForDisplay(display, annotations).map((item) => item.transcript_id),
    ['AGAP000001-RA', 'AGAP000001-RB'],
  );
});
