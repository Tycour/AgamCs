const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

require('../docs/assets/query-summary.js');
const comparison = require('../docs/assets/two-gene-comparison.js');

function result(chromosome, start, values) {
  return {
    chromosome, start, end: start + values.status.length - 1,
    values: { Cs: values.cs, snp_density: values.snp, status: values.status },
  };
}

function ranking(transcript = 'AGAPLEFT-RA') {
  const ranked = (value) => ({
    state: 'ranked', value, totalBases: 5, basesAssessed: 5,
    accessibleBases: 4, accessibleFraction: 0.8,
    global: { first: 3, last: 3, count: 100, percentile: 98, cohortDenominator: 100 },
    chromosome: { first: 2, last: 2, count: 10, percentile: 90, cohortDenominator: 10 },
    globalCohortDenominator: 100, chromosomeCohortDenominator: 10,
  });
  const unavailable = {
    state: 'not_ranked_ineligible', value: 4, totalBases: 5, basesAssessed: 4,
    accessibleBases: 3, accessibleFraction: 0.6, globalCohortDenominator: 100,
    chromosomeCohortDenominator: 10,
  };
  const scopes = Object.fromEntries(comparison.RANK_SCOPES.map((scope) => [scope, ranked(0.5)]));
  scopes.representative_utr = unavailable;
  return {
    representativeTranscript: transcript,
    cs: { metrics: scopes },
    snpDensity: { metrics: Object.fromEntries(comparison.RANK_SCOPES.map((scope) => [scope, scope === 'representative_utr' ? unavailable : ranked(2)])) },
  };
}

function side(geneAccession, chromosome, start, annotation, values, rank = ranking()) {
  return { geneAccession, annotation, result: result(chromosome, start, values), ranking: rank };
}

test('standardizes different arms and lengths without aligning coordinates', () => {
  const left = side('AGAPLEFT', '2L', 100, {
    id: 'AGAPLEFT', transcript_id: 'AGAPLEFT-RB', chromosome: '2L', start: 100, end: 104,
    strand: 1, exons: [{ start: 100, end: 101 }, { start: 103, end: 104 }], cds_start: 100, cds_end: 104,
  }, { cs: [1, 2, 3, 4, 5], snp: [1, 2, 3, 4, 5], status: [1, 1, 0, 1, 1] });
  const right = side('AGAPRIGHT', '3R', 1000, {
    id: 'AGAPRIGHT', transcript_id: 'AGAPRIGHT-RA', chromosome: '3R', start: 1000, end: 1007,
    strand: -1, exons: [{ start: 1000, end: 1002 }, { start: 1006, end: 1007 }], cds_start: null, cds_end: null,
  }, { cs: [1, 2, 3, 4, 5, 6, 7, 8], snp: [1, 2, 3, 4, 5, 6, 7, 8], status: [0, 0, 0, 0, 0, 0, 0, 0] }, ranking('AGAPRIGHT-RC'));
  const built = comparison.buildComparison({ left, right, provenance: { assembly: 'AgamP4' } });
  assert.equal(built.sides.left.axis.independent, true);
  assert.equal(built.sides.left.chromosome, '2L');
  assert.equal(built.sides.right.chromosome, '3R');
  assert.equal(built.sides.left.live_query_transcript.transcript_id, 'AGAPLEFT-RB');
  assert.equal(built.sides.left.pinned_ranking_transcript.transcript_id, 'AGAPLEFT-RA');
  assert.equal(built.sides.right.query_summary.scopes.cds.total_bases, 0, 'non-coding partition stays absent');
  assert.equal(built.sides.right.query_summary.scopes.query.accessible_bases, 0, 'all QC failures stay unknown');
  assert.equal(built.sides.left.static_rankings.representative_utr.low_snp_density.availability, 'unavailable');
});

test('comparison TSV keeps denominators and unavailable states rather than writing zero', () => {
  const left = side('AGAPLEFT', '2L', 100, {
    id: 'AGAPLEFT', transcript_id: 'AGAPLEFT-RB', chromosome: '2L', start: 100, end: 104,
    strand: 1, exons: [{ start: 100, end: 104 }], cds_start: 100, cds_end: 104,
  }, { cs: [1, 2, 3, 4, 5], snp: [1, 2, 3, 4, 5], status: [1, 1, 0, 1, 1] });
  const right = side('AGAPRIGHT', '3R', 1000, {
    id: 'AGAPRIGHT', transcript_id: 'AGAPRIGHT-RA', chromosome: '3R', start: 1000, end: 1004,
    strand: 1, exons: [{ start: 1000, end: 1004 }], cds_start: 1000, cds_end: 1004,
  }, { cs: [1, 2, 3, 4, 5], snp: [1, 2, 3, 4, 5], status: [1, 1, 1, 1, 1] });
  const text = comparison.toTsv(comparison.buildComparison({ left, right }));
  assert.match(text, /global_cohort_denominator/);
  assert.match(text, /UNAVAILABLE means unavailable evidence, never zero/);
  assert.match(text, /Below the 80% accessibility eligibility threshold/);
  assert.doesNotMatch(text, /\t0\tBelow the 80%/);
});

test('rejects identical genes', () => {
  const item = side('AGAPSAME', '2L', 100, {
    id: 'AGAPSAME', transcript_id: 'AGAPSAME-RA', chromosome: '2L', start: 100, end: 104,
    strand: 1, exons: [{ start: 100, end: 104 }], cds_start: 100, cds_end: 104,
  }, { cs: [1, 2, 3, 4, 5], snp: [1, 2, 3, 4, 5], status: [1, 1, 1, 1, 1] });
  assert.throws(() => comparison.buildComparison({ left: item, right: item }), /two different genes/);
});

test('UI keeps replacement transactional, sequential, and cancellable', () => {
  const source = fs.readFileSync(path.join(__dirname, '../docs/assets/site.js'), 'utf8');
  assert.match(source, /const left = await resolveComparisonSide/);
  assert.match(source, /const right = await resolveComparisonSide/);
  assert.match(source, /if \(generation !== comparisonGeneration\) return/);
  assert.match(source, /previous completed comparison remains available/);
  assert.match(source, /comparisonAbortController\.abort/);
  assert.match(source, /comparison-partition-table-body/);
  assert.match(source, /comparisonLeftHeading/);
});

test('worker accepts explicit cancellation for stale or replaced comparison requests', () => {
  const source = fs.readFileSync(path.join(__dirname, '../docs/assets/query-worker.js'), 'utf8');
  assert.match(source, /const activeQueries = new Map\(\)/);
  assert.match(source, /data\.action === 'cancel'/);
  assert.match(source, /activeQueries\.delete\(data\.requestId\)/);
});
