const PAGES_RELEASE = '2026-08-03-rc7';

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
const liveAnnotationNote = document.querySelector('#live-annotation-note');
const accessionQueryPanel = document.querySelector('#accession-query-panel');
const coordinateQueryPanel = document.querySelector('#coordinate-query-panel');
const liveAccession = document.querySelector('#live-accession');
const liveAccessionList = document.querySelector('#live-accession-list');
const accessionIndexHelp = document.querySelector('#accession-index-help');
const resolvedAccession = document.querySelector('#resolved-accession');
const exampleSelect = document.querySelector('#example-select');
const catalogueHelp = document.querySelector('#catalogue-help');
const resultTitle = document.querySelector('#result-title');
const resultStatus = document.querySelector('#result-status');
const queryWorker = new Worker(versionedAsset('assets/query-worker.js'));
const pendingQueries = new Map();
let examples = [];
let queryRequestId = 0;
let benchmarkDownloadUrl;
let queryManifestPromise;
let accessionIndexPromise;

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

async function loadAccessionIndex() {
  if (!accessionIndexPromise) {
    accessionIndexPromise = fetch(versionedAsset('assets/data/accession-index.json')).then(async (response) => {
      if (!response.ok) throw new Error(`Accession index request failed (${response.status}).`);
      const index = await response.json();
      if (index.schema_version !== 1 || index.assembly !== 'AgamP4' || !index.accessions) {
        throw new Error('The pinned accession index is not compatible with this client.');
      }
      return index;
    });
  }
  return accessionIndexPromise;
}

function configureAccessionIndex(index) {
  liveAccessionList.replaceChildren(...Object.entries(index.accessions).map(([accession, record]) => {
    const option = document.createElement('option');
    option.value = accession;
    option.label = `${record.region}; ${record.annotation.transcript_id}`;
    return option;
  }));
  const count = Object.keys(index.accessions).length;
  accessionIndexHelp.textContent = `${count} pinned genes · ${index.annotation.gene_build} · ${index.index_version} · live lookup off.`;
}

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
  benchmarkDownload.hidden = true;
  querySummary.hidden = true;
  liveVisuals.hidden = true;
  resolvedAccession.hidden = true;
  setPortalState('Ready for a query', 'Ready');
  benchmarkStatus.textContent = byAccession
    ? 'Ready to resolve a gene from the pinned accession index.'
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
    placeholder.textContent = 'Choose a reviewed example…';
    exampleSelect.replaceChildren(placeholder, ...examples.map((example) => {
      const option = document.createElement('option');
      option.value = example.accession;
      option.textContent = `${example.accession} — ${example.feature_summary}`;
      return option;
    }));
    catalogueHelp.textContent = `${examples.length} reviewed precomputed examples. Selecting one uses this same live query portal.`;
  } catch (error) {
    catalogueHelp.textContent = 'The precomputed example shortcuts could not be loaded; accession and coordinate queries still work.';
    console.error(error);
  }
}

exampleSelect.addEventListener('change', () => {
  if (!exampleSelect.value) return;
  const accessionMode = document.querySelector('input[name="live-query-mode"][value="accession"]');
  accessionMode.checked = true;
  setLiveQueryMode('accession');
  liveAccession.value = exampleSelect.value;
  setPortalState(`Ready to query ${exampleSelect.value}`, 'Ready');
  benchmarkStatus.textContent = `${exampleSelect.value} selected from the precomputed examples. Run the live query to retrieve its exact values.`;
});

const cataloguePromise = loadCatalogue();

loadAccessionIndex().then(configureAccessionIndex).catch((error) => {
  accessionIndexHelp.textContent = `Pinned accession lookup unavailable: ${error.message} Manual coordinates still work.`;
});

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
  queryRequestId += 1;
  const requestId = queryRequestId;
  return new Promise((resolve, reject) => {
    pendingQueries.set(requestId, { resolve, reject });
    queryWorker.postMessage({ action: 'query', requestId, chromosome, start, end });
  });
}

queryWorker.addEventListener('message', ({ data }) => {
  const pending = pendingQueries.get(data.requestId);
  if (!pending) return;
  pendingQueries.delete(data.requestId);
  if (data.ok) pending.resolve(data);
  else pending.reject(new Error(data.message));
});

queryWorker.addEventListener('error', () => {
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

function renderQuerySummary(result, annotation = null) {
  const summary = globalThis.AgamCsPlots.summarizeQuery(result, annotation);
  const hasExonSummary = summary.exonBasePairs != null;
  const queryScope = hasExonSummary ? 'Entire gene span' : 'Queried interval';
  document.querySelector('#summary-count').textContent = summary.queryBasePairs.toLocaleString();
  document.querySelector('#summary-cs').textContent = displayNumber(summary.queryMeanCs);
  document.querySelector('#summary-snp').textContent = displayNumber(summary.queryMeanSnp);
  document.querySelector('#summary-query-scope').textContent = queryScope;
  document.querySelector('#summary-exons-card').hidden = !hasExonSummary;
  if (hasExonSummary) {
    document.querySelector('#summary-exon-count').textContent = summary.exonBasePairs.toLocaleString();
    document.querySelector('#summary-cs-exons').textContent = displayNumber(summary.exonMeanCs);
    document.querySelector('#summary-snp-exons').textContent = displayNumber(summary.exonMeanSnp);
    document.querySelector('#summary-method-note').textContent = `Gene-span means use all ${summary.queryBasePairs.toLocaleString()} queried bp (exons and introns). Exon means use the ${summary.exonBasePairs.toLocaleString()} unique bp in the union of annotated exons. SNP means include only QC-accessible bases within each scope; QC-failed bases remain unknown. Exon SNP averages the archived density values assigned to exonic bases; it does not recalculate their 20 bp windows.`;
  } else {
    document.querySelector('#summary-method-note').textContent = `Means use all ${summary.queryBasePairs.toLocaleString()} queried bp. The SNP mean includes only QC-accessible bases; QC-failed bases remain unknown. Exon means require a pinned gene annotation.`;
  }
  querySummary.hidden = false;
}

function findPinnedAnnotation(chromosome, start, end) {
  const region = `${chromosome}:${start}-${end}`;
  return examples.find((example) => example.region === region) || null;
}

function renderResolvedAccession(resolution, index) {
  const annotation = resolution.annotation;
  document.querySelector('#resolved-accession-id').textContent = resolution.accession;
  document.querySelector('#resolved-transcript').textContent = annotation.transcript_id;
  document.querySelector('#resolved-strand').textContent = Number(annotation.strand) === -1 ? '− (minus)' : '+ (plus)';
  document.querySelector('#resolved-annotation').textContent = `${index.annotation.gene_build} (${index.annotation.released})`;
  document.querySelector('#resolved-index-version').textContent = index.index_version;
  resolvedAccession.hidden = false;
}

function renderLivePlots(result, providedAnnotation = null, providedAccession = null) {
  const pinned = providedAnnotation ? null : findPinnedAnnotation(result.chromosome, result.start, result.end);
  const annotation = providedAnnotation || pinned?.annotation || null;
  const accession = providedAccession || pinned?.accession || null;
  globalThis.AgamCsPlots.renderSignalPlot(liveSignalPlot, result, annotation);
  globalThis.AgamCsPlots.renderHeatmap(liveHeatmapPlot, result, annotation);
  liveAnnotationNote.textContent = annotation
    ? `${accession} annotation applied; ${annotation.transcript_id} is shown 5′→3′.`
    : 'Genomic-coordinate view. Gene annotation is applied when querying by accession or an exact precomputed catalogue interval.';
  liveVisuals.hidden = false;
}

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
  const signal = globalThis.AgamCsPlots.summarizeSignals(result, annotation, fixture.signal_bins);
  const heatmap = globalThis.AgamCsPlots.summarizeHeatmap(result, annotation, fixture.heatmap_bins);
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
  document.querySelector('#query-assembly').textContent = manifest.assembly;
  document.querySelector('#query-coordinate-convention').textContent = manifest.coordinate_convention;
  document.querySelector('#query-arrays').textContent = manifest.arrays.join(', ');
  document.querySelector('#query-accessibility').textContent = manifest.accessibility.note;
  const source = document.querySelector('#query-source');
  source.href = manifest.source.doi;
  source.textContent = manifest.source.filename;
}

loadQueryManifest().then(configureQueryMetadata).catch((error) => {
  benchmarkStatus.textContent = `Live query unavailable: ${error.message}`;
});

benchmarkForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(benchmarkForm);
  const mode = String(form.get('live-query-mode') || 'accession');
  let chromosome;
  let start;
  let end;
  let accessionIndex = null;
  let resolution = null;
  benchmarkDownload.hidden = true;
  querySummary.hidden = true;
  liveVisuals.hidden = true;
  resolvedAccession.hidden = true;

  if (mode === 'accession') {
    try {
      accessionIndex = await loadAccessionIndex();
      resolution = globalThis.AgamCsAccessions.resolve(accessionIndex, form.get('live-accession'));
      ({ chromosome, start, end } = resolution.annotation);
      liveAccession.value = resolution.accession;
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
    benchmarkStatus.textContent = `Live query unavailable: ${error.message}`;
    return;
  }
  try {
    ({ chromosome, start, end } = globalThis.AgamCsQueryContract.validateCoordinates(
      manifest, chromosome, start, end,
    ));
  } catch (error) {
    const subject = resolution && error.code === 'maximum-length'
      ? `${resolution.accession} spans ${(end - start + 1).toLocaleString()} bases. `
      : '';
    const guidance = error.code === 'maximum-length' && resolution
      ? ' Use manual coordinates for a smaller interval.'
      : '';
    setPortalState('Query not run', 'Check input', 'error');
    benchmarkStatus.textContent = `${subject}${error.message}${guidance}`;
    return;
  }

  const querySubject = resolution ? `${resolution.accession} (${chromosome}:${start}-${end})` : `${chromosome}:${start}-${end}`;
  setPortalState(resolution?.accession || `${chromosome}:${start}-${end}`, 'Loading', 'loading');
  benchmarkStatus.textContent = `Reading ${querySubject} from Zenodo and the QC companion…`;
  benchmarkSubmit.disabled = true;
  try {
    const [result, validation, plotValidation] = await Promise.all([
      workerQuery(chromosome, start, end),
      loadValidation(),
      loadPlotValidation(),
      cataloguePromise,
    ]);
    const pinned = resolution ? null : findPinnedAnnotation(chromosome, start, end);
    const annotation = resolution?.annotation || pinned?.annotation || null;
    const annotationAccession = resolution?.accession || pinned?.accession || null;
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

    setPortalState(resolution?.accession || `${chromosome}:${start}-${end}`, 'Complete');
    benchmarkStatus.textContent = hashesMatch && plotSummariesMatch
      ? 'Query complete; exact arrays and browser plot summaries match the Python fixtures.'
      : hashesMatch
        ? 'Query complete; exact arrays match the Python fixture.'
      : hashUnavailable
        ? 'Query complete; data retrieved, but browser hash validation is unavailable.'
        : `Query complete: ${querySubject}.`;
    renderQuerySummary(result, annotation);
    if (resolution) renderResolvedAccession(resolution, accessionIndex);
    renderLivePlots(result, annotation, annotationAccession);

    if (benchmarkDownloadUrl) URL.revokeObjectURL(benchmarkDownloadUrl);
    benchmarkDownloadUrl = URL.createObjectURL(new Blob([buildTsv(result)], { type: 'text/tab-separated-values' }));
    benchmarkDownload.href = benchmarkDownloadUrl;
    benchmarkDownload.download = resolution
      ? `AgamCs_${resolution.accession}_${chromosome}_${start}-${end}.tsv`
      : `AgamCs_${chromosome}_${start}-${end}.tsv`;
    benchmarkDownload.hidden = false;
  } catch (error) {
    setPortalState(resolution?.accession || `${chromosome}:${start}-${end}`, 'Failed', 'error');
    benchmarkStatus.textContent = `Query failed: ${error.message}`;
  } finally {
    benchmarkSubmit.disabled = false;
  }
});
