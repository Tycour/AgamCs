(function initialiseQueryContract(root, factory) {
  const api = factory();
  root.AgamCsQueryContract = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(globalThis, () => {
  class QueryValidationError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'QueryValidationError';
      this.code = code;
    }
  }

  function validateCoordinates(manifest, chromosomeValue, startValue, endValue) {
    const chromosome = String(chromosomeValue || '');
    const start = Number(startValue);
    const end = Number(endValue);
    if (!manifest?.chromosomes || !(chromosome in manifest.chromosomes)) {
      throw new QueryValidationError(
        'chromosome',
        `Chromosome ${chromosome || '(empty)'} is not available in ${manifest?.assembly || 'this dataset'}.`,
      );
    }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      throw new QueryValidationError('coordinate-order', 'Coordinates must satisfy 1 ≤ start ≤ end.');
    }
    const chromosomeLength = Number(manifest.chromosomes[chromosome].length);
    if (end > chromosomeLength) {
      throw new QueryValidationError(
        'chromosome-bound',
        `End coordinate ${end.toLocaleString()} exceeds ${chromosome} length ${chromosomeLength.toLocaleString()}.`,
      );
    }
    const length = end - start + 1;
    if (length > manifest.maximum_query_bases) {
      throw new QueryValidationError(
        'maximum-length',
        `Queries are limited to ${Number(manifest.maximum_query_bases).toLocaleString()} bases.`,
      );
    }
    return { chromosome, start, end, length };
  }

  function padCoordinates(manifest, chromosomeValue, startValue, endValue, paddingValue) {
    const coordinates = validateCoordinates(manifest, chromosomeValue, startValue, endValue);
    const requestedPadding = Number(paddingValue);
    if (!Number.isSafeInteger(requestedPadding) || requestedPadding < 0) {
      throw new QueryValidationError(
        'padding',
        'Padding must be a non-negative whole number of bases per side.',
      );
    }
    const chromosomeLength = Number(manifest.chromosomes[coordinates.chromosome].length);
    const start = Math.max(1, coordinates.start - requestedPadding);
    const end = Math.min(chromosomeLength, coordinates.end + requestedPadding);
    const padded = validateCoordinates(manifest, coordinates.chromosome, start, end);
    return {
      ...padded,
      requestedPadding,
      leftPadding: coordinates.start - padded.start,
      rightPadding: padded.end - coordinates.end,
    };
  }

  return { QueryValidationError, padCoordinates, validateCoordinates };
}));
