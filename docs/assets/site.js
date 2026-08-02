const tabs = document.querySelectorAll('[role="tab"]');
const panels = document.querySelectorAll('[role="tabpanel"]');
const accessionSelect = document.querySelector('#accession');
const catalogueHelp = document.querySelector('#catalogue-help');
const resultTitle = document.querySelector('#result-title');
const resultDescription = document.querySelector('#result-description');
const resultRegion = document.querySelector('#result-region');
const resultTranscript = document.querySelector('#result-transcript');
const resultQc = document.querySelector('#result-qc');
const profileImage = document.querySelector('#profile-image');
const profileDownload = document.querySelector('#profile-download');
const heatmapImage = document.querySelector('#heatmap-image');
const heatmapDownload = document.querySelector('#heatmap-download');
let examples = [];

function activateTab(tab) {
  tabs.forEach((candidate) => {
    const selected = candidate === tab;
    candidate.setAttribute('aria-selected', String(selected));
    candidate.tabIndex = selected ? 0 : -1;
  });
  panels.forEach((panel) => {
    panel.hidden = panel.id !== tab.dataset.tab;
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

function assetUrl(path) {
  return `assets/${path}`;
}

function renderExample(accession) {
  const example = examples.find((candidate) => candidate.accession === accession);
  if (!example) return;

  resultTitle.textContent = example.accession;
  resultDescription.textContent = example.description;
  resultRegion.textContent = example.region;
  resultTranscript.textContent = `${example.transcript_id} (${example.strand})`;
  resultQc.textContent = example.qc_note;

  const profileUrl = assetUrl(example.assets.summary);
  const heatmapUrl = assetUrl(example.assets.heatmap);
  profileImage.src = profileUrl;
  profileImage.alt = `Binned conservation score and SNP-density profile for ${example.accession}`;
  profileDownload.href = profileUrl;
  heatmapImage.src = heatmapUrl;
  heatmapImage.alt = `Cross-species conservation heatmap for ${example.accession}`;
  heatmapDownload.href = heatmapUrl;
}

async function loadCatalogue() {
  try {
    const response = await fetch('examples.json');
    if (!response.ok) throw new Error(`Catalogue request failed (${response.status})`);
    const catalogue = await response.json();
    examples = catalogue.examples;
    accessionSelect.replaceChildren(...examples.map((example) => {
      const option = document.createElement('option');
      option.value = example.accession;
      option.textContent = `${example.accession} — ${example.feature_summary}`;
      return option;
    }));
    catalogueHelp.textContent = `${examples.length} precomputed examples; choose one to update the displayed result.`;
    renderExample(accessionSelect.value);
  } catch (error) {
    catalogueHelp.textContent = 'The example catalogue could not be loaded; showing the default result.';
    console.error(error);
  }
}

accessionSelect.addEventListener('change', () => renderExample(accessionSelect.value));

document.querySelector('#query-form').addEventListener('submit', (event) => {
  event.preventDefault();
  renderExample(accessionSelect.value);
  const status = document.querySelector('#result-status');
  status.textContent = 'Loaded locally';
  status.classList.add('refresh');
  document.querySelector('.results-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => {
    status.textContent = 'Ready';
    status.classList.remove('refresh');
  }, 1200);
});

loadCatalogue();

const benchmarkForm = document.querySelector('#benchmark-form');
const benchmarkStatus = document.querySelector('#benchmark-status');
const benchmarkMetrics = document.querySelector('#benchmark-metrics');
const benchmarkDownload = document.querySelector('#benchmark-download');
const benchmarkSubmit = document.querySelector('#benchmark-submit');
const querySummary = document.querySelector('#query-summary');
const queryPreview = document.querySelector('#query-preview');
const queryWorker = new Worker('assets/query-worker.js');
const pendingQueries = new Map();
let queryRequestId = 0;
let benchmarkDownloadUrl;
let queryManifestPromise;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
}

async function loadValidation() {
  const response = await fetch('assets/data/query-validation.json');
  if (!response.ok) throw new Error(`Validation fixture request failed (${response.status}).`);
  return response.json();
}

async function loadQueryManifest() {
  if (!queryManifestPromise) {
    queryManifestPromise = fetch('assets/data/query-manifest.json').then((response) => {
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

function buildTsv(data) {
  const lines = ['chromosome\tpos\tCs_C\tsnp_density_s'];
  for (let index = 0; index < data.values.Cs.length; index += 1) {
    lines.push(`${data.chromosome}\t${data.start + index}\t${data.values.Cs[index]}\t${data.values.snp_density[index]}`);
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
  document.querySelector('#summary-count').textContent = result.values.Cs.length.toLocaleString();
  document.querySelector('#summary-cs').textContent = displayNumber(mean(result.values.Cs));
  document.querySelector('#summary-snp').textContent = displayNumber(mean(result.values.snp_density));
  const rows = [];
  const previewLength = Math.min(5, result.values.Cs.length);
  for (let index = 0; index < previewLength; index += 1) {
    const row = document.createElement('tr');
    for (const value of [
      String(result.start + index),
      displayNumber(result.values.Cs[index]),
      displayNumber(result.values.snp_density[index]),
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
  const chromosome = String(form.get('chromosome'));
  const start = Number(form.get('start'));
  const end = Number(form.get('end'));
  const length = end - start + 1;
  benchmarkMetrics.hidden = true;
  benchmarkDownload.hidden = true;
  querySummary.hidden = true;
  let manifest;
  try {
    manifest = await loadQueryManifest();
  } catch (error) {
    benchmarkStatus.textContent = `Live query unavailable: ${error.message}`;
    return;
  }
  if (!(chromosome in manifest.chromosomes)) {
    benchmarkStatus.textContent = `Chromosome ${chromosome} is not available in ${manifest.assembly}.`;
    return;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    benchmarkStatus.textContent = 'Coordinates must satisfy 1 ≤ start ≤ end.';
    return;
  }
  if (end > manifest.chromosomes[chromosome].length) {
    benchmarkStatus.textContent = `End coordinate ${end.toLocaleString()} exceeds ${chromosome} length ${manifest.chromosomes[chromosome].length.toLocaleString()}.`;
    return;
  }
  if (length > manifest.maximum_query_bases) {
    benchmarkStatus.textContent = `Queries are limited to ${manifest.maximum_query_bases.toLocaleString()} bases.`;
    return;
  }

  benchmarkStatus.textContent = `Reading ${chromosome}:${start}-${end} from Zenodo…`;
  benchmarkSubmit.disabled = true;
  try {
    const [result, validation] = await Promise.all([
      workerQuery(chromosome, start, end),
      loadValidation(),
    ]);
    const matchingFixture = validation.region === `${chromosome}:${start}-${end}`;
    const hashesMatch = matchingFixture && result.hashAvailable && Object.entries(validation.arrays).every(
      ([name, expected]) => result.hashes[name] === expected.sha256_le_float32 && result.values[name].length === expected.count,
    );
    const hashUnavailable = matchingFixture && !result.hashAvailable;
    if (matchingFixture && result.hashAvailable && !hashesMatch) {
      throw new Error('Local validation failed; returned values do not match the pinned HDF5 fixture.');
    }

    document.querySelector('#metric-time').textContent = `${result.metrics.totalMs.toFixed(0)} ms`;
    document.querySelector('#metric-cache-hits').textContent = String(result.metrics.cacheHits);
    document.querySelector('#metric-requests').textContent = String(result.metrics.requests);
    document.querySelector('#metric-bytes').textContent = formatBytes(result.metrics.transferredBytes);
    document.querySelector('#metric-memory').textContent = formatBytes(result.metrics.decodedCacheBytes);
    document.querySelector('#metric-validation').textContent = matchingFixture
      ? (hashesMatch ? 'Exact SHA-256 match' : hashUnavailable ? 'Hash unavailable; values retrieved' : 'FAILED')
      : 'No pinned local fixture for this interval';
    benchmarkMetrics.hidden = false;
    benchmarkStatus.textContent = hashesMatch
      ? 'Query complete; both arrays exactly match the local HDF5 fixture.'
      : hashUnavailable
        ? 'Query complete; data retrieved, but browser hash validation is unavailable.'
        : `Query complete: ${chromosome}:${start}-${end}.`;
    renderQuerySummary(result);

    if (benchmarkDownloadUrl) URL.revokeObjectURL(benchmarkDownloadUrl);
    benchmarkDownloadUrl = URL.createObjectURL(new Blob([buildTsv(result)], { type: 'text/tab-separated-values' }));
    benchmarkDownload.href = benchmarkDownloadUrl;
    benchmarkDownload.download = `AgamCs_${chromosome}_${start}-${end}.tsv`;
    benchmarkDownload.hidden = false;
  } catch (error) {
    benchmarkStatus.textContent = `Query failed: ${error.message}`;
  } finally {
    benchmarkSubmit.disabled = false;
  }
});
