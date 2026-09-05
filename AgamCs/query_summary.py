"""Versioned, QC-aware summaries for exact AgamP4 query intervals.

The matching browser implementation lives in ``docs/assets/query-summary.js``.
Both implementations are exercised against the same JSON fixtures.
"""

from __future__ import annotations

import math
from collections.abc import Mapping


SUMMARY_VERSION = 'agamcs-query-summary-v1'
SCHEMA_VERSION = 1
COORDINATE_CONVENTION = '1-based inclusive'
RANKING_ACCESSIBILITY_THRESHOLD = 0.8
RANKING_THRESHOLD_NOTE = (
    'The 80% value is the existing minimum accessibility coverage for '
    'representative-transcript gene SNP-density rankings. Per-query scope '
    'summaries report whether their coverage meets the same threshold for '
    'context; they are not additional rankings.'
)


def _inclusive_length(start: int, end: int) -> int:
    return end - start + 1


def _clip_interval(start: int, end: int, lower: int, upper: int):
    clipped_start = max(start, lower)
    clipped_end = min(end, upper)
    return (clipped_start, clipped_end) if clipped_start <= clipped_end else None


def _merge_intervals(intervals):
    merged = []
    for start, end in sorted(intervals):
        if not merged or start > merged[-1][1] + 1:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)
    return [tuple(interval) for interval in merged]


def _subtract_intervals(intervals, removed):
    output = []
    removed = _merge_intervals(removed)
    for start, end in _merge_intervals(intervals):
        cursor = start
        for removed_start, removed_end in removed:
            if removed_end < cursor:
                continue
            if removed_start > end:
                break
            if removed_start > cursor:
                output.append((cursor, min(end, removed_start - 1)))
            cursor = max(cursor, removed_end + 1)
            if cursor > end:
                break
        if cursor <= end:
            output.append((cursor, end))
    return output


def _finite_mean(values):
    finite = []
    for value in values:
        if value is None:
            continue
        number = float(value)
        if math.isfinite(number):
            finite.append(number)
    return (sum(finite) / len(finite) if finite else None), len(finite)


def _segments_json(intervals):
    return [{'start': start, 'end': end} for start, end in intervals]


def _scope_summary(scope_id, scope_type, label, intervals, result):
    intervals = _merge_intervals(intervals)
    query_start = result['start']
    cs = result['values']['Cs']
    snp_density = result['values']['snp_density']
    status = result['values']['status']
    cs_values = []
    accessible_snp_values = []
    accessible_bases = 0
    longest = {'bases': 0, 'start': None, 'end': None}

    for segment_start, segment_end in intervals:
        run_start = None
        for position in range(segment_start, segment_end + 1):
            index = position - query_start
            cs_values.append(cs[index])
            accessible = (int(status[index]) & 1) == 1
            if accessible:
                accessible_bases += 1
                accessible_snp_values.append(snp_density[index])
                if run_start is not None:
                    run_bases = position - run_start
                    if run_bases > longest['bases']:
                        longest = {
                            'bases': run_bases,
                            'start': run_start,
                            'end': position - 1,
                        }
                    run_start = None
            elif run_start is None:
                run_start = position
        if run_start is not None:
            run_bases = segment_end - run_start + 1
            if run_bases > longest['bases']:
                longest = {
                    'bases': run_bases,
                    'start': run_start,
                    'end': segment_end,
                }

    total_bases = sum(_inclusive_length(start, end) for start, end in intervals)
    mean_cs, finite_cs_bases = _finite_mean(cs_values)
    mean_snp, finite_accessible_snp_bases = _finite_mean(accessible_snp_values)
    accessible_fraction = accessible_bases / total_bases if total_bases else None
    return {
        'scope_id': scope_id,
        'scope_type': scope_type,
        'label': label,
        'segments': _segments_json(intervals),
        'total_bases': total_bases,
        'finite_cs_bases': finite_cs_bases,
        'mean_cs': mean_cs,
        'accessible_bases': accessible_bases,
        'accessible_fraction': accessible_fraction,
        'finite_accessible_snp_bases': finite_accessible_snp_bases,
        'mean_accessible_snp_density': mean_snp,
        'longest_inaccessible_run': longest,
        'meets_ranking_accessibility_threshold': (
            accessible_fraction >= RANKING_ACCESSIBILITY_THRESHOLD
            if accessible_fraction is not None else None
        ),
    }


def _normalise_result(result: Mapping) -> dict:
    chromosome = str(result.get('chromosome') or '')
    start = result.get('start')
    end = result.get('end')
    if not chromosome or not isinstance(start, int) or not isinstance(end, int):
        raise ValueError('Query summary requires chromosome and integer start/end coordinates.')
    if start < 1 or end < start:
        raise ValueError('Query summary coordinates must satisfy 1 <= start <= end.')
    values = result.get('values') or {}
    required = ('Cs', 'snp_density', 'status')
    if any(name not in values for name in required):
        raise ValueError('Query summary requires Cs, snp_density, and status arrays.')
    expected = _inclusive_length(start, end)
    if any(len(values[name]) != expected for name in required):
        raise ValueError('Query summary arrays must match the inclusive query length.')
    return {
        'chromosome': chromosome,
        'start': start,
        'end': end,
        'values': {name: values[name] for name in required},
    }


def select_transcript_annotation(annotation, transcript_annotations=()):
    """Return the exact selected model instead of a gene-span display record."""
    if not annotation:
        return None
    transcript_id = annotation.get('transcript_id')
    for candidate in transcript_annotations or ():
        if candidate.get('transcript_id') == transcript_id:
            return candidate
    return annotation


def _normalise_annotation(annotation, result):
    if not annotation or not annotation.get('transcript_id'):
        return None
    if str(annotation.get('chromosome')) != result['chromosome']:
        raise ValueError('Selected transcript and query must use the same chromosome.')
    start = annotation.get('start')
    end = annotation.get('end')
    strand = int(annotation.get('strand', 1))
    if not isinstance(start, int) or not isinstance(end, int) or start < 1 or end < start:
        raise ValueError('Selected transcript requires valid integer start/end coordinates.')
    if strand not in (-1, 1):
        raise ValueError('Selected transcript strand must be +1 or -1.')
    exons = []
    for exon in annotation.get('exons') or ():
        exon_start = int(exon['start'])
        exon_end = int(exon['end'])
        if exon_start > exon_end:
            raise ValueError('Exon start cannot exceed exon end.')
        clipped = _clip_interval(exon_start, exon_end, result['start'], result['end'])
        if clipped:
            exons.append(clipped)
    cds_start = annotation.get('cds_start')
    cds_end = annotation.get('cds_end')
    if (cds_start is None) != (cds_end is None):
        raise ValueError('Selected transcript CDS bounds must both be present or both be absent.')
    if cds_start is not None:
        cds_start, cds_end = int(cds_start), int(cds_end)
        if cds_start > cds_end:
            raise ValueError('Selected transcript CDS start cannot exceed CDS end.')
    return {
        'gene_id': annotation.get('id'),
        'transcript_id': str(annotation['transcript_id']),
        'start': start,
        'end': end,
        'strand': strand,
        'exons': exons,
        'cds_start': cds_start,
        'cds_end': cds_end,
    }


def summarize_query(result: Mapping, annotation: Mapping | None = None) -> dict:
    """Build an ``agamcs-query-summary-v1`` document.

    ``result`` uses the browser query shape: chromosome, inclusive start/end,
    and ``values`` containing equally sized Cs, snp_density, and packed status
    arrays. Bit zero of each status byte alone determines accessibility.
    """
    result = _normalise_result(result)
    transcript = _normalise_annotation(annotation, result)
    query_interval = [(result['start'], result['end'])]
    scopes = [_scope_summary('query', 'query', 'Query span', query_interval, result)]

    if transcript is not None:
        query_start, query_end = result['start'], result['end']
        transcript_interval = _clip_interval(
            transcript['start'], transcript['end'], query_start, query_end,
        )
        exons = _merge_intervals(transcript['exons'])
        coding = []
        if transcript['cds_start'] is not None:
            coding = _merge_intervals(
                clipped
                for exon_start, exon_end in exons
                if (clipped := _clip_interval(
                    exon_start, exon_end,
                    transcript['cds_start'], transcript['cds_end'],
                ))
            )
        utr = _subtract_intervals(exons, coding) if coding else []
        introns = _subtract_intervals([transcript_interval], exons) if transcript_interval else []

        scopes.extend([
            _scope_summary('cds', 'cds', 'Selected-transcript CDS', coding, result),
            _scope_summary('utr', 'utr', 'Selected-transcript UTR', utr, result),
            _scope_summary('introns', 'intron', 'Selected-transcript introns', introns, result),
        ])

        ordered_exons = sorted(
            transcript['exons'],
            key=lambda interval: (interval[0], interval[1]),
            reverse=transcript['strand'] == -1,
        )
        scopes.extend(
            _scope_summary(
                f'exon-{number}', 'exon', f'Exon {number} (5\u2032\u21923\u2032)', [interval], result,
            )
            for number, interval in enumerate(ordered_exons, start=1)
        )

        lower_flank = _clip_interval(query_start, transcript['start'] - 1, query_start, query_end)
        upper_flank = _clip_interval(transcript['end'] + 1, query_end, query_start, query_end)
        five_prime = upper_flank if transcript['strand'] == -1 else lower_flank
        three_prime = lower_flank if transcript['strand'] == -1 else upper_flank
        scopes.extend([
            _scope_summary(
                'five-prime-flank', 'flank_5p', '5\u2032 flank', [five_prime] if five_prime else [], result,
            ),
            _scope_summary(
                'three-prime-flank', 'flank_3p', '3\u2032 flank', [three_prime] if three_prime else [], result,
            ),
        ])

    return {
        'schema_version': SCHEMA_VERSION,
        'summary_version': SUMMARY_VERSION,
        'coordinate_convention': COORDINATE_CONVENTION,
        'query': {
            'chromosome': result['chromosome'],
            'start': result['start'],
            'end': result['end'],
        },
        'selected_transcript': (
            {
                'gene_id': transcript['gene_id'],
                'transcript_id': transcript['transcript_id'],
                'start': transcript['start'],
                'end': transcript['end'],
                'strand': transcript['strand'],
            }
            if transcript is not None else None
        ),
        'ranking_accessibility_threshold': RANKING_ACCESSIBILITY_THRESHOLD,
        'ranking_threshold_note': RANKING_THRESHOLD_NOTE,
        'scopes': scopes,
    }


def summarize_dataframe(frame, annotation: Mapping | None = None) -> dict:
    """Summarize an exact CLI TSV/DataFrame using the shared result schema."""
    if frame.empty:
        raise ValueError('Cannot summarize an empty query table.')
    cs_column = 'Cs_s' if 'Cs_s' in frame else 'Cs'
    snp_column = 'snp_density_s' if 'snp_density_s' in frame else 'snp_density'
    positions = [int(value) for value in frame['pos']]
    if positions != list(range(positions[0], positions[-1] + 1)):
        raise ValueError('Query summary positions must be contiguous and increasing.')
    if 'status' in frame:
        status = [int(value) for value in frame['status']]
    elif 'is_accessible' in frame:
        def is_accessible(value):
            if isinstance(value, str):
                normalized = value.strip().lower()
                if normalized in {'true', '1'}:
                    return True
                if normalized in {'false', '0'}:
                    return False
                raise ValueError(f'Invalid is_accessible value: {value!r}.')
            return bool(value) if not (isinstance(value, float) and math.isnan(value)) else False

        status = [1 if is_accessible(value) else 0 for value in frame['is_accessible']]
    else:
        raise ValueError('Query summary table requires status or is_accessible values.')
    return summarize_query({
        'chromosome': str(frame.iloc[0]['chromosome']),
        'start': positions[0],
        'end': positions[-1],
        'values': {
            'Cs': frame[cs_column].tolist(),
            'snp_density': frame[snp_column].tolist(),
            'status': status,
        },
    }, annotation)
