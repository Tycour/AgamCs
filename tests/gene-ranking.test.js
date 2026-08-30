const test = require('node:test');
const assert = require('node:assert/strict');

const geneRanking = require('../docs/assets/gene-ranking.js');


function document() {
  return {
    schema_version: 1,
    assembly: 'AgamP4',
    score_source: { interpretation: 'Arm-scaled warning.' },
    percentile_method: 'Compared with other genes.',
    cohorts: { global_gene_count: 3, chromosome_gene_counts: { '2L': 2 } },
    records: {
      AGAP000001: {
        chromosome: '2L',
        representative_transcript: 'AGAP000001-RA',
        gene_span: {
          bases: 4, mean_cs: 0.25,
          global: { rank: 2, ties: 1, percentile: 50 },
          chromosome: { rank: 1, ties: 2, percentile: 50 },
        },
        representative_exons: {
          bases: 2, mean_cs: 0.75,
          global: { rank: 1, ties: 1, percentile: 100 },
          chromosome: { rank: 1, ties: 1, percentile: 100 },
        },
      },
    },
  };
}


test('looks up case-insensitively and retains explicit denominators and ties', () => {
  const result = geneRanking.lookup(document(), ' agap000001 ');
  assert.equal(result.accession, 'AGAP000001');
  assert.equal(result.representativeTranscript, 'AGAP000001-RA');
  assert.deepEqual(result.metrics.gene_span.global, {
    first: 2, last: 2, ties: 1, count: 3, percentile: 50,
  });
  assert.deepEqual(result.metrics.gene_span.chromosome, {
    first: 1, last: 2, ties: 2, count: 2, percentile: 50,
  });
  assert.equal(result.interpretation, 'Arm-scaled warning.');
});


test('returns null for genes outside the pinned ranking cohort', () => {
  assert.equal(geneRanking.lookup(document(), 'AGAP999999'), null);
});


test('rejects incompatible documents and malformed rank positions', () => {
  assert.throws(() => geneRanking.lookup({}, 'AGAP000001'), /not compatible/i);
  const invalid = document();
  invalid.records.AGAP000001.gene_span.global.rank = 0;
  assert.throws(() => geneRanking.lookup(invalid, 'AGAP000001'), /position/i);
});
