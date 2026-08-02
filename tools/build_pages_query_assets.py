#!/usr/bin/env python3
"""Build the compact browser-query index and local HDF5 validation fixture."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import h5py
import numpy as np


CHROMOSOMES = ('2L', '2R', '3L', '3R', 'X')
ARRAYS = ('Cs', 'snp_density')
DEFAULT_REGION = ('2L', 28_585_064, 28_586_748)
MAX_QUERY_BASES = 20_000
SOURCE_DOI = 'https://doi.org/10.5281/zenodo.4304586'


def compact_reference(source: dict) -> dict:
    """Retain only the metadata and ranges needed by the Pages benchmark."""
    prefixes = tuple(
        f'{chromosome}/{array}/'
        for chromosome in CHROMOSOMES
        for array in ARRAYS
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


def validation_fixture(hdf5_path: Path) -> dict:
    chromosome, start, end = DEFAULT_REGION
    arrays = {}
    with h5py.File(hdf5_path, 'r') as root:
        for name in ARRAYS:
            values = np.asarray(root[chromosome][name][:, start - 1:end], dtype='<f4')
            arrays[name] = {
                'count': int(values.size),
                'sha256_le_float32': hashlib.sha256(values.tobytes(order='C')).hexdigest(),
            }
    return {
        'schema_version': 1,
        'assembly': 'AgamP4',
        'source': 'AgamP4_conservation.h5',
        'region': f'{chromosome}:{start}-{end}',
        'arrays': arrays,
    }


def query_manifest(reference: dict) -> dict:
    """Describe the stable public contract consumed by the Pages client."""
    chromosomes = {}
    for chromosome in CHROMOSOMES:
        metadata = json.loads(reference['refs'][f'{chromosome}/Cs/.zarray'])
        chromosomes[chromosome] = {'length': int(metadata['shape'][1])}
    return {
        'schema_version': 1,
        'assembly': 'AgamP4',
        'coordinate_convention': '1-based inclusive',
        'maximum_query_bases': MAX_QUERY_BASES,
        'arrays': list(ARRAYS),
        'chromosomes': chromosomes,
        'source': {
            'filename': 'AgamP4_conservation.h5',
            'doi': SOURCE_DOI,
            'url': reference['templates']['source'],
        },
        'accessibility': {
            'available': False,
            'note': 'Not joined in Stage 7; SNP density is archived and unmodified.',
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
        '--output-directory', type=Path, default=root / 'docs/assets/data',
    )
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()

    reference = compact_reference(json.loads(args.source_reference.read_text()))
    outputs = {
        args.output_directory / 'score-reference.json': serialized(reference),
        args.output_directory / 'query-manifest.json': serialized(query_manifest(reference)),
    }
    if args.hdf5.exists():
        outputs[args.output_directory / 'query-validation.json'] = serialized(
            validation_fixture(args.hdf5)
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
