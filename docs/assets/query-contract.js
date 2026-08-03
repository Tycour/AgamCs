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

  return { QueryValidationError, validateCoordinates };
}));
