#!/usr/bin/env python3
"""Build the compact Ag1000G Phase 2 AR1 accessibility companion track."""

import argparse
from contextlib import contextmanager
from pathlib import Path

import fsspec
import h5py
import numpy as np

from AgamCs.accessibility import FORMAT_NAME, FORMAT_VERSION, STATUS_FIELDS, encode_status


DEFAULT_SOURCE = (
    'https://ngs.sanger.ac.uk/production/ag1000g/phase2/AR1/'
    'accessibility/accessibility.h5'
)
SOURCE_RELEASE = 'Ag1000G Phase 2 AR1'
SOURCE_ASSEMBLY = 'AgamP4'
SOURCE_LAST_MODIFIED = '2016-07-04T16:45:20Z'
SOURCE_CONTENT_LENGTH = 2_005_427_410
CHROMOSOMES = ('2L', '2R', '3L', '3R', 'X')
OUTPUT_CHUNK_BASES = 65_536
READ_CHUNK_BASES = 1_048_576


@contextmanager
def open_source(source):
    """Open a local path or HTTP(S) HDF5 source without copying it."""
    source_text = str(source)
    if source_text.startswith(('http://', 'https://')):
        with fsspec.open(
            source_text,
            mode='rb',
            block_size=1_048_576,
            cache_type='blockcache',
        ) as stream:
            with h5py.File(stream, mode='r') as root:
                yield root
        return

    with h5py.File(Path(source).expanduser().resolve(), mode='r') as root:
        yield root


def _validate_chromosome(group, chromosome):
    missing = [field for field in ('pos', *STATUS_FIELDS) if field not in group]
    if missing:
        raise ValueError(
            f'{chromosome} is missing source arrays: {", ".join(missing)}.'
        )

    length = group['is_accessible'].shape[0]
    for field in STATUS_FIELDS:
        dataset = group[field]
        if dataset.shape != (length,):
            raise ValueError(
                f'{chromosome}/{field} has shape {dataset.shape}; expected {(length,)}.'
            )
        if dataset.dtype.kind != 'b':
            raise ValueError(
                f'{chromosome}/{field} has dtype {dataset.dtype}; expected boolean.'
            )

    positions = group['pos']
    if positions.shape != (length,):
        raise ValueError(
            f'{chromosome}/pos has shape {positions.shape}; expected {(length,)}.'
        )
    if int(positions[0]) != 1 or int(positions[-1]) != length:
        raise ValueError(
            f'{chromosome}/pos is not a one-based array spanning 1-{length}.'
        )
    return length


def build_track(source, output_path, chromosomes=CHROMOSOMES, progress=None):
    """Pack and chunk-compress the published accessibility and filter arrays."""
    output_path = Path(output_path).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open_source(source) as source_root, h5py.File(output_path, mode='w') as output:
        output.attrs['format'] = FORMAT_NAME
        output.attrs['format_version'] = FORMAT_VERSION
        output.attrs['assembly'] = SOURCE_ASSEMBLY
        output.attrs['source_release'] = SOURCE_RELEASE
        output.attrs['source_url'] = str(source)
        output.attrs['source_last_modified'] = SOURCE_LAST_MODIFIED
        output.attrs['source_content_length'] = SOURCE_CONTENT_LENGTH
        output.attrs['status_fields'] = STATUS_FIELDS

        for chromosome in chromosomes:
            if chromosome not in source_root:
                raise ValueError(f'Source does not contain chromosome {chromosome}.')
            source_group = source_root[chromosome]
            length = _validate_chromosome(source_group, chromosome)
            output_group = output.create_group(chromosome)
            status_dataset = output_group.create_dataset(
                'status',
                shape=(length,),
                dtype=np.uint8,
                chunks=(min(OUTPUT_CHUNK_BASES, length),),
                compression='gzip',
                compression_opts=9,
                shuffle=True,
            )
            status_dataset.attrs['status_fields'] = STATUS_FIELDS

            counts = {field: 0 for field in STATUS_FIELDS}
            for start in range(0, length, READ_CHUNK_BASES):
                end = min(start + READ_CHUNK_BASES, length)
                arrays = {
                    field: np.asarray(source_group[field][start:end], dtype=np.bool_)
                    for field in STATUS_FIELDS
                }
                encoded = encode_status(arrays)
                expected_accessible = ~np.logical_or.reduce(
                    [arrays[field] for field in STATUS_FIELDS[1:]]
                )
                if not np.array_equal(arrays['is_accessible'], expected_accessible):
                    mismatch = int(np.count_nonzero(
                        arrays['is_accessible'] != expected_accessible
                    ))
                    raise ValueError(
                        f'{chromosome}:{start + 1}-{end} contains {mismatch:,} '
                        'positions where is_accessible disagrees with the filter arrays.'
                    )

                status_dataset[start:end] = encoded
                for field, values in arrays.items():
                    counts[field] += int(np.count_nonzero(values))

            output_group.attrs['length'] = length
            for field, count in counts.items():
                output_group.attrs[f'{field}_bases'] = count
            if progress:
                progress(chromosome, length, counts['is_accessible'])

    return output_path


def main():
    project_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--source',
        default=DEFAULT_SOURCE,
        help='Published local or HTTP(S) accessibility.h5 source.',
    )
    parser.add_argument(
        '--output',
        type=Path,
        default=(
            project_root
            / 'AgamCs'
            / 'data'
            / 'Ag1000G_phase2_AR1_accessibility.h5'
        ),
        help='Destination for the compressed companion track.',
    )
    parser.add_argument(
        '--chromosomes',
        nargs='+',
        default=CHROMOSOMES,
        help='AgamP4 chromosome arms to include.',
    )
    args = parser.parse_args()
    path = build_track(
        args.source,
        args.output,
        tuple(args.chromosomes),
        progress=lambda chromosome, length, accessible: print(
            f'Packed {chromosome}: {accessible:,}/{length:,} accessible bases',
            flush=True,
        ),
    )
    print(f'Wrote accessibility companion track to {path}')


if __name__ == '__main__':
    main()
