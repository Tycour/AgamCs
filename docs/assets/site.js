const PAGES_RELEASE = '2026-09-05-query-summary-v1';
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
const benchmarkSubmit = document.querySelector('#benchmark-submit');
const querySummary = document.querySelector('#query-summary');
const querySummaryBody = document.querySelector('#query-summary-body');
const querySummarySubject = document.querySelector('#query-summary-subject');
const querySummaryVersion = document.querySelector('#query-summary-version');
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
const localFilePreview = window.location.protocol === 'file:';
const queryWorker = localFilePreview
  ? null
  : new Worker(versionedAsset('assets/query-worker.js'));
const pendingQueries = new Map();
let examples = [];
let queryRequestId = 0;
let benchmarkDownloadUrl;
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
const figureDownloadUrls = new Map();

function trackUsage(eventName, parameters) {
  try {
    globalThis.AgamCsAnalytics?.track(eventName, parameters);
  } catch (_error) {
    // Usage measurement must never affect scientific queries or downloads.
  }
}

benchmarkDownload.addEventListener('click', () => {
  trackUsage('file_download', { artifact_type: 'tsv' });
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
    selectFeaturedExample(quickExamples[0].accession, { focusSubmit: false });
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

function workerQuery(chromosome, start, end) {
  if (!queryWorker) return Promise.reject(new Error(LOCAL_FILE_PREVIEW_MESSAGE));
  queryRequestId += 1;
  const requestId = queryRequestId;
  return new Promise((resolve, reject) => {
    pendingQueries.set(requestId, { resolve, reject });
    queryWorker.postMessage({ action: 'query', requestId, chromosome, start, end });
  });
}

queryWorker?.addEventListener('message', ({ data }) => {
  const pending = pendingQueries.get(data.requestId);
  if (!pending) return;
  pendingQueries.delete(data.requestId);
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

function buildTsv(data) {
  const headers = [
    'chromosome', 'pos', 'Cs_C', 'snp_density_s', 'is_accessible',
    'quality_status', 'accessibility_status_byte',
    ...data.stackRows.map((code) => `stack_${code}`),
  ];
  const lines = [headers.join('\t')];
  const width = data.values.Cs.length;
  for (let index = 0; index < data.values.Cs.length; index += 1) {
    const status = data.values.status[index];
    const stack = data.stackRows.map((_code, row) => data.values.stack[row * width + index]);
    lines.push([
      data.chromosome,
      data.start + index,
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
  const renderRankedMetric = (metric, valueId, detailId) => {
    document.querySelector(valueId).textContent =
      `${metric.global.percentile.toFixed(2)}th`;
    document.querySelector(detailId).textContent =
      `Global ${rankingPosition(metric.global)} · ${card.chromosome} `
      + `${metric.chromosome.percentile.toFixed(2)}th percentile `
      + `(${rankingPosition(metric.chromosome)})`;
  };
  if (card.cs) {
    renderRankedMetric(card.cs.metrics.gene_span, '#summary-cs-rank-span', '#summary-cs-rank-span-detail');
    renderRankedMetric(
      card.cs.metrics.representative_exons,
      '#summary-cs-rank-exons', '#summary-cs-rank-exons-detail',
    );
    document.querySelector('#summary-cs-ranking-note').textContent =
      `Static ${card.accession} ranking; padding and selected non-representative isoforms do not `
      + `change it. Exon ranking uses ${card.representativeTranscript}. ${card.cs.interpretation}`;
  }
  if (card.snpDensity) {
    const renderSnpMetric = (metric, valueId, detailId) => {
      if (metric.eligible) {
        renderRankedMetric(metric, valueId, detailId);
      } else {
        document.querySelector(valueId).textContent = 'Not ranked';
        document.querySelector(detailId).textContent =
          `${(100 * metric.accessibleFraction).toFixed(1)}% accessible `
          + `(${metric.accessibleBases.toLocaleString()}/${metric.totalBases.toLocaleString()}); `
          + '80% required';
      }
    };
    renderSnpMetric(
      card.snpDensity.metrics.gene_span,
      '#summary-snp-rank-span', '#summary-snp-rank-span-detail',
    );
    renderSnpMetric(
      card.snpDensity.metrics.representative_exons,
      '#summary-snp-rank-exons', '#summary-snp-rank-exons-detail',
    );
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
    heatmapChoice, activeRange, rangeSelection,
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
    + `heatmap: ${heatmapSummary.binCount.toLocaleString()} bins `
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

if (!localFilePreview) {
  loadQueryManifest().then(configureQueryMetadata).catch((error) => {
    benchmarkStatus.textContent = `Query unavailable: ${error.message}`;
  });
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
  renderGeneRanking(null, null);
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
      const rankingDocument = await loadGeneRankings().catch(() => null);
      renderGeneRanking(rankingDocument, resolution.geneAccession);
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
    if (resolution) renderResolvedAccession(resolution, accessionIndex, paddingDetails);
    const figureStem = resolution
      ? `AgamCs_${resolution.accession}_${chromosome}_${start}-${end}`
      : `AgamCs_${chromosome}_${start}-${end}`;
    renderLivePlots(
      result, annotation, annotationAccession, transcriptAnnotations,
      figureStem, true,
    );

    if (benchmarkDownloadUrl) URL.revokeObjectURL(benchmarkDownloadUrl);
    benchmarkDownloadUrl = URL.createObjectURL(new Blob([buildTsv(result)], { type: 'text/tab-separated-values' }));
    benchmarkDownload.href = benchmarkDownloadUrl;
    benchmarkDownload.download = resolution
      ? `AgamCs_${resolution.accession}_${chromosome}_${start}-${end}.tsv`
      : `AgamCs_${chromosome}_${start}-${end}.tsv`;
    benchmarkDownload.hidden = false;
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
