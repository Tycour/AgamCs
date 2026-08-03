(function initialiseAccessionLookup(root, factory) {
  const api = factory();
  root.AgamCsAccessions = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(globalThis, () => {
  class AccessionLookupError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'AccessionLookupError';
      this.code = code;
    }
  }

  function normalize(value) {
    return String(value || '').trim().toUpperCase();
  }

  function targets(value) {
    if (Array.isArray(value)) return value.map(normalize).filter(Boolean);
    if (typeof value === 'string') return [normalize(value)].filter(Boolean);
    return [];
  }

  function annotationLabel(index) {
    return index?.annotation?.gene_build || index?.assembly || 'pinned annotation';
  }

  function currentRecord(index, accession, matchedAs = 'canonical') {
    const record = index?.accessions?.[accession];
    if (!record || record.status !== 'current' || !record.annotation) {
      throw new AccessionLookupError(
        'invalid-index',
        `The pinned index points to an unavailable canonical record (${accession}).`,
      );
    }
    return { accession, matchedAs, record, annotation: record.annotation };
  }

  function resolve(index, value) {
    const accession = normalize(value);
    if (!accession) {
      throw new AccessionLookupError('empty', 'Enter a gene accession from the pinned index.');
    }
    if (index?.accessions?.[accession]) return currentRecord(index, accession);

    const aliasTargets = targets(index?.aliases?.[accession]);
    if (aliasTargets.length > 1) {
      throw new AccessionLookupError(
        'ambiguous',
        `${accession} is ambiguous in ${annotationLabel(index)}: ${aliasTargets.join(', ')}. `
          + 'Choose a canonical accession or use manual coordinates.',
      );
    }
    if (aliasTargets.length === 1) return currentRecord(index, aliasTargets[0], 'alias');

    const retired = index?.retired?.[accession];
    if (retired) {
      const replacements = targets(retired.replacements || retired.replacement);
      const replacementText = replacements.length
        ? ` Suggested replacement${replacements.length === 1 ? '' : 's'}: ${replacements.join(', ')}.`
        : ' No replacement is recorded.';
      throw new AccessionLookupError(
        'retired',
        `${accession} is retired in ${annotationLabel(index)}.${replacementText} `
          + 'Review the replacement or use manual coordinates.',
      );
    }

    throw new AccessionLookupError(
      'missing',
      `${accession} is not in the pinned ${annotationLabel(index)} index. `
        + 'Use manual coordinates; live Ensembl lookup is intentionally disabled.',
    );
  }

  return { AccessionLookupError, normalize, resolve };
}));
