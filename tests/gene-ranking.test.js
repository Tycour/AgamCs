const test = require('node:test');
const assert = require('node:assert/strict');

const geneRanking = require('../docs/assets/gene-ranking.js');

function csDocument() {
  const stat = { rank: 2, ties: 1, percentile: 50 };
  return {
    schema_version: 1, assembly: 'AgamP4', ranking_type: 'mean_cs',
    score_source: { interpretation: 'Arm-scaled warning.' },
    cohorts: { global_gene_count: 3, chromosome_gene_counts: { '2L': 2 } },
    records: { AGAP000001: {
      chromosome: '2L', representative_transcript: 'AGAP000001-RA',
      gene_span: { mean_cs: 0.25, global: stat, chromosome: stat },
      representative_exons: { mean_cs: 0.75, global: stat, chromosome: stat },
    } },
  };
}

function snpDocument(eligible = true) {
  const stat = { rank: 1, ties: 1, percentile: 100 };
  const metric = {
    accessible_bases: eligible ? 8 : 7, total_bases: 10,
    accessible_fraction: eligible ? 0.8 : 0.7,
    mean_snp_density: 0.1, eligible,
    global: eligible ? stat : null, chromosome: eligible ? stat : null,
  };
  return {
    schema_version: 1, assembly: 'AgamP4', ranking_type: 'accessible_mean_snp_density',
    score_source: { interpretation: 'Archived density warning.' },
    accessibility_source: { interpretation: 'QC warning.' },
    minimum_accessible_fraction: 0.8,
    cohorts: {
      global_eligible_gene_counts: { gene_span: 1, representative_exons: 1 },
      chromosome_eligible_gene_counts: {
        gene_span: { '2L': 1 }, representative_exons: { '2L': 1 },
      },
    },
    records: { AGAP000001: {
      chromosome: '2L', representative_transcript: 'AGAP000001-RA',
      gene_span: metric, representative_exons: metric,
    } },
  };
}

test('looks up both ranking types with explicit denominators', () => {
  const result = geneRanking.lookup(csDocument(), snpDocument(), ' agap000001 ');
  assert.equal(result.accession, 'AGAP000001');
  assert.deepEqual(result.cs.metrics.gene_span.global, {
    first: 2, last: 2, ties: 1, count: 3, percentile: 50,
  });
  assert.deepEqual(result.snpDensity.metrics.gene_span.global, {
    first: 1, last: 1, ties: 1, count: 1, percentile: 100,
  });
  assert.equal(result.snpDensity.metrics.gene_span.accessibleFraction, 0.8);
});

test('preserves an ineligible SNP metric without inventing a rank', () => {
  const result = geneRanking.lookup(csDocument(), snpDocument(false), 'AGAP000001');
  assert.equal(result.snpDensity.metrics.gene_span.eligible, false);
  assert.equal(result.snpDensity.metrics.gene_span.global, undefined);
  assert.equal(result.snpDensity.metrics.gene_span.accessibleBases, 7);
});

test('can show one ranking when the other asset is unavailable', () => {
  assert.ok(geneRanking.lookup(csDocument(), null, 'AGAP000001').cs);
  assert.ok(geneRanking.lookup(null, snpDocument(), 'AGAP000001').snpDensity);
  assert.equal(geneRanking.lookup(csDocument(), snpDocument(), 'AGAP999999'), null);
});

test('rejects incompatible documents and malformed rank positions', () => {
  assert.throws(() => geneRanking.lookup({}, null, 'AGAP000001'), /not compatible/i);
  const invalid = csDocument();
  invalid.records.AGAP000001.gene_span.global.rank = 0;
  assert.throws(() => geneRanking.lookup(invalid, null, 'AGAP000001'), /position/i);
});
