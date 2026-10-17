(function init(root, factory) {
  const api = factory(); root.AgamCsGuides = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(globalThis, () => {
  const SCHEMA = 'agamcs-guide-catalogue-v1';
  const SORT_FIELDS = {
    tool_rank: { key: 'tool_rank', direction: 'asc' },
    start: { key: 'start', direction: 'asc' },
    strand: { key: 'strand', direction: 'asc' },
    spacer: { key: 'spacer', direction: 'asc' },
    mit_specificity: { key: 'mit_specificity', direction: 'desc' },
    cfd_specificity: { key: 'cfd_specificity', direction: 'desc' },
    activity_doench2016: { key: 'activity_doench2016', direction: 'desc' },
    spacer_mean_cs: { key: 'spacer_context.mean_cs', direction: 'desc' },
    spacer_mean_snp_density: { key: 'spacer_context.mean_snp_density', direction: 'asc' },
    pam_mean_cs: { key: 'pam_context.mean_cs', direction: 'desc' },
    pam_mean_snp_density: { key: 'pam_context.mean_snp_density', direction: 'asc' },
    exact_matches: { key: 'exact_matches', direction: 'asc' },
    off_target_count: { key: 'off_target_count', direction: 'asc' },
    gc_percent: { key: 'gc_percent', direction: 'desc' },
    warnings: { key: 'warnings', direction: 'asc' },
  };
  const FILTER_FIELDS = {
    tool_rank: 'tool_rank', start: 'start', mit_specificity: 'mit_specificity',
    cfd_specificity: 'cfd_specificity', activity_doench2016: 'activity_doench2016',
    spacer_mean_cs: 'spacer_context.mean_cs', spacer_mean_snp_density: 'spacer_context.mean_snp_density',
    pam_mean_cs: 'pam_context.mean_cs', pam_mean_snp_density: 'pam_context.mean_snp_density',
    exact_matches: 'exact_matches', off_target_count: 'off_target_count', gc_percent: 'gc_percent',
  };
  function validateCatalogue(catalogue) {
    if (catalogue?.schema_version !== SCHEMA || catalogue.assembly !== 'AgamP4'
      || catalogue.tool !== 'CRISPOR' || catalogue.candidate_pam !== 'NGG'
      || JSON.stringify(catalogue.off_target_pams) !== '["NGG"]'
      || catalogue.max_mismatches !== 4 || !Array.isArray(catalogue.regions)) {
      throw new Error('Unsupported guide catalogue or search scope.');
    }
    for (const region of catalogue.regions) {
      if (!Number.isSafeInteger(region.start) || !Number.isSafeInteger(region.end) || region.start < 1 || region.end < region.start) throw new Error('Invalid catalogue interval.');
      const ids = new Set();
      for (const g of region.guides) {
        if (ids.has(g.id) || !Number.isSafeInteger(g.start) || !Number.isSafeInteger(g.end)
          || g.chromosome !== region.chromosome || g.start < region.start || g.end > region.end
          || g.end - g.start !== 22 || !['+', '-'].includes(g.strand)
          || !/^[ACGT]{20}$/.test(g.spacer) || !/^[ACGT]GG$/.test(g.pam)
          || g.spacer_end - g.spacer_start !== 19 || g.pam_end - g.pam_start !== 2
          || (g.strand === '+' ? g.spacer_start !== g.start || g.pam_end !== g.end || g.spacer_end + 1 !== g.pam_start
            : g.pam_start !== g.start || g.spacer_end !== g.end || g.pam_end + 1 !== g.spacer_start)) throw new Error('Invalid guide geometry or sequence.');
        ids.add(g.id);
      }
    }
    return catalogue;
  }
  function guidesForQuery(catalogue, result) {
    const region = catalogue.regions.find((r) => r.chromosome === result.chromosome && r.start <= result.start && r.end >= result.end);
    return region ? { available: true, region, guides: region.guides.filter((g) => g.start >= result.start && g.end <= result.end) }
      : { available: false, region: null, guides: [] };
  }
  function summarizeBases(result, start, end) {
    let csSum = 0; let csCount = 0; let snpSum = 0; let snpCount = 0; let accessible = 0;
    for (let pos = start; pos <= end; pos += 1) {
      const index = pos - result.start;
      const cs = result.values.Cs[index]; const snp = result.values.snp_density[index]; const status = result.values.status[index];
      if (cs != null && Number.isFinite(cs)) { csSum += cs; csCount += 1; }
      if (status != null && (status & 1) === 1) {
        accessible += 1;
        if (snp != null && Number.isFinite(snp)) { snpSum += snp; snpCount += 1; }
      }
    }
    return { bases: end - start + 1, mean_cs: csCount ? csSum / csCount : null, finite_cs_bases: csCount,
      mean_snp_density: snpCount ? snpSum / snpCount : null, finite_accessible_snp_bases: snpCount, accessible_bases: accessible };
  }
  function contextualize(guides, result) {
    const expected = result.end - result.start + 1;
    if (['Cs', 'snp_density', 'status'].some((key) => result.values?.[key]?.length !== expected)) throw new Error('Exact query arrays are required for guide context.');
    return guides.map((g) => {
      if (g.chromosome !== result.chromosome || g.start < result.start || g.end > result.end) throw new Error('Guide is outside query.');
      return { ...g, spacer_context: summarizeBases(result, g.spacer_start, g.spacer_end), pam_context: summarizeBases(result, g.pam_start, g.pam_end) };
    });
  }
  function asTsv(guides, catalogue) {
    const columns = ['display_order', 'id', 'tool_rank', 'chromosome', 'start', 'end', 'strand', 'spacer', 'pam', 'mit_specificity', 'cfd_specificity', 'activity_doench2016', 'exact_matches', 'off_target_count', 'gc_percent', 'warnings'];
    const contextColumns = ['mean_cs', 'finite_cs_bases', 'mean_snp_density', 'finite_accessible_snp_bases', 'accessible_bases', 'bases'];
    const header = [...columns, ...['spacer', 'pam'].flatMap((part) => contextColumns.map((c) => `${part}_${c}`)), 'tool', 'tool_image', 'off_target_pams', 'max_mismatches', 'reference_sha256'];
    const cell = (v) => v == null ? 'NA' : String(Array.isArray(v) ? v.join('; ') : v).replace(/[\t\r\n]/g, ' ');
    return [header.join('\t'), ...guides.map((g, index) => [index + 1, ...columns.slice(1).map((key) => g[key]), ...['spacer', 'pam'].flatMap((part) => contextColumns.map((c) => g[`${part}_context`][c])), catalogue.tool, catalogue.tool_image, catalogue.off_target_pams.join(','), catalogue.max_mismatches, catalogue.reference_sha256].map(cell).join('\t'))].join('\n') + '\n';
  }
  function nestedValue(guide, key) {
    return key.split('.').reduce((value, part) => value?.[part], guide);
  }
  function sortGuides(guides, sortBy = 'tool_rank', direction = null) {
    const spec = SORT_FIELDS[sortBy];
    if (!spec) throw new Error(`Unsupported guide sort field: ${sortBy}`);
    const order = direction || spec.direction;
    if (!['asc', 'desc'].includes(order)) throw new Error(`Unsupported guide sort direction: ${order}`);
    return [...guides].sort((left, right) => {
      const a = nestedValue(left, spec.key); const b = nestedValue(right, spec.key);
      if (a == null || !Number.isFinite(a) && typeof a === 'number') return b == null || !Number.isFinite(b) && typeof b === 'number' ? left.tool_rank - right.tool_rank : 1;
      if (b == null || !Number.isFinite(b) && typeof b === 'number') return -1;
      const comparison = typeof a === 'string' || Array.isArray(a)
        ? String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }) : a - b;
      return comparison ? (order === 'asc' ? comparison : -comparison) : left.tool_rank - right.tool_rank;
    });
  }
  function filterGuides(guides, filters = {}) {
    for (const [field, range] of Object.entries(filters)) {
      if (field === 'text') continue;
      if (!FILTER_FIELDS[field] || !range || typeof range !== 'object') throw new Error(`Unsupported guide filter: ${field}`);
      if (range.min != null && !Number.isFinite(range.min) || range.max != null && !Number.isFinite(range.max)) throw new Error(`Invalid guide filter bound: ${field}`);
      if (range.min != null && range.max != null && range.min > range.max) throw new Error(`Minimum exceeds maximum for ${field}`);
    }
    const search = String(filters.text || '').trim().toLocaleLowerCase();
    return guides.filter((guide) => {
      for (const [field, range] of Object.entries(filters)) {
        if (field === 'text' || !range || range.min == null && range.max == null) continue;
        const value = nestedValue(guide, FILTER_FIELDS[field]);
        if (value == null || !Number.isFinite(value) || range.min != null && value < range.min || range.max != null && value > range.max) return false;
      }
      if (search && ![guide.id, guide.chromosome, guide.strand, guide.spacer, guide.pam, guide.warnings.join(' ')].join(' ').toLocaleLowerCase().includes(search)) return false;
      return true;
    });
  }
  function clippedSegment(start, end, range, xScale, mapPosition, left, right) {
    if (end < range.start || start > range.end) return null;
    const positions = [Math.max(start - 0.5, range.start), Math.min(end + 0.5, range.end)].map((p) => xScale(mapPosition(p)));
    const x = Math.max(left, Math.min(...positions)); const edge = Math.min(right, Math.max(...positions));
    return { x, width: Math.min(right - x, Math.max(1, edge - x)) };
  }
  function drawOverlay(svg, guide, summary, xScale, left, right, top, bottom, height) {
    if (!guide) return;
    const el = (tag, attrs = {}, text = '') => { const node = document.createElementNS('http://www.w3.org/2000/svg', tag); Object.entries(attrs).forEach(([k,v]) => node.setAttribute(k, v)); node.textContent = text; return node; };
    const annotation = summary.annotation;
    // Summary records retain the exact coordinate convention used by both plots.
    const first = summary.records?.[0];
    const map = annotation ? (Number(annotation.strand) === -1 ? (p) => annotation.end - p : (p) => p - annotation.start)
      : (p) => p - (first ? first.position - first.x : summary.displayStart);
    const range = { start: summary.displayStart, end: summary.displayEnd };
    const group = el('g', { 'class': 'guide-overlay', 'pointer-events': 'none', 'aria-label': `Selected guide ${guide.id}, ${guide.strand} strand` });
    for (const [part, color] of [['spacer', '#007f88'], ['pam', '#bf5b00']]) {
      const bounds = clippedSegment(guide[`${part}_start`], guide[`${part}_end`], range, xScale, map, left, right);
      if (!bounds) continue;
      group.append(el('rect', { ...bounds, y: top, height: bottom - top, fill: color, opacity: 0.12 }));
      group.append(el('rect', { ...bounds, y: height + 20, height: 10, fill: color }));
    }
    const visible = guide.end >= range.start && guide.start <= range.end;
    const label = `Guide ${guide.tool_rank} · ${guide.chromosome}:${guide.start}–${guide.end} (${guide.strand})${visible ? '' : ' · outside displayed range'}`;
    group.append(el('text', { x: left, y: height + 12, fill: '#173d42', 'font-size': 12 }, label));
    const seq = el('text', { x: left, y: height + 51, 'font-size': 14, 'font-family': 'monospace' });
    seq.append(el('tspan', { fill: '#007f88' }, `5′ ${guide.spacer} `), el('tspan', { fill: '#bf5b00', 'font-weight': 700 }, `${guide.pam} 3′`));
    group.append(seq, el('text', { x: left, y: height + 70, fill: '#526369', 'font-size': 11 }, 'Teal: 20-base spacer · orange: NGG PAM · sequence shown in guide orientation'));
    svg.append(group);
    const width = svg.getAttribute('viewBox').split(/\s+/)[2];
    svg.setAttribute('viewBox', `0 0 ${width} ${height + 86}`);
  }
  return { SCHEMA, SORT_FIELDS, FILTER_FIELDS, validateCatalogue, guidesForQuery, contextualize, summarizeBases, asTsv, sortGuides, filterGuides, clippedSegment, drawOverlay };
}));
