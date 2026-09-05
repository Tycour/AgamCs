"""Deterministic, QC-aware notable-window analysis for exact query data.

The matching browser implementation lives in ``docs/assets/notable-windows.js``.
Both are tested against ``tests/fixtures/notable-windows-v1-cases.json``.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from functools import cmp_to_key


ANALYSIS_VERSION = 'agamcs-notable-windows-v1'
SCHEMA_VERSION = 1
COORDINATE_CONVENTION = '1-based inclusive'
WINDOW_SIZE = 100
TOP_WINDOWS = 5
SNP_ACCESSIBILITY_THRESHOLD = 0.8
TIE_TOLERANCE = 1e-12


def _clip(start: int, end: int, lower: int, upper: int):
    start, end = max(start, lower), min(end, upper)
    return (start, end) if start <= end else None


def _merge(intervals):
    merged = []
    for start, end in sorted(intervals):
        if not merged or start > merged[-1][1] + 1:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)
    return [tuple(interval) for interval in merged]


def _subtract(intervals, removed):
    output = []
    for start, end in _merge(intervals):
        cursor = start
        for removed_start, removed_end in _merge(removed):
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
    values = [float(value) for value in values if value is not None and math.isfinite(float(value))]
    return (sum(values) / len(values) if values else None), len(values)


def _normalise_result(source: Mapping) -> dict:
    chromosome = str(source.get('chromosome') or '')
    start, end = source.get('start'), source.get('end')
    values = source.get('values') or {}
    required = ('Cs', 'snp_density', 'status')
    if not chromosome or not isinstance(start, int) or not isinstance(end, int) or start < 1 or end < start:
        raise ValueError('Notable-window analysis requires valid inclusive query coordinates.')
    if any(name not in values for name in required):
        raise ValueError('Notable-window analysis requires Cs, snp_density, and status arrays.')
    expected = end - start + 1
    if any(len(values[name]) != expected for name in required):
        raise ValueError('Notable-window arrays must match the inclusive query length.')
    return {'chromosome': chromosome, 'start': start, 'end': end, 'values': values}


def _feature_segments(annotation: Mapping | None, result: Mapping):
    """Return non-overlapping selected-transcript labels clipped to the query."""
    if not annotation or not annotation.get('transcript_id'):
        return None, []
    if str(annotation.get('chromosome')) != result['chromosome']:
        raise ValueError('Selected transcript and query must use the same chromosome.')
    start, end = annotation.get('start'), annotation.get('end')
    strand = int(annotation.get('strand', 1))
    if not isinstance(start, int) or not isinstance(end, int) or start < 1 or end < start or strand not in (-1, 1):
        raise ValueError('Selected transcript requires valid coordinates and strand.')
    transcript = _clip(start, end, result['start'], result['end'])
    exons = _merge(
        clipped for exon in annotation.get('exons') or ()
        if (clipped := _clip(int(exon['start']), int(exon['end']), result['start'], result['end']))
    )
    cds_start, cds_end = annotation.get('cds_start'), annotation.get('cds_end')
    if (cds_start is None) != (cds_end is None):
        raise ValueError('Selected transcript CDS bounds must both be present or absent.')
    coding = []
    if cds_start is not None:
        cds_start, cds_end = int(cds_start), int(cds_end)
        if cds_start > cds_end:
            raise ValueError('Selected transcript CDS start cannot exceed CDS end.')
        coding = _merge(
            clipped for exon_start, exon_end in exons
            if (clipped := _clip(exon_start, exon_end, cds_start, cds_end))
        )
    ordered_exons = sorted(exons, reverse=strand == -1)
    segments = []
    for number, (exon_start, exon_end) in enumerate(ordered_exons, start=1):
        exon_coding = _merge(
            clipped for coding_start, coding_end in coding
            if (clipped := _clip(exon_start, exon_end, coding_start, coding_end))
        )
        if not exon_coding:
            segments.append((exon_start, exon_end, f'Non-coding exon {number}'))
            continue
        for utr_start, utr_end in _subtract([(exon_start, exon_end)], exon_coding):
            is_five_prime = (utr_end < cds_start) if strand == 1 else (utr_start > cds_end)
            label = '5′ UTR' if is_five_prime else '3′ UTR'
            segments.append((utr_start, utr_end, f'{label} (exon {number})'))
        for coding_start, coding_end in exon_coding:
            segments.append((coding_start, coding_end, f'CDS (exon {number})'))
    if transcript:
        segments.extend((start, end, 'Intron') for start, end in _subtract([transcript], exons))
    return {
        'gene_id': annotation.get('id'),
        'transcript_id': str(annotation['transcript_id']),
        'strand': strand,
    }, sorted(segments)


def _window_feature(window_start: int, window_end: int, transcript, segments) -> str:
    if transcript is None:
        return 'No selected transcript'
    labels = []
    for start, end, label in segments:
        if start <= window_end and end >= window_start and label not in labels:
            labels.append(label)
    return '; '.join(labels) if labels else 'Outside selected transcript'


def _window_record(result, start: int, end: int, transcript, segments) -> dict:
    offset = start - result['start']
    length = end - start + 1
    cs = result['values']['Cs'][offset:offset + length]
    snp = result['values']['snp_density'][offset:offset + length]
    status = result['values']['status'][offset:offset + length]
    accessible = [(int(value) & 1) == 1 for value in status]
    accessible_bases = sum(accessible)
    mean_cs, finite_cs_bases = _finite_mean(cs)
    mean_snp, finite_accessible_snp_bases = _finite_mean(
        value for value, is_accessible in zip(snp, accessible) if is_accessible
    )
    accessible_fraction = accessible_bases / length
    return {
        'chromosome': result['chromosome'],
        'start': start,
        'end': end,
        'total_bases': length,
        'finite_cs_bases': finite_cs_bases,
        'mean_cs': mean_cs,
        'accessible_bases': accessible_bases,
        'accessible_fraction': accessible_fraction,
        'finite_accessible_snp_bases': finite_accessible_snp_bases,
        'mean_accessible_snp_density': mean_snp,
        'snp_density_eligible': bool(
            accessible_fraction >= SNP_ACCESSIBILITY_THRESHOLD and mean_snp is not None
        ),
        'selected_transcript_feature': _window_feature(start, end, transcript, segments),
    }


def _compare_windows(left: Mapping, right: Mapping, metric: str, descending=False) -> int:
    """Compare means with a cross-runtime tolerance before coordinate tie-breaking."""
    left_value, right_value = left[metric], right[metric]
    if not math.isclose(left_value, right_value, rel_tol=0, abs_tol=TIE_TOLERANCE):
        if descending:
            return -1 if left_value > right_value else 1
        return -1 if left_value < right_value else 1
    return (left['start'] > right['start']) - (left['start'] < right['start'])


def analyze_notable_windows(source_result: Mapping, annotation: Mapping | None = None,
                            *, window_size: int = WINDOW_SIZE, top_windows: int = TOP_WINDOWS) -> dict:
    """Analyse exact query values in fixed windows anchored at the query start.

    ``window_size`` and ``top_windows`` are parameters for compact cross-language
    fixtures. Product callers use the fixed 100-base/five-window defaults.
    """
    if not isinstance(window_size, int) or window_size < 1:
        raise ValueError('Window size must be a positive integer.')
    if not isinstance(top_windows, int) or top_windows < 1:
        raise ValueError('Top-window count must be a positive integer.')
    result = _normalise_result(source_result)
    transcript, segments = _feature_segments(annotation, result)
    windows = []
    for start in range(result['start'], result['end'] + 1, window_size):
        windows.append(_window_record(
            result, start, min(start + window_size - 1, result['end']), transcript, segments,
        ))
    highest_cs = sorted(
        (window for window in windows if window['mean_cs'] is not None),
        key=cmp_to_key(lambda left, right: _compare_windows(left, right, 'mean_cs', descending=True)),
    )[:top_windows]
    lowest_snp = sorted(
        (window for window in windows if window['snp_density_eligible']),
        key=cmp_to_key(lambda left, right: _compare_windows(
            left, right, 'mean_accessible_snp_density',
        )),
    )[:top_windows]
    return {
        'schema_version': SCHEMA_VERSION,
        'analysis_version': ANALYSIS_VERSION,
        'coordinate_convention': COORDINATE_CONVENTION,
        'window_size': window_size,
        'top_windows': top_windows,
        'snp_accessibility_threshold': SNP_ACCESSIBILITY_THRESHOLD,
        'query': {key: result[key] for key in ('chromosome', 'start', 'end')},
        'selected_transcript': transcript,
        'windows': windows,
        'highest_mean_cs_windows': highest_cs,
        'lowest_mean_snp_density_windows': lowest_snp,
    }
