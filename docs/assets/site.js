const PAGES_RELEASE = '2026-08-03-rc5';

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
const benchmarkMetrics = document.querySelector('#benchmark-metrics');
const benchmarkDownload = document.querySelector('#benchmark-download');
const benchmarkSubmit = document.querySelector('#benchmark-submit');
const querySummary = document.querySelector('#query-summary');
const queryPreview = document.querySelector('#query-preview');
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

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
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
  benchmarkMetrics.hidden = true;
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

function mean(values) {
  let total = 0;
  let count = 0;
  for (const value of values) {
    if (Number.isFinite(value)) {
      total += value;
      count += 1;
    }
  }
  return count ? total / count : Number.NaN;
}

function displayNumber(value) {
  return Number.isFinite(value) ? value.toPrecision(6) : 'NA';
}

function renderQuerySummary(result) {
  const accessibleSnp = [];
  let accessibleCount = 0;
  for (let index = 0; index < result.values.status.length; index += 1) {
    if ((result.values.status[index] & 1) === 1) {
      accessibleSnp.push(result.values.snp_density[index]);
      accessibleCount += 1;
    }
  }
  document.querySelector('#summary-count').textContent = result.values.Cs.length.toLocaleString();
  document.querySelector('#summary-cs').textContent = displayNumber(mean(result.values.Cs));
  document.querySelector('#summary-snp').textContent = displayNumber(mean(accessibleSnp));
  document.querySelector('#summary-accessible').textContent = `${(accessibleCount / result.values.status.length * 100).toFixed(1)}%`;
  const rows = [];
  const previewLength = Math.min(5, result.values.Cs.length);
  for (let index = 0; index < previewLength; index += 1) {
    const row = document.createElement('tr');
    for (const value of [
      String(result.start + index),
      displayNumber(result.values.Cs[index]),
      displayNumber(result.values.snp_density[index]),
      statusLabel(result.values.status[index], result.statusFields),
    ]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    rows.push(row);
  }
  queryPreview.replaceChildren(...rows);
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
  benchmarkMetrics.hidden = true;
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

    document.querySelector('#metric-time').textContent = `${result.metrics.totalMs.toFixed(0)} ms`;
    document.querySelector('#metric-cache-hits').textContent = String(result.metrics.cacheHits);
    document.querySelector('#metric-requests').textContent = result.metrics.retries
      ? `${result.metrics.requests} + ${result.metrics.retries} retries`
      : String(result.metrics.requests);
    document.querySelector('#metric-bytes').textContent = formatBytes(result.metrics.transferredBytes);
    document.querySelector('#metric-memory').textContent = formatBytes(result.metrics.decodedCacheBytes);
    document.querySelector('#metric-validation').textContent = hasArrayFixture
      ? (hashesMatch
        ? (plotSummariesMatch ? 'Exact arrays + Python plot match' : 'Exact arrays match Python fixture')
        : hashUnavailable
          ? (plotSummariesMatch ? 'Python plot match; hash unavailable' : 'Hash unavailable; fixture not checked')
          : 'FAILED')
      : 'No pinned local fixture for this interval';
    benchmarkMetrics.hidden = false;
    setPortalState(resolution?.accession || `${chromosome}:${start}-${end}`, 'Complete');
    benchmarkStatus.textContent = hashesMatch && plotSummariesMatch
      ? 'Query complete; exact arrays and browser plot summaries match the Python fixtures.'
      : hashesMatch
        ? 'Query complete; exact arrays match the Python fixture.'
      : hashUnavailable
        ? 'Query complete; data retrieved, but browser hash validation is unavailable.'
        : `Query complete: ${querySubject}.`;
    renderQuerySummary(result);
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
