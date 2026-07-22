"""Read the compact Ag1000G Phase 2 AR1 accessibility companion track.

The bundled track stores one status byte per AgamP4 base. Bit zero preserves
the published ``is_accessible`` value and bits one through seven preserve the
published boolean ``filter_*`` arrays. The byte is a companion annotation;
it never replaces or rewrites the archived SNP-density values.
"""

from contextlib import contextmanager
from pathlib import Path

import h5py
import numpy as np
import pandas as pd


ACCESSIBILITY_FILENAME = 'Ag1000G_phase2_AR1_accessibility.h5'
FORMAT_NAME = 'AgamCs accessibility status track'
FORMAT_VERSION = 1

# Keep this order stable: the builder and reader use the index as the bit
# position. There are exactly eight published boolean values, so each genomic
# position occupies one byte before HDF5 chunk compression.
STATUS_FIELDS = (
    'is_accessible',
    'filter_dust',
    'filter_high_coverage',
    'filter_high_mq0',
    'filter_low_coverage',
    'filter_low_mq',
    'filter_n',
    'filter_no_coverage',
)

FILTER_LABELS = {
    'filter_dust': 'RepeatDUST',
    'filter_high_coverage': 'HighCoverage',
    'filter_high_mq0': 'HighMQ0',
    'filter_low_coverage': 'LowCoverage',
    'filter_low_mq': 'LowMQ',
    'filter_n': 'RefN',
    'filter_no_coverage': 'NoCoverage',
}


def get_accessibility_path(accessibility_file=None):
    """Return a requested track or the bundled read-only companion track."""
    if accessibility_file:
        path = Path(accessibility_file).expanduser().resolve()
        if path.exists():
            return path
        raise FileNotFoundError(f'Accessibility companion track does not exist: {path}')

    package_path = Path(__file__).resolve().parent / 'data' / ACCESSIBILITY_FILENAME
    project_path = Path(__file__).resolve().parents[1] / 'data' / ACCESSIBILITY_FILENAME
    cwd_path = Path.cwd() / 'data' / ACCESSIBILITY_FILENAME
    for path in (package_path, project_path, cwd_path):
        if path.exists():
            return path

    raise FileNotFoundError(
        'Accessibility companion track does not exist. Checked: '
        f'{package_path}, {project_path}, or {cwd_path}. '
        'Rebuild it with tools/build_accessibility_track.py.'
    )


def _text_attribute(value):
    if isinstance(value, bytes):
        return value.decode('utf-8')
    return str(value)


def _validate_store(root):
    format_name = _text_attribute(root.attrs.get('format', ''))
    format_version = int(root.attrs.get('format_version', -1))
    fields = tuple(_text_attribute(value) for value in root.attrs.get('status_fields', ()))
    if format_name != FORMAT_NAME or format_version != FORMAT_VERSION:
        raise ValueError(
            'Unsupported accessibility companion track format: '
            f'{format_name!r} version {format_version}.'
        )
    if fields != STATUS_FIELDS:
        raise ValueError(
            'Accessibility companion track uses an incompatible status-bit schema.'
        )


@contextmanager
def open_accessibility_store(accessibility_file=None):
    """Open and validate the companion HDF5 in read-only mode."""
    path = get_accessibility_path(accessibility_file)
    with h5py.File(path, mode='r') as root:
        _validate_store(root)
        yield root


def encode_status(arrays):
    """Pack the eight published boolean arrays into a uint8 status array."""
    missing = [field for field in STATUS_FIELDS if field not in arrays]
    if missing:
        raise ValueError(f'Missing accessibility arrays: {", ".join(missing)}.')

    encoded = None
    expected_shape = None
    for bit, field in enumerate(STATUS_FIELDS):
        values = np.asarray(arrays[field], dtype=np.bool_)
        if expected_shape is None:
            expected_shape = values.shape
            encoded = np.zeros(expected_shape, dtype=np.uint8)
        elif values.shape != expected_shape:
            raise ValueError(
                f'Accessibility array {field!r} has shape {values.shape}; '
                f'expected {expected_shape}.'
            )
        encoded |= values.astype(np.uint8) << bit
    return encoded


def decode_quality_status(status):
    """Decode status bytes into PASS or published VCF FILTER labels."""
    status = np.asarray(status, dtype=np.uint8)
    labels = []
    for code in range(256):
        accessible = bool(code & 1)
        failures = [
            FILTER_LABELS[field]
            for bit, field in enumerate(STATUS_FIELDS[1:], start=1)
            if code & (1 << bit)
        ]
        if accessible and not failures:
            label = 'PASS'
        elif accessible:
            label = f'INCONSISTENT:{";".join(failures)}'
        elif failures:
            label = ';'.join(failures)
        else:
            label = 'INACCESSIBLE'
        labels.append(label)
    lookup = np.asarray(labels, dtype=object)
    return lookup[status]


def accessibility_dataframe(root, region, parse_region):
    """Extract base-level accessibility and QC status for an inclusive region."""
    chromosome, start, end = parse_region(region)
    if chromosome not in root:
        raise ValueError(
            f'Chromosome {chromosome!r} is not present in the accessibility track.'
        )

    group = root[chromosome]
    if 'status' not in group:
        raise ValueError(
            f'Accessibility status is unavailable for chromosome {chromosome}.'
        )
    dataset = group['status']
    if end > dataset.shape[0]:
        raise ValueError(
            f'Region ends at {end:,}, beyond accessibility track chromosome '
            f'{chromosome} length {dataset.shape[0]:,}.'
        )

    status = np.asarray(dataset[start - 1:end], dtype=np.uint8)
    return pd.DataFrame({
        'is_accessible': (status & 1).astype(bool),
        'quality_status': decode_quality_status(status),
    })
