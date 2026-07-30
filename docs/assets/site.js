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
