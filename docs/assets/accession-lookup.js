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
    return index?.annotation?.gene_build || index?.assembly || 'versioned annotation';
  }

  function currentRecord(index, accession, matchedAs = 'canonical') {
    const record = index?.accessions?.[accession];
    if (!record || record.status !== 'current' || !record.annotation) {
      throw new AccessionLookupError(
        'invalid-index',
        `The versioned index points to an unavailable canonical record (${accession}).`,
      );
    }
    return {
      accession,
      geneAccession: accession,
      matchedAs,
      record,
      annotation: record.annotation,
    };
  }

  function transcriptRecord(index, transcriptId) {
    const model = index?.transcripts?.[transcriptId];
    const geneAccession = model?.gene_accession;
    const geneRecord = index?.accessions?.[geneAccession];
    if (!model || !geneRecord?.annotation) {
      throw new AccessionLookupError(
        'invalid-index',
        `The versioned index points to an unavailable transcript model (${transcriptId}).`,
      );
    }
    const annotation = {
      ...geneRecord.annotation,
      start: model.start,
      end: model.end,
      transcript_id: transcriptId,
      exons: model.exons.map(([start, end]) => ({ start, end })),
      cds_start: model.cds_start,
      cds_end: model.cds_end,
    };
    const record = {
      status: 'current',
      gene_accession: geneAccession,
      region: `${annotation.chromosome}:${annotation.start}-${annotation.end}`,
      annotation,
    };
    return {
      accession: transcriptId,
      geneAccession,
      matchedAs: 'transcript',
      record,
      annotation,
    };
  }

  function resolve(index, value) {
    const accession = normalize(value);
    if (!accession) {
      throw new AccessionLookupError(
        'empty',
        'Enter an AGAP gene or transcript accession from the versioned index.',
      );
    }
    if (index?.accessions?.[accession]) return currentRecord(index, accession);
    if (index?.transcripts?.[accession]) return transcriptRecord(index, accession);

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
      `${accession} is not a gene or transcript in the versioned ${annotationLabel(index)} index for the supported chromosomes. `
        + 'Check the annotation release. Use manual coordinates if needed.',
    );
  }

  function overlappingGenes(index, chromosome, start, end, excludedAccessions = []) {
    const lower = Number(start);
    const upper = Number(end);
    if (!Number.isSafeInteger(lower) || !Number.isSafeInteger(upper) || lower > upper) {
      throw new AccessionLookupError(
        'invalid-region',
        'Overlapping annotations require an inclusive region with whole-number coordinates.',
      );
    }
    const excluded = new Set(targets(excludedAccessions));
    return Object.entries(index?.accessions || {})
      .filter(([accession, record]) => {
        const annotation = record?.annotation;
        return record?.status === 'current'
          && annotation
          && !excluded.has(accession)
          && String(annotation.chromosome) === String(chromosome)
          && Number(annotation.end) >= lower
          && Number(annotation.start) <= upper;
      })
      .map(([accession, record]) => ({ accession, annotation: record.annotation }))
      .sort((left, right) => (
        Number(left.annotation.start) - Number(right.annotation.start)
        || Number(left.annotation.end) - Number(right.annotation.end)
        || left.accession.localeCompare(right.accession)
      ));
  }

  return { AccessionLookupError, normalize, overlappingGenes, resolve };
}));
