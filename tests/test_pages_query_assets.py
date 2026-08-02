import json

from tools import build_pages_query_assets


def reference_fixture():
    refs = {}
    for index, chromosome in enumerate(build_pages_query_assets.CHROMOSOMES, start=1):
        for array in build_pages_query_assets.ARRAYS:
            refs[f'{chromosome}/{array}/.zarray'] = json.dumps({
                'shape': [1, index * 100],
                'chunks': [1, 50],
                'dtype': '<f4',
            })
            refs[f'{chromosome}/{array}/0.0'] = ['{{source}}', index, 10]
    return {
        'version': 1,
        'templates': {'source': 'https://example.test/source.h5'},
        'refs': refs,
    }


def test_compact_reference_exposes_only_browser_query_arrays():
    source = reference_fixture()
    source['refs']['2L/stack/.zarray'] = '{}'

    compact = build_pages_query_assets.compact_reference(source)

    assert '2L/stack/.zarray' not in compact['refs']
    assert '2L/Cs/.zarray' in compact['refs']
    assert '2L/snp_density/.zarray' in compact['refs']


def test_query_manifest_publishes_coordinate_contract_and_lengths():
    manifest = build_pages_query_assets.query_manifest(reference_fixture())

    assert manifest['assembly'] == 'AgamP4'
    assert manifest['coordinate_convention'] == '1-based inclusive'
    assert manifest['maximum_query_bases'] == 20_000
    assert manifest['arrays'] == ['Cs', 'snp_density']
    assert manifest['chromosomes']['X']['length'] == 500
    assert manifest['accessibility']['available'] is False
