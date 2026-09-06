const PAGES_RELEASE = '2026-09-06-two-gene-comparison-v1';
const LOCAL_FILE_PREVIEW_MESSAGE = 'This explorer cannot run from a file:// URL. From the AgamCs repository, start python3 -m http.server 8000 --directory docs, then open http://127.0.0.1:8000/.';

function versionedAsset(path) {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}v=${PAGES_RELEASE}`;
}

document.querySelectorAll('[role="tablist"]').forEach((tablist) => {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((tab) => document.querySelector(`#${tab.getAttribute('aria-controls')}`));
  function activateTab(tab) {
    tabs.forEach((candidate, index) => {
      const selected = candidate === tab;
      candidate.setAttribute('aria-selected', String(selected));
      candidate.tabIndex = selected ? 0 : -1;
      panels[index].hidden = !selected;
    });
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabs[(index + direction + tabs.length) % tabs.length];
      activateTab(next);
      next.focus();
    });
  });
});

const benchmarkForm = document.querySelector('#benchmark-form');
const benchmarkStatus = document.querySelector('#benchmark-status');
const benchmarkDownload = document.querySelector('#benchmark-download');
const queryReportActions = document.querySelector('#query-report-actions');
const queryReportStatus = document.querySelector('#query-report-status');
const queryReportVersion = document.querySelector('#query-report-version');
const queryReportDownload = document.querySelector('#query-report-download');
const copyMethods = document.querySelector('#copy-methods');
const copyFigureCaption = document.querySelector('#copy-figure-caption');
const benchmarkSubmit = document.querySelector('#benchmark-submit');
const querySummary = document.querySelector('#query-summary');
const querySummaryBody = document.querySelector('#query-summary-body');
const querySummarySubject = document.querySelector('#query-summary-subject');
const querySummaryVersion = document.querySelector('#query-summary-version');
const namedIntervals = document.querySelector('#named-intervals');
const namedIntervalsSubject = document.querySelector('#named-intervals-subject');
const intervalEditor = document.querySelector('#interval-editor');
const intervalName = document.querySelector('#interval-name');
const intervalStart = document.querySelector('#interval-start');
const intervalEnd = document.querySelector('#interval-end');
const intervalSave = document.querySelector('#interval-save');
const intervalCancel = document.querySelector('#interval-cancel');
const intervalStatus = document.querySelector('#interval-status');
const namedIntervalsBody = document.querySelector('#named-intervals-body');
const notableWindows = document.querySelector('#notable-windows');
const notableWindowsSubject = document.querySelector('#notable-windows-subject');
const notableWindowsVersion = document.querySelector('#notable-windows-version');
const notableWindowsMethod = document.querySelector('#notable-windows-method');
const highestCsWindowsBody = document.querySelector('#highest-cs-windows-body');
const lowestSnpWindowsBody = document.querySelector('#lowest-snp-windows-body');
const speciesContextPanel = document.querySelector('#species-context');
const speciesContextSubject = document.querySelector('#species-context-subject');
const speciesContextVersion = document.querySelector('#species-context-version');
const speciesContextBody = document.querySelector('#species-context-body');
const speciesDisplayOrder = document.querySelector('#species-display-order');
const speciesSelectAll = document.querySelector('#species-select-all');
const speciesClearAll = document.querySelector('#species-clear-all');
const speciesCheckboxGrid = document.querySelector('#species-checkbox-grid');
const cladeCollapseGrid = document.querySelector('#clade-collapse-grid');
const speciesDisplayStatus = document.querySelector('#species-display-status');
const liveVisuals = document.querySelector('#live-visuals');
const liveSignalPlot = document.querySelector('#live-signal-plot');
const liveHeatmapPlot = document.querySelector('#live-heatmap-plot');
const liveSignalDownload = document.querySelector('#live-signal-download');
const liveHeatmapDownload = document.querySelector('#live-heatmap-download');
const liveAnnotationNote = document.querySelector('#live-annotation-note');
const signalResolution = document.querySelector('#signal-resolution');
const heatmapResolution = document.querySelector('#heatmap-resolution');
const plotResolutionStatus = document.querySelector('#plot-resolution-status');
const plotRangeCurrent = document.querySelector('#plot-range-current');
const plotRangeSelect = document.querySelector('#plot-range-select');
const plotRangeBack = document.querySelector('#plot-range-back');
const plotRangeReset = document.querySelector('#plot-range-reset');
const plotRangeStart = document.querySelector('#plot-range-start');
const plotRangeEnd = document.querySelector('#plot-range-end');
const plotRangeApply = document.querySelector('#plot-range-apply');
const plotRangeStatus = document.querySelector('#plot-range-status');
const showOverlappingAnnotations = document.querySelector('#show-overlapping-annotations');
const overlapAnnotationHelp = document.querySelector('#overlap-annotation-help');
const copyQueryPermalink = document.querySelector('#copy-query-permalink');
const queryPermalinkStatus = document.querySelector('#query-permalink-status');
const accessionQueryPanel = document.querySelector('#accession-query-panel');
const accessionQueryOptions = document.querySelector('#accession-query-options');
const coordinateQueryPanel = document.querySelector('#coordinate-query-panel');
const queryOptions = document.querySelector('#query-options');
const queryOptionsSummary = queryOptions.querySelector('summary');
const liveAccession = document.querySelector('#live-accession');
const accessionCombobox = document.querySelector('#accession-combobox');
const accessionSuggestionsPanel = document.querySelector('#accession-suggestions-panel');
const accessionSuggestions = document.querySelector('#accession-suggestions');
const accessionSuggestionsNote = document.querySelector('#accession-suggestions-note');
const accessionSearchStatus = document.querySelector('#accession-search-status');
const accessionIndexHelp = document.querySelector('#accession-index-help');
const paddingHelp = document.querySelector('#padding-help');
const isoformControl = document.querySelector('#isoform-control');
const isoformSelect = document.querySelector('#isoform-select');
const isoformHelp = document.querySelector('#isoform-help');
const resolvedAccession = document.querySelector('#resolved-accession');
const exampleSelect = document.querySelector('#example-select');
const catalogueHelp = document.querySelector('#catalogue-help');
const featuredExampleStrip = document.querySelector('#featured-example-strip');
const featuredExampleActions = document.querySelector('#featured-example-actions');
const resultTitle = document.querySelector('#result-title');
const resultStatus = document.querySelector('#result-status');
const comparisonForm = document.querySelector('#comparison-form');
const comparisonLeftAccession = document.querySelector('#comparison-left-accession');
const comparisonRightAccession = document.querySelector('#comparison-right-accession');
const comparisonSubmit = document.querySelector('#comparison-submit');
const comparisonCancel = document.querySelector('#comparison-cancel');
const comparisonStatus = document.querySelector('#comparison-status');
const comparisonResults = document.querySelector('#comparison-results');
const comparisonLocusGrid = document.querySelector('#comparison-locus-grid');
const comparisonTableBody = document.querySelector('#comparison-table-body');
const comparisonLeftTsv = document.querySelector('#comparison-left-tsv');
const comparisonRightTsv = document.querySelector('#comparison-right-tsv');
const comparisonExport = document.querySelector('#comparison-export');
const localFilePreview = window.location.protocol === 'file:';
const queryWorker = localFilePreview
  ? null
  : new Worker(versionedAsset('assets/query-worker.js'));
const pendingQueries = new Map();
let examples = [];
let queryRequestId = 0;
let benchmarkDownloadUrl;
let queryReportDownloadUrl;
let currentQueryReport;
let queryReportContext;
let queryManifestPromise;
let plotContractPromise;
let accessionIndexPromise;
let geneSearchPromise;
let geneRankingPromise;
let accessionIndexSnapshot;
let geneSearchSnapshot;
let queryManifestSnapshot;
let plotContractSnapshot;
let retainedPlotState;
let plotZoomHistory = [];
let plotRangeSelectionMode = false;
let currentAccessionSuggestions = [];
let activeAccessionSuggestion = -1;
let speciesDisplayState = { selectedCodes: null, order: 'topology', collapsedClades: [] };
let namedIntervalState = [];
let editingIntervalId = null;
let comparisonState = null;
let comparisonGeneration = 0;
let comparisonAbortController = null;
const comparisonDownloadUrls = new Map();
const parsedInitialPermalink = globalThis.AgamCsQueryPermalinks.parse(window.location.hash);
let pendingPermalinkState = null;
const figureDownloadUrls = new Map();
const notableWindowDownloadUrls = new Map();

function trackUsage(eventName, parameters) {
  try {
    globalThis.AgamCsAnalytics?.track(eventName, parameters);
  } catch (_error) {
    // Usage measurement must never affect scientific queries or downloads.
  }
}

function setPermalinkStatus(message) {
  queryPermalinkStatus.textContent = message;
}

function permalinkRestoreMessage(code) {
  if (code === 'obsolete-version') {
    return 'This private permalink uses an obsolete format and was not restored. You can still enter a query normally.';
  }
  if (code === 'unknown-version') {
    return 'This private permalink uses a newer, unsupported format and was not restored. You can still enter a query normally.';
  }
  return 'This private permalink is malformed or no longer valid and was not restored. You can still enter a query normally.';
}

function permalinkStateFromControls() {
  const mode = document.querySelector('input[name="live-query-mode"]:checked').value;
  const displayRange = retainedPlotState ? { ...retainedPlotState.displayRange } : null;
  const state = {
    mode,
    accession: null,
    transcript: null,
    coordinates: null,
    padding: undefined,
    signal_resolution: selectedPlotResolution(signalResolution),
    heatmap_resolution: selectedPlotResolution(heatmapResolution),
    display_range: displayRange,
    intervals: namedIntervalState.map(({ id, name, start, end }) => ({ id, name, start, end })),
    show_overlapping_annotations: showOverlappingAnnotations.checked,
    species: {
      order: speciesDisplayState.order,
      selected_codes: speciesDisplayState.selectedCodes || [],
      collapsed_clades: speciesDisplayState.collapsedClades,
    },
  };
  if (mode === 'accession') {
    const resolution = globalThis.AgamCsAccessions.resolve(accessionIndexSnapshot, liveAccession.value);
    state.accession = resolution.geneAccession;
    state.transcript = resolution.accession === resolution.geneAccession ? null : resolution.accession;
    state.padding = Number(document.querySelector('#accession-padding').value);
    state.coordinates = null;
  } else {
    state.coordinates = {
      chromosome: document.querySelector('#benchmark-chromosome').value,
      start: Number(document.querySelector('#benchmark-start').value),
      end: Number(document.querySelector('#benchmark-end').value),
    };
    delete state.accession;
    delete state.transcript;
    delete state.padding;
  }
  return state;
}

async function copyPrivatePermalink() {
  if (!retainedPlotState) return;
  const confirmed = globalThis.confirm(
    'Private-locus warning: this permalink fragment can reveal the selected accession or genomic coordinates, including named interval names and bounds, to anyone you share it with. Copy it?',
  );
  if (!confirmed) {
    setPermalinkStatus('Private permalink was not copied.');
    return;
  }
  try {
    const fragment = globalThis.AgamCsQueryPermalinks.serialize(permalinkStateFromControls());
    const link = `${window.location.origin}${window.location.pathname}${fragment}`;
    await navigator.clipboard.writeText(link);
    setPermalinkStatus('Private permalink copied. Its fragment is not sent in HTTP requests or referrers.');
  } catch (_error) {
    setPermalinkStatus('Private permalink could not be copied. Your query remains available locally.');
  }
}

copyQueryPermalink.addEventListener('click', copyPrivatePermalink);

benchmarkDownload.addEventListener('click', () => {
  trackUsage('file_download', { artifact_type: 'tsv' });
});
queryReportDownload.addEventListener('click', () => {
  trackUsage('file_download', { artifact_type: 'report_json' });
});
liveSignalDownload.addEventListener('click', () => {
  trackUsage('file_download', { artifact_type: 'signal_svg' });
});
liveHeatmapDownload.addEventListener('click', () => {
  trackUsage('file_download', { artifact_type: 'heatmap_svg' });
});

function clearFigureDownloads() {
  figureDownloadUrls.forEach((url) => URL.revokeObjectURL(url));
  figureDownloadUrls.clear();
  [liveSignalDownload, liveHeatmapDownload].forEach((link) => {
    link.hidden = true;
    link.removeAttribute('href');
    link.removeAttribute('download');
  });
}

function clearQueryReport() {
  if (queryReportDownloadUrl) URL.revokeObjectURL(queryReportDownloadUrl);
  queryReportDownloadUrl = undefined;
  currentQueryReport = undefined;
  queryReportContext = undefined;
  queryReportDownload.hidden = true;
  queryReportDownload.removeAttribute('href');
  queryReportDownload.removeAttribute('download');
  queryReportActions.hidden = true;
}

function browserReportProvenance(manifest, index) {
  const topology = manifest.stack.topology;
  return {
    assembly: manifest.assembly,
    dataset: {
      filename: manifest.source.filename,
      url: manifest.source.url,
      score_source: { doi: manifest.source.doi, filename: manifest.source.filename },
      accessibility_source: manifest.accessibility,
    },
    annotation_index: {
      coordinate_index_version: index?.index_version || null,
      annotation_source: index?.annotation || null,
    },
    species_topology: {
      schema_version: topology.schema_version,
      title: topology.title,
      representation: topology.representation,
      sources: topology.sources,
    },
  };
}

function reportFilename(queryState) {
  const coordinates = queryState.coordinates;
  const subject = queryState.accession || `${coordinates.chromosome}_${coordinates.start}-${coordinates.end}`;
  return `AgamCs_${subject}_${coordinates.chromosome}_${coordinates.start}-${coordinates.end}_report.json`;
}

function renderQueryReport(result, { annotation, transcriptAnnotations, ranking, queryState, manifest, index }) {
  const state = retainedPlotState;
  const report = globalThis.AgamCsQueryReport.buildReport(result, {
    annotation,
    transcriptAnnotations,
    ranking,
    queryState,
    provenance: browserReportProvenance(manifest, index),
    display: {
      start: state.displayRange.start,
      end: state.displayRange.end,
      signal_resolution_bins: state.signalResolutionBins,
      heatmap_resolution_bins: state.heatmapResolutionBins,
    },
    intervals: namedIntervalState,
  });
  globalThis.AgamCsQueryReport.validateReport(report);
  if (queryReportDownloadUrl) URL.revokeObjectURL(queryReportDownloadUrl);
  queryReportDownloadUrl = URL.createObjectURL(new Blob([
    `${JSON.stringify(report, null, 2)}\n`,
  ], { type: 'application/json' }));
  queryReportDownload.href = queryReportDownloadUrl;
  queryReportDownload.download = reportFilename(report.query_state);
  queryReportDownload.hidden = false;
  queryReportVersion.textContent = report.report_version;
  queryReportStatus.textContent = `Versioned report for ${report.query_state.coordinates.chromosome}:${report.query_state.coordinates.start.toLocaleString()}–${report.query_state.coordinates.end.toLocaleString()} with display settings at the time of download.`;
  queryReportActions.hidden = false;
  currentQueryReport = report;
}

async function copyReportText(field, label) {
  if (!currentQueryReport) return;
  const text = currentQueryReport[field];
  try {
    await navigator.clipboard.writeText(text);
    queryReportStatus.textContent = `${label} copied from ${currentQueryReport.report_version}.`;
  } catch (_error) {
    const fallback = document.createElement('textarea');
    fallback.value = text;
    fallback.setAttribute('readonly', '');
    fallback.style.position = 'fixed';
    fallback.style.opacity = '0';
    document.body.append(fallback);
    fallback.select();
    const copied = document.execCommand('copy');
    fallback.remove();
    queryReportStatus.textContent = copied
      ? `${label} copied from ${currentQueryReport.report_version}.`
      : `${label} is unavailable to copy in this browser; download the JSON report instead.`;
  }
}

copyMethods.addEventListener('click', () => copyReportText('methods_text', 'Methods'));
copyFigureCaption.addEventListener('click', () => copyReportText('figure_caption', 'Figure caption'));

function clearNotableWindowDownloads() {
  notableWindowDownloadUrls.forEach((url) => URL.revokeObjectURL(url));
  notableWindowDownloadUrls.clear();
}

function configureFigureDownload(link, container, filename) {
  const svg = container.querySelector('svg');
  if (!svg) return;
  const standalone = svg.cloneNode(true);
  standalone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  standalone.setAttribute('font-family', 'Inter, ui-sans-serif, system-ui, sans-serif');
  standalone.setAttribute('style', 'background: #fff');
  const source = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(standalone)}\n`;
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  figureDownloadUrls.set(link, url);
  link.href = url;
  link.download = filename;
  link.hidden = false;
}

async function loadValidation() {
  const response = await fetch(versionedAsset('assets/data/query-validation.json'));
  if (!response.ok) throw new Error(`Validation fixture request failed (${response.status}).`);
  return response.json();
}

async function loadPlotValidation() {
  const response = await fetch(versionedAsset('assets/data/plot-validation.json'));
  if (!response.ok) throw new Error(`Plot validation fixture request failed (${response.status}).`);
  return response.json();
}

async function loadPlotContract() {
  if (!plotContractPromise) {
    plotContractPromise = fetch(versionedAsset('assets/data/plot-contract.json')).then(
      async (response) => {
        if (!response.ok) throw new Error(`Plot contract request failed (${response.status}).`);
        const contract = await response.json();
        globalThis.AgamCsPlots.configurePlotContract(contract);
        plotContractSnapshot = contract;
        configurePlotResolutionControls(contract);
        return contract;
      },
    );
  }
  return plotContractPromise;
}

function configurePlotResolutionControls(contract) {
  const adaptive = contract.binning.adaptive_keyword;
  const choices = [adaptive, ...contract.binning.explicit_choices];
  [signalResolution, heatmapResolution].forEach((select) => {
    const selected = select.value || adaptive;
    select.replaceChildren(...choices.map((choice) => {
      const option = document.createElement('option');
      option.value = String(choice);
      option.textContent = choice === adaptive
        ? 'Adaptive'
        : `${Number(choice).toLocaleString()} bins`;
      return option;
    }));
    select.value = choices.map(String).includes(selected) ? selected : adaptive;
  });
}

function selectedPlotResolution(select) {
  const value = select.value;
  return value === plotContractSnapshot.binning.adaptive_keyword ? value : Number(value);
}

function formatBasesPerBin(baseCount, binCount) {
  return (baseCount / binCount).toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

async function loadAccessionIndex() {
  if (!accessionIndexPromise) {
    accessionIndexPromise = fetch(versionedAsset('assets/data/accession-index.json')).then(async (response) => {
      if (!response.ok) throw new Error(`Accession index request failed (${response.status}).`);
      const index = await response.json();
      if (index.schema_version !== 2 || index.assembly !== 'AgamP4'
          || !index.accessions || !index.transcripts) {
        throw new Error('The versioned accession index is not compatible with this client.');
      }
      return index;
    });
  }
  return accessionIndexPromise;
}

async function loadGeneSearch() {
  if (!geneSearchPromise) {
    geneSearchPromise = fetch(versionedAsset('assets/data/gene-search.json')).then(async (response) => {
      if (!response.ok) throw new Error(`Gene-name index request failed (${response.status}).`);
      const searchIndex = await response.json();
      if (searchIndex.schema_version !== 1 || searchIndex.assembly !== 'AgamP4'
          || !searchIndex.names || searchIndex.live_lookup !== false) {
        throw new Error('The versioned gene-name index is not compatible with this client.');
      }
      return searchIndex;
    });
  }
  return geneSearchPromise;
}

async function loadGeneRankings() {
  if (!geneRankingPromise) {
    const load = async (filename, rankingType) => {
      try {
        const response = await fetch(versionedAsset(`assets/data/${filename}`));
        if (!response.ok) throw new Error(`Gene-ranking request failed (${response.status}).`);
        return globalThis.AgamCsGeneRankings.validate(await response.json(), rankingType);
      } catch (_error) {
        return null;
      }
    };
    geneRankingPromise = Promise.all([
      load('gene-cs-rankings.json', 'mean_cs'),
      load('gene-snp-rankings.json', 'accessible_mean_snp_density'),
    ]).then(([cs, snpDensity]) => ({ cs, snpDensity }));
  }
  return geneRankingPromise;
}

function closeAccessionSuggestions() {
  accessionSuggestionsPanel.hidden = true;
  liveAccession.setAttribute('aria-expanded', 'false');
  liveAccession.removeAttribute('aria-activedescendant');
  currentAccessionSuggestions = [];
  activeAccessionSuggestion = -1;
}

function setActiveAccessionSuggestion(index) {
  if (!currentAccessionSuggestions.length) return;
  const bounded = (index + currentAccessionSuggestions.length) % currentAccessionSuggestions.length;
  activeAccessionSuggestion = bounded;
  [...accessionSuggestions.children].forEach((option, optionIndex) => {
    const selected = optionIndex === bounded;
    option.setAttribute('aria-selected', String(selected));
    if (selected) option.scrollIntoView({ block: 'nearest' });
  });
  liveAccession.setAttribute(
    'aria-activedescendant', `accession-suggestion-${bounded}`,
  );
}

function suggestionElement(match, index) {
  const option = document.createElement('li');
  option.id = `accession-suggestion-${index}`;
  option.className = 'accession-suggestion';
  option.setAttribute('role', 'option');
  option.setAttribute('aria-selected', 'false');

  const heading = document.createElement('div');
  heading.className = 'accession-suggestion-heading';
  const primary = document.createElement('strong');
  primary.textContent = match.kind === 'transcript'
    ? match.accession
    : (match.name || match.accession);
  heading.append(primary);
  if (match.kind === 'gene' && match.name) {
    const accession = document.createElement('span');
    accession.className = 'accession-suggestion-accession';
    accession.textContent = match.accession;
    heading.append(accession);
  } else if (match.kind === 'transcript') {
    const gene = document.createElement('span');
    gene.className = 'accession-suggestion-accession';
    gene.textContent = match.name
      ? `${match.name} · ${match.geneAccession}`
      : match.geneAccession;
    heading.append(gene);
  }
  option.append(heading);

  if (match.description) {
    const description = document.createElement('span');
    description.className = 'accession-suggestion-description';
    description.textContent = match.description;
    option.append(description);
  }

  const metadata = document.createElement('span');
  metadata.className = 'accession-suggestion-metadata';
  const metadataParts = [match.region];
  if (match.kind === 'transcript') metadataParts.push('transcript');
  if (match.biotype) metadataParts.push(match.biotype.replaceAll('_', ' '));
  if (match.kind === 'gene') {
    metadataParts.push(
      `${match.transcriptCount} transcript${match.transcriptCount === 1 ? '' : 's'}`,
    );
    const annotation = accessionIndexSnapshot.accessions[match.geneAccession].annotation;
    const span = annotation.end - annotation.start + 1;
    const maximum = Number(queryManifestSnapshot?.maximum_query_bases);
    if (Number.isFinite(maximum) && span > maximum) {
      metadataParts.push(
        `${span.toLocaleString()} bp exceeds the ${maximum.toLocaleString()}-base browser limit`,
      );
      metadata.classList.add('accession-suggestion-limit');
    }
  }
  metadata.textContent = metadataParts.join(' · ');
  option.append(metadata);

  option.addEventListener('mousedown', (event) => event.preventDefault());
  option.addEventListener('click', () => selectAccessionSuggestion(match));
  return option;
}

function renderAccessionSuggestions(value) {
  if (!accessionIndexSnapshot || !geneSearchSnapshot || !String(value).trim()) {
    closeAccessionSuggestions();
    return;
  }
  const result = globalThis.AgamCsGeneSearch.search(
    accessionIndexSnapshot, geneSearchSnapshot, value,
  );
  currentAccessionSuggestions = result.matches;
  activeAccessionSuggestion = -1;
  accessionSuggestions.replaceChildren(
    ...result.matches.map((match, index) => suggestionElement(match, index)),
  );
  liveAccession.removeAttribute('aria-activedescendant');
  liveAccession.setAttribute('aria-expanded', 'true');
  accessionSuggestionsPanel.hidden = false;
  if (result.total === 0) {
    accessionSuggestionsNote.textContent = 'No indexed accession or official gene symbol matches this text.';
    accessionSearchStatus.textContent = 'No matching genes or transcripts.';
  } else if (result.total > result.matches.length) {
    accessionSuggestionsNote.textContent = `Showing ${result.matches.length.toLocaleString()} of ${result.total.toLocaleString()} matches. Type more to narrow the list.`;
    accessionSearchStatus.textContent = `${result.total.toLocaleString()} matches; ${result.matches.length.toLocaleString()} shown.`;
  } else {
    accessionSuggestionsNote.textContent = `${result.total.toLocaleString()} match${result.total === 1 ? '' : 'es'}. Use arrow keys and Enter, or click a choice.`;
    accessionSearchStatus.textContent = `${result.total.toLocaleString()} match${result.total === 1 ? '' : 'es'} available.`;
  }
}

function selectAccessionSuggestion(match) {
  liveAccession.value = match.value;
  closeAccessionSuggestions();
  configureIsoformControl(match.value);
  if (!isoformControl.hidden) queryOptions.open = true;
  updatePaddingHelp();
  const subject = match.kind === 'transcript'
    ? match.accession
    : match.name
      ? `${match.name} (${match.accession})`
      : match.accession;
  accessionSearchStatus.textContent = `${subject} selected.`;
  setPortalState(`Ready to query ${match.accession}`, 'Ready');
  benchmarkStatus.textContent = match.kind === 'transcript'
    ? `${match.accession} selected. Run the query to retrieve its transcript span.`
    : `${subject} selected. Run the query to retrieve its gene span, or choose a transcript isoform below.`;
}

function configureAccessionIndex(index, namingIndex) {
  if (namingIndex.coordinate_index_version !== index.index_version) {
    throw new Error('The gene-name index does not match the versioned accession index.');
  }
  accessionIndexSnapshot = index;
  geneSearchSnapshot = namingIndex;
  const geneCount = Object.keys(index.accessions).length;
  const transcriptCount = Object.keys(index.transcripts).length;
  const namedGeneCount = Number(namingIndex.coverage.named_gene_records);
  accessionIndexHelp.textContent = `${geneCount.toLocaleString()} genes · ${transcriptCount.toLocaleString()} transcripts · ${namedGeneCount.toLocaleString()} official symbols · 2L, 2R, 3L, 3R, and X · ${index.annotation.gene_build}.`;
  accessionIndexHelp.title = `${index.index_version}; symbol names from ${namingIndex.source.release} (${namingIndex.search_version}).`;
  showOverlappingAnnotations.disabled = false;
  overlapAnnotationHelp.textContent = 'Optional for accession and manual-coordinate queries. One representative transcript is added for every other indexed gene that overlaps the displayed range.';
  configureIsoformControl(liveAccession.value);
  updatePaddingHelp();
}

function configureAccessionOnly(index, error) {
  accessionIndexSnapshot = index;
  geneSearchSnapshot = { names: {}, source: { release: 'unavailable naming index' } };
  const geneCount = Object.keys(index.accessions).length;
  const transcriptCount = Object.keys(index.transcripts).length;
  accessionIndexHelp.textContent = `Gene-symbol search unavailable: ${error.message} Exact lookup still covers ${geneCount.toLocaleString()} genes and ${transcriptCount.toLocaleString()} transcripts.`;
  showOverlappingAnnotations.disabled = false;
  overlapAnnotationHelp.textContent = 'Optional for accession and manual-coordinate queries. One representative transcript is added for every other indexed gene that overlaps the displayed range.';
  configureIsoformControl(liveAccession.value);
  updatePaddingHelp();
}

function updatePaddingHelp() {
  if (!accessionIndexSnapshot || !queryManifestSnapshot) return;
  try {
    const resolution = globalThis.AgamCsAccessions.resolve(
      accessionIndexSnapshot, liveAccession.value,
    );
    const { chromosome, start, end } = resolution.annotation;
    const locusLength = end - start + 1;
    const maximumQueryBases = Number(queryManifestSnapshot.maximum_query_bases);
    if (locusLength > maximumQueryBases) {
      paddingHelp.textContent = `The complete ${resolution.accession} locus spans ${locusLength.toLocaleString()} bases, exceeds the ${maximumQueryBases.toLocaleString()}-base browser limit, and remains available through the CLI.`;
      return;
    }
    const maximum = globalThis.AgamCsQueryContract.maximumSymmetricPadding(
      queryManifestSnapshot, chromosome, start, end,
    );
    paddingHelp.textContent = `For ${resolution.accession}, use 0–${maximum.toLocaleString()} bp per side to remain within the ${Number(queryManifestSnapshot.maximum_query_bases).toLocaleString()}-base browser query limit. Padding is clipped at chromosome boundaries.`;
  } catch (_error) {
    const maximum = Number(queryManifestSnapshot.maximum_query_bases).toLocaleString();
    paddingHelp.textContent = `Choose a supported gene or transcript to calculate its allowable padding. The padded interval must remain within the ${maximum}-base browser query limit.`;
  }
}

function configureIsoformControl(value) {
  const index = accessionIndexSnapshot;
  if (!index) return;
  const normalized = globalThis.AgamCsAccessions.normalize(value);
  const geneAccession = index.accessions[normalized]
    ? normalized
    : index.transcripts[normalized]?.gene_accession;
  const geneRecord = index.accessions[geneAccession];
  const transcriptIds = geneRecord?.transcript_ids || [];
  if (transcriptIds.length < 2) {
    isoformControl.hidden = true;
    isoformSelect.replaceChildren();
    return;
  }

  const representative = geneRecord.annotation.transcript_id;
  const representativeOption = document.createElement('option');
  representativeOption.value = geneAccession;
  representativeOption.textContent = `Gene default — ${representative} annotation, full gene span`;
  const transcriptOptions = transcriptIds.map((transcriptId) => {
    const option = document.createElement('option');
    option.value = transcriptId;
    option.textContent = transcriptId === representative
      ? `${transcriptId} — representative`
      : transcriptId;
    return option;
  });
  isoformSelect.replaceChildren(representativeOption, ...transcriptOptions);
  isoformSelect.value = index.transcripts[normalized] ? normalized : geneAccession;
  isoformHelp.textContent = `${transcriptIds.length} transcript isoforms are available for ${geneAccession}. The gene default uses ${representative} annotation across the full gene span; an exact transcript uses its own span.`;
  isoformControl.hidden = false;
}

liveAccession.addEventListener('input', () => {
  configureIsoformControl(liveAccession.value);
  updatePaddingHelp();
  renderAccessionSuggestions(liveAccession.value);
});

liveAccession.addEventListener('focus', () => {
  renderAccessionSuggestions(liveAccession.value);
});

liveAccession.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (accessionSuggestionsPanel.hidden) {
      renderAccessionSuggestions(liveAccession.value);
    }
    if (currentAccessionSuggestions.length) {
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const next = activeAccessionSuggestion < 0
        ? (direction > 0 ? 0 : currentAccessionSuggestions.length - 1)
        : activeAccessionSuggestion + direction;
      setActiveAccessionSuggestion(next);
    }
    return;
  }
  if (event.key === 'Enter' && !accessionSuggestionsPanel.hidden
      && activeAccessionSuggestion >= 0) {
    event.preventDefault();
    selectAccessionSuggestion(currentAccessionSuggestions[activeAccessionSuggestion]);
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    closeAccessionSuggestions();
  } else if (event.key === 'Tab') {
    closeAccessionSuggestions();
  }
});

document.addEventListener('pointerdown', (event) => {
  if (!accessionCombobox.contains(event.target)) closeAccessionSuggestions();
});

isoformSelect.addEventListener('change', () => {
  liveAccession.value = isoformSelect.value;
  closeAccessionSuggestions();
  setPortalState(`Ready to query ${isoformSelect.value}`, 'Ready');
  const geneRecord = accessionIndexSnapshot?.accessions?.[isoformSelect.value];
  benchmarkStatus.textContent = geneRecord
    ? `${isoformSelect.value} gene default selected. The full gene span will use ${geneRecord.annotation.transcript_id} annotation.`
    : `${isoformSelect.value} selected. Run the query to retrieve its transcript span.`;
  updatePaddingHelp();
});

function setPortalState(title, status, tone = 'ready') {
  resultTitle.textContent = title;
  resultStatus.textContent = status;
  resultStatus.classList.toggle('loading', tone === 'loading');
  resultStatus.classList.toggle('error', tone === 'error');
}

function setLiveQueryMode(mode) {
  const byAccession = mode === 'accession';
  accessionQueryPanel.hidden = !byAccession;
  accessionQueryOptions.hidden = !byAccession;
  featuredExampleStrip.hidden = !byAccession;
  coordinateQueryPanel.hidden = byAccession;
  queryOptionsSummary.textContent = byAccession
    ? 'Options and featured examples'
    : 'Annotation options';
  closeAccessionSuggestions();
  renderGeneRanking(null, null);
  setPortalState('Ready for a query', 'Ready');
  benchmarkStatus.textContent = byAccession
    ? 'Ready to resolve a gene accession or official symbol, or a transcript accession.'
    : 'Ready for an independent manual AgamP4 coordinate query.';
}

document.querySelectorAll('input[name="live-query-mode"]').forEach((input) => {
  input.addEventListener('change', () => setLiveQueryMode(input.value));
});

async function loadCatalogue() {
  try {
    const response = await fetch(versionedAsset('examples.json'));
    if (!response.ok) throw new Error(`Catalogue request failed (${response.status})`);
    const catalogue = await response.json();
    if (catalogue.schema_version !== 2 || !Array.isArray(catalogue.examples)) {
      throw new Error('The featured-example catalogue is not compatible with this client.');
    }
    examples = catalogue.examples;
    const quickExamples = examples
      .filter((example) => Number.isSafeInteger(example.quick_rank))
      .sort((left, right) => left.quick_rank - right.quick_rank);
    if (quickExamples.length !== 3
        || quickExamples.some((example, index) => example.quick_rank !== index + 1)) {
      throw new Error('The featured-example catalogue must define quick ranks 1, 2, and 3.');
    }
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a featured example...';
    exampleSelect.replaceChildren(placeholder, ...examples.map((example) => {
      const option = document.createElement('option');
      option.value = example.accession;
      option.textContent = example.symbol
        ? `${example.symbol} · ${example.accession} — ${example.topic} · ${example.labels.qc}`
        : `${example.accession} — ${example.topic} · ${example.labels.qc}`;
      return option;
    }));
    featuredExampleActions.replaceChildren(...quickExamples.map((example) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'featured-example-button';
      const name = document.createElement('strong');
      name.textContent = example.symbol || example.accession;
      const accession = document.createElement('span');
      accession.className = 'featured-example-accession';
      accession.textContent = example.symbol ? example.accession : 'Official symbol unavailable';
      const topic = document.createElement('span');
      topic.className = 'featured-example-topic';
      topic.textContent = example.topic;
      button.replaceChildren(name, accession, topic);
      button.title = `${example.feature_summary}. ${example.labels.qc}.`;
      button.setAttribute(
        'aria-label', `Use featured example ${example.symbol || example.accession}, ${example.accession}: ${example.topic}`,
      );
      button.addEventListener('click', () => selectFeaturedExample(example.accession));
      return button;
    }));
    if (parsedInitialPermalink.kind !== 'valid') {
      selectFeaturedExample(quickExamples[0].accession, { focusSubmit: false });
    }
  } catch (error) {
    featuredExampleActions.textContent = 'Examples unavailable';
    catalogueHelp.textContent = 'Featured examples could not be loaded; accession and coordinate queries still work.';
    console.error(error);
  }
}

function renderCatalogueHelp(example) {
  if (!example) {
    catalogueHelp.textContent = `${examples.length} featured examples. Selecting one fills the accession query.`;
    return;
  }
  const heading = document.createElement('span');
  heading.className = 'catalogue-example-heading';
  const name = document.createElement('strong');
  name.textContent = example.symbol || example.accession;
  const accession = document.createElement('span');
  accession.className = 'catalogue-example-accession';
  accession.textContent = example.symbol ? example.accession : 'Official symbol unavailable';
  const topic = document.createElement('span');
  topic.className = 'catalogue-example-topic';
  topic.textContent = example.topic;
  heading.replaceChildren(name, accession, topic);

  const labels = document.createElement('span');
  labels.className = 'catalogue-example-labels';
  for (const [kind, label] of Object.entries(example.labels)) {
    const chip = document.createElement('span');
    chip.className = `catalogue-example-label catalogue-example-label-${kind}`;
    chip.textContent = label;
    labels.append(chip);
  }
  const reason = document.createElement('span');
  reason.className = 'catalogue-example-reason';
  reason.textContent = example.why_featured;
  const teaches = document.createElement('span');
  teaches.className = 'catalogue-example-teaches';
  teaches.textContent = `Demonstrates: ${example.teaches.join(' ')}`;
  const limitation = document.createElement('span');
  limitation.className = 'catalogue-example-limitation';
  limitation.textContent = `Interpretation limit: ${example.limitations.join(' ')}`;
  catalogueHelp.replaceChildren(heading, labels, reason, teaches, limitation);
}

function selectFeaturedExample(accession, { focusSubmit = true } = {}) {
  if (!accession) {
    renderCatalogueHelp(null);
    return;
  }
  const example = examples.find((item) => item.accession === accession);
  if (!example) return;
  const accessionMode = document.querySelector('input[name="live-query-mode"][value="accession"]');
  accessionMode.checked = true;
  setLiveQueryMode('accession');
  exampleSelect.value = accession;
  liveAccession.value = accession;
  closeAccessionSuggestions();
  configureIsoformControl(liveAccession.value);
  if (!isoformControl.hidden) queryOptions.open = true;
  updatePaddingHelp();
  renderCatalogueHelp(example);
  const subject = example.symbol ? `${example.symbol} (${accession})` : accession;
  setPortalState(`Ready to query ${subject}`, 'Ready');
  benchmarkStatus.textContent = `${subject} is selected but has not been run. Choose Run query to retrieve its values.`;
  if (focusSubmit) benchmarkSubmit.focus();
}

exampleSelect.addEventListener('change', () => {
  selectFeaturedExample(exampleSelect.value);
});

const cataloguePromise = localFilePreview ? Promise.resolve([]) : loadCatalogue();

if (localFilePreview) {
  accessionIndexHelp.textContent = LOCAL_FILE_PREVIEW_MESSAGE;
  paddingHelp.textContent = 'Start the local web server before using accession padding.';
  overlapAnnotationHelp.textContent = 'Start the local web server before using overlapping-gene annotations.';
  catalogueHelp.textContent = 'Start the local web server to load the featured examples.';
  featuredExampleActions.textContent = 'Start the local web server to load examples';
  benchmarkSubmit.disabled = true;
  setPortalState('Local web server required', 'Unavailable', 'error');
  benchmarkStatus.textContent = LOCAL_FILE_PREVIEW_MESSAGE;
} else {
  loadAccessionIndex().then(async (index) => {
    try {
      configureAccessionIndex(index, await loadGeneSearch());
    } catch (error) {
      configureAccessionOnly(index, error);
      console.error(error);
    }
  }).catch((error) => {
    accessionIndexHelp.textContent = `Versioned accession lookup unavailable: ${error.message} Manual coordinates still work.`;
    overlapAnnotationHelp.textContent = 'Overlapping-gene annotations are unavailable because the versioned gene index could not be loaded.';
  });
}

async function loadQueryManifest() {
  if (!queryManifestPromise) {
    queryManifestPromise = fetch(versionedAsset('assets/data/query-manifest.json')).then((response) => {
      if (!response.ok) throw new Error(`Query manifest request failed (${response.status}).`);
      return response.json();
    });
  }
  return queryManifestPromise;
}

function workerQuery(chromosome, start, end, { signal } = {}) {
  if (!queryWorker) return Promise.reject(new Error(LOCAL_FILE_PREVIEW_MESSAGE));
  queryRequestId += 1;
  const requestId = queryRequestId;
  return new Promise((resolve, reject) => {
    const cancel = () => {
      const pending = pendingQueries.get(requestId);
      if (!pending) return;
      pendingQueries.delete(requestId);
      queryWorker.postMessage({ action: 'cancel', requestId });
      reject(signal?.reason || new Error('The browser query was cancelled.'));
    };
    if (signal?.aborted) {
      reject(signal.reason || new Error('The browser query was cancelled.'));
      return;
    }
    pendingQueries.set(requestId, { resolve, reject, signal, cancel });
    signal?.addEventListener('abort', cancel, { once: true });
    queryWorker.postMessage({ action: 'query', requestId, chromosome, start, end });
  });
}

queryWorker?.addEventListener('message', ({ data }) => {
  const pending = pendingQueries.get(data.requestId);
  if (!pending) return;
  pendingQueries.delete(data.requestId);
  pending.signal?.removeEventListener('abort', pending.cancel);
  if (data.ok) pending.resolve(data);
  else pending.reject(new Error(data.message));
});

queryWorker?.addEventListener('error', () => {
  pendingQueries.forEach(({ reject }) => reject(new Error('The query worker stopped unexpectedly.')));
  pendingQueries.clear();
});

function statusLabel(status, fields) {
  if ((status & 1) === 1) return 'PASS';
  const failures = fields.slice(1).filter((_field, index) => (status & (1 << (index + 1))) !== 0);
  return failures.length ? failures.join(';') : 'UNKNOWN';
}

function buildTsv(data, range = null) {
  const headers = [
    'chromosome', 'pos', 'Cs_C', 'snp_density_s', 'is_accessible',
    'quality_status', 'accessibility_status_byte',
    ...data.stackRows.map((code) => `stack_${code}`),
  ];
  const lines = [headers.join('\t')];
  const width = data.values.Cs.length;
  const start = range?.start ?? data.start;
  const end = range?.end ?? (data.start + width - 1);
  for (let position = start; position <= end; position += 1) {
    const index = position - data.start;
    const status = data.values.status[index];
    const stack = data.stackRows.map((_code, row) => data.values.stack[row * width + index]);
    lines.push([
      data.chromosome,
      position,
      data.values.Cs[index],
      data.values.snp_density[index],
      (status & 1) === 1,
      statusLabel(status, data.statusFields),
      status,
      ...stack,
    ].join('\t'));
  }
  return `${lines.join('\n')}\n`;
}

function clearComparisonDownloads() {
  comparisonDownloadUrls.forEach((url) => URL.revokeObjectURL(url));
  comparisonDownloadUrls.clear();
  [comparisonLeftTsv, comparisonRightTsv, comparisonExport].forEach((link) => {
    link.hidden = true;
    link.removeAttribute('href');
    link.removeAttribute('download');
  });
}

function comparisonCell(primary, secondary = '') {
  const cell = document.createElement('td');
  const strong = document.createElement('strong'); strong.textContent = primary;
  const small = document.createElement('small'); small.textContent = secondary;
  cell.append(strong, small);
  return cell;
}

function comparisonMetricText(record, kind) {
  if (record.availability !== 'available') {
    return { primary: 'Unavailable', detail: record.reason };
  }
  const metric = record.value;
  const percentile = metric.global.percentile.toFixed(2);
  const rank = rankingPosition(metric.global);
  const label = kind === 'cs' ? 'Cs percentile' : 'Low-SNP-density percentile';
  return { primary: `${percentile}th`, detail: `${label} · ${rank}` };
}

function comparisonEvidence(record, kind) {
  const metric = record.value || record;
  const total = metric.total_bases ?? 'NA';
  const assessed = metric.assessed_bases ?? 'NA';
  const accessible = metric.accessible_bases;
  const coverage = kind === 'low_snp_density'
    ? ` · ${accessible ?? 'NA'}/${total} accessible (${metric.accessible_fraction == null ? 'NA' : `${(100 * metric.accessible_fraction).toFixed(1)}%`})`
    : '';
  const cohorts = `Global cohort ${metric.global_cohort_denominator ?? 'NA'} · arm cohort ${metric.chromosome_cohort_denominator ?? 'NA'}`;
  return `${assessed}/${total} assessed${coverage} · ${cohorts}`;
}

function renderComparison(comparison, sources) {
  comparisonLocusGrid.replaceChildren(...Object.entries(comparison.sides).map(([name, side]) => {
    const card = document.createElement('article'); card.className = 'comparison-locus-card';
    const heading = document.createElement('h3'); heading.textContent = `${name === 'left' ? 'First' : 'Second'}: ${side.gene_accession}`;
    const axis = document.createElement('p'); axis.className = 'comparison-locus-axis';
    axis.textContent = `${side.chromosome}:${side.query_coordinates.start.toLocaleString()}–${side.query_coordinates.end.toLocaleString()} (independent axis)`;
    const live = document.createElement('p'); live.textContent = `Live selected transcript: ${side.live_query_transcript.transcript_id || 'unavailable'}.`;
    const pinned = document.createElement('p'); pinned.textContent = `Static ranking representative transcript: ${side.pinned_ranking_transcript.transcript_id || 'unavailable'}.`;
    card.append(heading, axis, live, pinned);
    return card;
  }));
  const rows = [];
  for (const [sideName, side] of Object.entries(comparison.sides)) {
    for (const scope of ['query', 'cds', 'utr', 'introns']) {
      const summary = side.query_summary.scopes[scope];
      if (!summary) continue;
      const scopeLabel = summary.label || scope;
      const eligible = summary.meets_ranking_accessibility_threshold == null
        ? 'Unavailable (zero-base partition)'
        : summary.meets_ranking_accessibility_threshold ? 'Meets 80% reference' : 'Below 80% reference';
      for (const [metricLabel, value, assessed] of [
        ['Mean Cs', summary.mean_cs, summary.finite_cs_bases],
        ['Accessible-base SNP mean', summary.mean_accessible_snp_density, summary.finite_accessible_snp_bases],
      ]) {
        const row = document.createElement('tr');
        row.append(
          comparisonCell(sideName === 'left' ? 'First gene' : 'Second gene', side.gene_accession),
          comparisonCell(scopeLabel), comparisonCell(metricLabel),
          comparisonCell(displayNumber(value), `${assessed.toLocaleString()}/${summary.total_bases.toLocaleString()} finite assessed bases`),
          comparisonCell(`${summary.accessible_bases.toLocaleString()}/${summary.total_bases.toLocaleString()} accessible (${summary.accessible_fraction == null ? 'NA' : `${(100 * summary.accessible_fraction).toFixed(1)}%`})`),
          comparisonCell('Live selected-transcript summary', eligible),
        );
        rows.push(row);
      }
    }
    for (const [scope, metrics] of Object.entries(side.static_rankings)) {
      for (const [kind, record] of Object.entries(metrics)) {
        const row = document.createElement('tr');
        const scopeLabel = scope.replace('representative_', 'Representative ').replace('_', ' ');
        const metricLabel = kind === 'cs' ? 'Cs' : 'QC-aware low SNP density';
        const rank = comparisonMetricText(record, kind);
        const state = record.availability === 'available' ? 'Ranked' : 'Unavailable';
        row.append(
          comparisonCell(sideName === 'left' ? 'First gene' : 'Second gene', side.gene_accession),
          comparisonCell(scopeLabel), comparisonCell(metricLabel),
          comparisonCell(rank.primary, rank.detail), comparisonCell(comparisonEvidence(record, kind)),
          comparisonCell(state, record.availability === 'available'
            ? `Pinned ${side.pinned_ranking_transcript.transcript_id || 'representative transcript'}`
            : record.reason),
        );
        rows.push(row);
      }
    }
  }
  comparisonTableBody.replaceChildren(...rows);
  clearComparisonDownloads();
  const bindDownload = (link, source, text, filename) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/tab-separated-values' }));
    comparisonDownloadUrls.set(link, url);
    link.href = url; link.download = filename; link.hidden = false;
  };
  bindDownload(comparisonLeftTsv, sources.left.result, buildTsv(sources.left.result),
    `AgamCs_${sources.left.geneAccession}_${sources.left.result.chromosome}_${sources.left.result.start}-${sources.left.result.end}.tsv`);
  bindDownload(comparisonRightTsv, sources.right.result, buildTsv(sources.right.result),
    `AgamCs_${sources.right.geneAccession}_${sources.right.result.chromosome}_${sources.right.result.start}-${sources.right.result.end}.tsv`);
  bindDownload(comparisonExport, null, globalThis.AgamCsTwoGeneComparison.toTsv(comparison),
    `AgamCs_${sources.left.geneAccession}_vs_${sources.right.geneAccession}_comparison.tsv`);
  comparisonResults.hidden = false;
}

async function resolveComparisonSide(raw, index, manifest, rankings, signal) {
  const namingIndex = geneSearchSnapshot || await loadGeneSearch().catch(() => ({ names: {} }));
  const canonical = globalThis.AgamCsGeneSearch.canonicalize(index, namingIndex, raw);
  const resolution = globalThis.AgamCsAccessions.resolve(index, canonical.value);
  const { chromosome, start, end } = globalThis.AgamCsQueryContract.validateCoordinates(
    manifest, resolution.annotation.chromosome, resolution.annotation.start, resolution.annotation.end,
  );
  const result = await workerQuery(chromosome, start, end, { signal });
  const ranking = globalThis.AgamCsGeneRankings.lookup(
    rankings.cs, rankings.snpDensity, resolution.geneAccession,
  );
  return {
    result,
    annotation: resolution.annotation,
    geneAccession: resolution.geneAccession,
    ranking,
  };
}

async function runTwoGeneComparison() {
  if (localFilePreview) {
    comparisonStatus.textContent = LOCAL_FILE_PREVIEW_MESSAGE;
    return;
  }
  const generation = ++comparisonGeneration;
  if (comparisonAbortController) comparisonAbortController.abort(new Error('Superseded by a new comparison.'));
  const controller = new AbortController();
  comparisonAbortController = controller;
  comparisonSubmit.disabled = true;
  comparisonCancel.hidden = false;
  comparisonStatus.textContent = 'Resolving both genes and loading the first detailed query…';
  try {
    const [index, manifest, rankings] = await Promise.all([
      loadAccessionIndex(), loadQueryManifest(), loadGeneRankings(),
    ]);
    if (generation !== comparisonGeneration) return;
    const left = await resolveComparisonSide(
      comparisonLeftAccession.value, index, manifest, rankings, controller.signal,
    );
    if (generation !== comparisonGeneration) return;
    comparisonStatus.textContent = 'First locus retained locally; loading the second detailed query sequentially…';
    const right = await resolveComparisonSide(
      comparisonRightAccession.value, index, manifest, rankings, controller.signal,
    );
    if (generation !== comparisonGeneration) return;
    const comparison = globalThis.AgamCsTwoGeneComparison.buildComparison({
      left, right,
      provenance: browserReportProvenance(manifest, index),
    });
    comparisonState = { comparison, sources: { left, right } };
    renderComparison(comparison, comparisonState.sources);
    comparisonStatus.textContent = 'Comparison complete. Both loci remain browser-local; exports preserve unavailable states explicitly.';
  } catch (error) {
    if (generation !== comparisonGeneration) return;
    const preserved = comparisonState ? ' The previous completed comparison remains available.' : '';
    comparisonStatus.textContent = `Comparison replacement failed: ${error.message}.${preserved}`;
  } finally {
    if (generation === comparisonGeneration) {
      comparisonAbortController = null;
      comparisonSubmit.disabled = false;
      comparisonCancel.hidden = true;
    }
  }
}

if (typeof comparisonForm !== 'undefined') {
  comparisonForm.addEventListener('submit', (event) => { event.preventDefault(); runTwoGeneComparison(); });
  comparisonCancel.addEventListener('click', () => {
    if (!comparisonAbortController) return;
    comparisonAbortController.abort(new Error('Comparison replacement cancelled.'));
    comparisonGeneration += 1;
    comparisonAbortController = null;
    comparisonSubmit.disabled = false;
    comparisonCancel.hidden = true;
    comparisonStatus.textContent = comparisonState
      ? 'Comparison replacement cancelled. The previous completed comparison remains available.'
      : 'Comparison cancelled before completion.';
  });
}

function displayNumber(value) {
  return Number.isFinite(value) ? value.toPrecision(6) : 'NA';
}

function rankingPosition(statistics) {
  const position = statistics.first === statistics.last
    ? statistics.first.toLocaleString()
    : `${statistics.first.toLocaleString()}–${statistics.last.toLocaleString()} (tie)`;
  return `rank ${position} of ${statistics.count.toLocaleString()}`;
}

function renderGeneRanking(rankingDocuments, accession) {
  const card = rankingDocuments
    ? globalThis.AgamCsGeneRankings.lookup(
      rankingDocuments.cs, rankingDocuments.snpDensity, accession,
    )
    : null;
  const csElement = document.querySelector('#summary-cs-ranking-card');
  const snpElement = document.querySelector('#summary-snp-ranking-card');
  const rankingSection = document.querySelector('#ranking-section');
  csElement.hidden = !card?.cs;
  snpElement.hidden = !card?.snpDensity;
  rankingSection.hidden = !card;
  if (!card) return;
  const scopeTargets = {
    gene_span: ['span'],
    representative_exons: ['exons'],
    representative_cds: ['cds'],
    representative_utr: ['utr'],
    representative_introns: ['introns'],
  };
  const renderRankedMetric = (metric, prefix, suffix, valueLabel) => {
    const valueElement = document.querySelector(`#summary-${prefix}-rank-${suffix}`);
    const detailElement = document.querySelector(`#summary-${prefix}-rank-${suffix}-detail`);
    const transcript = metric.representativeTranscript || 'NA';
    if (metric.state !== 'ranked') {
      valueElement.textContent = metric.state === 'not_ranked_ineligible' ? 'Not ranked' : 'NA · Not ranked';
      if (metric.state === 'not_ranked_zero_bases') {
        detailElement.textContent = `Zero-base partition · 0 bases assessed · Representative transcript ${transcript}`;
      } else if (metric.state === 'not_ranked_ineligible') {
        const observed = metric.value != null && Number.isFinite(Number(metric.value))
          ? `${valueLabel} ${displayNumber(Number(metric.value))} · ` : 'Mean NA · ';
        detailElement.textContent = `${observed}${metric.basesAssessed.toLocaleString()} bases assessed · `
          + `${(100 * metric.accessibleFraction).toFixed(1)}% accessible `
          + `(${metric.accessibleBases.toLocaleString()}/${metric.totalBases.toLocaleString()}); `
          + `80% required · Representative transcript ${transcript}`;
      } else {
        detailElement.textContent = `Evidence unavailable · ${metric.basesAssessed.toLocaleString()}/`
          + `${(metric.totalBases || 0).toLocaleString()} bases assessed · Representative transcript ${transcript}`;
      }
      detailElement.textContent += ` · Eligible cohorts: global `
        + `${metric.globalCohortDenominator.toLocaleString()} · ${card.chromosome} `
        + `${metric.chromosomeCohortDenominator.toLocaleString()}`;
      return;
    }
    valueElement.textContent = `${metric.global.percentile.toFixed(2)}th`;
    const coverage = `${valueLabel} ${displayNumber(Number(metric.value))} · `
      + `${metric.basesAssessed.toLocaleString()}/${metric.totalBases.toLocaleString()} bases assessed`;
    const accessibility = prefix === 'snp'
      ? ` · ${(100 * metric.accessibleFraction).toFixed(1)}% accessible `
        + `(${metric.accessibleBases.toLocaleString()}/${metric.totalBases.toLocaleString()})`
      : '';
    detailElement.textContent = `${coverage}${accessibility} · Global ${rankingPosition(metric.global)} · `
      + `${card.chromosome} ${metric.chromosome.percentile.toFixed(2)}th percentile `
      + `(${rankingPosition(metric.chromosome)}) · Representative transcript ${transcript}`;
  };
  if (card.cs) {
    Object.entries(scopeTargets).forEach(([scope, [suffix]]) => {
      renderRankedMetric(card.cs.metrics[scope], 'cs', suffix, 'Mean Cs');
    });
    document.querySelector('#summary-cs-ranking-note').textContent =
      `Static ${card.accession} ranking; padding and selected non-representative isoforms do not `
      + `change it. All representative partitions use ${card.representativeTranscript}. `
      + `${card.cs.interpretation}`;
  }
  if (card.snpDensity) {
    Object.entries(scopeTargets).forEach(([scope, [suffix]]) => {
      renderRankedMetric(
        card.snpDensity.metrics[scope], 'snp', suffix,
        'Mean accessible-base SNP density',
      );
    });
    document.querySelector('#summary-snp-ranking-note').textContent =
      `Only accessible focal bases contribute; QC-failed bases remain unknown. `
      + `${card.snpDensity.interpretation}`;
  }
}

function renderQuerySummary(result, annotation = null, transcriptAnnotations = []) {
  const selectedAnnotation = globalThis.AgamCsQuerySummary.selectTranscriptAnnotation(
    annotation, transcriptAnnotations,
  );
  const summary = globalThis.AgamCsQuerySummary.summarizeQuery(result, selectedAnnotation);
  querySummaryVersion.textContent = summary.summary_version;
  querySummarySubject.textContent = summary.selected_transcript
    ? `Feature scopes use selected transcript ${summary.selected_transcript.transcript_id} on the ${summary.selected_transcript.strand === -1 ? 'minus' : 'plus'} strand.`
    : 'No exact selected-transcript annotation was supplied, so only the query span is summarized.';
  const rowForScope = (scope) => {
    const row = document.createElement('tr');
    const scopeCell = document.createElement('th');
    scopeCell.scope = 'row';
    const scopeLabel = document.createElement('span');
    scopeLabel.textContent = scope.label;
    const scopeCoordinates = document.createElement('small');
    scopeCoordinates.textContent = scope.segments.length
      ? scope.segments.map((segment) => `${segment.start.toLocaleString()}–${segment.end.toLocaleString()}`).join(', ')
      : 'Absent in this query/annotation';
    scopeCell.append(scopeLabel, scopeCoordinates);

    const cell = (primary, secondary = '') => {
      const element = document.createElement('td');
      const strong = document.createElement('strong');
      strong.textContent = primary;
      const small = document.createElement('small');
      small.textContent = secondary;
      element.append(strong, small);
      return element;
    };
    const accessibility = scope.total_bases
      ? `${(100 * scope.accessible_fraction).toFixed(1)}%`
      : 'NA';
    const inaccessible = scope.longest_inaccessible_run;
    const longest = inaccessible.bases
      ? `${inaccessible.bases.toLocaleString()} bp`
      : scope.total_bases ? '0 bp' : 'NA';
    const longestWhere = inaccessible.bases
      ? `${inaccessible.start.toLocaleString()}–${inaccessible.end.toLocaleString()}`
      : '';
    const threshold = scope.meets_ranking_accessibility_threshold == null
      ? 'NA'
      : scope.meets_ranking_accessibility_threshold ? 'Meets 80%' : 'Below 80%';
    row.append(
      scopeCell,
      cell(scope.total_bases.toLocaleString(), 'total bases'),
      cell(displayNumber(scope.mean_cs), `${scope.finite_cs_bases.toLocaleString()}/${scope.total_bases.toLocaleString()} finite bases`),
      cell(accessibility, `${scope.accessible_bases.toLocaleString()}/${scope.total_bases.toLocaleString()} accessible bases`),
      cell(displayNumber(scope.mean_accessible_snp_density), `${scope.finite_accessible_snp_bases.toLocaleString()} finite accessible bases`),
      cell(longest, longestWhere),
      cell(threshold, scope.total_bases ? 'ranking reference; not a rank' : 'no bases'),
    );
    return row;
  };
  querySummaryBody.replaceChildren(...summary.scopes.map(rowForScope));
  document.querySelector('#summary-method-note').textContent = (
    'Cs means use finite values and state their denominator. SNP-density means use only '
    + 'finite values at QC-accessible focal bases; QC-failed bases remain unknown, never zero. '
    + 'CDS and UTR are exonic unions, introns exclude the exon union, exon rows follow 5\u2032\u21923\u2032 '
    + 'transcript order, and strand-aware flanks cover queried bases outside the selected transcript. '
    + 'Inaccessible runs reset between disconnected feature segments. '
    + summary.ranking_threshold_note
  );
  querySummary.hidden = false;
}

function renderNamedIntervals(result) {
  namedIntervalsSubject.textContent = `All intervals are validated against the exact retained query ${result.chromosome}:${result.start.toLocaleString()}–${result.end.toLocaleString()} (inclusive), never the current plot zoom.`;
  const cell = (primary, secondary = '') => {
    const element = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = primary;
    const small = document.createElement('small');
    small.textContent = secondary;
    element.append(strong, small);
    return element;
  };
  const rows = namedIntervalState.map((interval) => {
    const row = document.createElement('tr');
    const heading = document.createElement('th');
    heading.scope = 'row';
    const summary = globalThis.AgamCsQueryIntervals.summarise(interval, result).summary;
    const scope = `${result.chromosome}:${interval.start.toLocaleString()}–${interval.end.toLocaleString()} inclusive`;
    const label = document.createElement('span'); label.textContent = interval.name;
    const detail = document.createElement('small'); detail.textContent = scope;
    heading.append(label, detail);
    const actions = document.createElement('td');
    const group = document.createElement('div'); group.className = 'notable-window-actions';
    const button = (text, handler) => { const element = document.createElement('button'); element.type = 'button'; element.className = 'button secondary'; element.textContent = text; element.addEventListener('click', handler); return element; };
    group.append(
      button('Zoom', () => zoomToPlotRange(interval, 'named interval')),
      button('Edit', () => { editingIntervalId = interval.id; intervalName.value = interval.name; intervalStart.value = interval.start; intervalEnd.value = interval.end; intervalSave.textContent = 'Save interval'; intervalCancel.hidden = false; intervalName.focus(); }),
      button('Delete', () => { namedIntervalState = globalThis.AgamCsQueryIntervals.remove(namedIntervalState, interval.id); renderNamedIntervals(result); refreshReport(); }),
      (() => { const link = document.createElement('a'); link.className = 'button secondary'; link.textContent = 'Interval TSV'; link.href = URL.createObjectURL(new Blob([buildTsv(result, interval)], { type: 'text/tab-separated-values' })); link.download = `AgamCs_${result.chromosome}_${interval.start}-${interval.end}_${interval.name.replace(/[^A-Za-z0-9_-]+/g, '_')}.tsv`; link.addEventListener('click', () => trackUsage('file_download', { artifact_type: 'tsv' })); return link; })(),
    );
    actions.append(group);
    row.append(heading, cell(summary.total_bases.toLocaleString(), 'total bases'), cell(displayNumber(summary.mean_cs), `${summary.finite_cs_bases}/${summary.total_bases} finite Cs bases`), cell(summary.total_bases ? `${(100 * summary.accessible_fraction).toFixed(1)}%` : 'NA', `${summary.accessible_bases}/${summary.total_bases} accessible bases`), cell(displayNumber(summary.mean_accessible_snp_density), `${summary.finite_accessible_snp_bases}/${summary.accessible_bases} finite accessible SNP bases`), actions);
    return row;
  });
  namedIntervalsBody.replaceChildren(...rows);
  namedIntervals.hidden = false;
  refreshReport();
}

function refreshReport() {
  if (queryReportContext) renderQueryReport(queryReportContext.result, queryReportContext);
}

function saveNamedInterval() {
  if (!retainedPlotState) return;
  try {
    const raw = { name: intervalName.value, start: Number(intervalStart.value), end: Number(intervalEnd.value) };
    namedIntervalState = editingIntervalId
      ? globalThis.AgamCsQueryIntervals.edit(namedIntervalState, editingIntervalId, raw, retainedPlotState.result)
      : globalThis.AgamCsQueryIntervals.add(namedIntervalState, raw, retainedPlotState.result);
    editingIntervalId = null; intervalName.value = ''; intervalStart.value = ''; intervalEnd.value = ''; intervalSave.textContent = 'Add interval'; intervalCancel.hidden = true;
    intervalStatus.textContent = 'Interval saved locally; it will be included if you deliberately copy a permalink or report.';
    renderNamedIntervals(retainedPlotState.result); refreshReport();
  } catch (error) { intervalStatus.textContent = `Interval was not saved: ${error.message}`; }
}
intervalSave.addEventListener('click', saveNamedInterval);
intervalEditor.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); saveNamedInterval(); } });
intervalCancel.addEventListener('click', () => { editingIntervalId = null; intervalName.value = ''; intervalStart.value = ''; intervalEnd.value = ''; intervalSave.textContent = 'Add interval'; intervalCancel.hidden = true; intervalName.focus(); });

function speciesDisplayOptions() {
  return {
    selectedCodes: speciesDisplayState.selectedCodes,
    order: speciesDisplayState.order,
    collapsedClades: speciesDisplayState.collapsedClades,
  };
}

function updateSpeciesDisplayStatus(result) {
  const selectedCount = speciesDisplayState.selectedCodes?.length || 0;
  const rows = selectedCount
    ? globalThis.AgamCsSpeciesContext.displayRows(result, speciesDisplayOptions())
    : [];
  const orderLabel = speciesDisplayState.order === 'topology'
    ? 'versioned-topology order' : 'alphabetical order';
  const collapseLabel = speciesDisplayState.collapsedClades.length
    ? `; ${speciesDisplayState.collapsedClades.length} encoded clade${speciesDisplayState.collapsedClades.length === 1 ? '' : 's'} collapsed`
    : '';
  speciesDisplayStatus.textContent = selectedCount
    ? `${rows.length} visible heatmap row${rows.length === 1 ? '' : 's'} represent ${selectedCount}/${result.stackRows.length} species in ${orderLabel}${collapseLabel}. Full TSV and context-table data are unchanged.`
    : `No species selected. Select at least one species to update Figure 2; full TSV and context-table data are unchanged.`;
}

function readSpeciesDisplayControls(result) {
  speciesDisplayState = {
    selectedCodes: [...speciesCheckboxGrid.querySelectorAll('input[data-species-code]:checked')]
      .map((input) => input.dataset.speciesCode),
    order: speciesDisplayOrder.value,
    collapsedClades: [...cladeCollapseGrid.querySelectorAll('input[data-clade-id]:checked')]
      .map((input) => input.dataset.cladeId),
  };
  updateSpeciesDisplayStatus(result);
  rerenderRetainedPlots();
}

function initializeSpeciesDisplayControls(result) {
  speciesDisplayState = {
    selectedCodes: [...result.stackRows], order: 'topology', collapsedClades: [],
  };
  speciesDisplayOrder.value = 'topology';
  const speciesInputs = result.stackRows.map((code, index) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = true;
    input.dataset.speciesCode = code;
    const text = document.createElement('span');
    text.textContent = `${result.stackSpecies[index]} (${code})`;
    label.append(input, text);
    input.addEventListener('change', () => readSpeciesDisplayControls(result));
    return label;
  });
  speciesCheckboxGrid.replaceChildren(...speciesInputs);
  const clades = globalThis.AgamCsSpeciesContext.cladeRecords(result.stackTopology.tree);
  const cladeInputs = clades.map((clade) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.cladeId = clade.id;
    const text = document.createElement('span');
    text.textContent = `${clade.name} (${clade.member_codes.length} species${clade.is_polytomy ? '; polytomy' : ''})`;
    label.append(input, text);
    input.addEventListener('change', () => readSpeciesDisplayControls(result));
    return label;
  });
  cladeCollapseGrid.replaceChildren(...cladeInputs);
  updateSpeciesDisplayStatus(result);
}

function renderSpeciesContext(result) {
  const analysis = globalThis.AgamCsSpeciesContext.analyzeSpeciesContext(result);
  speciesContextVersion.textContent = analysis.analysis_version;
  speciesContextSubject.textContent = (
    `${analysis.species_count} comparison species across ${analysis.query.bases.toLocaleString()} exact query bases; `
    + `${analysis.clades.length} summaries come only from named nodes in the versioned topology.`
  );
  const cell = (primary, secondary = '') => {
    const element = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = primary;
    const small = document.createElement('small');
    small.textContent = secondary;
    element.append(strong, small);
    return element;
  };
  const rowElement = (summary) => {
    const row = document.createElement('tr');
    if (summary.kind === 'clade') row.className = 'clade-row';
    const heading = document.createElement('th');
    heading.scope = 'row';
    const label = document.createElement('span');
    label.textContent = summary.name;
    const detail = document.createElement('small');
    detail.textContent = summary.kind === 'species'
      ? summary.id
      : `${summary.species_count} species · encoded ${summary.is_polytomy ? 'polytomy' : 'clade'} · ${summary.path.join(' › ')}`;
    heading.append(label, detail);
    const longest = summary.longest_undetected_run;
    const window = summary.lowest_qualifying_identity_window;
    row.append(
      heading,
      cell(
        `${summary.detected_bases.toLocaleString()}/${summary.possible_species_bases.toLocaleString()}`,
        summary.kind === 'species' ? 'detected/query bases' : 'detected/species × query bases',
      ),
      cell(`${(100 * summary.detected_fraction).toFixed(1)}%`, `${summary.detected_bases.toLocaleString()} detected species-bases`),
      cell(
        summary.mean_identity_detected == null ? 'NA' : `${summary.mean_identity_detected.toFixed(1)}%`,
        summary.mean_identity_detected == null ? 'no detected bases' : `among ${summary.detected_bases.toLocaleString()} detected bases only`,
      ),
      cell(
        longest.bases ? `${longest.bases.toLocaleString()} bp` : '0 bp',
        longest.bases ? `${longest.start.toLocaleString()}–${longest.end.toLocaleString()}${summary.kind === 'clade' ? '; no member detected' : ''}` : 'no fully undetected run',
      ),
      cell(
        window ? `${window.start.toLocaleString()}–${window.end.toLocaleString()}` : 'NA',
        window
          ? `${window.mean_identity_detected.toFixed(1)}% mean · ${window.detected_bases.toLocaleString()}/${window.possible_species_bases.toLocaleString()} detected species-bases`
          : 'no complete 100-bp window reached 80% detection',
      ),
    );
    return row;
  };
  speciesContextBody.replaceChildren(
    ...analysis.species.map(rowElement), ...analysis.clades.map(rowElement),
  );
  speciesContextPanel.hidden = false;
  return analysis;
}

function windowCoordinates(window) {
  return `${window.chromosome}:${window.start.toLocaleString()}–${window.end.toLocaleString()}`;
}

function configureNotableWindowDownload(link, result, window) {
  const url = URL.createObjectURL(new Blob([buildTsv(result, window)], {
    type: 'text/tab-separated-values',
  }));
  notableWindowDownloadUrls.set(link, url);
  link.href = url;
  link.download = `AgamCs_${window.chromosome}_${window.start}-${window.end}_window.tsv`;
  link.addEventListener('click', () => trackUsage('file_download', { artifact_type: 'tsv' }));
}

function renderNotableWindows(result, annotation = null, transcriptAnnotations = []) {
  const selectedAnnotation = globalThis.AgamCsQuerySummary.selectTranscriptAnnotation(
    annotation, transcriptAnnotations,
  );
  const analysis = globalThis.AgamCsNotableWindows.analyzeNotableWindows(result, selectedAnnotation);
  notableWindowsVersion.textContent = analysis.analysis_version;
  notableWindowsSubject.textContent = analysis.selected_transcript
    ? `Feature labels use selected transcript ${analysis.selected_transcript.transcript_id} on the ${analysis.selected_transcript.strand === -1 ? 'minus' : 'plus'} strand.`
    : 'No selected transcript was supplied; feature labels therefore state that explicitly.';
  notableWindowsMethod.textContent = (
    `Windows are non-overlapping ${analysis.window_size.toLocaleString()}-base intervals anchored at the exact retained-query start; the final window may be shorter. `
    + 'Cs rows are ordered by descending finite-base mean Cs, then ascending genomic coordinate. '
    + `SNP rows include only windows with at least ${(100 * analysis.snp_accessibility_threshold).toFixed(0)}% accessible bases and are ordered by ascending accessible-base SNP-density mean, then coordinate. `
    + 'QC-failed bases remain unknown. Each window TSV is the exact base-level subset for that inclusive window; the primary TSV remains the complete query.'
  );
  const rowForWindow = (window, metric) => {
    const row = document.createElement('tr');
    const label = windowCoordinates(window);
    const cell = (primary, secondary = '') => {
      const element = document.createElement('td');
      const strong = document.createElement('strong');
      strong.textContent = primary;
      const small = document.createElement('small');
      small.textContent = secondary;
      element.append(strong, small);
      return element;
    };
    const windowCell = document.createElement('th');
    windowCell.scope = 'row';
    const primary = document.createElement('strong');
    primary.textContent = label;
    const secondary = document.createElement('small');
    secondary.textContent = 'inclusive coordinates';
    windowCell.append(primary, secondary);
    const accessibility = `${(100 * window.accessible_fraction).toFixed(1)}%`;
    const metricCell = metric === 'cs'
      ? cell(displayNumber(window.mean_cs), `${window.finite_cs_bases.toLocaleString()}/${window.total_bases.toLocaleString()} finite Cs bases`)
      : cell(
        displayNumber(window.mean_accessible_snp_density),
        `${window.finite_accessible_snp_bases.toLocaleString()}/${window.accessible_bases.toLocaleString()} finite accessible SNP bases`,
      );
    const feature = cell(window.selected_transcript_feature, 'overlapping selected-transcript feature');
    const actions = document.createElement('td');
    const actionGroup = document.createElement('div');
    actionGroup.className = 'notable-window-actions';
    const zoom = document.createElement('button');
    zoom.type = 'button';
    zoom.className = 'button secondary';
    zoom.textContent = 'Zoom to window';
    zoom.setAttribute('aria-label', `Zoom plots to ${label}`);
    zoom.addEventListener('click', () => zoomToPlotRange(window, 'notable-window'));
    const download = document.createElement('a');
    download.className = 'button secondary';
    download.textContent = 'Exact window TSV';
    download.setAttribute('aria-label', `Download exact TSV values for ${label}`);
    configureNotableWindowDownload(download, result, window);
    actionGroup.append(zoom, download);
    actions.append(actionGroup);
    row.append(
      windowCell,
      cell(window.total_bases.toLocaleString(), 'total bases'),
      cell(
        `${window.finite_cs_bases.toLocaleString()}/${window.total_bases.toLocaleString()}`,
        'finite Cs bases',
      ),
      metricCell,
      cell(accessibility, `${window.accessible_bases.toLocaleString()}/${window.total_bases.toLocaleString()} accessible bases`),
      feature,
      actions,
    );
    return row;
  };
  const renderRows = (body, windows, metric, emptyText) => {
    if (windows.length) body.replaceChildren(...windows.map((window) => rowForWindow(window, metric)));
    else {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.className = 'notable-window-empty';
      cell.textContent = emptyText;
      row.append(cell);
      body.replaceChildren(row);
    }
  };
  renderRows(
    highestCsWindowsBody, analysis.highest_mean_cs_windows, 'cs',
    'No window contains a finite Cs value.',
  );
  renderRows(
    lowestSnpWindowsBody, analysis.lowest_mean_snp_density_windows, 'snp',
    `No window meets the ${(100 * analysis.snp_accessibility_threshold).toFixed(0)}% accessibility requirement with a finite accessible-base SNP-density mean.`,
  );
  notableWindows.hidden = false;
}

function findPinnedAnnotation(chromosome, start, end) {
  const region = `${chromosome}:${start}-${end}`;
  return examples.find((example) => example.region === region) || null;
}

function transcriptAnnotationsForResolution(index, resolution, annotation) {
  if (!annotation) return [];
  if (!index || !resolution || resolution.matchedAs === 'transcript') return [annotation];
  const transcriptIds = index.accessions?.[resolution.geneAccession]?.transcript_ids || [];
  return transcriptIds.map((transcriptId) => (
    globalThis.AgamCsAccessions.resolve(index, transcriptId).annotation
  ));
}

function annotationsForDisplayedRegion(
  index, result, annotation, transcriptAnnotations, displayRange, includeOverlaps,
) {
  const primaryModels = annotation ? transcriptAnnotations : [];
  if (!includeOverlaps || !index) {
    return { models: primaryModels, overlappingGeneCount: 0 };
  }
  const excluded = annotation?.id ? [annotation.id] : [];
  const overlapping = globalThis.AgamCsAccessions.overlappingGenes(
    index, result.chromosome, displayRange.start, displayRange.end, excluded,
  );
  return {
    models: [...primaryModels, ...overlapping.map((item) => item.annotation)],
    overlappingGeneCount: overlapping.length,
  };
}

function formatResolutionLabel(resolution) {
  const name = geneSearchSnapshot?.names?.[resolution?.geneAccession]?.name || null;
  return name ? `${name} (${resolution.accession})` : resolution.accession;
}

function renderResolvedAccession(resolution, index, paddingDetails) {
  const annotation = resolution.annotation;
  const name = geneSearchSnapshot?.names?.[resolution.geneAccession]?.name || null;
  const queryLabel = formatResolutionLabel(resolution);
  const geneLabel = name
    ? `${name} (${resolution.geneAccession})`
    : resolution.geneAccession;
  renderVectorBaseGeneLink(
    document.querySelector('#resolved-accession-id'), resolution.geneAccession, queryLabel,
  );
  renderVectorBaseGeneLink(
    document.querySelector('#resolved-gene-id'), resolution.geneAccession, geneLabel,
  );
  document.querySelector('#resolved-transcript').textContent = annotation.transcript_id;
  const requestedPadding = paddingDetails?.requestedPadding || 0;
  document.querySelector('#resolved-padding').textContent = requestedPadding > 0
    && (paddingDetails.leftPadding !== requestedPadding
      || paddingDetails.rightPadding !== requestedPadding)
    ? `${requestedPadding.toLocaleString()} bp/side requested; ${paddingDetails.leftPadding.toLocaleString()} lower + ${paddingDetails.rightPadding.toLocaleString()} higher applied`
    : `${requestedPadding.toLocaleString()} bp per side`;
  document.querySelector('#resolved-strand').textContent = Number(annotation.strand) === -1 ? '− (minus)' : '+ (plus)';
  document.querySelector('#resolved-annotation').textContent = `${index.annotation.gene_build} (${index.annotation.released})`;
  document.querySelector('#resolved-index-version').textContent = index.index_version;
  resolvedAccession.hidden = false;
}

function renderVectorBaseGeneLink(element, accession, label) {
  const link = document.createElement('a');
  link.href = `https://vectorbase.org/vectorbase/app/record/gene/${encodeURIComponent(accession)}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = `${label} ↗`;
  link.setAttribute('aria-label', `View ${label} in VectorBase`);
  element.replaceChildren(link);
}

function plotRangesEqual(left, right) {
  return Number(left?.start) === Number(right?.start)
    && Number(left?.end) === Number(right?.end);
}

function setPlotRangeSelectionMode(enabled) {
  plotRangeSelectionMode = Boolean(enabled && retainedPlotState);
  plotRangeSelect.setAttribute('aria-pressed', String(plotRangeSelectionMode));
  plotRangeSelect.textContent = plotRangeSelectionMode ? 'Cancel selection' : 'Select range';
  [liveSignalPlot, liveHeatmapPlot].forEach((container) => {
    container.classList.toggle('range-selection-enabled', plotRangeSelectionMode);
  });
  if (plotRangeSelectionMode) {
    plotRangeStatus.textContent = 'Drag horizontally across either plot. The selected view will expand outward to the touched display-bin boundaries.';
  }
}

function updatePlotRangeControls(result, displayRange) {
  const fullRange = { start: result.start, end: result.end };
  const isFull = plotRangesEqual(displayRange, fullRange);
  const span = displayRange.end - displayRange.start + 1;
  plotRangeCurrent.textContent = (
    `${result.chromosome}:${displayRange.start.toLocaleString()}–${displayRange.end.toLocaleString()} `
    + `(${span.toLocaleString()} bp; ${isFull ? 'full query' : `zoom level ${plotZoomHistory.length}`}).`
  );
  [plotRangeStart, plotRangeEnd].forEach((input) => {
    input.min = String(result.start);
    input.max = String(result.end);
    input.disabled = false;
  });
  plotRangeStart.value = String(displayRange.start);
  plotRangeEnd.value = String(displayRange.end);
  plotRangeSelect.disabled = span <= 1;
  plotRangeBack.disabled = plotZoomHistory.length === 0;
  plotRangeReset.disabled = isFull;
  plotRangeApply.disabled = false;
  if (span <= 1) setPlotRangeSelectionMode(false);
}

function validatePlotRangeInputs(result) {
  const start = Number(plotRangeStart.value);
  const end = Number(plotRangeEnd.value);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
    throw new Error('Zoom coordinates must be whole genomic positions.');
  }
  if (start > end) throw new Error('Zoom start must not exceed zoom end.');
  if (start < result.start || end > result.end) {
    throw new Error(
      `Zoom coordinates must stay within ${result.chromosome}:${result.start}-${result.end}.`,
    );
  }
  return { start, end };
}

function zoomToPlotRange(range, source = 'coordinates') {
  if (!retainedPlotState) return;
  const previous = retainedPlotState;
  const next = globalThis.AgamCsPlotModel.normalizeDisplayRange(previous.result, range);
  if (plotRangesEqual(next, previous.displayRange)) {
    plotRangeStatus.textContent = 'The displayed range is unchanged.';
    return;
  }
  plotZoomHistory.push({ ...previous.displayRange });
  try {
    renderLivePlots(
      previous.result,
      previous.providedAnnotation,
      previous.providedAccession,
      previous.providedTranscriptAnnotations,
      previous.figureStem,
      false,
      next,
    );
    setPlotRangeSelectionMode(false);
    plotRangeStatus.textContent = source === 'selection'
      ? 'Range zoom applied at the touched display-bin boundaries; no genomic request was made.'
      : 'Coordinate zoom applied from retained full-query data; no genomic request was made.';
  } catch (error) {
    plotZoomHistory.pop();
    plotRangeStatus.textContent = `Range unchanged: ${error.message}`;
  }
}

function zoomOutPlotRange() {
  if (!retainedPlotState || !plotZoomHistory.length) return;
  const previous = retainedPlotState;
  const target = plotZoomHistory.pop();
  try {
    renderLivePlots(
      previous.result,
      previous.providedAnnotation,
      previous.providedAccession,
      previous.providedTranscriptAnnotations,
      previous.figureStem,
      false,
      target,
    );
    setPlotRangeSelectionMode(false);
    plotRangeStatus.textContent = 'Returned to the preceding displayed range.';
  } catch (error) {
    plotZoomHistory.push(target);
    plotRangeStatus.textContent = `Range unchanged: ${error.message}`;
  }
}

function resetPlotRange() {
  if (!retainedPlotState) return;
  const previous = retainedPlotState;
  const oldHistory = plotZoomHistory;
  plotZoomHistory = [];
  try {
    renderLivePlots(
      previous.result,
      previous.providedAnnotation,
      previous.providedAccession,
      previous.providedTranscriptAnnotations,
      previous.figureStem,
      false,
      { start: previous.result.start, end: previous.result.end },
    );
    setPlotRangeSelectionMode(false);
    plotRangeStatus.textContent = 'Reset to the complete queried interval.';
  } catch (error) {
    plotZoomHistory = oldHistory;
    plotRangeStatus.textContent = `Range unchanged: ${error.message}`;
  }
}

function renderLivePlots(
  result, providedAnnotation = null, providedAccession = null, providedTranscriptAnnotations = null,
  figureStem = null, resetResolution = false, displayRange = null,
) {
  const adaptive = plotContractSnapshot.binning.adaptive_keyword;
  if (resetResolution) {
    signalResolution.value = adaptive;
    heatmapResolution.value = adaptive;
    plotZoomHistory = [];
    setPlotRangeSelectionMode(false);
    plotRangeStatus.textContent = (
      'Select range enables horizontal dragging on either plot. Plot selections expand '
      + 'outward to the displayed bin boundaries; the exact TSV remains the full query.'
    );
  }
  const activeRange = globalThis.AgamCsPlotModel.normalizeDisplayRange(result, displayRange);
  const signalChoice = selectedPlotResolution(signalResolution);
  const heatmapChoice = selectedPlotResolution(heatmapResolution);
  globalThis.AgamCsPlotModel.validatePlotResolution(signalChoice, plotContractSnapshot);
  globalThis.AgamCsPlotModel.validatePlotResolution(heatmapChoice, plotContractSnapshot);
  const pinned = providedAnnotation ? null : findPinnedAnnotation(result.chromosome, result.start, result.end);
  const annotation = providedAnnotation || pinned?.annotation || null;
  const accession = providedAccession || pinned?.accession || null;
  const transcriptAnnotations = providedTranscriptAnnotations
    || (annotation ? [annotation] : []);
  const displayedAnnotations = annotationsForDisplayedRegion(
    accessionIndexSnapshot,
    result,
    annotation,
    transcriptAnnotations,
    activeRange,
    showOverlappingAnnotations.checked,
  );
  const rangeSelection = {
    isEnabled: () => plotRangeSelectionMode,
    onSelect: (range) => zoomToPlotRange(range, 'selection'),
  };
  const signalSummary = globalThis.AgamCsPlots.renderSignalPlot(
    liveSignalPlot, result, annotation, displayedAnnotations.models,
    signalChoice, activeRange, rangeSelection,
  );
  const heatmapSummary = globalThis.AgamCsPlots.renderHeatmap(
    liveHeatmapPlot, result, annotation, displayedAnnotations.models,
    heatmapChoice, activeRange, rangeSelection, speciesDisplayOptions(),
  );
  const annotationSubject = accession === annotation?.transcript_id
    ? `${annotation.id} isoform ${annotation.transcript_id}`
    : accession;
  const overlapCount = displayedAnnotations.overlappingGeneCount;
  const overlapNote = showOverlappingAnnotations.checked
    ? overlapCount
      ? ` ${overlapCount}${annotation ? ' additional' : ''} overlapping gene${overlapCount === 1 ? '' : 's'} ${overlapCount === 1 ? 'is' : 'are'} shown ${overlapCount === 1 ? 'using its representative transcript' : 'using one representative transcript each'}.`
      : annotation
        ? ' No other indexed genes overlap the displayed range.'
        : ' No indexed genes overlap the displayed range.'
    : '';
  liveAnnotationNote.textContent = transcriptAnnotations.length > 1
    ? `All ${transcriptAnnotations.length} transcript models for ${annotation.id} are shown 5′→3′; ${annotation.transcript_id} is bold and supplies the exon summary and CDS guides.${overlapNote}`
    : annotation
      ? `${annotationSubject} annotation applied; ${annotation.transcript_id} is shown 5′→3′.${overlapNote}`
      : showOverlappingAnnotations.checked
        ? `Genomic-coordinate view.${overlapNote}`
        : 'Genomic-coordinate view. Enable overlapping gene annotations to add indexed genes within the displayed range.';
  const baseCount = activeRange.end - activeRange.start + 1;
  plotResolutionStatus.textContent = (
    `Signal: ${signalSummary.binCount.toLocaleString()} bins `
    + `(~${formatBasesPerBin(baseCount, signalSummary.binCount)} bases/bin); `
    + `heatmap: ${heatmapSummary.binCount.toLocaleString()} bins across ${heatmapSummary.displayRows.length} visible rows `
    + `(~${formatBasesPerBin(baseCount, heatmapSummary.binCount)} bases/bin).`
  );
  retainedPlotState = {
    result,
    providedAnnotation,
    providedAccession,
    providedTranscriptAnnotations,
    figureStem,
    displayRange: activeRange,
    signalChoice: String(signalChoice),
    heatmapChoice: String(heatmapChoice),
    signalResolutionBins: signalSummary.binCount,
    heatmapResolutionBins: heatmapSummary.binCount,
  };
  updatePlotRangeControls(result, activeRange);
  if (figureStem) {
    const rangeSuffix = plotRangesEqual(activeRange, { start: result.start, end: result.end })
      ? ''
      : `_view_${activeRange.start}-${activeRange.end}`;
    clearFigureDownloads();
    configureFigureDownload(
      liveSignalDownload, liveSignalPlot, `${figureStem}${rangeSuffix}_cs-snp-qc.svg`,
    );
    configureFigureDownload(
      liveHeatmapDownload, liveHeatmapPlot, `${figureStem}${rangeSuffix}_species-heatmap.svg`,
    );
  }
  liveVisuals.hidden = false;
  if (queryReportContext?.result === result) {
    renderQueryReport(result, queryReportContext);
  }
}

function rerenderRetainedPlots() {
  if (!retainedPlotState) return;
  const previous = retainedPlotState;
  try {
    renderLivePlots(
      previous.result,
      previous.providedAnnotation,
      previous.providedAccession,
      previous.providedTranscriptAnnotations,
      previous.figureStem,
      false,
      previous.displayRange,
    );
  } catch (error) {
    signalResolution.value = previous.signalChoice;
    heatmapResolution.value = previous.heatmapChoice;
    plotResolutionStatus.textContent = `Resolution unchanged: ${error.message}`;
  }
}

signalResolution.addEventListener('change', rerenderRetainedPlots);
heatmapResolution.addEventListener('change', rerenderRetainedPlots);
showOverlappingAnnotations.addEventListener('change', rerenderRetainedPlots);
speciesDisplayOrder.addEventListener('change', () => {
  if (retainedPlotState) readSpeciesDisplayControls(retainedPlotState.result);
});
speciesSelectAll.addEventListener('click', () => {
  if (!retainedPlotState) return;
  speciesCheckboxGrid.querySelectorAll('input[data-species-code]').forEach((input) => { input.checked = true; });
  readSpeciesDisplayControls(retainedPlotState.result);
});
speciesClearAll.addEventListener('click', () => {
  if (!retainedPlotState) return;
  speciesCheckboxGrid.querySelectorAll('input[data-species-code]').forEach((input) => { input.checked = false; });
  readSpeciesDisplayControls(retainedPlotState.result);
});
plotRangeSelect.addEventListener('click', () => {
  const enable = !plotRangeSelectionMode;
  setPlotRangeSelectionMode(enable);
  if (!enable) plotRangeStatus.textContent = 'Range selection cancelled.';
});
plotRangeBack.addEventListener('click', zoomOutPlotRange);
plotRangeReset.addEventListener('click', resetPlotRange);
plotRangeApply.addEventListener('click', () => {
  if (!retainedPlotState) return;
  try {
    zoomToPlotRange(validatePlotRangeInputs(retainedPlotState.result));
  } catch (error) {
    plotRangeStatus.textContent = `Range unchanged: ${error.message}`;
  }
});
[plotRangeStart, plotRangeEnd].forEach((input) => {
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    plotRangeApply.click();
  });
});

function valuesMatch(actual, expected, tolerance = 1e-7) {
  if (expected == null) return !Number.isFinite(actual);
  return Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
}

function findValidationFixture(validation, region) {
  if (Array.isArray(validation.cases)) {
    return validation.cases.find((fixture) => fixture.region === region) || null;
  }
  return validation.region === region ? validation : null;
}

function validatePlotSummaries(result, fixture, annotation) {
  if (fixture.region !== `${result.chromosome}:${result.start}-${result.end}`) return false;
  const signal = globalThis.AgamCsPlots.summarizeSignals(result, annotation);
  const heatmap = globalThis.AgamCsPlots.summarizeHeatmap(result, annotation);
  const csFields = ['position', 'mean', 'q10', 'q25', 'median', 'q75', 'q90'];
  const csMatches = fixture.cs.length === signal.cs.length && fixture.cs.every((expected, index) => (
    csFields.every((field) => valuesMatch(signal.cs[index][field], expected[field]))
  ));
  const snpMatches = fixture.snp.length === signal.snp.length && fixture.snp.every((expected, index) => (
    valuesMatch(signal.snp[index].position, expected.position)
    && valuesMatch(signal.snp[index].mean, expected.mean)
    && valuesMatch(signal.snp[index].accessibleFraction, expected.callable_fraction)
  ));
  const heatmapMatches = fixture.heatmap.length === heatmap.cells.length && fixture.heatmap.every((row, rowIndex) => (
    row.length === heatmap.cells[rowIndex].length && row.every((expected, binIndex) => {
      const actual = heatmap.cells[rowIndex][binIndex];
      return valuesMatch(actual.identity, expected.identity, 2e-5)
        && valuesMatch(actual.detectedFraction, expected.detectedFraction);
    })
  ));
  return csMatches && snpMatches && heatmapMatches;
}

function configureQueryMetadata(manifest) {
  queryManifestSnapshot = manifest;
  document.querySelector('#query-assembly').textContent = manifest.assembly;
  document.querySelector('#query-coordinate-convention').textContent = manifest.coordinate_convention;
  document.querySelector('#query-arrays').textContent = manifest.arrays.join(', ');
  document.querySelector('#query-accessibility').textContent = manifest.accessibility.note;
  const source = document.querySelector('#query-source');
  source.href = manifest.source.doi;
  source.textContent = manifest.source.filename;
  updatePaddingHelp();
}

function permalinkResolutionIsAvailable(value, select, contract) {
  globalThis.AgamCsPlotModel.validatePlotResolution(value, contract);
  return [...select.options].some((option) => option.value === String(value));
}

async function restoreInitialPermalink() {
  if (parsedInitialPermalink.kind === 'absent') return;
  if (parsedInitialPermalink.kind !== 'valid') {
    setPermalinkStatus(permalinkRestoreMessage(parsedInitialPermalink.code));
    return;
  }

  const state = parsedInitialPermalink.state;
  try {
    const [manifest, contract] = await Promise.all([loadQueryManifest(), loadPlotContract()]);
    if (!permalinkResolutionIsAvailable(state.signal_resolution, signalResolution, contract)
        || !permalinkResolutionIsAvailable(state.heatmap_resolution, heatmapResolution, contract)) {
      throw new Error('Unsupported display setting.');
    }
    const index = state.mode === 'accession' ? await loadAccessionIndex() : null;
    const restore = globalThis.AgamCsQueryPermalinks.validateForRestore(state, {
      allowedResolutions: [...signalResolution.options].map((option) => option.value),
      speciesCodes: manifest.stack.rows,
      cladeIds: globalThis.AgamCsSpeciesContext.cladeRecords(manifest.stack.topology.tree)
        .map((clade) => clade.id),
      resolveAccession(value) {
        return globalThis.AgamCsAccessions.resolve(index, value);
      },
      padAccession(annotation, padding) {
        return globalThis.AgamCsQueryContract.padCoordinates(
          manifest, annotation.chromosome, annotation.start, annotation.end, padding,
        );
      },
      validateCoordinates(chromosome, start, end) {
        return globalThis.AgamCsQueryContract.validateCoordinates(manifest, chromosome, start, end);
      },
    });
    const expected = restore.expected;
    if (state.mode === 'accession') {
      const selected = state.transcript || state.accession;
      const accessionMode = document.querySelector('input[name="live-query-mode"][value="accession"]');
      accessionMode.checked = true;
      setLiveQueryMode('accession');
      liveAccession.value = selected;
      configureIsoformControl(selected);
      document.querySelector('#accession-padding').value = String(state.padding);
      updatePaddingHelp();
    } else {
      const coordinateMode = document.querySelector('input[name="live-query-mode"][value="coordinates"]');
      coordinateMode.checked = true;
      setLiveQueryMode('coordinates');
      document.querySelector('#benchmark-chromosome').value = expected.chromosome;
      document.querySelector('#benchmark-start').value = String(expected.start);
      document.querySelector('#benchmark-end').value = String(expected.end);
    }
    signalResolution.value = String(state.signal_resolution);
    heatmapResolution.value = String(state.heatmap_resolution);
    showOverlappingAnnotations.checked = state.show_overlapping_annotations;
    pendingPermalinkState = { state, expected };
    setPermalinkStatus(
      'Private permalink restored and validated. Review the controls, then choose Run query; no genomic query has been started.',
    );
  } catch (_error) {
    pendingPermalinkState = null;
    setPermalinkStatus(
      'This private permalink refers to unavailable or out-of-range current data and was not restored. You can still enter a query normally.',
    );
  }
}

function applyPendingPermalinkDisplayState(
  result, annotation, annotationAccession, transcriptAnnotations, figureStem,
) {
  const pending = pendingPermalinkState;
  if (!pending) return false;
  pendingPermalinkState = null;
  const { state, expected } = pending;
  if (result.chromosome !== expected.chromosome || result.start !== expected.start
      || result.end !== expected.end) {
    setPermalinkStatus(
      'The restored display settings were not applied because the query controls changed. The completed query remains available.',
    );
    return false;
  }
  try {
    namedIntervalState = globalThis.AgamCsQueryIntervals.validateState(state.intervals, result);
    const speciesCodes = new Set(result.stackRows);
    const clades = new Set(
      globalThis.AgamCsSpeciesContext.cladeRecords(result.stackTopology.tree).map((clade) => clade.id),
    );
    if (!state.species.selected_codes.every((code) => speciesCodes.has(code))
        || !state.species.collapsed_clades.every((clade) => clades.has(clade))) {
      throw new Error('Species display no longer matches the query.');
    }
    signalResolution.value = String(state.signal_resolution);
    heatmapResolution.value = String(state.heatmap_resolution);
    showOverlappingAnnotations.checked = state.show_overlapping_annotations;
    speciesDisplayOrder.value = state.species.order;
    speciesCheckboxGrid.querySelectorAll('input[data-species-code]').forEach((input) => {
      input.checked = state.species.selected_codes.includes(input.dataset.speciesCode);
    });
    cladeCollapseGrid.querySelectorAll('input[data-clade-id]').forEach((input) => {
      input.checked = state.species.collapsed_clades.includes(input.dataset.cladeId);
    });
    speciesDisplayState = {
      selectedCodes: [...state.species.selected_codes],
      order: state.species.order,
      collapsedClades: [...state.species.collapsed_clades],
    };
    updateSpeciesDisplayStatus(result);
    plotZoomHistory = state.display_range && !plotRangesEqual(
      state.display_range, { start: result.start, end: result.end },
    ) ? [{ start: result.start, end: result.end }] : [];
    renderLivePlots(
      result, annotation, annotationAccession, transcriptAnnotations, figureStem,
      false, state.display_range,
    );
    renderNamedIntervals(result);
    setPermalinkStatus('Private permalink display settings applied to this manually started query.');
    return true;
  } catch (_error) {
    setPermalinkStatus(
      'The restored display settings are no longer supported. The completed query remains available with current defaults.',
    );
    return false;
  }
}

if (!localFilePreview) {
  loadQueryManifest().then(configureQueryMetadata).catch((error) => {
    benchmarkStatus.textContent = `Query unavailable: ${error.message}`;
  });
  restoreInitialPermalink();
}

async function runLiveQuery() {
  if (localFilePreview) {
    setPortalState('Local web server required', 'Unavailable', 'error');
    benchmarkStatus.textContent = LOCAL_FILE_PREVIEW_MESSAGE;
    return;
  }
  const form = new FormData(benchmarkForm);
  const mode = String(form.get('live-query-mode') || 'accession');
  let chromosome;
  let start;
  let end;
  let accessionIndex = null;
  let resolution = null;
  let paddingDetails = null;
  let rankingDocuments = null;
  renderGeneRanking(null, null);
  clearQueryReport();
  setPortalState('Preparing query', 'Loading', 'loading');
  benchmarkStatus.textContent = mode === 'accession'
    ? 'Resolving the gene or transcript from the versioned AgamP4 indexes…'
    : 'Validating the requested coordinates…';

  if (mode === 'accession') {
    try {
      accessionIndex = await loadAccessionIndex();
      const namingIndex = geneSearchSnapshot || await loadGeneSearch().catch(() => ({ names: {} }));
      const canonical = globalThis.AgamCsGeneSearch.canonicalize(
        accessionIndex, namingIndex, form.get('live-accession'),
      );
      resolution = globalThis.AgamCsAccessions.resolve(accessionIndex, canonical.value);
      if (canonical.matchedAs === 'name') {
        resolution = { ...resolution, matchedAs: 'name', matchedName: canonical.name };
      }
      ({ chromosome, start, end } = resolution.annotation);
      liveAccession.value = resolution.accession;
      closeAccessionSuggestions();
      configureIsoformControl(resolution.accession);
      updatePaddingHelp();
      rankingDocuments = await loadGeneRankings().catch(() => null);
      renderGeneRanking(rankingDocuments, resolution.geneAccession);
    } catch (error) {
      setPortalState('Query not run', 'Check input', 'error');
      benchmarkStatus.textContent = `Accession lookup stopped: ${error.message}`;
      return;
    }
  } else {
    chromosome = String(form.get('chromosome'));
    start = Number(form.get('start'));
    end = Number(form.get('end'));
  }

  let manifest;
  try {
    manifest = await loadQueryManifest();
  } catch (error) {
    setPortalState('Query unavailable', 'Unavailable', 'error');
    benchmarkStatus.textContent = `Query unavailable: ${error.message}`;
    return;
  }
  try {
    if (resolution) {
      try {
        globalThis.AgamCsQueryContract.validateCoordinates(
          manifest, chromosome, start, end,
        );
      } catch (error) {
        if (error.code !== 'maximum-length') throw error;
        const locusLength = end - start + 1;
        const maximum = Number(manifest.maximum_query_bases);
        const locusError = new Error(`The complete ${resolution.accession} locus spans ${locusLength.toLocaleString()} bases, exceeds the ${maximum.toLocaleString()}-base browser limit, and remains available through the CLI.`);
        locusError.code = 'complete-locus-over-limit';
        throw locusError;
      }
      paddingDetails = globalThis.AgamCsQueryContract.padCoordinates(
        manifest, chromosome, start, end, form.get('accession-padding'),
      );
      ({ chromosome, start, end } = paddingDetails);
    } else {
      ({ chromosome, start, end } = globalThis.AgamCsQueryContract.validateCoordinates(
        manifest, chromosome, start, end,
      ));
    }
  } catch (error) {
    const originalSpan = resolution
      ? resolution.annotation.end - resolution.annotation.start + 1
      : null;
    const sourceFits = originalSpan != null
      && originalSpan <= Number(manifest.maximum_query_bases);
    const subject = resolution && error.code === 'maximum-length'
      ? sourceFits
        ? `${resolution.accession} with the requested padding exceeds the browser query limit. `
        : `${resolution.accession} spans more than the browser query limit. `
      : '';
    const maximumPadding = resolution && manifest
      && error.code === 'maximum-length' && sourceFits
      ? globalThis.AgamCsQueryContract.maximumSymmetricPadding(
        manifest, resolution.annotation.chromosome,
        resolution.annotation.start, resolution.annotation.end,
      )
      : null;
    const guidance = error.code === 'maximum-length' && resolution && sourceFits
      ? ` Use no more than ${maximumPadding.toLocaleString()} bp per side for this accession, or use manual coordinates for a smaller interval.`
      : error.code === 'maximum-length' && resolution
        ? ' Choose a shorter transcript if available, use manual coordinates for a smaller interval, or use the CLI for the full span.'
      : '';
    setPortalState('Query not run', 'Check input', 'error');
    benchmarkStatus.textContent = error.code === 'complete-locus-over-limit'
      ? error.message
      : `${subject}${error.message}${guidance}`;
    return;
  }

  const paddingSubject = paddingDetails?.requestedPadding
    ? `; ${paddingDetails.requestedPadding.toLocaleString()} bp padding per side`
    : '';
  const querySubject = resolution
    ? `${resolution.accession} (${chromosome}:${start}-${end}${paddingSubject})`
    : `${chromosome}:${start}-${end}`;
  setPortalState(resolution ? formatResolutionLabel(resolution) : `${chromosome}:${start}-${end}`, 'Loading', 'loading');
  benchmarkStatus.textContent = `Reading ${querySubject} from Zenodo and the QC companion…`;
  try {
    const [result, validation, plotValidation] = await Promise.all([
      workerQuery(chromosome, start, end),
      loadValidation(),
      loadPlotValidation(),
      loadPlotContract(),
      cataloguePromise,
    ]);
    const pinned = resolution ? null : findPinnedAnnotation(chromosome, start, end);
    result.stackTopology = manifest.stack.topology;
    const annotation = resolution?.annotation || pinned?.annotation || null;
    const annotationAccession = resolution?.accession || pinned?.accession || null;
    const transcriptAnnotations = transcriptAnnotationsForResolution(
      accessionIndex, resolution, annotation,
    );
    const resultRegion = `${chromosome}:${start}-${end}`;
    const validationFixture = findValidationFixture(validation, resultRegion);
    const hasArrayFixture = Boolean(validationFixture);
    const hashesMatch = hasArrayFixture && result.hashAvailable && Object.entries(validationFixture.arrays).every(
      ([name, expected]) => result.hashes[name] === expected.sha256_bytes && result.values[name].length === expected.count,
    );
    const hashUnavailable = hasArrayFixture && !result.hashAvailable;
    if (hasArrayFixture && result.hashAvailable && !hashesMatch) {
      throw new Error('Local validation failed; returned values do not match the pinned HDF5 fixture.');
    }
    const hasPlotFixture = plotValidation.region === resultRegion;
    const plotSummariesMatch = hasPlotFixture
      && validatePlotSummaries(result, plotValidation, annotation);
    if (hasPlotFixture && !plotSummariesMatch) {
      throw new Error('Plot validation failed; browser summaries do not match the Python plotting fixture.');
    }

    clearFigureDownloads();
    setPortalState(resolution ? formatResolutionLabel(resolution) : `${chromosome}:${start}-${end}`, 'Complete');
    benchmarkStatus.textContent = hashesMatch && plotSummariesMatch
      ? 'Query complete; values and plot summaries passed validation.'
      : hashesMatch
        ? 'Query complete; values passed validation.'
      : hashUnavailable
        ? 'Query complete; data retrieved, but browser hash validation is unavailable.'
        : `Query complete: ${querySubject}.`;
    renderQuerySummary(
      result,
      resolution ? annotation : null,
      resolution ? transcriptAnnotations : [],
    );
    namedIntervalState = [];
    renderNamedIntervals(result);
    clearNotableWindowDownloads();
    renderNotableWindows(
      result,
      resolution ? annotation : null,
      resolution ? transcriptAnnotations : [],
    );
    initializeSpeciesDisplayControls(result);
    renderSpeciesContext(result);
    if (resolution) renderResolvedAccession(resolution, accessionIndex, paddingDetails);
    const figureStem = resolution
      ? `AgamCs_${resolution.accession}_${chromosome}_${start}-${end}`
      : `AgamCs_${chromosome}_${start}-${end}`;
    renderLivePlots(
      result, annotation, annotationAccession, transcriptAnnotations,
      figureStem, true,
    );
    applyPendingPermalinkDisplayState(
      result, annotation, annotationAccession, transcriptAnnotations, figureStem,
    );

    const reportRanking = resolution && rankingDocuments
      ? globalThis.AgamCsGeneRankings.lookup(
        rankingDocuments.cs, rankingDocuments.snpDensity, resolution.geneAccession,
      )
      : null;
    queryReportContext = {
      result,
      annotation: resolution ? annotation : null,
      transcriptAnnotations: resolution ? transcriptAnnotations : [],
      ranking: reportRanking,
      queryState: {
        mode,
        accession: resolution?.accession || null,
        matched_as: resolution?.matchedAs || null,
        padding_bases_per_side: paddingDetails?.requestedPadding || 0,
      },
      manifest,
      index: accessionIndex,
    };
    renderQueryReport(result, queryReportContext);

    if (benchmarkDownloadUrl) URL.revokeObjectURL(benchmarkDownloadUrl);
    benchmarkDownloadUrl = URL.createObjectURL(new Blob([buildTsv(result)], { type: 'text/tab-separated-values' }));
    benchmarkDownload.href = benchmarkDownloadUrl;
    benchmarkDownload.download = resolution
      ? `AgamCs_${resolution.accession}_${chromosome}_${start}-${end}.tsv`
      : `AgamCs_${chromosome}_${start}-${end}.tsv`;
    benchmarkDownload.hidden = false;
    copyQueryPermalink.disabled = false;
    if (!queryPermalinkStatus.textContent.includes('permalink display settings')) {
      setPermalinkStatus('Ready to copy a private permalink. Its fragment is kept out of HTTP requests and referrers.');
    }
    trackUsage('query_success', {
      query_mode: mode,
      query_kind: resolution
        ? (resolution.matchedAs === 'transcript' ? 'transcript' : 'gene')
        : 'coordinates',
    });
  } catch (error) {
    setPortalState(resolution ? formatResolutionLabel(resolution) : `${chromosome}:${start}-${end}`, 'Failed', 'error');
    benchmarkStatus.textContent = `Query failed: ${error.message}`;
  }
}

globalThis.AgamCsQueryInteraction.installQuerySubmissionGuard({
  form: benchmarkForm,
  button: benchmarkSubmit,
  run: runLiveQuery,
  onUnexpectedError(error) {
    setPortalState('Query failed', 'Failed', 'error');
    benchmarkStatus.textContent = `Query failed unexpectedly: ${error.message}`;
  },
});
