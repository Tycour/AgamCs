(function initialiseQuerySummary(root, factory) {
  const api = factory();
  root.AgamCsQuerySummary = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(globalThis, () => {
  const SUMMARY_VERSION = 'agamcs-query-summary-v1';
  const SCHEMA_VERSION = 1;
  const COORDINATE_CONVENTION = '1-based inclusive';
  const RANKING_ACCESSIBILITY_THRESHOLD = 0.8;
  const RANKING_THRESHOLD_NOTE = 'The 80% value is the existing minimum accessibility coverage for representative-transcript gene SNP-density rankings. Per-query scope summaries report whether their coverage meets the same threshold for context; they are not additional rankings.';

  function clipInterval(start, end, lower, upper) {
    const clippedStart = Math.max(start, lower);
    const clippedEnd = Math.min(end, upper);
    return clippedStart <= clippedEnd ? [clippedStart, clippedEnd] : null;
  }

  function mergeIntervals(intervals) {
    const merged = [];
    [...intervals].sort((left, right) => left[0] - right[0] || left[1] - right[1])
      .forEach(([start, end]) => {
        if (!merged.length || start > merged[merged.length - 1][1] + 1) {
          merged.push([start, end]);
        } else {
          merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end);
        }
      });
    return merged;
  }

  function subtractIntervals(intervals, removed) {
    const output = [];
    const removedUnion = mergeIntervals(removed);
    mergeIntervals(intervals).forEach(([start, end]) => {
      let cursor = start;
      for (const [removedStart, removedEnd] of removedUnion) {
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
    const finite = values.filter(Number.isFinite);
    return { mean: finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null, count: finite.length };
  }

  function scopeSummary(scopeId, scopeType, label, intervals, result) {
    const merged = mergeIntervals(intervals);
    const csValues = [];
    const accessibleSnpValues = [];
    let accessibleBases = 0;
    let longest = { bases: 0, start: null, end: null };
    merged.forEach(([segmentStart, segmentEnd]) => {
      let runStart = null;
      for (let position = segmentStart; position <= segmentEnd; position += 1) {
        const index = position - result.start;
        const csValue = result.values.Cs[index];
        csValues.push(csValue == null ? Number.NaN : Number(csValue));
        const accessible = (Number(result.values.status[index]) & 1) === 1;
        if (accessible) {
          accessibleBases += 1;
          const snpValue = result.values.snp_density[index];
          accessibleSnpValues.push(snpValue == null ? Number.NaN : Number(snpValue));
          if (runStart != null) {
            const runBases = position - runStart;
            if (runBases > longest.bases) {
              longest = { bases: runBases, start: runStart, end: position - 1 };
            }
            runStart = null;
          }
        } else if (runStart == null) {
          runStart = position;
        }
      }
      if (runStart != null) {
        const runBases = segmentEnd - runStart + 1;
        if (runBases > longest.bases) {
          longest = { bases: runBases, start: runStart, end: segmentEnd };
        }
      }
    });
    const totalBases = merged.reduce((sum, [start, end]) => sum + end - start + 1, 0);
    const cs = finiteMean(csValues);
    const snp = finiteMean(accessibleSnpValues);
    const accessibleFraction = totalBases ? accessibleBases / totalBases : null;
    return {
      scope_id: scopeId,
      scope_type: scopeType,
      label,
      segments: merged.map(([start, end]) => ({ start, end })),
      total_bases: totalBases,
      finite_cs_bases: cs.count,
      mean_cs: cs.mean,
      accessible_bases: accessibleBases,
      accessible_fraction: accessibleFraction,
      finite_accessible_snp_bases: snp.count,
      mean_accessible_snp_density: snp.mean,
      longest_inaccessible_run: longest,
      meets_ranking_accessibility_threshold: accessibleFraction == null
        ? null : accessibleFraction >= RANKING_ACCESSIBILITY_THRESHOLD,
    };
  }

  function normaliseResult(result) {
    const chromosome = String(result?.chromosome || '');
    const start = result?.start;
    const end = result?.end;
    if (!chromosome || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      throw new Error('Query summary requires chromosome and integer start/end coordinates.');
    }
    if (start < 1 || end < start) {
      throw new Error('Query summary coordinates must satisfy 1 <= start <= end.');
    }
    const values = result?.values || {};
    const required = ['Cs', 'snp_density', 'status'];
    if (required.some((name) => values[name] == null)) {
      throw new Error('Query summary requires Cs, snp_density, and status arrays.');
    }
    const expected = end - start + 1;
    if (required.some((name) => values[name].length !== expected)) {
      throw new Error('Query summary arrays must match the inclusive query length.');
    }
    return { chromosome, start, end, values };
  }

  function selectTranscriptAnnotation(annotation, transcriptAnnotations = []) {
    if (!annotation) return null;
    const selected = transcriptAnnotations.find((candidate) => (
      candidate?.transcript_id === annotation.transcript_id
    ));
    return selected || annotation;
  }

  function normaliseAnnotation(annotation, result) {
    if (!annotation?.transcript_id) return null;
    if (String(annotation.chromosome) !== result.chromosome) {
      throw new Error('Selected transcript and query must use the same chromosome.');
    }
    const start = annotation.start;
    const end = annotation.end;
    const strand = Number(annotation.strand ?? 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) {
      throw new Error('Selected transcript requires valid integer start/end coordinates.');
    }
    if (![-1, 1].includes(strand)) {
      throw new Error('Selected transcript strand must be +1 or -1.');
    }
    const exons = (annotation.exons || []).map((exon) => {
      const exonStart = Number(exon.start);
      const exonEnd = Number(exon.end);
      if (!Number.isSafeInteger(exonStart) || !Number.isSafeInteger(exonEnd)
          || exonStart > exonEnd) {
        throw new Error('Exons require valid integer bounds with start <= end.');
      }
      return clipInterval(exonStart, exonEnd, result.start, result.end);
    }).filter(Boolean);
    let cdsStart = annotation.cds_start;
    let cdsEnd = annotation.cds_end;
    if ((cdsStart == null) !== (cdsEnd == null)) {
      throw new Error('Selected transcript CDS bounds must both be present or both be absent.');
    }
    if (cdsStart != null) {
      cdsStart = Number(cdsStart);
      cdsEnd = Number(cdsEnd);
      if (!Number.isSafeInteger(cdsStart) || !Number.isSafeInteger(cdsEnd)
          || cdsStart > cdsEnd) {
        throw new Error('Selected transcript CDS requires valid integer bounds with start <= end.');
      }
    }
    return {
      gene_id: annotation.id ?? null,
      transcript_id: String(annotation.transcript_id),
      start,
      end,
      strand,
      exons,
      cds_start: cdsStart,
      cds_end: cdsEnd,
    };
  }

  function summarizeQuery(sourceResult, annotation = null) {
    const result = normaliseResult(sourceResult);
    const transcript = normaliseAnnotation(annotation, result);
    const scopes = [scopeSummary(
      'query', 'query', 'Query span', [[result.start, result.end]], result,
    )];
    if (transcript) {
      const transcriptInterval = clipInterval(
        transcript.start, transcript.end, result.start, result.end,
      );
      const exons = mergeIntervals(transcript.exons);
      const coding = transcript.cds_start == null ? [] : mergeIntervals(
        exons.map(([start, end]) => clipInterval(
          start, end, transcript.cds_start, transcript.cds_end,
        )).filter(Boolean),
      );
      const utr = coding.length ? subtractIntervals(exons, coding) : [];
      const introns = transcriptInterval ? subtractIntervals([transcriptInterval], exons) : [];
      scopes.push(
        scopeSummary('cds', 'cds', 'Selected-transcript CDS', coding, result),
        scopeSummary('utr', 'utr', 'Selected-transcript UTR', utr, result),
        scopeSummary('introns', 'intron', 'Selected-transcript introns', introns, result),
      );
      [...transcript.exons]
        .sort((left, right) => (
          transcript.strand === -1
            ? right[0] - left[0] || right[1] - left[1]
            : left[0] - right[0] || left[1] - right[1]
        ))
        .forEach((interval, index) => scopes.push(scopeSummary(
          `exon-${index + 1}`, 'exon', `Exon ${index + 1} (5\u2032\u21923\u2032)`, [interval], result,
        )));
      const lowerFlank = clipInterval(result.start, transcript.start - 1, result.start, result.end);
      const upperFlank = clipInterval(transcript.end + 1, result.end, result.start, result.end);
      const fivePrime = transcript.strand === -1 ? upperFlank : lowerFlank;
      const threePrime = transcript.strand === -1 ? lowerFlank : upperFlank;
      scopes.push(
        scopeSummary('five-prime-flank', 'flank_5p', '5\u2032 flank', fivePrime ? [fivePrime] : [], result),
        scopeSummary('three-prime-flank', 'flank_3p', '3\u2032 flank', threePrime ? [threePrime] : [], result),
      );
    }
    return {
      schema_version: SCHEMA_VERSION,
      summary_version: SUMMARY_VERSION,
      coordinate_convention: COORDINATE_CONVENTION,
      query: { chromosome: result.chromosome, start: result.start, end: result.end },
      selected_transcript: transcript ? {
        gene_id: transcript.gene_id,
        transcript_id: transcript.transcript_id,
        start: transcript.start,
        end: transcript.end,
        strand: transcript.strand,
      } : null,
      ranking_accessibility_threshold: RANKING_ACCESSIBILITY_THRESHOLD,
      ranking_threshold_note: RANKING_THRESHOLD_NOTE,
      scopes,
    };
  }

  return {
    COORDINATE_CONVENTION,
    RANKING_ACCESSIBILITY_THRESHOLD,
    RANKING_THRESHOLD_NOTE,
    SCHEMA_VERSION,
    SUMMARY_VERSION,
    selectTranscriptAnnotation,
    summarizeQuery,
  };
}));
