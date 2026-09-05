const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/query-summary-v1-cases.json');
const querySummary = require('../docs/assets/query-summary.js');

function scopeMap(summary) {
  return Object.fromEntries(summary.scopes.map((scope) => [scope.scope_id, scope]));
}

function assertFixtureExpectations(item, summary) {
  const expected = item.expect;
  const scopes = scopeMap(summary);
  if (expected.scope_ids) {
    assert.deepEqual(summary.scopes.map((scope) => scope.scope_id), expected.scope_ids);
  }
  Object.entries(expected.totals || {}).forEach(([scopeId, total]) => {
    assert.equal(scopes[scopeId].total_bases, total);
  });
  assert.equal(summary.selected_transcript?.transcript_id ?? null, expected.selected_transcript);
  if (expected.first_exon_segment) {
    assert.deepEqual(scopes['exon-1'].segments[0], expected.first_exon_segment);
  }
  if ('query_accessible_bases' in expected) {
    assert.equal(scopes.query.accessible_bases, expected.query_accessible_bases);
  }
  if ('query_finite_cs_bases' in expected) {
    assert.equal(scopes.query.finite_cs_bases, expected.query_finite_cs_bases);
  }
  if ('query_accessible_fraction' in expected) {
    assert.ok(Math.abs(scopes.query.accessible_fraction - expected.query_accessible_fraction) < 1e-12);
  }
  if ('query_snp_mean' in expected) {
    assert.ok(Math.abs(scopes.query.mean_accessible_snp_density - expected.query_snp_mean) < 1e-12);
  }
  if ('query_longest_inaccessible_run' in expected) {
    assert.equal(scopes.query.longest_inaccessible_run.bases, expected.query_longest_inaccessible_run);
  }
  if ('query_meets_threshold' in expected) {
    assert.equal(scopes.query.meets_ranking_accessibility_threshold, expected.query_meets_threshold);
  }
}

for (const item of fixture.cases) test(`agamcs-query-summary-v1: ${item.name}`, () => {
  const summary = querySummary.summarizeQuery(item.result, item.annotation);
  assert.equal(summary.summary_version, fixture.summary_version);
  assert.equal(summary.ranking_accessibility_threshold, 0.8);
  assert.match(summary.ranking_threshold_note, /representative-transcript gene SNP-density rankings/);
  assertFixtureExpectations(item, summary);
});

test('disconnected scopes do not bridge inaccessible runs', () => {
  const item = fixture.cases.find((candidate) => candidate.name === 'coding-plus-padding-partial-accessibility');
  const scopes = scopeMap(querySummary.summarizeQuery(item.result, item.annotation));
  assert.deepEqual(scopes.cds.segments, [{ start: 102, end: 103 }, { start: 106, end: 108 }]);
  assert.equal(scopes.cds.longest_inaccessible_run.bases, 1);
  assert.equal(scopes.utr.longest_inaccessible_run.bases, 1);
});

test('selected transcript helper chooses the exact alternative isoform model', () => {
  const gene = { transcript_id: 'AGAPISOFORM-RB', start: 100, end: 200 };
  const representative = { transcript_id: 'AGAPISOFORM-RA', start: 110, end: 190 };
  const selected = { transcript_id: 'AGAPISOFORM-RB', start: 125, end: 175 };
  assert.equal(querySummary.selectTranscriptAnnotation(gene, [representative, selected]), selected);
});

test('absent partitions report zero bases and null ratios without becoming eligible', () => {
  const item = fixture.cases.find((candidate) => candidate.name.includes('non-coding'));
  const scopes = scopeMap(querySummary.summarizeQuery(item.result, item.annotation));
  for (const scopeId of ['cds', 'utr', 'five-prime-flank', 'three-prime-flank']) {
    assert.equal(scopes[scopeId].total_bases, 0);
    assert.equal(scopes[scopeId].accessible_fraction, null);
    assert.equal(scopes[scopeId].meets_ranking_accessibility_threshold, null);
  }
});
