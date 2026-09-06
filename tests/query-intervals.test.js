const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');

require('../docs/assets/query-summary.js');
const intervals = require('../docs/assets/query-intervals.js');
const permalink = require('../docs/assets/query-permalink.js');
require('../docs/assets/species-context.js');
require('../docs/assets/notable-windows.js');
const report = require('../docs/assets/query-report.js');

const result = {
  chromosome: '2L', start: 100, end: 104,
  values: {
    Cs: [1, 2, null, 4, 5], snp_density: [10, 20, 30, 40, 50], status: [1, 1, 0, 1, 1],
  },
};
const query = { chromosome: '2L', start: 100, end: 104 };

test('inclusive one-base, whole-query, overlap, duplicate, and bounds semantics', () => {
  const one = intervals.validateInterval({ name: 'one', start: 100, end: 100 }, query);
  assert.equal(intervals.summarise(one, result).summary.scope.total_bases, 1);
  const whole = intervals.validateInterval({ name: 'whole', start: 100, end: 104 }, query);
  assert.equal(intervals.summarise(whole, result).summary.scope.total_bases, 5);
  const state = intervals.add([one], { name: 'overlap', start: 100, end: 101 }, query);
  assert.throws(() => intervals.add(state, { name: 'ONE', start: 102, end: 103 }, query));
  for (const raw of [
    { name: 'bad', start: 99, end: 100 }, { name: 'bad', start: 100, end: 105 },
    { name: 'bad', start: 103, end: 102 }, { name: ' ', start: 100, end: 100 },
  ]) assert.throws(() => intervals.validateInterval(raw, query));
});

test('editing, deletion, summaries, report v2, and permalink interval validation', () => {
  const original = intervals.add([], { name: 'edited', start: 101, end: 103 }, query);
  const edited = intervals.edit(original, original[0].id, { name: 'renamed', start: 102, end: 102 }, query);
  assert.equal(edited[0].name, 'renamed');
  assert.equal(intervals.remove(edited, edited[0].id).length, 0);
  const built = report.buildReport(result, {
    queryState: { mode: 'coordinates' }, intervals: edited,
    provenance: {}, ranking: null,
  });
  assert.equal(built.report_version, 'agamcs-query-report-v2');
  assert.equal(built.named_intervals[0].summary.scope.total_bases, 1);
  assert.equal(report.validateReport(built), true);
  const state = {
    mode: 'coordinates', coordinates: query, signal_resolution: 'adaptive', heatmap_resolution: 500,
    display_range: null, show_overlapping_annotations: false,
    species: { order: 'topology', selected_codes: [], collapsed_clades: [] }, intervals: edited,
  };
  assert.equal(permalink.parse(permalink.serialize(state)).state.intervals[0].start, 102);
  assert.throws(() => permalink.validateForRestore({ ...state, intervals: [{ ...edited[0], end: 999 }] }, {
    allowedResolutions: ['adaptive', '500'], speciesCodes: [], cladeIds: [],
    validateCoordinates: () => query,
  }));
});

test('Pages UI exposes keyboard-safe interval editing, zoom, and separate export actions', () => {
  const source = fs.readFileSync(require.resolve('../docs/assets/site.js'), 'utf8');
  for (const marker of [
    'saveNamedInterval', 'renderNamedIntervals', "zoomToPlotRange(interval, 'named interval')",
    'Interval TSV', 'intervalCancel', 'intervals: namedIntervalState',
  ]) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
