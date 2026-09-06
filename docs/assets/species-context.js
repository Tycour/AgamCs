(function initialiseSpeciesContext(root, factory) {
  const api = factory();
  root.AgamCsSpeciesContext = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(globalThis, () => {
  const ANALYSIS_VERSION = 'agamcs-species-context-v1';
  const SCHEMA_VERSION = 1;
  const COORDINATE_CONVENTION = '1-based inclusive';
  const WINDOW_SIZE = 100;
  const WINDOW_DETECTION_THRESHOLD = 0.8;

  function tipCodes(node) {
    if (typeof node === 'string') return [node];
    if (!node || !Array.isArray(node.children) || !node.children.length) throw new Error('Topology nodes must be genome codes or non-empty child-bearing objects.');
    return node.children.flatMap(tipCodes);
  }

  function cladeRecords(node, path = []) {
    if (typeof node === 'string') return [];
    const name = String(node?.name || '').trim();
    if (!name || !Array.isArray(node.children) || !node.children.length) throw new Error('Every topology clade must have a name and at least one child.');
    const currentPath = [...path, name];
    return [{
      id: currentPath.join('/'), name, path: currentPath,
      member_codes: tipCodes(node), child_count: node.children.length,
      is_polytomy: node.children.length > 2,
    }, ...node.children.flatMap((child) => cladeRecords(child, currentPath))];
  }

  function longestRun(detectedByPosition, start) {
    let bestStart = null; let bestEnd = null; let runStart = null;
    for (let offset = 0; offset <= detectedByPosition.length; offset += 1) {
      const detected = offset === detectedByPosition.length || Boolean(detectedByPosition[offset]);
      if (!detected && runStart == null) runStart = offset;
      else if (detected && runStart != null) {
        const runEnd = offset - 1;
        if (bestStart == null || runEnd - runStart > bestEnd - bestStart) [bestStart, bestEnd] = [runStart, runEnd];
        runStart = null;
      }
    }
    return { start: bestStart == null ? null : start + bestStart, end: bestEnd == null ? null : start + bestEnd, bases: bestStart == null ? 0 : bestEnd - bestStart + 1 };
  }

  function detectedValues(values) {
    return values.map(Number).filter((value) => Number.isFinite(value) && value !== 0);
  }

  function windowRecord(valuesBySpecies, chromosome, queryStart, offset, length) {
    let detected = 0; let identityTotal = 0;
    valuesBySpecies.forEach((valuesByPosition) => {
      for (let index = offset; index < offset + length; index += 1) {
        const value = Number(valuesByPosition[index]);
        if (Number.isFinite(value) && value !== 0) { detected += 1; identityTotal += value; }
      }
    });
    const possible = valuesBySpecies.length * length;
    return {
      chromosome, start: queryStart + offset, end: queryStart + offset + length - 1,
      total_bases: length, possible_species_bases: possible, detected_bases: detected,
      detected_fraction: detected / possible,
      mean_identity_detected: detected ? identityTotal / detected : null,
    };
  }

  function summary(kind, id, name, memberCodes, valuesBySpecies, chromosome, queryStart, queryBases, metadata = {}) {
    let detected = 0; let identityTotal = 0;
    const detectedByPosition = new Uint8Array(queryBases);
    valuesBySpecies.forEach((speciesValues) => {
      for (let offset = 0; offset < queryBases; offset += 1) {
        const value = Number(speciesValues[offset]);
        if (Number.isFinite(value) && value !== 0) {
          detected += 1; identityTotal += value; detectedByPosition[offset] = 1;
        }
      }
    });
    const windows = [];
    for (let offset = 0; offset < queryBases; offset += WINDOW_SIZE) windows.push(windowRecord(valuesBySpecies, chromosome, queryStart, offset, Math.min(WINDOW_SIZE, queryBases - offset)));
    const qualifying = windows.filter((window) => window.total_bases === WINDOW_SIZE && window.detected_fraction >= WINDOW_DETECTION_THRESHOLD && window.mean_identity_detected != null);
    qualifying.sort((left, right) => left.mean_identity_detected - right.mean_identity_detected || left.start - right.start);
    const possible = valuesBySpecies.length * queryBases;
    return {
      kind, id, name, member_codes: memberCodes, species_count: valuesBySpecies.length,
      query_bases: queryBases, possible_species_bases: possible, detected_bases: detected,
      detected_fraction: detected / possible,
      mean_identity_detected: detected ? identityTotal / detected : null,
      longest_undetected_run: longestRun(detectedByPosition, queryStart),
      lowest_qualifying_identity_window: qualifying[0] || null,
      ...metadata,
    };
  }

  function analyzeSpeciesContext(source, topology = null) {
    const chromosome = String(source?.chromosome || '');
    const { start, end } = source || {};
    const rows = [...(source?.stackRows || [])];
    const labels = [...(source?.stackSpecies || [])];
    const stack = source?.values?.stack;
    const selectedTopology = topology || source?.stackTopology;
    if (!chromosome || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) throw new Error('Species-context analysis requires valid inclusive query coordinates.');
    if (!rows.length || labels.length !== rows.length || !selectedTopology) throw new Error('Species-context analysis requires aligned species metadata and topology.');
    const queryBases = end - start + 1;
    if (!stack || stack.length !== rows.length * queryBases) throw new Error('Species stack length must equal species rows multiplied by query bases.');
    const tips = tipCodes(selectedTopology.tree);
    if (tips.length !== rows.length || new Set(tips).size !== tips.length || tips.some((code, index) => code !== rows[index])) throw new Error('Species topology tips must uniquely match the stack-row order.');
    const valuesByCode = new Map(rows.map((code, index) => [
      code,
      typeof stack.subarray === 'function'
        ? stack.subarray(index * queryBases, (index + 1) * queryBases)
        : stack.slice(index * queryBases, (index + 1) * queryBases),
    ]));
    const species = rows.map((code, index) => summary('species', code, labels[index], [code], [valuesByCode.get(code)], chromosome, start, queryBases));
    const clades = cladeRecords(selectedTopology.tree).map(({ member_codes: memberCodes, ...clade }) => summary(
      'clade', clade.id, clade.name, memberCodes, memberCodes.map((code) => valuesByCode.get(code)), chromosome, start, queryBases, clade,
    ));
    return {
      schema_version: SCHEMA_VERSION, analysis_version: ANALYSIS_VERSION,
      coordinate_convention: COORDINATE_CONVENTION, window_size: WINDOW_SIZE,
      window_detection_threshold: WINDOW_DETECTION_THRESHOLD,
      zero_semantics: 'No detected CNEr interval; not measured 0% identity.',
      query: { chromosome, start, end, bases: queryBases }, species_count: rows.length,
      species, clades,
    };
  }

  function displayRows(source, { selectedCodes = null, order = 'topology', collapsedClades = [] } = {}) {
    const selected = new Set(selectedCodes || source.stackRows);
    const collapsed = new Set(collapsedClades);
    const labelByCode = new Map(source.stackRows.map((code, index) => [code, source.stackSpecies[index]]));
    const visit = (node, path = []) => {
      if (typeof node === 'string') return selected.has(node) ? [{ id: node, kind: 'species', name: labelByCode.get(node), memberCodes: [node] }] : [];
      const currentPath = [...path, node.name];
      const id = currentPath.join('/');
      const members = tipCodes(node).filter((code) => selected.has(code));
      if (!members.length) return [];
      if (collapsed.has(id)) return [{ id, kind: 'clade', name: `${node.name} (${members.length} spp.)`, memberCodes: members }];
      return node.children.flatMap((child) => visit(child, currentPath));
    };
    const rows = visit(source.stackTopology.tree);
    if (order === 'alphabetical') rows.sort((left, right) => left.name.localeCompare(right.name));
    else if (order !== 'topology') throw new Error('Species display order must be topology or alphabetical.');
    return rows;
  }

  function displayTree(node, rowIds, path = []) {
    const allowed = new Set(rowIds);
    const visit = (current, currentPath) => {
      if (typeof current === 'string') return allowed.has(current) ? current : null;
      const nextPath = [...currentPath, current.name];
      const id = nextPath.join('/');
      if (allowed.has(id)) return id;
      const children = current.children.map((child) => visit(child, nextPath)).filter(Boolean);
      if (!children.length) return null;
      return children.length === 1 ? children[0] : { name: current.name, children };
    };
    return visit(node, path);
  }

  function summarizeDisplayHeatmap(source, baseSummary, rows) {
    const width = source.end - source.start + 1;
    const rowIndex = new Map(source.stackRows.map((code, index) => [code, index]));
    const cells = rows.map((row) => baseSummary.bins.map((bin) => {
      let detected = 0; let identityTotal = 0;
      row.memberCodes.forEach((code) => {
        const offset = rowIndex.get(code) * width;
        bin.forEach((record) => {
          const value = Number(source.values.stack[offset + record.index]);
          if (Number.isFinite(value) && value !== 0) { detected += 1; identityTotal += value; }
        });
      });
      const possible = row.memberCodes.length * bin.length;
      return {
        identity: detected ? identityTotal / detected : 0,
        detectedFraction: detected / possible,
        genomicStart: Math.min(...bin.map((record) => record.position)),
        genomicEnd: Math.max(...bin.map((record) => record.position)),
      };
    }));
    return { ...baseSummary, cells };
  }

  return { analyzeSpeciesContext, cladeRecords, displayRows, displayTree, summarizeDisplayHeatmap, tipCodes };
}));
