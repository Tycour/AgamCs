#!/usr/bin/env python3
"""Build a compact Kerchunk index for remote AgamP4 range queries."""

import argparse
import json
from pathlib import Path

from kerchunk.hdf import SingleHdf5ToZarr
import numpy as np


DEFAULT_SOURCE_URL = (
    'https://zenodo.org/api/records/4304586/files/'
    'AgamP4_conservation.h5/content'
)
DEFAULT_ARRAYS = ('Cs', 'score', 'snp_density', 'stack', 'stack_norm', 'phyloP')
CHROMOSOMES = ('2L', '2R', '3L', '3R', 'X')
REMOTE_CHUNK_BASES = 65_536


def _keep_reference(key, arrays):
    if key == '.zgroup':
        return True
    if key in {f'{chromosome}/.zgroup' for chromosome in CHROMOSOMES}:
        return True
    return any(
        key.startswith(f'{chromosome}/{array}/')
        for chromosome in CHROMOSOMES
        for array in arrays
    )


def _rechunk_contiguous_array(references, array_path, chunk_bases=REMOTE_CHUNK_BASES):
    """Split one uncompressed HDF5 byte range into virtual Zarr chunks."""
    metadata_key = f'{array_path}/.zarray'
    attributes_key = f'{array_path}/.zattrs'
    original_chunk_key = f'{array_path}/0.0'
    if metadata_key not in references or original_chunk_key not in references:
        return

    metadata = json.loads(references[metadata_key])
    if metadata['compressor'] is not None or metadata['shape'][0] != 1:
        return

    source_url, byte_offset, byte_length = references.pop(original_chunk_key)
    item_size = np.dtype(metadata['dtype']).itemsize
    array_length = metadata['shape'][1]
    expected_bytes = array_length * item_size
    if byte_length != expected_bytes:
        raise ValueError(
            f'{array_path} contains {byte_length} bytes; expected {expected_bytes}.'
        )

    metadata['chunks'] = [1, min(chunk_bases, array_length)]
    references[metadata_key] = json.dumps(metadata, separators=(',', ':'))

    # Kerchunk flattens a one-item HDF5 string array to a scalar. Retain the
    # original list shape so the remote TSV column matches the local reader.
    attributes = json.loads(references[attributes_key])
    if isinstance(attributes.get('rows'), str):
        attributes['rows'] = [attributes['rows']]
        references[attributes_key] = json.dumps(attributes, separators=(',', ':'))

    for chunk_index, start in enumerate(range(0, array_length, chunk_bases)):
        chunk_length = min(chunk_bases, array_length - start)
        references[f'{array_path}/0.{chunk_index}'] = [
            source_url,
            byte_offset + start * item_size,
            chunk_length * item_size,
        ]


def build_reference(input_path, output_path, source_url, arrays):
    """Translate selected HDF5 arrays into a compact reference-spec document."""
    with input_path.open('rb') as stream:
        translator = SingleHdf5ToZarr(
            stream,
            source_url,
            inline_threshold=300,
        )
        references = translator.translate()
        translator.close()

    if 'phyloP' in arrays:
        for chromosome in CHROMOSOMES:
            _rechunk_contiguous_array(references['refs'], f'{chromosome}/phyloP')

    selected = {
        key: value
        for key, value in references['refs'].items()
        if _keep_reference(key, arrays)
    }
    for value in selected.values():
        if isinstance(value, list) and value and value[0] == source_url:
            value[0] = '{{source}}'

    compact = {
        'version': 1,
        'templates': {'source': source_url},
        'refs': selected,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(compact, separators=(',', ':'), sort_keys=True),
        encoding='utf-8',
    )
    return len(selected)


def main():
    project_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--input',
        type=Path,
        default=project_root / 'data' / 'AgamP4_conservation.h5',
        help='Local source HDF5 used to discover chunk offsets.',
    )
    parser.add_argument(
        '--output',
        type=Path,
        default=project_root / 'AgamCs' / 'data' / 'AgamP4_conservation.kerchunk.json',
        help='Destination for the compact reference JSON.',
    )
    parser.add_argument(
        '--source-url',
        default=DEFAULT_SOURCE_URL,
        help='Immutable remote URL that contains the same HDF5 bytes.',
    )
    parser.add_argument(
        '--arrays',
        nargs='+',
        default=DEFAULT_ARRAYS,
        help='HDF5 arrays to expose through the prototype.',
    )
    args = parser.parse_args()

    if not args.input.exists():
        parser.error(f'input file does not exist: {args.input}')

    count = build_reference(
        args.input.resolve(),
        args.output.resolve(),
        args.source_url,
        tuple(args.arrays),
    )
    print(f'Wrote {count:,} references to {args.output}')


if __name__ == '__main__':
    main()
