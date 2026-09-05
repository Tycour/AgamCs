(function initialiseGeneRanking(root, factory) {
  const api = factory();
  root.AgamCsGeneRankings = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(globalThis, () => {
  const SCHEMA_VERSION = 2;
  const METRICS = [
    'gene_span', 'representative_exons', 'representative_cds',
    'representative_utr', 'representative_introns',
  ];
  const CS_FIELDS = ['total_bases', 'bases_assessed', 'mean_cs', 'global', 'chromosome'];
  const SNP_FIELDS = [
    'total_bases', 'accessible_bases', 'bases_assessed', 'accessible_fraction',
    'mean_snp_density', 'global', 'chromosome',
  ];

  function validate(document, expectedType) {
    const expectedFields = expectedType === 'mean_cs' ? CS_FIELDS : SNP_FIELDS;
    if (document?.schema_version !== SCHEMA_VERSION || document?.assembly !== 'AgamP4'
        || !document?.records || !document?.cohorts
        || JSON.stringify(document.scope_order) !== JSON.stringify(METRICS)
        || JSON.stringify(document.record_fields) !== JSON.stringify([
          'chromosome', 'representative_transcript', 'scopes',
        ])
        || JSON.stringify(document.rank_fields) !== JSON.stringify(['rank', 'ties', 'percentile'])
        || JSON.stringify(document.scope_value_fields) !== JSON.stringify(expectedFields)
        || (expectedType && document.ranking_type !== expectedType)) {
      throw new Error('The gene-ranking asset is not compatible with this client.');
    }
    return document;
  }

  function rankRange(statistics, count) {
    if (!Array.isArray(statistics) || statistics.length !== 3) {
      throw new Error('Invalid gene-ranking position.');
    }
    const [first, ties, percentile] = statistics.map(Number);
    if (!Number.isSafeInteger(first) || first < 1 || !Number.isSafeInteger(ties) || ties < 1
        || !Number.isFinite(percentile) || !Number.isSafeInteger(count) || count < 1) {
      throw new Error('Invalid gene-ranking position.');
    }
    return {
      first, last: first + ties - 1, ties, count, percentile,
      cohortDenominator: count,
    };
  }

  function scopeState(summary, kind, threshold) {
    if (summary.total_bases == null) return 'not_ranked_unavailable';
    if (summary.total_bases === 0) return 'not_ranked_zero_bases';
    if (kind === 'snpDensity'
        && (summary.accessible_fraction == null || summary.accessible_fraction < threshold)) {
      return 'not_ranked_ineligible';
    }
    const value = kind === 'cs' ? summary.mean_cs : summary.mean_snp_density;
    if (!summary.bases_assessed || !Number.isFinite(Number(value))
        || !summary.global || !summary.chromosome) {
      return 'not_ranked_unavailable';
    }
    return 'ranked';
  }

  function decodeRecord(document, row, kind) {
    if (!Array.isArray(row) || row.length !== 3 || !Array.isArray(row[2])
        || row[2].length !== METRICS.length) {
      throw new Error('Invalid compact gene-ranking record.');
    }
    const [chromosome, representativeTranscript, scopeRows] = row;
    const fields = kind === 'cs' ? CS_FIELDS : SNP_FIELDS;
    const threshold = kind === 'snpDensity' ? Number(document.minimum_accessible_fraction) : null;
    const metrics = {};
    METRICS.forEach((metric, index) => {
      const values = scopeRows[index];
      if (!Array.isArray(values) || values.length !== fields.length) {
        throw new Error(`Invalid compact ${metric} ranking summary.`);
      }
      const summary = Object.fromEntries(fields.map((field, position) => [field, values[position]]));
      const state = scopeState(summary, kind, threshold);
      const output = {
        state,
        eligible: state === 'ranked',
        representativeTranscript,
        totalBases: summary.total_bases,
        basesAssessed: Number(summary.bases_assessed),
        value: summary[kind === 'cs' ? 'mean_cs' : 'mean_snp_density'],
        globalCohortDenominator: document.cohorts.global_ranked_scope_counts[metric],
        chromosomeCohortDenominator:
          document.cohorts.chromosome_ranked_scope_counts[metric][chromosome],
      };
      if (kind === 'snpDensity') {
        output.accessibleBases = summary.accessible_bases;
        output.accessibleFraction = summary.accessible_fraction;
      }
      if (state === 'ranked') {
        output.global = rankRange(
          summary.global, output.globalCohortDenominator,
        );
        output.chromosome = rankRange(
          summary.chromosome,
          output.chromosomeCohortDenominator,
        );
      }
      metrics[metric] = output;
    });
    return { chromosome, representativeTranscript, metrics };
  }

  function lookup(csDocument, snpDocument, accession) {
    const cs = csDocument ? validate(csDocument, 'mean_cs') : null;
    const snp = snpDocument ? validate(snpDocument, 'accessible_mean_snp_density') : null;
    const normalized = String(accession || '').trim().toUpperCase();
    const csRow = cs?.records?.[normalized];
    const snpRow = snp?.records?.[normalized];
    if (!csRow && !snpRow) return null;
    const csRecord = csRow ? decodeRecord(cs, csRow, 'cs') : null;
    const snpRecord = snpRow ? decodeRecord(snp, snpRow, 'snpDensity') : null;
    const record = csRecord || snpRecord;
    const result = {
      accession: normalized,
      chromosome: record.chromosome,
      representativeTranscript: record.representativeTranscript,
    };
    if (csRecord) {
      result.cs = {
        interpretation: cs.score_source.interpretation,
        rankingVersion: cs.ranking_version,
        metrics: csRecord.metrics,
      };
    }
    if (snpRecord) {
      result.snpDensity = {
        interpretation: snp.score_source.interpretation,
        accessibilityInterpretation: snp.accessibility_source.interpretation,
        minimumAccessibleFraction: Number(snp.minimum_accessible_fraction),
        rankingVersion: snp.ranking_version,
        metrics: snpRecord.metrics,
      };
    }
    return result;
  }

  return { METRICS, lookup, rankRange, validate };
}));
