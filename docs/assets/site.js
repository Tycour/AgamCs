const tabs = document.querySelectorAll('[role="tab"]');
const panels = document.querySelectorAll('[role="tabpanel"]');

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

document.querySelector('#query-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const status = document.querySelector('#result-status');
  status.textContent = 'Loaded locally';
  status.classList.add('refresh');
  document.querySelector('.results-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => {
    status.textContent = 'Ready';
    status.classList.remove('refresh');
  }, 1200);
});
