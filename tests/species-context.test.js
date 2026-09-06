const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const speciesContext = require('../docs/assets/species-context.js');
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/species-context-v1-cases.json'), 'utf8'));

function expandCase(item) {
  const stack = item.row_runs.flatMap((runs) => runs.flatMap(([count, value]) => Array(count).fill(value)));
  return {
    chromosome: item.chromosome, start: item.start, end: item.end,
    stackRows: item.rows, stackSpecies: item.labels,
    stackTopology: item.topology, values: { stack },
  };
}

fixture.cases.forEach((item) => test(`agamcs-species-context-v1: ${item.name}`, () => {
  const analysis = speciesContext.analyzeSpeciesContext(expandCase(item));
  const expected = item.expect;
  assert.equal(analysis.analysis_version, fixture.analysis_version);
  assert.deepEqual(analysis.species.map((row) => row.detected_bases), expected.species_detected_bases);
  assert.deepEqual(analysis.species.map((row) => row.longest_undetected_run.bases), expected.species_longest_runs);
  assert.deepEqual(analysis.species.map((row) => row.lowest_qualifying_identity_window?.start ?? null), expected.species_window_starts);
  assert.equal(analysis.clades[0].is_polytomy, expected.root_is_polytomy);
}));

test('display rows support selection, topology order, alphabetical order, and encoded clade collapse', () => {
  const item = fixture.cases[1];
  const result = expandCase(item);
  assert.deepEqual(speciesContext.displayRows(result).map((row) => row.id), ['sp1', 'sp2', 'sp3']);
  assert.deepEqual(
    speciesContext.displayRows(result, { selectedCodes: ['sp1', 'sp2'], collapsedClades: ['Root/Pair'] }),
    [{ id: 'Root/Pair', kind: 'clade', name: 'Pair (2 spp.)', memberCodes: ['sp1', 'sp2'] }],
  );
  assert.deepEqual(
    speciesContext.displayRows(result, { selectedCodes: ['sp1', 'sp3'], order: 'alphabetical' }).map((row) => row.id),
    ['sp1', 'sp3'],
  );
});

test('collapsed heatmap cells retain species-base detection denominators', () => {
  const item = fixture.cases[0];
  const result = expandCase(item);
  const rows = speciesContext.displayRows(result, { collapsedClades: ['Root'] });
  const baseSummary = {
    bins: [[...Array(120)].map((_unused, index) => ({ index, position: index + 1 }))],
  };
  const summary = speciesContext.summarizeDisplayHeatmap(result, baseSummary, rows);
  assert.equal(summary.cells[0][0].detectedFraction, 190 / 360);
  assert.equal(summary.cells[0][0].identity, (120 * 90 + 70 * 80) / 190);
});

test('default display preserves per-species heatmap cells exactly', () => {
  const item = fixture.cases[0];
  const result = expandCase(item);
  const rows = speciesContext.displayRows(result);
  const bins = [
    [...Array(100)].map((_unused, index) => ({ index, position: index + 1 })),
    [...Array(20)].map((_unused, index) => ({ index: index + 100, position: index + 101 })),
  ];
  const baseCells = result.stackRows.map((_code, rowIndex) => bins.map((bin) => {
    const values = bin.map((record) => result.values.stack[rowIndex * 120 + record.index]).filter((value) => value !== 0);
    return {
      identity: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
      detectedFraction: values.length / bin.length,
      genomicStart: bin[0].position,
      genomicEnd: bin[bin.length - 1].position,
    };
  }));
  const summary = speciesContext.summarizeDisplayHeatmap(result, { bins, cells: baseCells }, rows);
  assert.deepEqual(summary.cells, baseCells);
});
