(function init(root, factory) {
  const api = factory(); root.AgamCsGuides = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(globalThis, () => {
  const SCHEMA = 'agamcs-guide-catalogue-v1';
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
    const columns = ['id', 'tool_rank', 'chromosome', 'start', 'end', 'strand', 'spacer', 'pam', 'mit_specificity', 'cfd_specificity', 'activity_doench2016', 'exact_matches', 'off_target_count', 'gc_percent', 'warnings'];
    const contextColumns = ['mean_cs', 'finite_cs_bases', 'mean_snp_density', 'finite_accessible_snp_bases', 'accessible_bases', 'bases'];
    const header = [...columns, ...['spacer', 'pam'].flatMap((part) => contextColumns.map((c) => `${part}_${c}`)), 'tool', 'tool_image', 'off_target_pams', 'max_mismatches', 'reference_sha256'];
    const cell = (v) => v == null ? 'NA' : String(Array.isArray(v) ? v.join('; ') : v).replace(/[\t\r\n]/g, ' ');
    return [header.join('\t'), ...guides.map((g) => [...columns.map((key) => g[key]), ...['spacer', 'pam'].flatMap((part) => contextColumns.map((c) => g[`${part}_context`][c])), catalogue.tool, catalogue.tool_image, catalogue.off_target_pams.join(','), catalogue.max_mismatches, catalogue.reference_sha256].map(cell).join('\t'))].join('\n') + '\n';
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
  return { SCHEMA, validateCatalogue, guidesForQuery, contextualize, summarizeBases, asTsv, clippedSegment, drawOverlay };
}));
