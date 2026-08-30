(function initialiseGeneRanking(root, factory) {
  const api = factory();
  root.AgamCsGeneRankings = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(globalThis, () => {
  const METRICS = ['gene_span', 'representative_exons'];

  function validate(document) {
    if (document?.schema_version !== 1 || document?.assembly !== 'AgamP4'
        || !document?.records || !document?.cohorts) {
      throw new Error('The gene-ranking asset is not compatible with this client.');
    }
    return document;
  }

  function rankRange(statistics) {
    const first = Number(statistics?.rank);
    const ties = Number(statistics?.ties);
    if (!Number.isSafeInteger(first) || first < 1 || !Number.isSafeInteger(ties) || ties < 1) {
      throw new Error('Invalid gene-ranking position.');
    }
    return { first, last: first + ties - 1, ties };
  }

  function lookup(document, accession) {
    const rankings = validate(document);
    const normalized = String(accession || '').trim().toUpperCase();
    const record = rankings.records[normalized];
    if (!record) return null;
    const globalCount = Number(rankings.cohorts.global_gene_count);
    const chromosomeCount = Number(
      rankings.cohorts.chromosome_gene_counts?.[record.chromosome],
    );
    const metrics = {};
    METRICS.forEach((metric) => {
      const summary = record[metric];
      metrics[metric] = {
        bases: Number(summary.bases),
        meanCs: Number(summary.mean_cs),
        global: {
          ...rankRange(summary.global),
          count: globalCount,
          percentile: Number(summary.global.percentile),
        },
        chromosome: {
          ...rankRange(summary.chromosome),
          count: chromosomeCount,
          percentile: Number(summary.chromosome.percentile),
        },
      };
    });
    return {
      accession: normalized,
      chromosome: record.chromosome,
      representativeTranscript: record.representative_transcript,
      interpretation: rankings.score_source.interpretation,
      percentileMethod: rankings.percentile_method,
      metrics,
    };
  }

  return { METRICS, lookup, rankRange, validate };
}));
