/* Optional catalogue-backed guide exploration; no browser-native search is implied. */
(function init(root) {
  root.AgamCsGuidePanel = { create({ assetUrl, onChange, onZoom, onExample }) {
    const api = root.AgamCsGuides;
    const get = (id) => document.getElementById(id);
    const panel = get('guide-panel'); const enable = get('guide-enable'); const overlay = get('guide-overlay');
    const status = get('guide-status'); const body = get('guide-body'); const details = get('guide-details');
    const sortBy = get('guide-sort'); const sortDirection = get('guide-sort-direction');
    const filterGrid = get('guide-filter-grid'); const filterText = get('guide-filter-text'); const viewStatus = get('guide-view-status');
    const content = get('guide-content'); const download = get('guide-download'); const jsonDownload = get('guide-json-download');
    let result = null; let catalogue = null; let loading = null; let candidates = []; let guides = []; let selected = null; let generation = 0; const urls = [];
    const element = (tag, text, className = '') => { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; };
    const numeric = (value, digits = 1) => value == null ? 'Unavailable' : Number(value).toFixed(digits);
    const FILTER_LABELS = {
      tool_rank: 'CRISPOR order', start: 'Start coordinate', mit_specificity: 'MIT specificity',
      cfd_specificity: 'CFD specificity', activity_doench2016: 'Predicted activity',
      spacer_mean_cs: 'Spacer mean Cs', spacer_mean_snp_density: 'Spacer mean SNP density',
      pam_mean_cs: 'PAM mean Cs', pam_mean_snp_density: 'PAM mean SNP density',
      exact_matches: 'Exact reference matches', off_target_count: 'Off-target count', gc_percent: 'Spacer GC percent',
    };
    Object.entries(FILTER_LABELS).forEach(([key, label]) => {
      const group = element('div', '', 'guide-filter-group');
      const heading = element('span', label); heading.id = `guide-filter-label-${key}`;
      const bounds = element('div', '', 'guide-filter-bounds');
      for (const [bound, caption] of [['min', 'Minimum'], ['max', 'Maximum']]) {
        const field = element('label', caption); const input = document.createElement('input');
        input.type = 'number'; input.step = 'any'; input.id = `guide-filter-${key}-${bound}`;
        input.setAttribute('aria-label', `${caption} ${label}`); input.setAttribute('aria-describedby', heading.id);
        input.addEventListener('input', renderView); field.append(input); bounds.append(field);
      }
      group.append(heading, bounds); filterGrid.append(group);
    });
    function currentFilters() {
      const filters = {};
      for (const key of Object.keys(FILTER_LABELS)) {
        const minimum = get(`guide-filter-${key}-min`).value; const maximum = get(`guide-filter-${key}-max`).value;
        const range = { min: minimum === '' ? null : Number(minimum), max: maximum === '' ? null : Number(maximum) };
        if (range.min != null || range.max != null) filters[key] = range;
      }
      if (filterText.value.trim()) filters.text = filterText.value.trim();
      return filters;
    }
    function releaseDownloads() { urls.splice(0).forEach((url) => URL.revokeObjectURL(url)); download.hidden = true; jsonDownload.hidden = true; }
    function sequence(g) { const code = element('code', '', 'guide-sequence'); code.append(element('span', g.spacer), element('span', g.pam, 'guide-pam')); return code; }
    function contextText(c) { return `Cs ${numeric(c.mean_cs, 3)} (${c.finite_cs_bases}/${c.bases} valid); SNP density ${numeric(c.mean_snp_density, 4)} (${c.finite_accessible_snp_bases}/${c.bases} valid accessible bases)`; }
    function updateDownloads() {
      releaseDownloads(); if (!catalogue || !guides.length) return;
      const stem = `AgamCs_guides_${result.chromosome}_${result.start}-${result.end}`;
        const record = { schema_version: 'agamcs-guide-report-v1', query: { chromosome: result.chromosome, start: result.start, end: result.end },
        provenance: Object.fromEntries(Object.entries(catalogue).filter(([key]) => key !== 'regions')),
        source_intervals: catalogue.regions.map(({ guides: _guides, ...metadata }) => metadata),
        context_method: 'Spacer and PAM means separately; finite Cs values, SNP values only at accessible focal bases (status bit 1). SNP is the archived centred 20-base rolling density, not variant counts. Missing values remain unknown.',
        selected_guide: selected?.id || null, show_on_figures: overlay.checked,
        display: { sort_by: sortBy.value, sort_direction: sortDirection.value, filters: currentFilters(), matched_guides: guides.length, candidate_guides: candidates.length }, guides };
      for (const [link, data, type, suffix] of [[download, api.asTsv(guides, catalogue), 'text/tab-separated-values', 'tsv'], [jsonDownload, JSON.stringify(record, null, 2), 'application/json', 'json']]) {
        const url = URL.createObjectURL(new Blob([data], { type })); urls.push(url); link.href = url; link.download = `${stem}.${suffix}`; link.hidden = false;
      }
    }
    function select(guide) {
      selected = guide;
      body.querySelectorAll('button[data-guide-id]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.guideId === guide.id)));
      details.replaceChildren(element('h4', `Selected guide · CRISPOR order ${guide.tool_rank}`), sequence(guide),
        element('p', `5′→3′ guide orientation · ${guide.chromosome}:${guide.start.toLocaleString()}–${guide.end.toLocaleString()} (${guide.strand} strand). Spacer ${guide.spacer_start}–${guide.spacer_end}; PAM ${guide.pam_start}–${guide.pam_end}.`),
        element('p', `Spacer: ${contextText(guide.spacer_context)}.`), element('p', `PAM: ${contextText(guide.pam_context)}.`),
        element('p', `GC ${numeric(guide.gc_percent)}%. Additional matches by 0/1/2/3/4 mismatches: ${guide.mismatch_counts.join(' / ')}. ${guide.warnings.join('; ') || 'No recorded sequence warnings.'}`));
      const zoom = element('button', 'Zoom figures to guide', 'button secondary'); zoom.type = 'button';
      zoom.addEventListener('click', () => { overlay.checked = true; onZoom({ start: Math.max(result.start, guide.start - 20), end: Math.min(result.end, guide.end + 20) }); updateDownloads(); });
      details.append(zoom); details.hidden = false; updateDownloads(); onChange();
    }
    function renderRows() {
      if (!guides.length) {
        const row = element('tr', ''); const cell = element('td', 'No guides match these filters. Clear a bound or text filter to show more guides.');
        cell.colSpan = 8; row.append(cell); body.replaceChildren(row); return;
      }
      body.replaceChildren(...guides.map((g) => {
        const row = element('tr', '');
        const choose = element('button', String(g.tool_rank), 'guide-select'); choose.type = 'button'; choose.dataset.guideId = g.id;
        choose.setAttribute('aria-label', `Select CRISPOR guide ${g.tool_rank}: ${g.spacer} ${g.pam}`); choose.setAttribute('aria-pressed', 'false'); choose.addEventListener('click', () => select(g));
        const rank = element('td', ''); rank.append(choose);
        const seq = element('td', ''); seq.append(sequence(g), element('small', `${g.chromosome}:${g.start}–${g.end} (${g.strand})`));
        const specificity = element('td', numeric(g.mit_specificity, 0)); specificity.append(element('small', `CFD ${numeric(g.cfd_specificity, 0)}`));
        const cs = element('td', numeric(g.spacer_context.mean_cs, 3)); cs.append(element('small', `${g.spacer_context.finite_cs_bases}/20 valid bases`));
        const snp = element('td', numeric(g.spacer_context.mean_snp_density, 4)); snp.append(element('small', `${g.spacer_context.finite_accessible_snp_bases}/20 valid accessible bases`));
        row.append(rank, seq, specificity, element('td', numeric(g.activity_doench2016, 0)), cs, snp, element('td', g.exact_matches == null ? 'Unknown' : String(g.exact_matches)), element('td', g.warnings.join('; ') || '—', g.warnings.length ? 'guide-warning' : ''));
        return row;
      }));
    }
    function renderView() {
      try {
        guides = api.sortGuides(api.filterGuides(candidates, currentFilters()), sortBy.value, sortDirection.value);
      } catch (error) {
        guides = []; selected = null; details.hidden = true; renderRows(); releaseDownloads(); onChange();
        viewStatus.textContent = error.message; viewStatus.className = 'guide-warning'; return;
      }
      viewStatus.className = '';
      const activeSort = sortBy.selectedOptions[0].textContent;
      const direction = sortDirection.value === 'asc' ? 'ascending' : 'descending';
      viewStatus.textContent = `Showing ${guides.length.toLocaleString()} of ${candidates.length.toLocaleString()} guides · ${activeSort}, ${direction}; CRISPOR order remains visible in the first column.`;
      const selectedIsVisible = selected && guides.some((guide) => guide.id === selected.id);
      if (selected && !selectedIsVisible) { selected = null; details.hidden = true; onChange(); }
      renderRows();
      body.querySelectorAll('button[data-guide-id]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.guideId === selected?.id)));
      updateDownloads();
    }
    async function load() {
      const token = ++generation; candidates = []; guides = []; selected = null; content.hidden = true; details.hidden = true; body.replaceChildren(); releaseDownloads(); onChange();
      if (!enable.checked || !result) { status.textContent = 'Enable guide exploration to retrieve scored NGG guides for this interval.'; return; }
      status.textContent = 'Loading scored guides…';
      try {
        if (!catalogue) {
          if (!loading) loading = fetch(assetUrl).then((response) => { if (!response.ok) throw new Error('Catalogue request failed.'); return response.json(); }).then(api.validateCatalogue).catch((error) => { loading = null; throw error; });
          catalogue = await loading;
        }
        if (token !== generation) return;
        const match = api.guidesForQuery(catalogue, result);
        if (!match.available) { status.textContent = 'Guide results are not yet available for this whole interval. This prototype covers only the four examples below; this does not mean no guides exist here.'; return; }
        candidates = api.contextualize(match.guides, result);
        content.hidden = false; renderView(); if (guides.length) select(guides[0]);
        status.textContent = `${candidates.length} NGG guides fully inside this query. MIT specificity is CRISPOR’s native ordering score; Cs, SNP density and activity do not enter that score. Search: whole reference, NGG only, up to four mismatches.`;
        if (!candidates.length) status.textContent += ' No complete 20-base spacer plus PAM occurs inside this interval.';
      } catch (error) { if (token === generation) status.textContent = `Guide results unavailable: ${error.message} Disable and re-enable to retry.`; }
    }
    sortBy.addEventListener('change', () => { sortDirection.value = api.SORT_FIELDS[sortBy.value].direction; renderView(); });
    sortDirection.addEventListener('change', renderView);
    filterText.addEventListener('input', renderView);
    enable.addEventListener('change', load);
    overlay.addEventListener('change', () => { updateDownloads(); onChange(); });
    get('guide-examples').querySelectorAll('button').forEach((button) => button.addEventListener('click', () => { enable.checked = true; onExample(button.dataset.region); }));
    return {
      setResult(next) { if (result === next) return; result = next; panel.hidden = false; load(); },
      overlay() { return enable.checked && overlay.checked ? selected : null; },
      clear() { generation += 1; result = null; candidates = []; guides = []; selected = null; body.replaceChildren(); details.hidden = true; content.hidden = true; releaseDownloads(); panel.hidden = true; },
    };
  } };
}(globalThis));
