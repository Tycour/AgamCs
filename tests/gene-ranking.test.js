const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const geneRanking = require('../docs/assets/gene-ranking.js');
const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures', 'gene-ranking-v2-cases.json'), 'utf8',
));

test('decodes all v2 partition states from the shared parity fixture', () => {
  const result = geneRanking.lookup(
    fixture.documents.cs, fixture.documents.snp_density, ' agap000001 ',
  );
  assert.equal(result.accession, fixture.expected.accession);
  assert.equal(result.chromosome, fixture.expected.chromosome);
  assert.equal(result.representativeTranscript, fixture.expected.representative_transcript);
  assert.deepEqual(
    geneRanking.METRICS.map((scope) => result.cs.metrics[scope].state),
    fixture.expected.cs_states,
  );
  assert.deepEqual(
    geneRanking.METRICS.map((scope) => result.snpDensity.metrics[scope].state),
    fixture.expected.snp_states,
  );
});

test('publishes assessed bases, representative transcript, and rank denominators', () => {
  const result = geneRanking.lookup(
    fixture.documents.cs, fixture.documents.snp_density, 'AGAP000001',
  );
  const cds = result.cs.metrics.representative_cds;
  assert.equal(cds.basesAssessed, 6);
  assert.equal(cds.totalBases, 6);
  assert.equal(cds.representativeTranscript, 'AGAP000001-RA');
  assert.equal(cds.global.cohortDenominator, 1);
  assert.equal(cds.chromosome.count, 1);

  const edge = result.snpDensity.metrics.representative_exons;
  assert.equal(edge.accessibleFraction, 0.8);
  assert.equal(edge.state, 'ranked');
  assert.equal(edge.basesAssessed, 4);
  assert.equal(edge.global.cohortDenominator, 1);
});

test('never invents ranks for ineligible, zero-base, unavailable, or failed-QC evidence', () => {
  const result = geneRanking.lookup(
    fixture.documents.cs, fixture.documents.snp_density, 'AGAP000001',
  );
  assert.equal(result.snpDensity.metrics.representative_cds.global, undefined);
  assert.equal(result.snpDensity.metrics.representative_utr.value, null);
  assert.equal(result.snpDensity.metrics.representative_introns.basesAssessed, 0);
  assert.equal(result.snpDensity.metrics.representative_introns.globalCohortDenominator, 0);
  assert.equal(result.cs.metrics.representative_introns.global, undefined);
});

test('can show one ranking when the other asset is unavailable', () => {
  assert.ok(geneRanking.lookup(fixture.documents.cs, null, 'AGAP000001').cs);
  assert.ok(geneRanking.lookup(null, fixture.documents.snp_density, 'AGAP000001').snpDensity);
  assert.equal(geneRanking.lookup(
    fixture.documents.cs, fixture.documents.snp_density, 'AGAP999999',
  ), null);
});

test('rejects incompatible documents and malformed rank positions', () => {
  assert.throws(() => geneRanking.lookup({}, null, 'AGAP000001'), /not compatible/i);
  const invalid = structuredClone(fixture.documents.cs);
  invalid.records.AGAP000001[2][0][3][0] = 0;
  assert.throws(() => geneRanking.lookup(invalid, null, 'AGAP000001'), /position/i);
});
