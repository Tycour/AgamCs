const test = require('node:test');
const assert = require('node:assert/strict');

const permalinks = require('../docs/assets/query-permalink.js');

function state(overrides = {}) {
  return {
    mode: 'accession',
    accession: 'AGAP000040',
    transcript: 'AGAP000040-RB',
    coordinates: null,
    padding: 25,
    signal_resolution: 'adaptive',
    heatmap_resolution: 500,
    display_range: { start: 100, end: 200 },
    intervals: [],
    show_overlapping_annotations: true,
    species: {
      order: 'alphabetical',
      selected_codes: ['agambiae', 'aquadriannulatus'],
      collapsed_clades: ['anopheles'],
    },
    ...overrides,
  };
}

test('versioned accession permalink round trips every private query/display choice', () => {
  const original = state();
  const fragment = permalinks.serialize(original);
  assert.match(fragment, /^#agamcs-query=v2\./);
  assert.deepEqual(permalinks.parse(fragment), {
    kind: 'valid', state: permalinks.validateState(original),
  });
});

test('manual coordinate permalink round trips without accession-only fields', () => {
  const original = state({
    mode: 'coordinates',
    accession: null,
    transcript: null,
    padding: undefined,
    coordinates: { chromosome: '3L', start: 38678790, end: 38679501 },
    display_range: null,
  });
  delete original.padding;
  assert.deepEqual(permalinks.parse(permalinks.serialize(original)), {
    kind: 'valid', state: permalinks.validateState(original),
  });
});

test('old, future, unrelated, and malformed fragments fail closed', () => {
  assert.deepEqual(permalinks.parse('#ordinary-anchor'), { kind: 'absent', state: null });
  assert.deepEqual(permalinks.parse('#agamcs-query=v0.%7B%7D'), {
    kind: 'invalid', code: 'obsolete-version',
  });
  const legacy = encodeURIComponent(JSON.stringify({ ...state(), intervals: undefined }));
  assert.equal(permalinks.parse(`#agamcs-query=v1.${legacy}`).kind, 'valid');
  assert.deepEqual(permalinks.parse('#agamcs-query=v3.%7B%7D'), {
    kind: 'invalid', code: 'unknown-version',
  });
  assert.deepEqual(permalinks.parse('#agamcs-query=v1.%7Bnot-json'), {
    kind: 'invalid', code: 'malformed',
  });
  assert.deepEqual(permalinks.parse(`#agamcs-query=v1.${'x'.repeat(permalinks.MAX_FRAGMENT_LENGTH + 1)}`), {
    kind: 'invalid', code: 'malformed',
  });
  assert.deepEqual(permalinks.parse('#agamcs-query=v1.%7B%22mode%22%3A%22accession%22%7D'), {
    kind: 'invalid', code: 'malformed',
  });
});

test('malformed coordinates, padding, range, and species choices are rejected', () => {
  for (const candidate of [
    state({ padding: -1 }),
    state({ display_range: { start: 201, end: 200 } }),
    state({ species: { order: 'random', selected_codes: [], collapsed_clades: [] } }),
    state({ species: { order: 'topology', selected_codes: ['a', 'a'], collapsed_clades: [] } }),
    state({ display_range: { start: 100, end: 200, unexpected: true } }),
    state({ mode: 'coordinates', accession: null, transcript: null, padding: undefined,
      coordinates: { chromosome: '3L', start: 8, end: 7 } }),
  ]) {
    assert.throws(() => permalinks.validateState(candidate), permalinks.PermalinkValidationError);
  }
});

function restoreOptions(overrides = {}) {
  return {
    allowedResolutions: ['adaptive', '500'],
    speciesCodes: ['AcolM1', 'AaraD1'],
    cladeIds: ['Anopheles'],
    resolveAccession(value) {
      if (value !== 'AGAP000040-RB') throw new Error('deleted accession');
      return {
        geneAccession: 'AGAP000040',
        annotation: { chromosome: '3L', start: 100, end: 200 },
      };
    },
    padAccession(annotation, padding) {
      if (padding > 50) throw new Error('padding limit');
      return { chromosome: annotation.chromosome, start: annotation.start - padding, end: annotation.end + padding };
    },
    validateCoordinates(chromosome, start, end) {
      if (chromosome !== '3L' || start < 1 || end > 300) throw new Error('out of range');
      return { chromosome, start, end };
    },
    ...overrides,
  };
}

test('restore validation rejects deleted accessions, padding limits, manual intervals, and out-of-range zooms', () => {
  const valid = state({
    display_range: { start: 100, end: 200 },
    species: { order: 'topology', selected_codes: ['AcolM1'], collapsed_clades: ['Anopheles'] },
    heatmap_resolution: 500,
  });
  assert.deepEqual(permalinks.validateForRestore(valid, restoreOptions()).expected, {
    chromosome: '3L', start: 75, end: 225,
  });
  assert.throws(() => permalinks.validateForRestore(state({ accession: 'AGAP999999', transcript: null,
    species: valid.species, heatmap_resolution: 500 }), restoreOptions()), permalinks.PermalinkValidationError);
  assert.throws(() => permalinks.validateForRestore(state({ padding: 51,
    species: valid.species, heatmap_resolution: 500 }), restoreOptions()), permalinks.PermalinkValidationError);
  const coordinates = state({ mode: 'coordinates', accession: undefined, transcript: undefined, padding: undefined,
    coordinates: { chromosome: '3L', start: 1, end: 301 }, display_range: null,
    species: valid.species, heatmap_resolution: 500 });
  delete coordinates.accession;
  delete coordinates.transcript;
  delete coordinates.padding;
  assert.throws(() => permalinks.validateForRestore(coordinates, restoreOptions()), permalinks.PermalinkValidationError);
  assert.throws(() => permalinks.validateForRestore(state({ display_range: { start: 1, end: 200 },
    species: valid.species, heatmap_resolution: 500 }), restoreOptions()), permalinks.PermalinkValidationError);
});

test('the analytics-safe view contains no accession, coordinates, transcript, padding, or range', () => {
  const safe = permalinks.stateWithoutPrivateValues(state());
  const encoded = JSON.stringify(safe);
  assert.doesNotMatch(encoded, /AGAP|100|200|25|transcript|coordinates/i);
  assert.deepEqual(safe, {
    mode: 'accession', signal_resolution: 'adaptive', heatmap_resolution: 500,
    has_display_range: true, show_overlapping_annotations: true,
    named_interval_count: 0,
    species_order: 'alphabetical', visible_species_count: 2, collapsed_clade_count: 1,
  });
});
