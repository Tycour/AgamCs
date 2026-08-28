"""Language-neutral summaries, palette, and geometry for AgamCs plots.

The Python CLI and browser implement this model independently against one
versioned JSON contract. Sharing a contract is not sharing rendering code.
"""

from __future__ import annotations

import json
import math
from importlib.resources import files
from pathlib import Path

import numpy as np
import pandas as pd

from .create_heatmap import SPECIES_GENOME_CODES, SPECIES_LABELS, _gene_coordinate_mapper


CONTRACT_ID = 'agamcs-plot-contract-v2'


def load_plot_contract(path=None):
    """Load and validate the canonical packaged plot contract."""
    contract_path = Path(path) if path else files('AgamCs').joinpath('data/plot-contract.json')
    contract = json.loads(contract_path.read_text(encoding='utf-8'))
    if contract.get('schema_version') != 2 or contract.get('contract_id') != CONTRACT_ID:
        raise ValueError('The plot contract is missing or incompatible.')
    binning = contract.get('binning', {})
    if (
        binning.get('assignment')
        != 'min(bin_count - 1, floor((x - minimum) * bin_count / (maximum - minimum)))'
        or binning.get('empty_bins') != 'omit'
        or binning.get('inclusive_length') != 'end - start + 1'
        or binning.get('adaptive_keyword') != 'adaptive'
        or binning.get('explicit_choices') != [60, 120, 240, 500, 1000]
        or binning.get('safety_maximum_bins') != 1000
        or binning.get('explicit_clamping') != 'min(requested_bins, inclusive_length)'
        or binning.get('signal', {}).get('adaptive_bases_per_bin') != 20
        or binning.get('signal', {}).get('adaptive_maximum_bins') != 240
        or binning.get('heatmap', {}).get('adaptive_bases_per_bin') != 30
        or binning.get('heatmap', {}).get('adaptive_maximum_bins') != 500
    ):
        raise ValueError('The plot contract has unexpected binning semantics.')
    return contract


def validate_plot_resolution(value, contract=None):
    """Validate an adaptive or positive bounded display-bin request."""
    contract = contract or load_plot_contract()
    binning = contract['binning']
    adaptive = binning['adaptive_keyword']
    if isinstance(value, str) and value.strip().lower() == adaptive:
        return adaptive
    if isinstance(value, bool):
        raise ValueError(
            f"plot resolution must be '{adaptive}' or a positive integer through "
            f"{binning['safety_maximum_bins']}"
        )
    try:
        text = str(value).strip()
        if not text or any(character not in '0123456789' for character in text):
            raise ValueError
        requested = int(text)
    except (TypeError, ValueError):
        raise ValueError(
            f"plot resolution must be '{adaptive}' or a positive integer through "
            f"{binning['safety_maximum_bins']}"
        ) from None
    if requested < 1 or requested > binning['safety_maximum_bins']:
        raise ValueError(
            f"plot resolution must be '{adaptive}' or a positive integer from 1 "
            f"through {binning['safety_maximum_bins']}"
        )
    return requested


def resolve_bin_count(inclusive_length, plot_kind, requested='adaptive', contract=None):
    """Resolve adaptive or explicit display bins for one plotted interval."""
    contract = contract or load_plot_contract()
    try:
        length = int(inclusive_length)
    except (TypeError, ValueError):
        raise ValueError('inclusive plotted length must be a positive integer') from None
    if length < 1 or length != inclusive_length:
        raise ValueError('inclusive plotted length must be a positive integer')
    if plot_kind not in {'signal', 'heatmap'}:
        raise ValueError("plot kind must be 'signal' or 'heatmap'")
    resolution = validate_plot_resolution(requested, contract)
    if resolution == contract['binning']['adaptive_keyword']:
        policy = contract['binning'][plot_kind]
        return max(1, min(
            length,
            policy['adaptive_maximum_bins'],
            math.floor(length / policy['adaptive_bases_per_bin']),
        ))
    return min(length, resolution)


def dataframe_to_result(data):
    """Convert an exact CLI TSV frame to the language-neutral browser shape."""
    if data.empty:
        raise ValueError('The plot model requires at least one row.')
    chromosome_values = data['chromosome'].astype(str).unique()
    if len(chromosome_values) != 1:
        raise ValueError('The plot model requires exactly one chromosome.')
    positions = pd.to_numeric(data['pos'], errors='raise').astype(int)
    start, end = int(positions.min()), int(positions.max())
    expected_positions = np.arange(start, end + 1)
    if not np.array_equal(positions.to_numpy(), expected_positions):
        raise ValueError('The parity model requires contiguous ascending base positions.')

    def numeric_column(name):
        return pd.to_numeric(data[name], errors='coerce').astype(float).tolist()

    if 'is_accessible' not in data:
        raise ValueError('The parity model requires explicit is_accessible values.')
    accessible = data['is_accessible']
    if pd.api.types.is_bool_dtype(accessible):
        status = accessible.fillna(False).astype(int).tolist()
    elif pd.api.types.is_numeric_dtype(accessible):
        status = accessible.fillna(0).astype(int).eq(1).astype(int).tolist()
    else:
        status = (
            accessible.astype('string').str.strip().str.lower().eq('true')
            .fillna(False).astype(int).tolist()
        )

    stack = []
    for code in SPECIES_GENOME_CODES:
        column = f'stack_{code}'
        if column not in data:
            raise ValueError(f'The score table is missing expected stack row {code}.')
        stack.extend(numeric_column(column))
    return {
        'chromosome': chromosome_values[0],
        'start': start,
        'end': end,
        'stackRows': list(SPECIES_GENOME_CODES),
        'stackSpecies': list(SPECIES_LABELS),
        'values': {
            'Cs': numeric_column('Cs_C'),
            'snp_density': numeric_column('snp_density_s'),
            'status': status,
            'stack': stack,
        },
    }

def annotation_matches(result, annotation):
    """Match the Pages containment rule without changing the base renderer."""
    return bool(
        annotation
        and str(annotation.get('chromosome')) == str(result['chromosome'])
        and int(annotation['start']) >= int(result['start'])
        and int(annotation['end']) <= int(result['end'])
    )


def transcript_annotations_for_display(display_annotation, annotations=None):
    """Return unique compatible isoforms in stable transcript-id order."""
    if not display_annotation:
        return []
    candidates = list(annotations or [display_annotation])
    unique = {}
    for annotation in candidates:
        transcript_id = annotation.get('transcript_id') if annotation else None
        if not transcript_id:
            continue
        if str(annotation.get('chromosome')) != str(display_annotation.get('chromosome')):
            continue
        if int(annotation.get('strand', 1)) != int(display_annotation.get('strand', 1)):
            continue
        if (int(annotation['end']) < int(display_annotation['start'])
                or int(annotation['start']) > int(display_annotation['end'])):
            continue
        if not annotation.get('exons'):
            continue
        unique[str(transcript_id)] = annotation
    if not unique and display_annotation.get('transcript_id'):
        unique[str(display_annotation['transcript_id'])] = display_annotation
    return [unique[key] for key in sorted(unique)]


def _coordinate_records(result, annotation=None):
    use_annotation = annotation_matches(result, annotation)
    if use_annotation:
        mapper = _gene_coordinate_mapper(annotation)
    else:
        mapper = lambda position: position - result['start']
    records = []
    for index, cs_value in enumerate(result['values']['Cs']):
        position = result['start'] + index
        records.append({
            'index': index,
            'position': position,
            'x': float(mapper(position)),
            'Cs': float(cs_value),
            'snp': float(result['values']['snp_density'][index]),
            'status': int(result['values']['status'][index]),
        })
    records.sort(key=lambda record: record['x'])
    return records, annotation if use_annotation else None


def _assign_bins(records, maximum_bins):
    if not records:
        raise ValueError('The plot model requires at least one record.')
    bin_count = min(max(1, int(maximum_bins)), len(records))
    minimum, maximum = records[0]['x'], records[-1]['x']
    span = maximum - minimum
    bins = [[] for _ in range(bin_count)]
    for record in records:
        index = 0 if span == 0 else min(
            bin_count - 1,
            math.floor((record['x'] - minimum) * bin_count / span),
        )
        bins[index].append(record)
    return [bin_ for bin_ in bins if bin_], minimum, maximum, bin_count


def _finite(values):
    return [float(value) for value in values if math.isfinite(float(value))]


def _mean(values):
    values = _finite(values)
    return sum(values) / len(values) if values else None


def _quantile(values, proportion):
    values = sorted(_finite(values))
    if not values:
        return None
    position = (len(values) - 1) * proportion
    lower, upper = math.floor(position), math.ceil(position)
    if lower == upper:
        return values[lower]
    return values[lower] + (values[upper] - values[lower]) * (position - lower)


def build_plot_model(
    result, annotation=None, transcript_annotations=None, contract=None,
    signal_bins='adaptive', heatmap_bins='adaptive',
):
    """Return the complete JSON-safe model compared with the browser model."""
    contract = contract or load_plot_contract()
    records, applied_annotation = _coordinate_records(result, annotation)
    annotation_models = transcript_annotations_for_display(
        applied_annotation, transcript_annotations,
    )
    signal_count = resolve_bin_count(len(records), 'signal', signal_bins, contract)
    heatmap_count = resolve_bin_count(len(records), 'heatmap', heatmap_bins, contract)
    signal_bins, signal_minimum, signal_maximum, signal_count = _assign_bins(
        records, signal_count,
    )
    heatmap_bins, heatmap_minimum, heatmap_maximum, heatmap_count = _assign_bins(
        records, heatmap_count,
    )

    cs_summary = []
    snp_summary = []
    for bin_ in signal_bins:
        cs_values = [record['Cs'] for record in bin_]
        accessible = [record for record in bin_ if record['status'] & 1]
        cs_summary.append({
            'position': _mean(record['x'] for record in bin_),
            'mean': _mean(cs_values),
            'q10': _quantile(cs_values, 0.10),
            'q25': _quantile(cs_values, 0.25),
            'median': _quantile(cs_values, 0.50),
            'q75': _quantile(cs_values, 0.75),
            'q90': _quantile(cs_values, 0.90),
        })
        snp_summary.append({
            'position': _mean(record['x'] for record in bin_),
            'mean': _mean(record['snp'] for record in accessible),
            'accessibleFraction': len(accessible) / len(bin_),
        })

    source_width = len(records)
    cells = []
    for row in range(len(result['stackRows'])):
        row_cells = []
        for bin_ in heatmap_bins:
            values = [
                float(result['values']['stack'][row * source_width + record['index']])
                for record in bin_
            ]
            detected = [value for value in values if math.isfinite(value) and value != 0]
            row_cells.append({
                'identity': sum(detected) / len(detected) if detected else 0,
                'detectedFraction': len(detected) / len(bin_),
                'genomicStart': min(record['position'] for record in bin_),
                'genomicEnd': max(record['position'] for record in bin_),
            })
        cells.append(row_cells)

    return {
        'schemaVersion': contract['schema_version'],
        'contractId': contract['contract_id'],
        'chromosome': result['chromosome'],
        'start': result['start'],
        'end': result['end'],
        'annotationApplied': bool(applied_annotation),
        'signal': {
            'minimum': signal_minimum,
            'maximum': signal_maximum,
            'binCount': signal_count,
            'bins': [[record['index'] for record in bin_] for bin_ in signal_bins],
            'cs': cs_summary,
            'snp': snp_summary,
        },
        'heatmap': {
            'minimum': heatmap_minimum,
            'maximum': heatmap_maximum,
            'binCount': heatmap_count,
            'bins': [[record['index'] for record in bin_] for bin_ in heatmap_bins],
            'cells': cells,
        },
        'rendering': {
            'geometry': heatmap_geometry(
                len(result['stackRows']), heatmap_count, contract,
                annotation_count=len(annotation_models),
            ),
        },
    }


def _round_channel(value):
    return int(math.floor(float(value) + 0.5))


def interpolate_identity_rgb(identity, contract=None):
    contract = contract or load_plot_contract()
    bounded = max(0, min(1, float(identity) / 100))
    anchors = contract['palette']['viridis_anchors']
    lower, upper = anchors[0], anchors[-1]
    for index in range(1, len(anchors)):
        if bounded <= anchors[index][0]:
            lower, upper = anchors[index - 1], anchors[index]
            break
    fraction = (bounded - lower[0]) / (upper[0] - lower[0] or 1)
    return tuple(
        _round_channel(channel + (upper[1][index] - channel) * fraction)
        for index, channel in enumerate(lower[1])
    )


def blended_identity_rgb(identity, detected_fraction, contract=None):
    contract = contract or load_plot_contract()
    background = contract['palette']['no_interval_rgb']
    if not detected_fraction:
        return tuple(background)
    identity_rgb = interpolate_identity_rgb(identity, contract)
    strength = 0.35 + float(detected_fraction) * 0.65
    return tuple(
        _round_channel(background[index] + (channel - background[index]) * strength)
        for index, channel in enumerate(identity_rgb)
    )


def heatmap_geometry(row_count, bin_count, contract=None, annotation_count=0):
    contract = contract or load_plot_contract()
    layout = contract['heatmap_layout']
    plot_width = layout['plot_right'] - layout['plot_left']
    plot_height = row_count * layout['row_height']
    if annotation_count > 1:
        footer = max(
            layout['footer_single_annotation'],
            layout['footer_multi_annotation_base']
            + annotation_count * layout['transcript_row_height'],
        )
    elif annotation_count == 1:
        footer = layout['footer_single_annotation']
    else:
        footer = layout['footer_without_annotation']
    return {
        'width': layout['width'],
        'height': layout['row_top'] + plot_height + footer,
        'plotLeft': layout['plot_left'],
        'plotRight': layout['plot_right'],
        'plotWidth': plot_width,
        'plotHeight': plot_height,
        'rowTop': layout['row_top'],
        'rowHeight': layout['row_height'],
        'cellWidth': plot_width / bin_count,
    }
