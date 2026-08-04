const test = require('node:test');
const assert = require('node:assert/strict');

const lookup = require('../docs/assets/accession-lookup.js');

function index() {
  return {
    assembly: 'AgamP4',
    annotation: { gene_build: 'AgamP4.14' },
    accessions: {
      AGAP000001: {
        status: 'current',
        transcript_ids: ['AGAP000001-RA'],
        annotation: { id: 'AGAP000001', chromosome: '2L', start: 10, end: 30 },
      },
      AGAP000002: {
        status: 'current',
        transcript_ids: ['AGAP000002-RA', 'AGAP000002-RB'],
        annotation: { id: 'AGAP000002', chromosome: '3R', start: 40, end: 60 },
      },
    },
    transcripts: {
      'AGAP000001-RA': {
        gene_accession: 'AGAP000001', start: 10, end: 30,
        exons: [[10, 30]], cds_start: 12, cds_end: 28,
      },
      'AGAP000002-RA': {
        gene_accession: 'AGAP000002', start: 42, end: 55,
        exons: [[42, 55]], cds_start: 44, cds_end: 53,
      },
      'AGAP000002-RB': {
        gene_accession: 'AGAP000002', start: 40, end: 60,
        exons: [[40, 45], [50, 60]], cds_start: 41, cds_end: 58,
      },
    },
    aliases: { OLD001: 'AGAP000001', SHARED: ['AGAP000001', 'AGAP000002'] },
    retired: {
      DEAD001: { replacement: 'AGAP000002' },
      DEAD002: { replacements: [] },
    },
  };
}

test('canonical and unique alias lookups normalize input', () => {
  assert.equal(lookup.resolve(index(), '  agap000001 ').accession, 'AGAP000001');
  const alias = lookup.resolve(index(), 'old001');
  assert.equal(alias.accession, 'AGAP000001');
  assert.equal(alias.matchedAs, 'alias');
});

test('exact transcript accessions resolve their own spans and exon models', () => {
  const resolution = lookup.resolve(index(), 'agap000002-ra');
  assert.equal(resolution.accession, 'AGAP000002-RA');
  assert.equal(resolution.geneAccession, 'AGAP000002');
  assert.equal(resolution.matchedAs, 'transcript');
  assert.equal(resolution.record.region, '3R:42-55');
  assert.equal(resolution.annotation.transcript_id, 'AGAP000002-RA');
  assert.deepEqual(resolution.annotation.exons, [{ start: 42, end: 55 }]);
});

test('ambiguous aliases stop and identify canonical choices', () => {
  assert.throws(
    () => lookup.resolve(index(), 'shared'),
    (error) => error.code === 'ambiguous' && /AGAP000001, AGAP000002/.test(error.message),
  );
});

test('retired accessions stop with or without a replacement', () => {
  assert.throws(
    () => lookup.resolve(index(), 'dead001'),
    (error) => error.code === 'retired' && /Suggested replacement: AGAP000002/.test(error.message),
  );
  assert.throws(
    () => lookup.resolve(index(), 'dead002'),
    (error) => error.code === 'retired' && /No replacement is recorded/.test(error.message),
  );
});

test('missing accessions never fall through to live lookup', () => {
  assert.throws(
    () => lookup.resolve(index(), 'AGAP999999'),
    (error) => error.code === 'missing'
      && /Use manual coordinates/.test(error.message)
      && /versioned AgamP4.14 index/.test(error.message),
  );
});
