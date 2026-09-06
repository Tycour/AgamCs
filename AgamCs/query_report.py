"""Versioned, reproducible reports composed from AgamCs query analyses.

This deliberately composes the already versioned query-summary, ranking,
notable-window, and species-context calculations.  It does not serialise the
base-level result arrays: the exact TSV remains the base-level export.
"""

from __future__ import annotations

import json
from importlib.resources import files
from typing import Mapping

from .fetch_score import DATASET_FILENAME, DEFAULT_REMOTE_URL
from .notable_windows import analyze_notable_windows
from .query_summary import select_transcript_annotation, summarize_query
from .species_context import analyze_species_context


REPORT_VERSION = 'agamcs-query-report-v1'
SCHEMA_VERSION = 1
COORDINATE_CONVENTION = '1-based inclusive'


def _json_resource(name: str) -> dict:
    return json.loads(files('AgamCs').joinpath('data', name).read_text(encoding='utf-8'))


def default_provenance() -> dict:
    """Return the same immutable provenance facts used by the CLI assets."""
    cs_ranking = _json_resource('gene-cs-rankings.json')
    snp_ranking = _json_resource('gene-snp-rankings.json')
    topology = _json_resource('species_topology.json')
    return {
        'assembly': cs_ranking['assembly'],
        'dataset': {
            'filename': DATASET_FILENAME,
            'url': DEFAULT_REMOTE_URL,
            'score_source': cs_ranking['score_source'],
            'accessibility_source': snp_ranking['accessibility_source'],
        },
        'annotation_index': {
            'coordinate_index_version': cs_ranking['coordinate_index_version'],
            'annotation_source': cs_ranking['annotation_source'],
        },
        'species_topology': {
            'schema_version': topology['schema_version'],
            'title': topology['title'],
            'representation': topology['representation'],
            'sources': topology['sources'],
        },
    }


def _availability(value, reason: str) -> dict:
    return {'availability': 'unavailable', 'reason': reason, 'value': value}


def _display(query, display=None) -> dict:
    display = display or {}
    return {
        'displayed_range': {
            'start': int(display.get('start', query['start'])),
            'end': int(display.get('end', query['end'])),
        },
        'signal_resolution_bins': display.get('signal_resolution_bins'),
        'heatmap_resolution_bins': display.get('heatmap_resolution_bins'),
    }


def build_report(source_result: Mapping, *, annotation: Mapping | None = None,
                 transcript_annotations=(), ranking: Mapping | None = None,
                 query_state: Mapping | None = None, provenance: Mapping | None = None,
                 display: Mapping | None = None) -> dict:
    """Build a JSON-safe ``agamcs-query-report-v1`` document.

    Absent analyses are represented by an explicit ``availability`` state;
    numerical unknowns from the analytical summaries remain JSON ``null``.
    """
    selected = select_transcript_annotation(annotation, transcript_annotations)
    summary = summarize_query(source_result, selected)
    query = summary['query']
    query_state = dict(query_state or {})
    query_state.setdefault('mode', 'coordinates')
    query_state['coordinates'] = {
        'chromosome': query['chromosome'], 'start': query['start'], 'end': query['end'],
    }
    query_state.setdefault('padding_bases_per_side', 0)

    try:
        species = {'availability': 'available', 'value': analyze_species_context(source_result)}
    except ValueError as error:
        species = _availability(None, str(error))

    report = {
        'schema_version': SCHEMA_VERSION,
        'report_version': REPORT_VERSION,
        'coordinate_convention': COORDINATE_CONVENTION,
        'query_state': query_state,
        'selected_annotation': summary['selected_transcript'] or {
            'availability': 'unavailable', 'reason': 'No exact selected-transcript annotation was supplied.',
        },
        'display': _display(query, display),
        'provenance': dict(provenance or default_provenance()),
        'query_partitions': summary,
        'accessibility_audit': {
            'availability': 'available',
            'ranking_accessibility_threshold': summary['ranking_accessibility_threshold'],
            'ranking_threshold_note': summary['ranking_threshold_note'],
            'scopes': summary['scopes'],
        },
        'rankings': (
            {'availability': 'available', 'value': dict(ranking)}
            if ranking is not None else _availability(
                None, 'No static gene ranking is available for this query.',
            )
        ),
        'notable_windows': {'availability': 'available', 'value': analyze_notable_windows(source_result, selected)},
        'species_clade_summaries': species,
        'calculation_methods': {
            'query_summary': summary['summary_version'],
            'notable_windows': 'agamcs-notable-windows-v1',
            'species_context': 'agamcs-species-context-v1',
            'ranking_assets': (
                {
                    'cs': ranking.get('cs', {}).get('ranking_version'),
                    'snp_density': ranking.get('snp_density', {}).get('ranking_version'),
                } if ranking is not None else {'cs': None, 'snp_density': None}
            ),
        },
        'limitations': [
            'QC-failed accessibility positions are unknown and are not converted to zero.',
            'Zero CNEr stack values mean no detected interval, not measured 0% identity.',
            'The JSON report contains summaries; the exact TSV remains the base-level export.',
        ],
    }
    report['methods_text'] = methods_text(report)
    report['figure_caption'] = figure_caption(report)
    return report


def methods_text(report: Mapping) -> str:
    query = report['query_state']['coordinates']
    display = report['display']
    provenance = report['provenance']
    selected = report['selected_annotation']
    transcript = selected.get('transcript_id') if isinstance(selected, Mapping) else None
    transcript_text = transcript or 'no selected transcript'
    return (
        f"AgamCs report {report['report_version']} used {provenance['assembly']} "
        f"{report['coordinate_convention']} coordinates for {query['chromosome']}:{query['start']}-{query['end']} "
        f"with {transcript_text}. Query partitions use {report['calculation_methods']['query_summary']}; "
        f"notable windows use {report['calculation_methods']['notable_windows']}; species/clade summaries use "
        f"{report['calculation_methods']['species_context']}. SNP-density means use accessible focal bases only "
        f"and retain QC-failed positions as unknown. Displayed range was "
        f"{display['displayed_range']['start']}-{display['displayed_range']['end']} with "
        f"{display['signal_resolution_bins'] if display['signal_resolution_bins'] is not None else 'unavailable'} "
        f"signal bins and {display['heatmap_resolution_bins'] if display['heatmap_resolution_bins'] is not None else 'unavailable'} heatmap bins."
    )


def figure_caption(report: Mapping) -> str:
    query = report['query_state']['coordinates']
    display = report['display']
    selected = report['selected_annotation']
    transcript = selected.get('transcript_id') if isinstance(selected, Mapping) else None
    scope = report['accessibility_audit']['scopes'][0]
    accessibility = f"{scope['accessible_bases']}/{scope['total_bases']} accessible bases"
    return (
        f"AgamCs {report['provenance']['assembly']} conservation and accessible-base SNP-density view for "
        f"{query['chromosome']}:{query['start']}-{query['end']} (inclusive), selected transcript "
        f"{transcript or 'unavailable'}. The displayed range is "
        f"{display['displayed_range']['start']}-{display['displayed_range']['end']} at "
        f"{display['signal_resolution_bins'] if display['signal_resolution_bins'] is not None else 'unavailable'} signal "
        f"and {display['heatmap_resolution_bins'] if display['heatmap_resolution_bins'] is not None else 'unavailable'} heatmap bins; "
        f"the accessibility denominator is {accessibility}. QC-failed bases are unknown rather than zero, and "
        f"zero CNEr values denote no detected interval rather than measured 0% identity."
    )


def validate_report(report: Mapping) -> None:
    """Small dependency-free schema guard for report exports and tests."""
    required = {
        'schema_version', 'report_version', 'coordinate_convention', 'query_state',
        'selected_annotation', 'display', 'provenance', 'query_partitions',
        'accessibility_audit', 'rankings', 'notable_windows', 'species_clade_summaries',
        'calculation_methods', 'limitations', 'methods_text', 'figure_caption',
    }
    missing = sorted(required - set(report))
    if missing:
        raise ValueError(f'Report is missing required fields: {", ".join(missing)}.')
    if report['schema_version'] != SCHEMA_VERSION or report['report_version'] != REPORT_VERSION:
        raise ValueError('Unsupported AgamCs report schema/version.')
    coordinates = report['query_state'].get('coordinates', {})
    if not isinstance(coordinates.get('start'), int) or not isinstance(coordinates.get('end'), int):
        raise ValueError('Report query coordinates must be integer inclusive bounds.')
    if coordinates['start'] < 1 or coordinates['end'] < coordinates['start']:
        raise ValueError('Report query coordinates are invalid.')
