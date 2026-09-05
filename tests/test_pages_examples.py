import json
import subprocess
from pathlib import Path

import pytest

from tools import build_pages_examples


def write_catalogue(path, examples):
    path.write_text(json.dumps({'schema_version': 2, 'examples': examples}))


def example(accession='AGAP000001'):
    return {
        'accession': accession,
        'symbol': 'Example',
        'topic': 'Example topic',
        'quick_rank': None,
        'why_featured': 'Why this example is featured.',
        'teaches': ['One teaching point.'],
        'limitations': ['One interpretation limit.'],
        'labels': {'complexity': 'Simple', 'qc': 'QC available'},
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


def test_load_catalogue_validates_quick_rank_sequence_and_metadata(tmp_path):
    manifest = tmp_path / 'examples.json'
    first = example('AGAP000001')
    second = example('AGAP000002')
    first['quick_rank'] = 1
    second['quick_rank'] = 3
    write_catalogue(manifest, [first, second])

    with pytest.raises(ValueError, match='consecutive sequence'):
        build_pages_examples.load_catalogue(manifest)

    second['quick_rank'] = 2
    second['symbol'] = None
    write_catalogue(manifest, [first, second])
    assert build_pages_examples.load_catalogue(manifest)['examples'] == [first, second]


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
    assert [example['symbol'] for example in catalogue['examples'][:7]] == [
        'CYP6M2', 'Orco', 'TIM', 'TEP1', 'para', 'aga-mir-275', 'ZPG',
    ]
    assert [example['quick_rank'] for example in catalogue['examples']] == [
        1, 2, 3, None, None, None, None, None, None,
    ]
    assert catalogue['examples'][7]['symbol'] is None
    assert catalogue['examples'][8]['symbol'] is None
    labelled = {example['accession']: example['labels'] for example in catalogue['examples']}
    assert labelled['AGAP010815']['qc'].startswith('QC-limited')
    assert labelled['AGAP004707']['complexity'].startswith('High complexity')
    assert labelled['AGAP010449']['qc'].startswith('All QC failed')


def test_tracked_current_tree_contains_no_retired_private_example_identifiers():
    root = Path(__file__).resolve().parents[1]
    tracked = subprocess.run(
        ['git', 'ls-files', '-z'], cwd=root, check=True, capture_output=True,
    ).stdout.split(b'\0')
    forbidden = (b'AGAP' + b'013705', b'mir' + b'-989', b'miR' + b'989')
    offenders = []
    for relative in tracked:
        if not relative:
            continue
        data = (root / relative.decode()).read_bytes()
        if any(term.lower() in data.lower() for term in forbidden):
            offenders.append(relative.decode())

    assert offenders == []
