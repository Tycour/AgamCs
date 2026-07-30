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
let benchmarkDownloadUrl;

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

function buildTsv(data) {
  const lines = ['chromosome\tpos\tCs_C\tsnp_density_s'];
  for (let index = 0; index < data.values.Cs.length; index += 1) {
    lines.push(`${data.chromosome}\t${data.start + index}\t${data.values.Cs[index]}\t${data.values.snp_density[index]}`);
  }
  return `${lines.join('\n')}\n`;
}

benchmarkForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(benchmarkForm);
  const chromosome = String(form.get('chromosome'));
  const start = Number(form.get('start'));
  const end = Number(form.get('end'));
  const length = end - start + 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    benchmarkStatus.textContent = 'Coordinates must satisfy 1 ≤ start ≤ end.';
    return;
  }
  if (length > 20000) {
    benchmarkStatus.textContent = 'Stage 5 limits queries to 20,000 bases.';
    return;
  }

  benchmarkStatus.textContent = `Reading ${chromosome}:${start}-${end} from Zenodo…`;
  benchmarkMetrics.hidden = true;
  benchmarkDownload.hidden = true;
  const worker = new Worker('assets/query-worker.js');
  const beforeMemory = performance.memory?.usedJSHeapSize;
  try {
    const validationPromise = loadValidation();
    const result = await new Promise((resolve, reject) => {
      worker.addEventListener('message', ({ data }) => data.ok ? resolve(data) : reject(new Error(data.message)), { once: true });
      worker.addEventListener('error', () => reject(new Error('The query worker stopped unexpectedly.')), { once: true });
      worker.postMessage({ action: 'benchmark', chromosome, start, end });
    });
    const validation = await validationPromise;
    const matchingFixture = validation.region === `${chromosome}:${start}-${end}`;
    const hashesMatch = matchingFixture && result.hashAvailable && Object.entries(validation.arrays).every(
      ([name, expected]) => result.hashes[name] === expected.sha256_le_float32 && result.values[name].length === expected.count,
    );
    const hashUnavailable = matchingFixture && !result.hashAvailable;
    const heapDelta = beforeMemory && performance.memory?.usedJSHeapSize
      ? Math.max(0, performance.memory.usedJSHeapSize - beforeMemory)
      : null;

    document.querySelector('#metric-cold').textContent = `${result.cold.totalMs.toFixed(0)} ms`;
    document.querySelector('#metric-warm').textContent = `${result.warm.totalMs.toFixed(1)} ms (${result.warm.cacheHits} cache hits)`;
    document.querySelector('#metric-requests').textContent = String(result.cold.requests);
    document.querySelector('#metric-bytes').textContent = formatBytes(result.cold.transferredBytes);
    document.querySelector('#metric-memory').textContent = heapDelta === null
      ? `${formatBytes(result.cold.decodedCacheBytes)} decoded estimate`
      : `${formatBytes(result.cold.decodedCacheBytes)} decoded; ${formatBytes(heapDelta)} observed heap change`;
    document.querySelector('#metric-validation').textContent = matchingFixture
      ? (hashesMatch ? 'Exact SHA-256 match' : hashUnavailable ? 'Hash unavailable; values retrieved' : 'FAILED')
      : 'No pinned local fixture for this interval';
    benchmarkMetrics.hidden = false;
    benchmarkStatus.textContent = hashesMatch
      ? 'Query complete; both arrays exactly match the local HDF5 fixture.'
      : hashUnavailable
        ? 'Query complete; data retrieved, but browser hash validation is unavailable.'
        : 'Query complete. Inspect the validation status before using these values.';

    if (benchmarkDownloadUrl) URL.revokeObjectURL(benchmarkDownloadUrl);
    benchmarkDownloadUrl = URL.createObjectURL(new Blob([buildTsv(result)], { type: 'text/tab-separated-values' }));
    benchmarkDownload.href = benchmarkDownloadUrl;
    benchmarkDownload.download = `AgamCs_${chromosome}_${start}-${end}.tsv`;
    benchmarkDownload.hidden = false;
  } catch (error) {
    benchmarkStatus.textContent = `Benchmark failed: ${error.message}`;
  } finally {
    worker.terminate();
  }
});
