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
        annotation: { id: 'AGAP000001', chromosome: '2L', start: 10, end: 30 },
      },
      AGAP000002: {
        status: 'current',
        annotation: { id: 'AGAP000002', chromosome: '3R', start: 40, end: 60 },
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
      && /live Ensembl lookup is intentionally disabled/.test(error.message),
  );
});
