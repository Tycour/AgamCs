from contextlib import contextmanager

import h5py
import numpy as np
import pandas as pd
import pytest

from AgamCs import fetch_score


def make_test_hdf5(path):
    with h5py.File(path, 'w') as root:
        chromosome = root.create_group('3R')

        cs = chromosome.create_dataset('Cs', data=np.array([[0.1, 0.2, 0.3, 0.4]]))
        cs.attrs['rows'] = 'Cs'

        snp = chromosome.create_dataset(
            'snp_density',
            data=np.array([[1.0, 0.5, 0.25, 0.0]]),
        )
        snp.attrs['rows'] = 'snp_density'

        stack = chromosome.create_dataset(
            'stack',
            data=np.array([[10, 20, 30, 40], [50, 60, 70, 80]]),
        )
        stack.attrs['rows'] = np.array(['species_a', 'species_b'], dtype=object)


def test_parse_region_accepts_commas_and_rejects_invalid_coordinates():
    assert fetch_score.parse_region('3R:1,000-2,000') == ('3R', 1000, 2000)

    with pytest.raises(ValueError, match='1 <= start <= end'):
        fetch_score.parse_region('3R:0-10')
    with pytest.raises(ValueError, match='expected chromosome:start-end'):
        fetch_score.parse_region('not-a-region')


def test_scores_dataframe_works_with_an_hdf5_like_store(tmp_path):
    hdf5_path = tmp_path / 'scores.h5'
    make_test_hdf5(hdf5_path)

    with h5py.File(hdf5_path, 'r') as root:
        frame = fetch_score.scores_dataframe(
            root,
            '3R:2-3',
            'Cs,snp_density,stack',
        )

    assert frame.columns.tolist() == [
        'chromosome',
        'pos',
        'Cs_C',
        'snp_density_s',
        'stack_species_a',
        'stack_species_b',
    ]
    assert frame['pos'].tolist() == [2, 3]
    assert frame['stack_species_b'].tolist() == [60, 70]


def test_fetch_scores_queries_bundled_accessibility_columns_without_masking_density(
    tmp_path,
    monkeypatch,
):
    hdf5_path = tmp_path / 'scores.h5'
    output_path = tmp_path / 'scores.tsv'
    make_test_hdf5(hdf5_path)
    monkeypatch.setattr(fetch_score, 'get_dataset_path', lambda: hdf5_path)

    frame = fetch_score.fetch_scores(
        '3R:1-3',
        'snp_density',
        output_path,
        data_source='local',
    )

    assert frame.columns[:5].tolist() == [
        'chromosome',
        'pos',
        'is_accessible',
        'quality_status',
        'snp_density_s',
    ]
    assert frame['is_accessible'].dtype == bool
    assert frame['quality_status'].str.len().gt(0).all()
    assert frame['snp_density_s'].tolist() == pytest.approx([1.0, 0.5, 0.25])


def test_fetch_scores_passes_remote_configuration_and_writes_tsv(tmp_path, monkeypatch):
    hdf5_path = tmp_path / 'scores.h5'
    output_path = tmp_path / 'scores.tsv'
    make_test_hdf5(hdf5_path)
    observed = {}

    @contextmanager
    def fake_open(data_source, reference_file, remote_url):
        observed.update({
            'data_source': data_source,
            'reference_file': reference_file,
            'remote_url': remote_url,
        })
        with h5py.File(hdf5_path, 'r') as root:
            yield root

    monkeypatch.setattr(fetch_score, 'open_score_store', fake_open)
    frame = fetch_score.fetch_scores(
        '3R:1-2',
        'Cs,snp_density,stack',
        output_path,
        data_source='remote',
        reference_file='index.json',
        remote_url='https://example.test/data.h5',
    )

    assert observed == {
        'data_source': 'remote',
        'reference_file': 'index.json',
        'remote_url': 'https://example.test/data.h5',
    }
    pd.testing.assert_frame_equal(pd.read_csv(output_path, sep='\t'), frame)


def test_auto_source_prefers_local_data(monkeypatch):
    monkeypatch.setattr(fetch_score, 'get_dataset_path', lambda: 'local.h5')
    assert fetch_score._resolve_data_source('auto') == 'local'


def test_auto_source_falls_back_to_remote(monkeypatch):
    def missing_dataset():
        raise FileNotFoundError

    monkeypatch.setattr(fetch_score, 'get_dataset_path', missing_dataset)
    assert fetch_score._resolve_data_source('auto') == 'remote'
