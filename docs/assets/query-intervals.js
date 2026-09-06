(function initialiseQueryIntervals(root, factory) {
  const api = factory(root);
  root.AgamCsQueryIntervals = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(globalThis, (root) => {
  const MAX_INTERVALS = 100;
  const MAX_NAME_LENGTH = 80;

  function fail(message) {
    throw new Error(message);
  }

  function integer(value, label) {
    if (!Number.isSafeInteger(value)) fail(`${label} must be a whole genomic position.`);
    return value;
  }

  function validateName(value) {
    if (typeof value !== 'string') fail('Interval name must be text.');
    const name = value.trim();
    if (!name || name.length > MAX_NAME_LENGTH) {
      fail(`Interval names must contain 1-${MAX_NAME_LENGTH} characters.`);
    }
    return name;
  }

  function validateBounds(start, end, query) {
    integer(start, 'Interval start');
    integer(end, 'Interval end');
    if (start > end) fail('Interval start must not exceed interval end.');
    if (start < query.start || end > query.end) {
      fail(`Interval coordinates must stay within ${query.chromosome}:${query.start}-${query.end}.`);
    }
    return { start, end };
  }

  function validateInterval(raw, query, existing = [], editingId = null) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Malformed interval.');
    const name = validateName(raw.name);
    const bounds = validateBounds(raw.start, raw.end, query);
    const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
    if (existing.some((interval) => interval.id !== editingId
      && interval.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      fail('Interval names must be unique, ignoring letter case.');
    }
    return { id: id || `interval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name, ...bounds };
  }

  function validateState(raw, query) {
    if (!Array.isArray(raw) || raw.length > MAX_INTERVALS) fail('Malformed interval state.');
    const output = [];
    raw.forEach((interval) => output.push(validateInterval(interval, query, output)));
    return output;
  }

  function add(intervals, raw, query) {
    if (intervals.length >= MAX_INTERVALS) fail(`You can define at most ${MAX_INTERVALS} intervals.`);
    return [...intervals, validateInterval(raw, query, intervals)];
  }

  function edit(intervals, id, raw, query) {
    const index = intervals.findIndex((interval) => interval.id === id);
    if (index < 0) fail('The interval no longer exists.');
    const next = validateInterval({ ...raw, id }, query, intervals, id);
    return intervals.map((interval, candidate) => candidate === index ? next : interval);
  }

  function remove(intervals, id) {
    return intervals.filter((interval) => interval.id !== id);
  }

  function summarise(interval, result) {
    const summary = root.AgamCsQuerySummary.summarizeInterval(
      result, interval.start, interval.end, interval.name,
    );
    return { ...interval, summary };
  }

  return {
    MAX_INTERVALS,
    MAX_NAME_LENGTH,
    add,
    edit,
    remove,
    summarise,
    validateInterval,
    validateState,
  };
}));
