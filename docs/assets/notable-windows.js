(function initialiseNotableWindows(root, factory) {
  const api = factory();
  root.AgamCsNotableWindows = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(globalThis, () => {
  const ANALYSIS_VERSION = 'agamcs-notable-windows-v1';
  const SCHEMA_VERSION = 1;
  const COORDINATE_CONVENTION = '1-based inclusive';
  const WINDOW_SIZE = 100;
  const TOP_WINDOWS = 5;
  const SNP_ACCESSIBILITY_THRESHOLD = 0.8;
  const TIE_TOLERANCE = 1e-12;

  function clip(start, end, lower, upper) {
    const clippedStart = Math.max(start, lower);
    const clippedEnd = Math.min(end, upper);
    return clippedStart <= clippedEnd ? [clippedStart, clippedEnd] : null;
  }

  function merge(intervals) {
    const merged = [];
    [...intervals].sort((left, right) => left[0] - right[0] || left[1] - right[1]).forEach(([start, end]) => {
      if (!merged.length || start > merged[merged.length - 1][1] + 1) merged.push([start, end]);
      else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end);
    });
    return merged;
  }

  function subtract(intervals, removed) {
    const output = [];
    merge(intervals).forEach(([start, end]) => {
      let cursor = start;
      for (const [removedStart, removedEnd] of merge(removed)) {
        if (removedEnd < cursor) continue;
        if (removedStart > end) break;
        if (removedStart > cursor) output.push([cursor, Math.min(end, removedStart - 1)]);
        cursor = Math.max(cursor, removedEnd + 1);
        if (cursor > end) break;
      }
      if (cursor <= end) output.push([cursor, end]);
    });
    return output;
  }

  function finiteMean(values) {
    const finite = [...values].map((value) => value == null ? Number.NaN : Number(value)).filter(Number.isFinite);
    return { mean: finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null, count: finite.length };
  }

  function normaliseResult(source) {
    const chromosome = String(source?.chromosome || '');
    const { start, end } = source || {};
    const values = source?.values || {};
    const required = ['Cs', 'snp_density', 'status'];
    if (!chromosome || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) {
      throw new Error('Notable-window analysis requires valid inclusive query coordinates.');
    }
    if (required.some((name) => values[name] == null)) throw new Error('Notable-window analysis requires Cs, snp_density, and status arrays.');
    const expected = end - start + 1;
    if (required.some((name) => values[name].length !== expected)) throw new Error('Notable-window arrays must match the inclusive query length.');
    return { chromosome, start, end, values };
  }

  function featureSegments(annotation, result) {
    if (!annotation?.transcript_id) return { transcript: null, segments: [] };
    if (String(annotation.chromosome) !== result.chromosome) throw new Error('Selected transcript and query must use the same chromosome.');
    const { start, end } = annotation;
    const strand = Number(annotation.strand ?? 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || ![-1, 1].includes(strand)) throw new Error('Selected transcript requires valid coordinates and strand.');
    const transcriptInterval = clip(start, end, result.start, result.end);
    const exons = merge((annotation.exons || []).map((exon) => clip(Number(exon.start), Number(exon.end), result.start, result.end)).filter(Boolean));
    let { cds_start: cdsStart, cds_end: cdsEnd } = annotation;
    if ((cdsStart == null) !== (cdsEnd == null)) throw new Error('Selected transcript CDS bounds must both be present or absent.');
    let coding = [];
    if (cdsStart != null) {
      cdsStart = Number(cdsStart); cdsEnd = Number(cdsEnd);
      if (!Number.isSafeInteger(cdsStart) || !Number.isSafeInteger(cdsEnd) || cdsStart > cdsEnd) throw new Error('Selected transcript CDS start cannot exceed CDS end.');
      coding = merge(exons.map(([exonStart, exonEnd]) => clip(exonStart, exonEnd, cdsStart, cdsEnd)).filter(Boolean));
    }
    const segments = [];
    [...exons].sort((left, right) => strand === -1 ? right[0] - left[0] || right[1] - left[1] : left[0] - right[0] || left[1] - right[1]).forEach(([exonStart, exonEnd], index) => {
      const number = index + 1;
      const exonCoding = merge(coding.map(([codingStart, codingEnd]) => clip(exonStart, exonEnd, codingStart, codingEnd)).filter(Boolean));
      if (!exonCoding.length) { segments.push([exonStart, exonEnd, `Non-coding exon ${number}`]); return; }
      subtract([[exonStart, exonEnd]], exonCoding).forEach(([utrStart, utrEnd]) => {
        const fivePrime = strand === 1 ? utrEnd < cdsStart : utrStart > cdsEnd;
        segments.push([utrStart, utrEnd, `${fivePrime ? '5′ UTR' : '3′ UTR'} (exon ${number})`]);
      });
      exonCoding.forEach(([codingStart, codingEnd]) => segments.push([codingStart, codingEnd, `CDS (exon ${number})`]));
    });
    if (transcriptInterval) subtract([transcriptInterval], exons).forEach(([intronStart, intronEnd]) => segments.push([intronStart, intronEnd, 'Intron']));
    return { transcript: { gene_id: annotation.id ?? null, transcript_id: String(annotation.transcript_id), strand }, segments: segments.sort((left, right) => left[0] - right[0] || left[1] - right[1] || left[2].localeCompare(right[2])) };
  }

  function windowFeature(start, end, transcript, segments) {
    if (!transcript) return 'No selected transcript';
    const labels = [];
    segments.forEach(([segmentStart, segmentEnd, label]) => {
      if (segmentStart <= end && segmentEnd >= start && !labels.includes(label)) labels.push(label);
    });
    return labels.length ? labels.join('; ') : 'Outside selected transcript';
  }

  function windowRecord(result, start, end, transcript, segments) {
    const offset = start - result.start;
    const length = end - start + 1;
    const cs = result.values.Cs.slice(offset, offset + length);
    const snp = result.values.snp_density.slice(offset, offset + length);
    const status = result.values.status.slice(offset, offset + length);
    const accessible = [...status].map((value) => (Number(value) & 1) === 1);
    const accessibleBases = accessible.filter(Boolean).length;
    const csMean = finiteMean(cs);
    const snpMean = finiteMean([...snp].filter((_value, index) => accessible[index]));
    const accessibleFraction = accessibleBases / length;
    return {
      chromosome: result.chromosome, start, end, total_bases: length,
      finite_cs_bases: csMean.count, mean_cs: csMean.mean,
      accessible_bases: accessibleBases, accessible_fraction: accessibleFraction,
      finite_accessible_snp_bases: snpMean.count, mean_accessible_snp_density: snpMean.mean,
      snp_density_eligible: accessibleFraction >= SNP_ACCESSIBILITY_THRESHOLD && snpMean.mean != null,
      selected_transcript_feature: windowFeature(start, end, transcript, segments),
    };
  }

  function compareWindows(left, right, metric, descending = false) {
    const difference = left[metric] - right[metric];
    if (Math.abs(difference) > TIE_TOLERANCE) return descending ? -difference : difference;
    return left.start - right.start;
  }

  function analyzeNotableWindows(sourceResult, annotation = null, { windowSize = WINDOW_SIZE, topWindows = TOP_WINDOWS } = {}) {
    if (!Number.isSafeInteger(windowSize) || windowSize < 1) throw new Error('Window size must be a positive integer.');
    if (!Number.isSafeInteger(topWindows) || topWindows < 1) throw new Error('Top-window count must be a positive integer.');
    const result = normaliseResult(sourceResult);
    const { transcript, segments } = featureSegments(annotation, result);
    const windows = [];
    for (let start = result.start; start <= result.end; start += windowSize) windows.push(windowRecord(result, start, Math.min(start + windowSize - 1, result.end), transcript, segments));
    const highestMeanCs = windows.filter((window) => window.mean_cs != null).sort((left, right) => compareWindows(left, right, 'mean_cs', true)).slice(0, topWindows);
    const lowestMeanSnpDensity = windows.filter((window) => window.snp_density_eligible).sort((left, right) => compareWindows(left, right, 'mean_accessible_snp_density')).slice(0, topWindows);
    return {
      schema_version: SCHEMA_VERSION, analysis_version: ANALYSIS_VERSION,
      coordinate_convention: COORDINATE_CONVENTION, window_size: windowSize, top_windows: topWindows,
      snp_accessibility_threshold: SNP_ACCESSIBILITY_THRESHOLD,
      query: { chromosome: result.chromosome, start: result.start, end: result.end },
      selected_transcript: transcript, windows,
      highest_mean_cs_windows: highestMeanCs, lowest_mean_snp_density_windows: lowestMeanSnpDensity,
    };
  }

  return { ANALYSIS_VERSION, COORDINATE_CONVENTION, SCHEMA_VERSION, SNP_ACCESSIBILITY_THRESHOLD, TOP_WINDOWS, WINDOW_SIZE, analyzeNotableWindows };
}));
