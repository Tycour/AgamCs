(function initialiseQueryPermalinks(root, factory) {
  const api = factory();
  root.AgamCsQueryPermalinks = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(globalThis, () => {
  const FRAGMENT_KEY = 'agamcs-query';
  const VERSION = 2;
  const VERSION_PREFIX = `v${VERSION}.`;
  const MAX_FRAGMENT_LENGTH = 12_000;
  const ACCESSION_PATTERN = /^AGAP[0-9]{6,}(?:[-.][A-Z0-9]+)?$/i;

  class PermalinkValidationError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'PermalinkValidationError';
      this.code = code;
    }
  }

  function integer(value, label, { minimum = 0 } = {}) {
    if (!Number.isSafeInteger(value) || value < minimum) {
      throw new PermalinkValidationError('malformed', `Invalid ${label}.`);
    }
    return value;
  }

  function accession(value, label) {
    const normalized = String(value || '').trim().toUpperCase();
    if (!ACCESSION_PATTERN.test(normalized)) {
      throw new PermalinkValidationError('malformed', `Invalid ${label}.`);
    }
    return normalized;
  }

  function resolution(value, label) {
    if (value === 'adaptive') return value;
    if (Number.isSafeInteger(value) && value > 0) return value;
    throw new PermalinkValidationError('malformed', `Invalid ${label}.`);
  }

  function hasExactKeys(value, keys) {
    const expected = new Set(keys);
    return Object.keys(value).length === expected.size
      && Object.keys(value).every((key) => expected.has(key));
  }

  function optionalRange(value) {
    if (value == null) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || !hasExactKeys(value, ['start', 'end'])) {
      throw new PermalinkValidationError('malformed', 'Invalid displayed range.');
    }
    const start = integer(value.start, 'displayed-range start', { minimum: 1 });
    const end = integer(value.end, 'displayed-range end', { minimum: 1 });
    if (end < start) throw new PermalinkValidationError('malformed', 'Invalid displayed range.');
    return { start, end };
  }

  function optionalStringArray(value, label) {
    if (!Array.isArray(value) || value.length > 100
        || value.some((item) => typeof item !== 'string' || !item)) {
      throw new PermalinkValidationError('malformed', `Invalid ${label}.`);
    }
    if (new Set(value).size !== value.length) {
      throw new PermalinkValidationError('malformed', `Invalid ${label}.`);
    }
    return [...value];
  }

  const MAX_INTERVALS = 100;
  const MAX_INTERVAL_NAME_LENGTH = 80;

  function optionalIntervals(value) {
    if (value == null) return [];
    if (!Array.isArray(value) || value.length > MAX_INTERVALS) {
      throw new PermalinkValidationError('malformed', 'Invalid named intervals.');
    }
    const names = new Set();
    return value.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)
          || !hasExactKeys(item, ['id', 'name', 'start', 'end'])) {
        throw new PermalinkValidationError('malformed', 'Invalid named interval.');
      }
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      if (!name || name.length > MAX_INTERVAL_NAME_LENGTH || names.has(name.toLocaleLowerCase())) {
        throw new PermalinkValidationError('malformed', 'Invalid named interval name.');
      }
      names.add(name.toLocaleLowerCase());
      const start = integer(item.start, 'interval start', { minimum: 1 });
      const end = integer(item.end, 'interval end', { minimum: 1 });
      if (end < start) throw new PermalinkValidationError('malformed', 'Invalid named interval bounds.');
      return { id: typeof item.id === 'string' && item.id ? item.id : `interval-${names.size}`, name, start, end };
    });
  }

  function validateState(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new PermalinkValidationError('malformed', 'The permalink state is malformed.');
    }
    const expected = new Set([
      'mode', 'accession', 'transcript', 'coordinates', 'padding', 'signal_resolution',
      'heatmap_resolution', 'display_range', 'show_overlapping_annotations', 'species', 'intervals',
    ]);
    if (Object.keys(raw).some((key) => !expected.has(key))) {
      throw new PermalinkValidationError('malformed', 'The permalink state is not recognized.');
    }
    const mode = raw.mode;
    if (!['accession', 'coordinates'].includes(mode)) {
      throw new PermalinkValidationError('malformed', 'Invalid query mode.');
    }
    const state = {
      mode,
      coordinates: null,
      signal_resolution: resolution(raw.signal_resolution, 'signal resolution'),
      heatmap_resolution: resolution(raw.heatmap_resolution, 'heatmap resolution'),
      display_range: optionalRange(raw.display_range),
      show_overlapping_annotations: raw.show_overlapping_annotations,
      intervals: optionalIntervals(raw.intervals),
      species: null,
    };
    if (typeof state.show_overlapping_annotations !== 'boolean') {
      throw new PermalinkValidationError('malformed', 'Invalid overlapping-annotation setting.');
    }
    if (mode === 'accession') {
      state.accession = accession(raw.accession, 'accession');
      state.transcript = raw.transcript == null ? null : accession(raw.transcript, 'transcript');
      state.padding = integer(raw.padding, 'padding');
      if (raw.coordinates != null) {
        throw new PermalinkValidationError('malformed', 'Invalid accession query state.');
      }
    } else {
      if (!raw.coordinates || typeof raw.coordinates !== 'object' || Array.isArray(raw.coordinates)
          || !hasExactKeys(raw.coordinates, ['chromosome', 'start', 'end'])) {
        throw new PermalinkValidationError('malformed', 'Invalid coordinate query state.');
      }
      state.coordinates = {
        chromosome: String(raw.coordinates.chromosome || ''),
        start: integer(raw.coordinates.start, 'coordinate start', { minimum: 1 }),
        end: integer(raw.coordinates.end, 'coordinate end', { minimum: 1 }),
      };
      if (state.coordinates.end < state.coordinates.start || raw.accession != null
          || raw.transcript != null || raw.padding != null) {
        throw new PermalinkValidationError('malformed', 'Invalid coordinate query state.');
      }
    }
    if (!raw.species || typeof raw.species !== 'object' || Array.isArray(raw.species)
        || !hasExactKeys(raw.species, ['order', 'selected_codes', 'collapsed_clades'])) {
      throw new PermalinkValidationError('malformed', 'Invalid species display state.');
    }
    if (!['topology', 'alphabetical'].includes(raw.species.order)) {
      throw new PermalinkValidationError('malformed', 'Invalid species display order.');
    }
    state.species = {
      order: raw.species.order,
      selected_codes: optionalStringArray(raw.species.selected_codes, 'visible species'),
      collapsed_clades: optionalStringArray(raw.species.collapsed_clades, 'collapsed clades'),
    };
    return state;
  }

  function encodeState(state) {
    return encodeURIComponent(JSON.stringify(validateState(state)));
  }

  function serialize(state) {
    return `#${FRAGMENT_KEY}=${VERSION_PREFIX}${encodeState(state)}`;
  }

  function parse(fragment) {
    const value = String(fragment || '');
    const prefix = `#${FRAGMENT_KEY}=`;
    if (!value) return { kind: 'absent', state: null };
    if (!value.startsWith(prefix)) return { kind: 'absent', state: null };
    const encoded = value.slice(prefix.length);
    if (encoded.length > MAX_FRAGMENT_LENGTH) return { kind: 'invalid', code: 'malformed' };
    const match = /^v([0-9]+)\.(.*)$/.exec(encoded);
    if (!match) return { kind: 'invalid', code: 'malformed' };
    const requestedVersion = Number(match[1]);
    if (requestedVersion < VERSION && requestedVersion !== 1) return { kind: 'invalid', code: 'obsolete-version' };
    if (requestedVersion > VERSION) return { kind: 'invalid', code: 'unknown-version' };
    try {
      return { kind: 'valid', state: validateState(JSON.parse(decodeURIComponent(match[2]))) };
    } catch (_error) {
      return { kind: 'invalid', code: 'malformed' };
    }
  }

  function stateWithoutPrivateValues(state) {
    const validated = validateState(state);
    return {
      mode: validated.mode,
      signal_resolution: validated.signal_resolution,
      heatmap_resolution: validated.heatmap_resolution,
      has_display_range: Boolean(validated.display_range),
      named_interval_count: validated.intervals.length,
      show_overlapping_annotations: validated.show_overlapping_annotations,
      species_order: validated.species.order,
      visible_species_count: validated.species.selected_codes.length,
      collapsed_clade_count: validated.species.collapsed_clades.length,
    };
  }

  function validateForRestore(rawState, options = {}) {
    const state = validateState(rawState);
    const allowedResolutions = new Set((options.allowedResolutions || []).map(String));
    if (!allowedResolutions.has(String(state.signal_resolution))
        || !allowedResolutions.has(String(state.heatmap_resolution))) {
      throw new PermalinkValidationError('unsupported-control', 'Unsupported plot resolution.');
    }
    const speciesCodes = new Set(options.speciesCodes || []);
    const cladeIds = new Set(options.cladeIds || []);
    if (!state.species.selected_codes.every((code) => speciesCodes.has(code))
        || !state.species.collapsed_clades.every((id) => cladeIds.has(id))) {
      throw new PermalinkValidationError('unsupported-control', 'Unsupported species display choice.');
    }
    let expected;
    if (state.mode === 'accession') {
      if (typeof options.resolveAccession !== 'function' || typeof options.padAccession !== 'function') {
        throw new PermalinkValidationError('unavailable', 'Accession validation is unavailable.');
      }
      const selected = state.transcript || state.accession;
      let resolution;
      try {
        resolution = options.resolveAccession(selected);
      } catch (_error) {
        throw new PermalinkValidationError('unavailable', 'Accession is unavailable.');
      }
      if (!resolution || resolution.geneAccession !== state.accession || !resolution.annotation) {
        throw new PermalinkValidationError('unavailable', 'Accession is unavailable.');
      }
      try {
        expected = options.padAccession(resolution.annotation, state.padding);
      } catch (_error) {
        throw new PermalinkValidationError('out-of-range', 'Requested padding is unavailable.');
      }
    } else {
      if (typeof options.validateCoordinates !== 'function') {
        throw new PermalinkValidationError('unavailable', 'Coordinate validation is unavailable.');
      }
      try {
        expected = options.validateCoordinates(
          state.coordinates.chromosome, state.coordinates.start, state.coordinates.end,
        );
      } catch (_error) {
        throw new PermalinkValidationError('out-of-range', 'Coordinates are unavailable.');
      }
    }
    if (!expected || !Number.isSafeInteger(expected.start) || !Number.isSafeInteger(expected.end)
        || expected.start > expected.end || (state.display_range
          && (state.display_range.start < expected.start || state.display_range.end > expected.end))) {
      throw new PermalinkValidationError('out-of-range', 'Displayed range is unavailable.');
    }
    if (state.intervals.some((interval) => interval.start < expected.start
      || interval.end > expected.end)) {
      throw new PermalinkValidationError('out-of-range', 'Named interval is unavailable.');
    }
    return { state, expected: { chromosome: expected.chromosome, start: expected.start, end: expected.end } };
  }

  return {
    FRAGMENT_KEY,
    MAX_FRAGMENT_LENGTH,
    VERSION,
    PermalinkValidationError,
    parse,
    serialize,
    stateWithoutPrivateValues,
    validateForRestore,
    validateState,
  };
}));
