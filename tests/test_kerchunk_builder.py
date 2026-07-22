import json

from tools.build_kerchunk_reference import _rechunk_contiguous_array


def test_rechunk_contiguous_array_splits_bytes_without_copying_data():
    references = {
        '3R/phyloP/.zarray': json.dumps({
            'shape': [1, 10],
            'chunks': [1, 10],
            'dtype': '<f4',
            'compressor': None,
        }),
        '3R/phyloP/.zattrs': json.dumps({'rows': 'phyloP'}),
        '3R/phyloP/0.0': ['https://example.test/data.h5', 1_000, 40],
    }

    _rechunk_contiguous_array(references, '3R/phyloP', chunk_bases=4)

    metadata = json.loads(references['3R/phyloP/.zarray'])
    assert metadata['chunks'] == [1, 4]
    assert json.loads(references['3R/phyloP/.zattrs'])['rows'] == ['phyloP']
    assert references['3R/phyloP/0.0'] == ['https://example.test/data.h5', 1_000, 16]
    assert references['3R/phyloP/0.1'] == ['https://example.test/data.h5', 1_016, 16]
    assert references['3R/phyloP/0.2'] == ['https://example.test/data.h5', 1_032, 8]
