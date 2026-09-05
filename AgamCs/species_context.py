"""Exact-query species and topology-clade summaries.

The matching browser implementation lives in ``docs/assets/species-context.js``.
Both are tested against ``tests/fixtures/species-context-v1-cases.json``.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence


ANALYSIS_VERSION = 'agamcs-species-context-v1'
SCHEMA_VERSION = 1
COORDINATE_CONVENTION = '1-based inclusive'
WINDOW_SIZE = 100
WINDOW_DETECTION_THRESHOLD = 0.8


def _tip_codes(node: str | Mapping) -> list[str]:
    if isinstance(node, str):
        return [node]
    children = node.get('children') if isinstance(node, Mapping) else None
    if not isinstance(children, list) or not children:
        raise ValueError('Topology nodes must be genome codes or non-empty child-bearing objects.')
    return [code for child in children for code in _tip_codes(child)]


def _clades(node: str | Mapping, path: tuple[str, ...] = ()) -> list[dict]:
    if isinstance(node, str):
        return []
    name = str(node.get('name') or '').strip()
    children = node.get('children')
    if not name or not isinstance(children, list) or not children:
        raise ValueError('Every topology clade must have a name and at least one child.')
    current_path = (*path, name)
    record = {
        'id': '/'.join(current_path),
        'name': name,
        'path': list(current_path),
        'member_codes': _tip_codes(node),
        'child_count': len(children),
        'is_polytomy': len(children) > 2,
    }
    return [record, *(item for child in children for item in _clades(child, current_path))]


def _longest_run(detected_by_position: Sequence[bool], start: int) -> dict:
    best_start = best_end = None
    run_start = None
    for offset, detected in enumerate([*detected_by_position, True]):
        if not detected and run_start is None:
            run_start = offset
        elif detected and run_start is not None:
            run_end = offset - 1
            if best_start is None or run_end - run_start > best_end - best_start:
                best_start, best_end = run_start, run_end
            run_start = None
    return {
        'start': start + best_start if best_start is not None else None,
        'end': start + best_end if best_end is not None else None,
        'bases': best_end - best_start + 1 if best_start is not None else 0,
    }


def _window(values_by_species: Sequence[Sequence[float]], chromosome: str,
            query_start: int, offset: int, length: int) -> dict:
    values = [
        float(value)
        for species_values in values_by_species
        for value in species_values[offset:offset + length]
        if value is not None and math.isfinite(float(value)) and float(value) != 0
    ]
    possible = len(values_by_species) * length
    return {
        'chromosome': chromosome,
        'start': query_start + offset,
        'end': query_start + offset + length - 1,
        'total_bases': length,
        'possible_species_bases': possible,
        'detected_bases': len(values),
        'detected_fraction': len(values) / possible,
        'mean_identity_detected': sum(values) / len(values) if values else None,
    }


def _summary(kind: str, identifier: str, name: str, member_codes: list[str],
             values_by_species: Sequence[Sequence[float]], chromosome: str,
             query_start: int, query_bases: int, **metadata) -> dict:
    detected_values = [
        float(value)
        for species_values in values_by_species
        for value in species_values
        if value is not None and math.isfinite(float(value)) and float(value) != 0
    ]
    detected_by_position = [
        any(
            value is not None and math.isfinite(float(value)) and float(value) != 0
            for value in (species_values[offset] for species_values in values_by_species)
        )
        for offset in range(query_bases)
    ]
    windows = [
        _window(values_by_species, chromosome, query_start, offset,
                min(WINDOW_SIZE, query_bases - offset))
        for offset in range(0, query_bases, WINDOW_SIZE)
    ]
    qualifying = [
        window for window in windows
        if window['total_bases'] == WINDOW_SIZE
        and window['detected_fraction'] >= WINDOW_DETECTION_THRESHOLD
        and window['mean_identity_detected'] is not None
    ]
    lowest = min(
        qualifying,
        key=lambda window: (window['mean_identity_detected'], window['start']),
        default=None,
    )
    possible = len(values_by_species) * query_bases
    return {
        'kind': kind,
        'id': identifier,
        'name': name,
        'member_codes': member_codes,
        'species_count': len(values_by_species),
        'query_bases': query_bases,
        'possible_species_bases': possible,
        'detected_bases': len(detected_values),
        'detected_fraction': len(detected_values) / possible,
        'mean_identity_detected': (
            sum(detected_values) / len(detected_values) if detected_values else None
        ),
        'longest_undetected_run': _longest_run(detected_by_position, query_start),
        'lowest_qualifying_identity_window': lowest,
        **metadata,
    }


def analyze_species_context(source_result: Mapping, topology: Mapping | None = None) -> dict:
    """Summarize exact CNEr stack values without treating zero as identity."""
    chromosome = str(source_result.get('chromosome') or '')
    start, end = source_result.get('start'), source_result.get('end')
    rows_value = source_result.get('stackRows')
    labels_value = source_result.get('stackSpecies')
    values = source_result.get('values')
    stack_value = values.get('stack') if isinstance(values, Mapping) else None
    rows = list(rows_value) if rows_value is not None else []
    labels = list(labels_value) if labels_value is not None else []
    stack = list(stack_value) if stack_value is not None else []
    topology = topology or source_result.get('stackTopology')
    if not chromosome or not isinstance(start, int) or not isinstance(end, int) or start < 1 or end < start:
        raise ValueError('Species-context analysis requires valid inclusive query coordinates.')
    if not rows or len(labels) != len(rows) or not isinstance(topology, Mapping):
        raise ValueError('Species-context analysis requires aligned species metadata and topology.')
    query_bases = end - start + 1
    if len(stack) != len(rows) * query_bases:
        raise ValueError('Species stack length must equal species rows multiplied by query bases.')
    tips = _tip_codes(topology.get('tree'))
    if tips != rows or len(set(tips)) != len(tips):
        raise ValueError('Species topology tips must uniquely match the stack-row order.')
    values_by_code = {
        code: stack[index * query_bases:(index + 1) * query_bases]
        for index, code in enumerate(rows)
    }
    species = [
        _summary('species', code, labels[index], [code], [values_by_code[code]],
                 chromosome, start, query_bases)
        for index, code in enumerate(rows)
    ]
    clades = []
    for clade in _clades(topology['tree']):
        member_codes = clade.pop('member_codes')
        identifier = clade.pop('id')
        name = clade.pop('name')
        clades.append(_summary(
            'clade', identifier, name, member_codes,
            [values_by_code[code] for code in member_codes],
            chromosome, start, query_bases, **clade,
        ))
    return {
        'schema_version': SCHEMA_VERSION,
        'analysis_version': ANALYSIS_VERSION,
        'coordinate_convention': COORDINATE_CONVENTION,
        'window_size': WINDOW_SIZE,
        'window_detection_threshold': WINDOW_DETECTION_THRESHOLD,
        'zero_semantics': 'No detected CNEr interval; not measured 0% identity.',
        'query': {'chromosome': chromosome, 'start': start, 'end': end, 'bases': query_bases},
        'species_count': len(rows),
        'species': species,
        'clades': clades,
    }
