"""Read AgamP4 conservation scores from local HDF5 or remote byte ranges."""

from contextlib import contextmanager
from pathlib import Path

import h5py
import pandas as pd

from .accessibility import accessibility_dataframe, open_accessibility_store


DATASET_FILENAME = 'AgamP4_conservation.h5'
REFERENCE_FILENAME = 'AgamP4_conservation.kerchunk.json'
DEFAULT_REMOTE_URL = (
    'https://zenodo.org/api/records/4304586/files/'
    'AgamP4_conservation.h5/content'
)
DATA_SOURCES = ('auto', 'local', 'remote')


def get_dataset_path():
    """Return the local HDF5 path, preferring the project data directory."""
    project_data_path = Path(__file__).resolve().parents[1] / 'data' / DATASET_FILENAME
    cwd_data_path = Path.cwd() / 'data' / DATASET_FILENAME

    for path in (project_data_path, cwd_data_path):
        if path.exists():
            return path

    checked_paths = f'{project_data_path} or {cwd_data_path}'
    raise FileNotFoundError(
        f'Dataset file does not exist. Download {DATASET_FILENAME} from the README link '
        f'and place it at {project_data_path}. Checked: {checked_paths}'
    )


def get_reference_path(reference_file=None):
    """Return the bundled Kerchunk reference index or a requested override."""
    if reference_file:
        path = Path(reference_file).expanduser().resolve()
        if path.exists():
            return path
        raise FileNotFoundError(f'Kerchunk reference index does not exist: {path}')

    package_path = Path(__file__).resolve().parent / 'data' / REFERENCE_FILENAME
    project_path = Path(__file__).resolve().parents[1] / 'data' / REFERENCE_FILENAME
    cwd_path = Path.cwd() / 'data' / REFERENCE_FILENAME

    for path in (package_path, project_path, cwd_path):
        if path.exists():
            return path

    raise FileNotFoundError(
        f'Kerchunk reference index does not exist. Checked: '
        f'{package_path}, {project_path}, or {cwd_path}'
    )


def parse_region(region_string):
    """Parse a one-based inclusive ``chromosome:start-end`` region."""
    try:
        chromosome, positions = region_string.split(':', maxsplit=1)
        start_text, end_text = positions.replace(',', '').split('-', maxsplit=1)
        start, end = int(start_text), int(end_text)
    except (AttributeError, TypeError, ValueError) as error:
        raise ValueError(
            f'Invalid region {region_string!r}; expected chromosome:start-end.'
        ) from error

    if not chromosome or start < 1 or end < start:
        raise ValueError(
            f'Invalid region {region_string!r}; coordinates must satisfy 1 <= start <= end.'
        )
    return chromosome, start, end


def _resolve_data_source(data_source):
    if data_source not in DATA_SOURCES:
        choices = ', '.join(DATA_SOURCES)
        raise ValueError(f'Unknown data source {data_source!r}; choose one of: {choices}.')

    if data_source != 'auto':
        return data_source

    try:
        get_dataset_path()
    except FileNotFoundError:
        return 'remote'
    return 'local'


@contextmanager
def open_score_store(data_source='auto', reference_file=None, remote_url=None):
    """Open the local HDF5 file or its remote Kerchunk/Zarr representation."""
    resolved_source = _resolve_data_source(data_source)
    if resolved_source == 'local':
        with h5py.File(get_dataset_path(), mode='r') as root:
            yield root
        return

    try:
        import fsspec
        import zarr
    except ImportError as error:
        raise ImportError(
            'Remote access requires fsspec[http] and zarr. Reinstall AgamCs '
            'with its current dependencies.'
        ) from error

    reference_path = get_reference_path(reference_file)
    template_overrides = None
    if remote_url:
        template_overrides = {'source': remote_url}

    filesystem = fsspec.filesystem(
        'reference',
        fo=str(reference_path),
        template_overrides=template_overrides,
        asynchronous=True,
        remote_options={'asynchronous': True},
        skip_instance_cache=True,
    )
    store = zarr.storage.FsspecStore(
        filesystem,
        path='',
        read_only=True,
    )
    root = zarr.open_group(
        store=store,
        mode='r',
        zarr_format=2,
    )
    yield root


def _column_names(array, dataset, values):
    row_names = dataset.attrs['rows']
    if values.shape[0] == 1:
        row_names = [row_names[0]]

    names = []
    for row_name in row_names:
        if isinstance(row_name, bytes):
            row_name = row_name.decode('utf-8')
        names.append(f'{array}_{row_name}')
    return names


def scores_dataframe(root, region, arrays, accessibility_root=None):
    """Extract a region from an HDF5- or Zarr-like root into a DataFrame."""
    chromosome, start, end = parse_region(region)
    array_names = arrays.split(',') if isinstance(arrays, str) else list(arrays)
    array_names = [name.strip() for name in array_names if name.strip()]
    if not array_names:
        raise ValueError('At least one score array must be requested.')

    if chromosome not in root:
        raise ValueError(f'Chromosome {chromosome!r} is not present in the dataset.')

    chromosome_group = root[chromosome]
    frames = []
    for array in array_names:
        if array not in chromosome_group:
            raise ValueError(f'Array {array!r} is not available for chromosome {chromosome}.')

        dataset = chromosome_group[array]
        chromosome_length = dataset.shape[1]
        if end > chromosome_length:
            raise ValueError(
                f'Region ends at {end:,}, beyond chromosome {chromosome} length '
                f'{chromosome_length:,}.'
            )

        values = dataset[:, start - 1:end]
        frames.append(pd.DataFrame(values.T, columns=_column_names(array, dataset, values)))

    combined_df = pd.concat(frames, axis=1)
    combined_df.insert(0, 'pos', range(start, end + 1))
    combined_df.insert(0, 'chromosome', chromosome)
    if accessibility_root is not None:
        status = accessibility_dataframe(accessibility_root, region, parse_region)
        combined_df.insert(2, 'is_accessible', status['is_accessible'].to_numpy())
        combined_df.insert(3, 'quality_status', status['quality_status'].to_numpy())
    return combined_df


def fetch_scores(
    region,
    arrays,
    output_file,
    data_source='auto',
    reference_file=None,
    remote_url=None,
    accessibility_file=None,
):
    """Fetch conservation scores and write them as a tab-separated file.

    ``data_source='auto'`` uses a local HDF5 file when available and otherwise
    streams the required compressed chunks from Zenodo through the bundled
    Kerchunk reference index. The archived score values are preserved while
    ``is_accessible`` and ``quality_status`` are joined from the read-only
    Ag1000G Phase 2 AR1 companion track.
    """
    with open_score_store(data_source, reference_file, remote_url) as root:
        with open_accessibility_store(accessibility_file) as accessibility_root:
            combined_df = scores_dataframe(
                root,
                region,
                arrays,
                accessibility_root=accessibility_root,
            )

    combined_df.to_csv(output_file, sep='\t', index=False)
    print(f'Saved to {output_file}')
    return combined_df
