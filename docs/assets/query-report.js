(function initialiseQueryReport(root, factory) {
  const api = factory();
  root.AgamCsQueryReport = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(globalThis, () => {
  const REPORT_VERSION = 'agamcs-query-report-v2';
  const SCHEMA_VERSION = 2;
  const LEGACY_REPORT_VERSION = 'agamcs-query-report-v1';
  const COORDINATE_CONVENTION = '1-based inclusive';

  function availability(value, reason) {
    return { availability: 'unavailable', reason, value };
  }

  function display(query, settings = {}) {
    return {
      displayed_range: {
        start: Number(settings.start ?? query.start),
        end: Number(settings.end ?? query.end),
      },
      signal_resolution_bins: settings.signal_resolution_bins ?? null,
      heatmap_resolution_bins: settings.heatmap_resolution_bins ?? null,
    };
  }

  function methodsText(report) {
    const query = report.query_state.coordinates;
    const shown = report.display;
    const transcript = report.selected_annotation?.transcript_id || 'no selected transcript';
    const intervalNote = report.named_intervals ? ` Named interval summaries include ${report.named_intervals.length} browser-local interval${report.named_intervals.length === 1 ? '' : 's'}.` : '';
    return `AgamCs report ${report.report_version} used ${report.provenance.assembly} ${report.coordinate_convention} coordinates for ${query.chromosome}:${query.start}-${query.end} with ${transcript}. Query partitions use ${report.calculation_methods.query_summary}; notable windows use ${report.calculation_methods.notable_windows}; species/clade summaries use ${report.calculation_methods.species_context}. SNP-density means use accessible focal bases only and retain QC-failed positions as unknown.${intervalNote} Displayed range was ${shown.displayed_range.start}-${shown.displayed_range.end} with ${shown.signal_resolution_bins ?? 'unavailable'} signal bins and ${shown.heatmap_resolution_bins ?? 'unavailable'} heatmap bins.`;
  }

  function figureCaption(report) {
    const query = report.query_state.coordinates;
    const shown = report.display;
    const transcript = report.selected_annotation?.transcript_id || 'unavailable';
    const scope = report.accessibility_audit.scopes[0];
    return `AgamCs ${report.provenance.assembly} conservation and accessible-base SNP-density view for ${query.chromosome}:${query.start}-${query.end} (inclusive), selected transcript ${transcript}. The displayed range is ${shown.displayed_range.start}-${shown.displayed_range.end} at ${shown.signal_resolution_bins ?? 'unavailable'} signal and ${shown.heatmap_resolution_bins ?? 'unavailable'} heatmap bins; the accessibility denominator is ${scope.accessible_bases}/${scope.total_bases} accessible bases. QC-failed bases are unknown rather than zero, and zero CNEr values denote no detected interval rather than measured 0% identity.`;
  }

  function buildReport(sourceResult, options = {}) {
    const selected = globalThis.AgamCsQuerySummary.selectTranscriptAnnotation(
      options.annotation || null, options.transcriptAnnotations || [],
    );
    const summary = globalThis.AgamCsQuerySummary.summarizeQuery(sourceResult, selected);
    const queryState = { ...(options.queryState || {}) };
    queryState.mode = queryState.mode || 'coordinates';
    queryState.coordinates = {
      chromosome: summary.query.chromosome, start: summary.query.start, end: summary.query.end,
    };
    queryState.padding_bases_per_side = queryState.padding_bases_per_side ?? 0;
    let species;
    try {
      species = { availability: 'available', value: globalThis.AgamCsSpeciesContext.analyzeSpeciesContext(sourceResult) };
    } catch (error) {
      species = availability(null, error.message);
    }
    const legacy = options.contractVersion === 1;
    const report = {
      schema_version: legacy ? 1 : SCHEMA_VERSION,
      report_version: legacy ? LEGACY_REPORT_VERSION : REPORT_VERSION,
      coordinate_convention: COORDINATE_CONVENTION,
      query_state: queryState,
      selected_annotation: summary.selected_transcript || {
        availability: 'unavailable', reason: 'No exact selected-transcript annotation was supplied.',
      },
      display: display(summary.query, options.display),
      provenance: options.provenance || {},
      query_partitions: summary,
      ...(legacy ? {} : { named_intervals: (options.intervals || []).map((interval) => ({
        id: interval.id,
        name: interval.name,
        start: interval.start,
        end: interval.end,
        summary: interval.summary || globalThis.AgamCsQueryIntervals?.summarise(interval, sourceResult).summary,
      })) }),
      accessibility_audit: {
        availability: 'available',
        ranking_accessibility_threshold: summary.ranking_accessibility_threshold,
        ranking_threshold_note: summary.ranking_threshold_note,
        scopes: summary.scopes,
      },
      rankings: options.ranking == null
        ? availability(null, 'No static gene ranking is available for this query.')
        : { availability: 'available', value: options.ranking },
      notable_windows: {
        availability: 'available',
        value: globalThis.AgamCsNotableWindows.analyzeNotableWindows(sourceResult, selected),
      },
      species_clade_summaries: species,
      calculation_methods: {
        query_summary: summary.summary_version,
        notable_windows: 'agamcs-notable-windows-v1',
        species_context: 'agamcs-species-context-v1',
        ranking_assets: options.ranking == null ? { cs: null, snp_density: null } : {
          cs: options.ranking.cs?.ranking_version ?? options.ranking.cs?.rankingVersion ?? null,
          snp_density: options.ranking.snp_density?.ranking_version
            ?? options.ranking.snpDensity?.rankingVersion ?? null,
        },
      },
      limitations: [
        'QC-failed accessibility positions are unknown and are not converted to zero.',
        'Zero CNEr stack values mean no detected interval, not measured 0% identity.',
        'The JSON report contains summaries; the exact TSV remains the base-level export.',
      ],
    };
    report.methods_text = methodsText(report);
    report.figure_caption = figureCaption(report);
    return report;
  }

  function validateReport(report) {
    const required = [
      'schema_version', 'report_version', 'coordinate_convention', 'query_state',
      'selected_annotation', 'display', 'provenance', 'query_partitions',
      'accessibility_audit', 'rankings', 'notable_windows', 'species_clade_summaries',
      'calculation_methods', 'limitations', 'methods_text', 'figure_caption',
    ];
    const missing = required.filter((key) => !(key in (report || {})));
    if (missing.length) throw new Error(`Report is missing required fields: ${missing.join(', ')}.`);
    const current = report.schema_version === SCHEMA_VERSION && report.report_version === REPORT_VERSION;
    const legacy = report.schema_version === 1 && report.report_version === LEGACY_REPORT_VERSION;
    if (!current && !legacy) {
      throw new Error('Unsupported AgamCs report schema/version.');
    }
    if (current && !Array.isArray(report.named_intervals)) throw new Error('Report named intervals are invalid.');
    const coordinates = report.query_state?.coordinates || {};
    if (!Number.isSafeInteger(coordinates.start) || !Number.isSafeInteger(coordinates.end)) {
      throw new Error('Report query coordinates must be integer inclusive bounds.');
    }
    if (coordinates.start < 1 || coordinates.end < coordinates.start) {
      throw new Error('Report query coordinates are invalid.');
    }
    return true;
  }

  return { REPORT_VERSION, SCHEMA_VERSION, LEGACY_REPORT_VERSION, COORDINATE_CONVENTION, buildReport, methodsText, figureCaption, validateReport };
}));
