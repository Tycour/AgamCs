import json
from pathlib import Path

from AgamCs.species_topology import SPECIES_TOPOLOGY
from tools import build_pages_query_assets


def reference_fixture():
    refs = {}
    for index, chromosome in enumerate(build_pages_query_assets.CHROMOSOMES, start=1):
        for array in build_pages_query_assets.SCORE_ARRAYS:
            shape = [21, index * 100] if array == 'stack' else [1, index * 100]
            refs[f'{chromosome}/{array}/.zarray'] = json.dumps({
                'shape': shape,
                'chunks': [1, 50],
                'dtype': '<f4',
            })
            refs[f'{chromosome}/{array}/0.0'] = ['{{source}}', index, 10]
        refs[f'{chromosome}/stack/.zattrs'] = json.dumps({
            'rows': [f'code-{row}' for row in range(21)],
            'species': [f'Species {row}' for row in range(21)],
        })
    return {
        'version': 1,
        'templates': {'source': 'https://example.test/source.h5'},
        'refs': refs,
    }


def accessibility_reference_fixture():
    refs = {}
    for chromosome in build_pages_query_assets.CHROMOSOMES:
        refs[f'{chromosome}/status/.zarray'] = json.dumps({
            'shape': [500], 'chunks': [50], 'dtype': '|u1',
        })
        refs[f'{chromosome}/status/.zattrs'] = json.dumps({
            'status_fields': ['is_accessible', 'filter_dust'],
        })
    return {
        'version': 1,
        'templates': {'source': 'https://example.test/accessibility.h5'},
        'refs': refs,
    }


def test_compact_reference_exposes_stage_8_browser_query_arrays():
    source = reference_fixture()
    source['refs']['2L/phyloP/.zarray'] = '{}'

    compact = build_pages_query_assets.compact_reference(source)

    assert '2L/phyloP/.zarray' not in compact['refs']
    assert '2L/stack/.zarray' in compact['refs']
    assert '2L/Cs/.zarray' in compact['refs']
    assert '2L/snp_density/.zarray' in compact['refs']


def test_query_manifest_publishes_coordinate_contract_and_lengths():
    manifest = build_pages_query_assets.query_manifest(
        reference_fixture(), accessibility_reference_fixture()
    )

    assert manifest['assembly'] == 'AgamP4'
    assert manifest['coordinate_convention'] == '1-based inclusive'
    assert manifest['maximum_query_bases'] == 200_000
    assert manifest['arrays'] == ['Cs', 'snp_density', 'stack']
    assert manifest['chromosomes']['X']['length'] == 500
    assert manifest['accessibility']['available'] is True
    assert len(manifest['stack']['rows']) == 21
    assert manifest['stack']['topology'] == SPECIES_TOPOLOGY


def test_checked_in_browser_manifest_matches_the_canonical_topology():
    root = Path(__file__).resolve().parents[1]
    manifest = json.loads(
        (root / 'docs/assets/data/query-manifest.json').read_text()
    )

    assert manifest['stack']['topology'] == SPECIES_TOPOLOGY
