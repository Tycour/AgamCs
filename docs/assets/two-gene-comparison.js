(function initialiseTwoGeneComparison(root, factory) {
  const api = factory(root);
  root.AgamCsTwoGeneComparison = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(globalThis, (root) => {
  const VERSION = 'agamcs-two-gene-comparison-v1';
  const RANK_SCOPES = [
    'gene_span', 'representative_exons', 'representative_cds',
    'representative_utr', 'representative_introns',
  ];

  function unavailable(reason, extra = {}) {
    return { availability: 'unavailable', reason, ...extra };
  }

  function available(value) {
    return { availability: 'available', value };
  }

  function summaryById(summary) {
    return Object.fromEntries(summary.scopes.map((scope) => [scope.scope_id, scope]));
  }

  function rankingMetric(metric) {
    if (!metric) return unavailable('Static ranking asset is unavailable.');
    if (metric.state !== 'ranked') {
      return unavailable(
        metric.state === 'not_ranked_ineligible'
          ? 'Below the 80% accessibility eligibility threshold.'
          : metric.state === 'not_ranked_zero_bases'
            ? 'This representative-transcript partition contains zero bases.'
            : 'Ranking evidence is unavailable for this partition.',
        {
          state: metric.state,
          total_bases: metric.totalBases,
          assessed_bases: metric.basesAssessed,
          accessible_bases: metric.accessibleBases ?? null,
          accessible_fraction: metric.accessibleFraction ?? null,
          global_cohort_denominator: metric.globalCohortDenominator ?? 0,
          chromosome_cohort_denominator: metric.chromosomeCohortDenominator ?? 0,
        },
      );
    }
    return available({
      state: metric.state,
      value: metric.value,
      total_bases: metric.totalBases,
      assessed_bases: metric.basesAssessed,
      accessible_bases: metric.accessibleBases ?? null,
      accessible_fraction: metric.accessibleFraction ?? null,
      global: metric.global,
      chromosome: metric.chromosome,
      global_cohort_denominator: metric.global.cohortDenominator,
      chromosome_cohort_denominator: metric.chromosome.cohortDenominator,
    });
  }

  function buildSide(source) {
    if (!source?.result || !source?.annotation || !source?.geneAccession) {
      throw new Error('A comparison side requires a resolved gene, selected transcript, and result.');
    }
    const summary = root.AgamCsQuerySummary.summarizeQuery(source.result, source.annotation);
    const ranking = source.ranking || null;
    const rankMetrics = {};
    for (const scope of RANK_SCOPES) {
      rankMetrics[scope] = {
        cs: rankingMetric(ranking?.cs?.metrics?.[scope]),
        low_snp_density: rankingMetric(ranking?.snpDensity?.metrics?.[scope]),
      };
    }
    return {
      gene_accession: source.geneAccession,
      chromosome: source.result.chromosome,
      query_coordinates: { start: source.result.start, end: source.result.end },
      axis: {
        coordinate_system: 'AgamP4 1-based inclusive genomic coordinates',
        independent: true,
        note: 'This locus is displayed on its own genomic axis and is not aligned to the other locus.',
      },
      live_query_transcript: {
        transcript_id: summary.selected_transcript?.transcript_id || null,
        note: 'Used only for this live query’s feature summaries.',
      },
      pinned_ranking_transcript: {
        transcript_id: ranking?.representativeTranscript || null,
        note: 'Used by the static representative-transcript rankings; it does not change with the live-query transcript.',
      },
      query_summary: {
        summary_version: summary.summary_version,
        ranking_accessibility_threshold: summary.ranking_accessibility_threshold,
        scopes: summaryById(summary),
      },
      static_rankings: rankMetrics,
    };
  }

  function buildComparison({ left, right, provenance = {} }) {
    const leftSide = buildSide(left);
    const rightSide = buildSide(right);
    if (leftSide.gene_accession === rightSide.gene_accession) {
      throw new Error('Choose two different genes for a comparison.');
    }
    return {
      comparison_version: VERSION,
      coordinate_convention: '1-based inclusive',
      comparison_scope: 'Contextual standardized summaries and rankings only; this is not coordinate alignment or statistical testing.',
      provenance,
      sides: { left: leftSide, right: rightSide },
      limitations: [
        'Each locus has an independent genomic axis; coordinates are never stretched, superimposed, or aligned across loci.',
        'QC-failed bases are unknown and are never exported as zero SNP density or zero accessibility.',
        'Unavailable partitions and ranks remain explicit unavailable states, not zero values.',
      ],
    };
  }

  function valueOrUnavailable(value) {
    return value == null || !Number.isFinite(Number(value)) ? 'UNAVAILABLE' : String(value);
  }

  function tsvRows(comparison) {
    const rows = [[
      'side', 'record_type', 'scope', 'metric', 'availability', 'value', 'reason',
      'assessed_bases', 'accessible_bases', 'total_bases', 'accessible_fraction',
      'accessibility_eligible', 'global_percentile', 'global_rank',
      'global_cohort_denominator', 'chromosome_percentile', 'chromosome_rank',
      'chromosome_cohort_denominator', 'live_query_transcript', 'pinned_ranking_transcript',
      'chromosome', 'query_start', 'query_end',
    ]];
    for (const [sideName, side] of Object.entries(comparison.sides)) {
      const shared = [
        side.live_query_transcript.transcript_id || 'UNAVAILABLE',
        side.pinned_ranking_transcript.transcript_id || 'UNAVAILABLE',
        side.chromosome, side.query_coordinates.start, side.query_coordinates.end,
      ];
      for (const [scope, summary] of Object.entries(side.query_summary.scopes)) {
        rows.push([
          sideName, 'live_query_summary', scope, 'mean_cs', 'available',
          valueOrUnavailable(summary.mean_cs), '', summary.finite_cs_bases,
          summary.accessible_bases, summary.total_bases, valueOrUnavailable(summary.accessible_fraction),
          summary.meets_ranking_accessibility_threshold == null ? 'UNAVAILABLE' : String(summary.meets_ranking_accessibility_threshold),
          'UNAVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE', ...shared,
        ]);
        rows.push([
          sideName, 'live_query_summary', scope, 'mean_accessible_snp_density', 'available',
          valueOrUnavailable(summary.mean_accessible_snp_density), '', summary.finite_accessible_snp_bases,
          summary.accessible_bases, summary.total_bases, valueOrUnavailable(summary.accessible_fraction),
          summary.meets_ranking_accessibility_threshold == null ? 'UNAVAILABLE' : String(summary.meets_ranking_accessibility_threshold),
          'UNAVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE', 'UNAVAILABLE', ...shared,
        ]);
      }
      for (const [scope, metrics] of Object.entries(side.static_rankings)) {
        for (const [metricName, record] of Object.entries(metrics)) {
          const metric = record.value;
          rows.push([
            sideName, 'static_ranking', scope, metricName, record.availability,
            record.availability === 'available' ? valueOrUnavailable(metric.value) : 'UNAVAILABLE',
            record.reason || '', metric?.assessed_bases ?? record.assessed_bases ?? 'UNAVAILABLE',
            metric?.accessible_bases ?? record.accessible_bases ?? 'UNAVAILABLE',
            metric?.total_bases ?? record.total_bases ?? 'UNAVAILABLE',
            valueOrUnavailable(metric?.accessible_fraction ?? record.accessible_fraction),
            metricName === 'low_snp_density'
              ? String(record.availability === 'available') : 'UNAVAILABLE',
            metric?.global?.percentile ?? 'UNAVAILABLE', metric?.global?.first ?? 'UNAVAILABLE',
            metric?.global_cohort_denominator ?? record.global_cohort_denominator ?? 'UNAVAILABLE',
            metric?.chromosome?.percentile ?? 'UNAVAILABLE', metric?.chromosome?.first ?? 'UNAVAILABLE',
            metric?.chromosome_cohort_denominator ?? record.chromosome_cohort_denominator ?? 'UNAVAILABLE', ...shared,
          ]);
        }
      }
    }
    return rows;
  }

  function toTsv(comparison) {
    const metadata = [
      `# comparison_version\t${comparison.comparison_version}`,
      `# coordinate_convention\t${comparison.coordinate_convention}`,
      `# comparison_scope\t${comparison.comparison_scope}`,
      `# provenance\t${JSON.stringify(comparison.provenance)}`,
      '# unavailable_values\tUNAVAILABLE means unavailable evidence, never zero',
    ];
    return `${[...metadata, ...tsvRows(comparison).map((row) => row.join('\t'))].join('\n')}\n`;
  }

  return { VERSION, RANK_SCOPES, buildComparison, buildSide, toTsv, tsvRows };
}));
