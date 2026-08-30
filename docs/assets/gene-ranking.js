(function initialiseGeneRanking(root, factory) {
  const api = factory();
  root.AgamCsGeneRankings = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(globalThis, () => {
  const METRICS = ['gene_span', 'representative_exons'];

  function validate(document, expectedType) {
    if (document?.schema_version !== 1 || document?.assembly !== 'AgamP4'
        || !document?.records || !document?.cohorts
        || (expectedType && document.ranking_type !== expectedType)) {
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

  function rankedMetric(summary, globalCount, chromosomeCount, valueField) {
    return {
      eligible: true,
      value: Number(summary[valueField]),
      global: {
        ...rankRange(summary.global), count: globalCount,
        percentile: Number(summary.global.percentile),
      },
      chromosome: {
        ...rankRange(summary.chromosome), count: chromosomeCount,
        percentile: Number(summary.chromosome.percentile),
      },
    };
  }

  function lookup(csDocument, snpDocument, accession) {
    const cs = csDocument ? validate(csDocument, 'mean_cs') : null;
    const snp = snpDocument ? validate(snpDocument, 'accessible_mean_snp_density') : null;
    const normalized = String(accession || '').trim().toUpperCase();
    const csRecord = cs?.records?.[normalized];
    const snpRecord = snp?.records?.[normalized];
    if (!csRecord && !snpRecord) return null;
    const record = csRecord || snpRecord;
    const result = {
      accession: normalized,
      chromosome: record.chromosome,
      representativeTranscript: record.representative_transcript,
    };
    if (csRecord) {
      result.cs = { interpretation: cs.score_source.interpretation, metrics: {} };
      METRICS.forEach((metric) => {
        result.cs.metrics[metric] = rankedMetric(
          csRecord[metric], cs.cohorts.global_gene_count,
          cs.cohorts.chromosome_gene_counts[record.chromosome], 'mean_cs',
        );
      });
    }
    if (snpRecord) {
      result.snpDensity = {
        interpretation: snp.score_source.interpretation,
        accessibilityInterpretation: snp.accessibility_source.interpretation,
        minimumAccessibleFraction: Number(snp.minimum_accessible_fraction),
        metrics: {},
      };
      METRICS.forEach((metric) => {
        const summary = snpRecord[metric];
        const coverage = {
          accessibleBases: Number(summary.accessible_bases),
          totalBases: Number(summary.total_bases),
          accessibleFraction: Number(summary.accessible_fraction),
        };
        result.snpDensity.metrics[metric] = summary.eligible
          ? {
            ...rankedMetric(
              summary, snp.cohorts.global_eligible_gene_counts[metric],
              snp.cohorts.chromosome_eligible_gene_counts[metric][record.chromosome],
              'mean_snp_density',
            ),
            ...coverage,
          }
          : { eligible: false, value: summary.mean_snp_density, ...coverage };
      });
    }
    return result;
  }

  return { METRICS, lookup, rankRange, validate };
}));
