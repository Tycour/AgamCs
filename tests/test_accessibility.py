import h5py
import numpy as np
import pytest

from AgamCs import accessibility, fetch_score
from tools.build_accessibility_track import build_track


def make_accessibility_source(path):
    with h5py.File(path, mode='w') as root:
        chromosome = root.create_group('3R')
        chromosome.create_dataset('pos', data=np.arange(1, 5, dtype=np.int64))
        values = {
            'is_accessible': [True, False, False, True],
            'filter_dust': [False, False, True, False],
            'filter_high_coverage': [False] * 4,
            'filter_high_mq0': [False] * 4,
            'filter_low_coverage': [False, True, False, False],
            'filter_low_mq': [False] * 4,
            'filter_n': [False] * 4,
            'filter_no_coverage': [False] * 4,
        }
        for name, data in values.items():
            chromosome.create_dataset(name, data=np.asarray(data, dtype=np.bool_))


def test_builder_packs_source_arrays_and_reader_decodes_quality_status(tmp_path):
    source_path = tmp_path / 'source.h5'
    track_path = tmp_path / 'track.h5'
    make_accessibility_source(source_path)

    build_track(source_path, track_path, chromosomes=('3R',))

    assert track_path.stat().st_size < source_path.stat().st_size * 5
    with accessibility.open_accessibility_store(track_path) as root:
        assert root.mode == 'r'
        frame = accessibility.accessibility_dataframe(
            root,
            '3R:1-4',
            fetch_score.parse_region,
        )
        assert root['3R'].attrs['is_accessible_bases'] == 2

    assert frame['is_accessible'].tolist() == [True, False, False, True]
    assert frame['quality_status'].tolist() == [
        'PASS',
        'LowCoverage',
        'RepeatDUST',
        'PASS',
    ]


def test_builder_rejects_accessible_positions_that_fail_a_filter(tmp_path):
    source_path = tmp_path / 'source.h5'
    track_path = tmp_path / 'track.h5'
    make_accessibility_source(source_path)
    with h5py.File(source_path, mode='r+') as root:
        root['3R']['is_accessible'][1] = True

    with pytest.raises(ValueError, match='is_accessible disagrees'):
        build_track(source_path, track_path, chromosomes=('3R',))


def test_scores_dataframe_adds_status_without_changing_density_values(tmp_path):
    source_path = tmp_path / 'source.h5'
    track_path = tmp_path / 'track.h5'
    scores_path = tmp_path / 'scores.h5'
    make_accessibility_source(source_path)
    build_track(source_path, track_path, chromosomes=('3R',))

    with h5py.File(scores_path, mode='w') as root:
        chromosome = root.create_group('3R')
        snp = chromosome.create_dataset(
            'snp_density',
            data=np.asarray([[0.0, 0.0, 0.75, 0.0]]),
        )
        snp.attrs['rows'] = 'snp_density'

    with h5py.File(scores_path, mode='r') as scores:
        with accessibility.open_accessibility_store(track_path) as status:
            frame = fetch_score.scores_dataframe(
                scores,
                '3R:1-4',
                'snp_density',
                accessibility_root=status,
            )

    assert frame.columns.tolist() == [
        'chromosome',
        'pos',
        'is_accessible',
        'quality_status',
        'snp_density_s',
    ]
    assert frame['snp_density_s'].tolist() == [0.0, 0.0, 0.75, 0.0]
    assert frame.loc[0, ['is_accessible', 'quality_status']].tolist() == [True, 'PASS']
    assert frame.loc[1, ['is_accessible', 'quality_status']].tolist() == [
        False,
        'LowCoverage',
    ]
