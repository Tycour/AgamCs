const PAGES_RELEASE = '2026-08-28-adaptive-plot-binning';
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
const liveVisuals = document.querySelector('#live-visuals');
const liveSignalPlot = document.querySelector('#live-signal-plot');
const liveHeatmapPlot = document.querySelector('#live-heatmap-plot');
const liveSignalDownload = document.querySelector('#live-signal-download');
const liveHeatmapDownload = document.querySelector('#live-heatmap-download');
const liveAnnotationNote = document.querySelector('#live-annotation-note');
const signalResolution = document.querySelector('#signal-resolution');
const heatmapResolution = document.querySelector('#heatmap-resolution');
const plotResolutionStatus = document.querySelector('#plot-resolution-status');
const accessionQueryPanel = document.querySelector('#accession-query-panel');
const coordinateQueryPanel = document.querySelector('#coordinate-query-panel');
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
let accessionIndexSnapshot;
let geneSearchSnapshot;
let queryManifestSnapshot;
let plotContractSnapshot;
let retainedPlotState;
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
  configureIsoformControl(liveAccession.value);
  updatePaddingHelp();
}

function configureAccessionOnly(index, error) {
  accessionIndexSnapshot = index;
  geneSearchSnapshot = { names: {}, source: { release: 'unavailable naming index' } };
  const geneCount = Object.keys(index.accessions).length;
  const transcriptCount = Object.keys(index.transcripts).length;
  accessionIndexHelp.textContent = `Gene-symbol search unavailable: ${error.message} Exact lookup still covers ${geneCount.toLocaleString()} genes and ${transcriptCount.toLocaleString()} transcripts.`;
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
  coordinateQueryPanel.hidden = byAccession;
  closeAccessionSuggestions();
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
    examples = catalogue.examples;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a featured example...';
    exampleSelect.replaceChildren(placeholder, ...examples.map((example) => {
      const option = document.createElement('option');
      option.value = example.accession;
      option.textContent = `${example.accession} — ${example.feature_summary}`;
      return option;
    }));
    catalogueHelp.textContent = `${examples.length} featured examples. Selecting one fills the accession query.`;
  } catch (error) {
    catalogueHelp.textContent = 'Featured examples could not be loaded; accession and coordinate queries still work.';
    console.error(error);
  }
}

exampleSelect.addEventListener('change', () => {
  if (!exampleSelect.value) {
    catalogueHelp.textContent = `${examples.length} featured examples. Selecting one fills the accession query.`;
    return;
  }
  const example = examples.find((item) => item.accession === exampleSelect.value);
  const accessionMode = document.querySelector('input[name="live-query-mode"][value="accession"]');
  accessionMode.checked = true;
  setLiveQueryMode('accession');
  liveAccession.value = exampleSelect.value;
  closeAccessionSuggestions();
  configureIsoformControl(liveAccession.value);
  updatePaddingHelp();
  if (example) catalogueHelp.textContent = `${example.description} ${example.qc_note}`;
  setPortalState(`Ready to query ${exampleSelect.value}`, 'Ready');
  benchmarkStatus.textContent = `${exampleSelect.value} selected from the featured examples. Run the query to retrieve its values.`;
});

const cataloguePromise = localFilePreview ? Promise.resolve([]) : loadCatalogue();

if (localFilePreview) {
  accessionIndexHelp.textContent = LOCAL_FILE_PREVIEW_MESSAGE;
  paddingHelp.textContent = 'Start the local web server before using accession padding.';
  catalogueHelp.textContent = 'Start the local web server to load the featured examples.';
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

function renderQuerySummary(
  result, annotation = null, annotationScope = 'gene', transcriptAnnotations = [],
  paddingDetails = null,
) {
  const summary = globalThis.AgamCsPlots.summarizeQuery(result, annotation);
  const hasExonSummary = summary.exonBasePairs != null;
  const transcriptScope = hasExonSummary && annotationScope === 'transcript';
  const multiTranscriptGene = hasExonSummary
    && annotationScope === 'gene'
    && transcriptAnnotations.length > 1;
  const hasPadding = Number(paddingDetails?.requestedPadding) > 0;
  const queryScope = hasExonSummary
    ? (hasPadding
      ? `Padded ${transcriptScope ? 'transcript' : 'gene'} interval`
      : (transcriptScope ? 'Entire transcript span' : 'Entire gene span'))
    : 'Queried interval';
  document.querySelector('#summary-count').textContent = summary.queryBasePairs.toLocaleString();
  document.querySelector('#summary-cs').textContent = displayNumber(summary.queryMeanCs);
  document.querySelector('#summary-snp').textContent = displayNumber(summary.queryMeanSnp);
  document.querySelector('#summary-query-scope').textContent = queryScope;
  document.querySelector('#summary-exons-card').hidden = !hasExonSummary;
  if (hasExonSummary) {
    document.querySelector('#summary-exons-heading').textContent = transcriptScope
      ? 'Selected transcript exons'
      : multiTranscriptGene
        ? 'Representative transcript exons'
        : 'Aggregated exons';
    document.querySelector('#summary-exon-count').textContent = summary.exonBasePairs.toLocaleString();
    document.querySelector('#summary-cs-exons').textContent = displayNumber(summary.exonMeanCs);
    document.querySelector('#summary-snp-exons').textContent = displayNumber(summary.exonMeanSnp);
    const spanLabel = hasPadding
      ? `Padded ${transcriptScope ? 'transcript' : 'gene'}-interval`
      : (transcriptScope ? 'Transcript-span' : 'Gene-span');
    const spanContents = hasPadding ? 'flanks, exons, and introns' : 'exons and introns';
    const paddingNote = hasPadding
      ? ` Requested padding was ${paddingDetails.requestedPadding.toLocaleString()} bp per side; chromosome-boundary clipping applied ${paddingDetails.leftPadding.toLocaleString()} bp on the lower-coordinate side and ${paddingDetails.rightPadding.toLocaleString()} bp on the higher-coordinate side.`
      : '';
    const exonDefinition = multiTranscriptGene
      ? `Exon means use the ${summary.exonBasePairs.toLocaleString()} unique bp in the union of ${annotation.transcript_id} exons; other isoforms shown in the plots are not combined into this metric.`
      : `Exon means use the ${summary.exonBasePairs.toLocaleString()} unique bp in the union of annotated exons.`;
    document.querySelector('#summary-method-note').textContent = `${spanLabel} means use all ${summary.queryBasePairs.toLocaleString()} queried bp (${spanContents}).${paddingNote} ${exonDefinition} SNP means include only QC-accessible bases within each scope; QC-failed bases remain unknown. Exon SNP averages the archived density values assigned to exonic bases; it does not recalculate their 20 bp windows.`;
  } else {
    document.querySelector('#summary-method-note').textContent = `Means use all ${summary.queryBasePairs.toLocaleString()} queried bp. The SNP mean includes only QC-accessible bases; QC-failed bases remain unknown. Exon means require a gene annotation from the versioned index.`;
  }
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

function renderResolvedAccession(resolution, index, paddingDetails) {
  const annotation = resolution.annotation;
  const name = geneSearchSnapshot?.names?.[resolution.geneAccession]?.name || null;
  const queryLabel = name ? `${resolution.accession} (${name})` : resolution.accession;
  const geneLabel = name
    ? `${resolution.geneAccession} (${name})`
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

function renderLivePlots(
  result, providedAnnotation = null, providedAccession = null, providedTranscriptAnnotations = null,
  figureStem = null, resetResolution = false,
) {
  const adaptive = plotContractSnapshot.binning.adaptive_keyword;
  if (resetResolution) {
    signalResolution.value = adaptive;
    heatmapResolution.value = adaptive;
  }
  const signalChoice = selectedPlotResolution(signalResolution);
  const heatmapChoice = selectedPlotResolution(heatmapResolution);
  globalThis.AgamCsPlotModel.validatePlotResolution(signalChoice, plotContractSnapshot);
  globalThis.AgamCsPlotModel.validatePlotResolution(heatmapChoice, plotContractSnapshot);
  const pinned = providedAnnotation ? null : findPinnedAnnotation(result.chromosome, result.start, result.end);
  const annotation = providedAnnotation || pinned?.annotation || null;
  const accession = providedAccession || pinned?.accession || null;
  const transcriptAnnotations = providedTranscriptAnnotations
    || (annotation ? [annotation] : []);
  const signalSummary = globalThis.AgamCsPlots.renderSignalPlot(
    liveSignalPlot, result, annotation, transcriptAnnotations,
    signalChoice,
  );
  const heatmapSummary = globalThis.AgamCsPlots.renderHeatmap(
    liveHeatmapPlot, result, annotation, transcriptAnnotations,
    heatmapChoice,
  );
  const annotationSubject = accession === annotation?.transcript_id
    ? `${annotation.id} isoform ${annotation.transcript_id}`
    : accession;
  liveAnnotationNote.textContent = transcriptAnnotations.length > 1
    ? `All ${transcriptAnnotations.length} transcript models for ${annotation.id} are shown 5′→3′; ${annotation.transcript_id} is bold and supplies the exon summary and CDS guides.`
    : annotation
      ? `${annotationSubject} annotation applied; ${annotation.transcript_id} is shown 5′→3′.`
      : 'Genomic-coordinate view. Gene annotation is applied when querying by accession or a featured example.';
  const baseCount = result.end - result.start + 1;
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
    signalChoice: String(signalChoice),
    heatmapChoice: String(heatmapChoice),
  };
  if (figureStem) {
    clearFigureDownloads();
    configureFigureDownload(
      liveSignalDownload, liveSignalPlot, `${figureStem}_cs-snp-qc.svg`,
    );
    configureFigureDownload(
      liveHeatmapDownload, liveHeatmapPlot, `${figureStem}_species-heatmap.svg`,
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
    );
  } catch (error) {
    signalResolution.value = previous.signalChoice;
    heatmapResolution.value = previous.heatmapChoice;
    plotResolutionStatus.textContent = `Resolution unchanged: ${error.message}`;
  }
}

signalResolution.addEventListener('change', rerenderRetainedPlots);
heatmapResolution.addEventListener('change', rerenderRetainedPlots);

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
  setPortalState(resolution?.accession || `${chromosome}:${start}-${end}`, 'Loading', 'loading');
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
    setPortalState(resolution?.accession || `${chromosome}:${start}-${end}`, 'Complete');
    benchmarkStatus.textContent = hashesMatch && plotSummariesMatch
      ? 'Query complete; values and plot summaries passed validation.'
      : hashesMatch
        ? 'Query complete; values passed validation.'
      : hashUnavailable
        ? 'Query complete; data retrieved, but browser hash validation is unavailable.'
        : `Query complete: ${querySubject}.`;
    renderQuerySummary(
      result,
      annotation,
      resolution?.matchedAs === 'transcript' ? 'transcript' : 'gene',
      transcriptAnnotations,
      paddingDetails,
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
    setPortalState(resolution?.accession || `${chromosome}:${start}-${end}`, 'Failed', 'error');
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
