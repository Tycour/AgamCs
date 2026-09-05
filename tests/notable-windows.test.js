const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const notableWindows = require('../docs/assets/notable-windows.js');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/notable-windows-v1-cases.json'), 'utf8'));

function coordinates(rows) {
  return rows.map((row) => [row.start, row.end]);
}

fixture.cases.forEach((item) => test(`agamcs-notable-windows-v1: ${item.name}`, () => {
  const analysis = notableWindows.analyzeNotableWindows(item.result, item.annotation, {
    windowSize: item.window_size, topWindows: item.top_windows,
  });
  const expected = item.expect;
  assert.equal(analysis.analysis_version, fixture.analysis_version);
  if (expected.windows) assert.deepEqual(analysis.windows.map((row) => [row.start, row.end, row.total_bases]), expected.windows);
  if (expected.features) assert.deepEqual(analysis.windows.map((row) => row.selected_transcript_feature), expected.features);
  if (expected.highest_mean_cs) assert.deepEqual(coordinates(analysis.highest_mean_cs_windows), expected.highest_mean_cs);
  if (expected.lowest_mean_snp_density) assert.deepEqual(coordinates(analysis.lowest_mean_snp_density_windows), expected.lowest_mean_snp_density);
  if (expected.accessible_bases) assert.deepEqual(analysis.windows.map((row) => row.accessible_bases), expected.accessible_bases);
}));
