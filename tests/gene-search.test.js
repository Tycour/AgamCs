const test = require('node:test');
const assert = require('node:assert/strict');

const geneSearch = require('../docs/assets/gene-search.js');

function index() {
  return {
    index_version: 'test-index-v1',
    accessions: {
      AGAP000001: {
        region: '2L:10-30', transcript_ids: ['AGAP000001-RA'],
        annotation: { chromosome: '2L' },
      },
      AGAP000002: {
        region: '3R:40-60', transcript_ids: ['AGAP000002-RA', 'AGAP000002-RB'],
        annotation: { chromosome: '3R' },
      },
      AGAP000003: {
        region: 'X:70-90', transcript_ids: ['AGAP000003-RA'],
        annotation: { chromosome: 'X' },
      },
    },
    transcripts: {
      'AGAP000001-RA': { gene_accession: 'AGAP000001', start: 10, end: 30 },
      'AGAP000002-RA': { gene_accession: 'AGAP000002', start: 42, end: 55 },
      'AGAP000002-RB': { gene_accession: 'AGAP000002', start: 40, end: 60 },
      'AGAP000003-RA': { gene_accession: 'AGAP000003', start: 70, end: 90 },
    },
  };
}

function namingIndex() {
  return {
    source: { release: 'Test release' },
    names: {
      AGAP000001: {
        name: 'ZPG', biotype: 'protein_coding', description: 'Innexin inx2',
      },
      AGAP000002: {
        name: 'Mocs2', biotype: 'protein_coding', description: 'Catalytic subunit',
      },
      AGAP000003: {
        name: 'Mocs2', biotype: 'protein_coding', description: 'Carrier subunit',
      },
    },
  };
}

test('searches accessions and official names case-insensitively', () => {
  const accession = geneSearch.search(index(), namingIndex(), 'agap000001');
  assert.equal(accession.total, 1);
  assert.equal(accession.matches[0].accession, 'AGAP000001');
  assert.equal(accession.matches[0].matchField, 'accession');

  const name = geneSearch.search(index(), namingIndex(), 'zpg');
  assert.equal(name.total, 1);
  assert.deepEqual(
    {
      accession: name.matches[0].accession,
      name: name.matches[0].name,
      description: name.matches[0].description,
    },
    { accession: 'AGAP000001', name: 'ZPG', description: 'Innexin inx2' },
  );
});

test('keeps every duplicate-name locus as a separate choice', () => {
  const result = geneSearch.search(index(), namingIndex(), 'mocs2');
  assert.equal(result.total, 2);
  assert.deepEqual(
    result.matches.map((match) => match.accession),
    ['AGAP000002', 'AGAP000003'],
  );
  assert.deepEqual(
    result.matches.map((match) => match.region),
    ['3R:40-60', 'X:70-90'],
  );
});

test('suggests transcripts only after a transcript separator is typed', () => {
  assert.equal(
    geneSearch.search(index(), namingIndex(), 'AGAP000002').matches.some(
      (match) => match.kind === 'transcript',
    ),
    false,
  );
  assert.deepEqual(
    geneSearch.search(index(), namingIndex(), 'AGAP000002-R').matches.map(
      (match) => match.accession,
    ),
    ['AGAP000002-RA', 'AGAP000002-RB'],
  );
});

test('reports the full match count when visible results are capped', () => {
  const result = geneSearch.search(index(), namingIndex(), 'AGAP', 2);
  assert.equal(result.total, 3);
  assert.equal(result.matches.length, 2);
});

test('canonicalizes unique names but refuses ambiguous names', () => {
  assert.deepEqual(
    geneSearch.canonicalize(index(), namingIndex(), ' zpg '),
    { value: 'AGAP000001', matchedAs: 'name', name: 'zpg' },
  );
  assert.throws(
    () => geneSearch.canonicalize(index(), namingIndex(), 'Mocs2'),
    (error) => error.code === 'ambiguous-name'
      && error.choices.length === 2
      && /Choose one from the suggestions/.test(error.message),
  );
});

test('descriptions provide context but are not search identifiers', () => {
  assert.equal(geneSearch.search(index(), namingIndex(), 'innexin').total, 0);
});
