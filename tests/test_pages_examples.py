import json
from pathlib import Path

import pytest

from tools import build_pages_examples


def write_catalogue(path, examples):
    path.write_text(json.dumps({'schema_version': 1, 'examples': examples}))


def example(accession='AGAP000001'):
    return {
        'accession': accession,
        'region': '3R:1-2',
        'transcript_id': f'{accession}-RA',
        'strand': '+',
        'feature_summary': 'Example',
        'description': 'Example description.',
        'qc_note': 'Example QC note.',
        'annotation': {'exons': []},
        'assets': {
            'summary': f'examples/{accession}/cs_snp_summary.png',
            'heatmap': f'examples/{accession}/heatmap.png',
        },
    }


def test_load_catalogue_validates_and_selects_manifest_examples(tmp_path):
    manifest = tmp_path / 'examples.json'
    first = example('AGAP000001')
    second = example('AGAP000002')
    write_catalogue(manifest, [first, second])

    catalogue = build_pages_examples.load_catalogue(manifest)

    assert build_pages_examples.selected_examples(catalogue, []) == [first, second]
    assert build_pages_examples.selected_examples(catalogue, ['AGAP000002']) == [second]
    with pytest.raises(ValueError, match='Unknown example'):
        build_pages_examples.selected_examples(catalogue, ['AGAP999999'])


def test_load_catalogue_rejects_unsafe_asset_path(tmp_path):
    manifest = tmp_path / 'examples.json'
    invalid = example()
    invalid['assets']['summary'] = '../outside.png'
    write_catalogue(manifest, [invalid])

    with pytest.raises(ValueError, match='unsafe PNG asset path'):
        build_pages_examples.load_catalogue(manifest)


def test_verify_assets_reports_only_missing_catalogue_outputs(tmp_path):
    item = example()
    paths = build_pages_examples.output_paths(item, tmp_path)
    paths['summary'].parent.mkdir(parents=True)
    paths['summary'].write_bytes(b'png')

    assert build_pages_examples.verify_assets([item], tmp_path) == [paths['heatmap']]


def test_checked_in_catalogue_matches_the_public_batch_example():
    root = Path(__file__).resolve().parents[1]
    catalogue = build_pages_examples.load_catalogue(root / 'docs/examples.json')
    batch_accessions = build_pages_examples.load_accession_list(
        root / 'batch_accessions_example.txt'
    )

    assert [example['accession'] for example in catalogue['examples']] == batch_accessions
