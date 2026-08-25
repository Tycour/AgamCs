#!/usr/bin/env python3
"""Build the compact browser-query index and local HDF5 validation fixture."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import h5py
import numpy as np
import pandas as pd
from kerchunk.hdf import SingleHdf5ToZarr

from AgamCs.plot_signal_summary import _bin_signal, _bin_snp_signal
from AgamCs.species_topology import SPECIES_TOPOLOGY


CHROMOSOMES = ('2L', '2R', '3L', '3R', 'X')
SCORE_ARRAYS = ('Cs', 'snp_density', 'stack')
VALIDATION_ARRAYS = ('Cs', 'snp_density', 'stack', 'status')
DEFAULT_REGION = ('2L', 28_585_064, 28_586_748)
MAX_QUERY_BASES = 50_000
SIGNAL_DISPLAY_BINS = 240
HEATMAP_DISPLAY_BINS = 500
SOURCE_DOI = 'https://doi.org/10.5281/zenodo.4304586'
ACCESSIBILITY_SOURCE_URL = (
    'https://raw.githubusercontent.com/Tycour/AgamCs/'
    '39e233bf4d8e517e4f51e30e3da1444cd7a6e9b6/'
    'AgamCs/data/Ag1000G_phase2_AR1_accessibility.h5'
)
ACCESSIBILITY_SHA256 = (
    '00fc146b977233c537d6189db891be55153038033d922014804ef5210acb260a'
)
RELEASE_VALIDATION_CASES = (
    {
        'id': 'plus-gene-2l', 'chromosome': '2L',
        'start': 28_585_064, 'end': 28_586_748,
        'accession': 'AGAP006241', 'strand': 1,
        'purpose': 'Plus-strand pinned gene and Python plot fixture.',
        'expected_qc': 'partly_accessible',
    },
    {
        'id': 'mixed-manual-2r', 'chromosome': '2R',
        'start': 30_000_000, 'end': 30_000_199,
        'purpose': 'Representative manual-coordinate query on 2R.',
        'expected_qc': 'partly_accessible',
    },
    {
        'id': 'fully-accessible-gene-3l', 'chromosome': '3L',
        'start': 2_905_395, 'end': 2_905_525,
        'accession': 'AGAP013705', 'strand': 1,
        'purpose': 'Fully accessible non-coding pinned gene.',
        'expected_qc': 'fully_accessible',
    },
    {
        'id': 'unavailable-gene-3l', 'chromosome': '3L',
        'start': 3_855_186, 'end': 3_858_609,
        'accession': 'AGAP010449', 'strand': -1,
        'purpose': 'Pinned gene with no accessible bases; SNP interpretation remains unknown.',
        'expected_qc': 'no_accessible_bases',
    },
    {
        'id': 'minus-gene-3r', 'chromosome': '3R',
        'start': 5_886_340, 'end': 5_904_286,
        'accession': 'AGAP008118', 'strand': -1,
        'purpose': 'Minus-strand pinned gene shown in 5-prime to 3-prime orientation.',
        'expected_qc': 'partly_accessible',
    },
    {
        'id': 'fully-accessible-manual-x', 'chromosome': 'X',
        'start': 10_000_000, 'end': 10_000_199,
        'purpose': 'Fully accessible manual-coordinate query on X.',
        'expected_qc': 'fully_accessible',
    },
    {
        'id': 'left-boundary-2l', 'chromosome': '2L',
        'start': 1, 'end': 21,
        'purpose': 'Inclusive left chromosome boundary.',
        'expected_qc': 'no_accessible_bases',
    },
    {
        'id': 'right-boundary-x', 'chromosome': 'X',
        'start': 24_393_088, 'end': 24_393_108,
        'purpose': 'Inclusive right chromosome boundary.',
        'expected_qc': 'no_accessible_bases',
    },
)


def compact_reference(source: dict) -> dict:
    """Retain only the metadata and ranges needed by the Pages benchmark."""
    prefixes = tuple(
        f'{chromosome}/{array}/'
        for chromosome in CHROMOSOMES
        for array in SCORE_ARRAYS
    )
    refs = {
        key: value
        for key, value in source['refs'].items()
        if key.startswith(prefixes)
    }
    return {
        'version': source['version'],
        'templates': source['templates'],
        'refs': refs,
    }


def accessibility_reference(hdf5_path: Path) -> dict:
    """Build byte-range references for the compact QC companion HDF5."""
    with hdf5_path.open('rb') as stream:
        translator = SingleHdf5ToZarr(
            stream,
            ACCESSIBILITY_SOURCE_URL,
            inline_threshold=300,
        )
        translated = translator.translate()
        translator.close()

    prefixes = tuple(f'{chromosome}/status/' for chromosome in CHROMOSOMES)
    refs = {
        key: value
        for key, value in translated['refs'].items()
        if key.startswith(prefixes)
    }
    for value in refs.values():
        if isinstance(value, list) and value and value[0] == ACCESSIBILITY_SOURCE_URL:
            value[0] = '{{source}}'
    return {
        'version': 1,
        'templates': {'source': ACCESSIBILITY_SOURCE_URL},
        'refs': refs,
    }


def _digest(values: np.ndarray) -> dict:
    contiguous = np.ascontiguousarray(values)
    return {
        'count': int(contiguous.size),
        'dtype': str(contiguous.dtype),
        'sha256_bytes': hashlib.sha256(contiguous.tobytes(order='C')).hexdigest(),
    }


def _qc_class(status: np.ndarray) -> str:
    accessible = int(np.count_nonzero((status & 1) == 1))
    if accessible == len(status):
        return 'fully_accessible'
    if accessible == 0:
        return 'no_accessible_bases'
    return 'partly_accessible'


def validation_fixture(hdf5_path: Path, accessibility_path: Path) -> dict:
    """Pin exact Python-reader hashes across the Stage 10 release matrix."""
    cases = []
    with h5py.File(hdf5_path, 'r') as scores, h5py.File(accessibility_path, 'r') as qc:
        for specification in RELEASE_VALIDATION_CASES:
            chromosome = specification['chromosome']
            start = specification['start']
            end = specification['end']
            arrays = {
                name: _digest(np.asarray(
                    scores[chromosome][name][:, start - 1:end], dtype='<f4'
                ))
                for name in SCORE_ARRAYS
            }
            status = np.asarray(qc[chromosome]['status'][start - 1:end], dtype='u1')
            arrays['status'] = _digest(status)
            qc_class = _qc_class(status)
            if qc_class != specification['expected_qc']:
                raise ValueError(
                    f"{specification['id']} QC changed: expected "
                    f"{specification['expected_qc']}, found {qc_class}."
                )
            accessible_bases = int(np.count_nonzero((status & 1) == 1))
            cases.append({
                **specification,
                'region': f'{chromosome}:{start}-{end}',
                'bases': end - start + 1,
                'accessible_bases': accessible_bases,
                'accessible_fraction': accessible_bases / len(status),
                'arrays': arrays,
            })
    return {
        'schema_version': 3,
        'assembly': 'AgamP4',
        'source': 'AgamP4_conservation.h5',
        'accessibility_source': 'Ag1000G_phase2_AR1_accessibility.h5',
        'default_case': RELEASE_VALIDATION_CASES[0]['id'],
        'cases': cases,
    }


def _json_records(frame: pd.DataFrame) -> list[dict]:
    records = []
    for record in frame.to_dict(orient='records'):
        records.append({
            key: None if pd.isna(value) else float(value)
            for key, value in record.items()
        })
    return records


def plot_validation_fixture(hdf5_path: Path, accessibility_path: Path) -> dict:
    """Generate golden display summaries through the existing Python contract."""
    chromosome, start, end = DEFAULT_REGION
    with h5py.File(hdf5_path, 'r') as root:
        cs_values = np.asarray(root[chromosome]['Cs'][0, start - 1:end], dtype='<f4')
        snp_values = np.asarray(
            root[chromosome]['snp_density'][0, start - 1:end], dtype='<f4'
        )
        stack = np.asarray(root[chromosome]['stack'][:, start - 1:end], dtype='<f4')
    with h5py.File(accessibility_path, 'r') as root:
        status = np.asarray(root[chromosome]['status'][start - 1:end], dtype='u1')

    positions = pd.Series(np.arange(end - start + 1, dtype=float))
    accessible = pd.Series((status & 1) == 1)
    signal = _bin_signal(positions, pd.Series(cs_values), bins=SIGNAL_DISPLAY_BINS)
    snp = _bin_snp_signal(
        positions, pd.Series(snp_values), accessible, bins=SIGNAL_DISPLAY_BINS
    )

    span = len(positions) - 1
    bin_count = min(HEATMAP_DISPLAY_BINS, len(positions))
    bin_indices = np.minimum(
        bin_count - 1,
        np.floor(positions.to_numpy() * bin_count / span).astype(int),
    ) if span else np.zeros(len(positions), dtype=int)
    heatmap = []
    for row in stack:
        row_summary = []
        for bin_index in range(bin_count):
            values = row[bin_indices == bin_index]
            detected = values[np.isfinite(values) & (values != 0)]
            row_summary.append({
                'identity': float(detected.mean()) if detected.size else 0.0,
                'detectedFraction': float(detected.size / values.size),
            })
        heatmap.append(row_summary)

    return {
        'schema_version': 1,
        'region': f'{chromosome}:{start}-{end}',
        'signal_bins': SIGNAL_DISPLAY_BINS,
        'heatmap_bins': HEATMAP_DISPLAY_BINS,
        'cs': _json_records(signal),
        'snp': _json_records(snp),
        'heatmap': heatmap,
    }


def query_manifest(reference: dict, qc_reference: dict) -> dict:
    """Describe the stable public contract consumed by the Pages client."""
    chromosomes = {}
    for chromosome in CHROMOSOMES:
        metadata = json.loads(reference['refs'][f'{chromosome}/Cs/.zarray'])
        chromosomes[chromosome] = {'length': int(metadata['shape'][1])}
    stack_attributes = json.loads(reference['refs']['2L/stack/.zattrs'])
    status_attributes = json.loads(qc_reference['refs']['2L/status/.zattrs'])
    return {
        'schema_version': 2,
        'assembly': 'AgamP4',
        'coordinate_convention': '1-based inclusive',
        'maximum_query_bases': MAX_QUERY_BASES,
        'arrays': list(SCORE_ARRAYS),
        'chromosomes': chromosomes,
        'source': {
            'filename': 'AgamP4_conservation.h5',
            'doi': SOURCE_DOI,
            'url': reference['templates']['source'],
        },
        'stack': {
            'rows': stack_attributes['rows'],
            'species': stack_attributes['species'],
            'units': 'Identity (%)',
            'zero_semantics': 'No detected CNEr interval; not measured 0% identity.',
            'topology': SPECIES_TOPOLOGY,
        },
        'accessibility': {
            'available': True,
            'filename': 'Ag1000G_phase2_AR1_accessibility.h5',
            'source_release': 'Ag1000G Phase 2 AR1',
            'source_url': ACCESSIBILITY_SOURCE_URL,
            'sha256': ACCESSIBILITY_SHA256,
            'status_fields': status_attributes['status_fields'],
            'note': (
                'Joined as a separate QC companion; raw SNP density remains '
                'unchanged and failed positions are unknown.'
            ),
        },
    }


def serialized(value: dict) -> str:
    return json.dumps(value, separators=(',', ':'), sort_keys=True) + '\n'


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--source-reference', type=Path,
        default=root / 'AgamCs/data/AgamP4_conservation.kerchunk.json',
    )
    parser.add_argument(
        '--hdf5', type=Path, default=root / 'data/AgamP4_conservation.h5',
    )
    parser.add_argument(
        '--accessibility-hdf5', type=Path,
        default=root / 'AgamCs/data/Ag1000G_phase2_AR1_accessibility.h5',
    )
    parser.add_argument(
        '--output-directory', type=Path, default=root / 'docs/assets/data',
    )
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()

    reference = compact_reference(json.loads(args.source_reference.read_text()))
    qc_reference = accessibility_reference(args.accessibility_hdf5)
    outputs = {
        args.output_directory / 'score-reference.json': serialized(reference),
        args.output_directory / 'accessibility-reference.json': serialized(qc_reference),
        args.output_directory / 'query-manifest.json': serialized(
            query_manifest(reference, qc_reference)
        ),
    }
    if args.hdf5.exists():
        outputs[args.output_directory / 'query-validation.json'] = serialized(
            validation_fixture(args.hdf5, args.accessibility_hdf5)
        )
        outputs[args.output_directory / 'plot-validation.json'] = serialized(
            plot_validation_fixture(args.hdf5, args.accessibility_hdf5)
        )
    elif not (args.output_directory / 'query-validation.json').exists():
        parser.error(f'HDF5 source is required to create validation data: {args.hdf5}')

    if args.verify:
        mismatches = [path for path, text in outputs.items() if not path.exists() or path.read_text() != text]
        if mismatches:
            parser.error('generated query assets are stale: ' + ', '.join(map(str, mismatches)))
        print(f'Verified {len(outputs)} browser-query assets.')
        return

    args.output_directory.mkdir(parents=True, exist_ok=True)
    for path, text in outputs.items():
        path.write_text(text)
        print(f'Wrote {path} ({len(text):,} bytes)')


if __name__ == '__main__':
    main()
