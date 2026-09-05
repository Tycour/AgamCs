import json
import shutil
import subprocess
from pathlib import Path

import pandas as pd
import pytest

from AgamCs.query_summary import (
    RANKING_ACCESSIBILITY_THRESHOLD,
    SUMMARY_VERSION,
    select_transcript_annotation,
    summarize_dataframe,
    summarize_query,
)


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_PATH = ROOT / 'tests/fixtures/query-summary-v1-cases.json'


def load_fixture():
    return json.loads(FIXTURE_PATH.read_text(encoding='utf-8'))


def scope_map(summary):
    return {scope['scope_id']: scope for scope in summary['scopes']}


def assert_fixture_expectations(case, summary):
    expected = case['expect']
    scopes = scope_map(summary)
    if 'scope_ids' in expected:
        assert [scope['scope_id'] for scope in summary['scopes']] == expected['scope_ids']
    for scope_id, total in expected.get('totals', {}).items():
        assert scopes[scope_id]['total_bases'] == total
    transcript = summary['selected_transcript']
    assert (transcript['transcript_id'] if transcript else None) == expected['selected_transcript']
    if 'first_exon_segment' in expected:
        assert scopes['exon-1']['segments'][0] == expected['first_exon_segment']
    if 'query_accessible_bases' in expected:
        assert scopes['query']['accessible_bases'] == expected['query_accessible_bases']
    if 'query_finite_cs_bases' in expected:
        assert scopes['query']['finite_cs_bases'] == expected['query_finite_cs_bases']
    if 'query_accessible_fraction' in expected:
        assert scopes['query']['accessible_fraction'] == pytest.approx(expected['query_accessible_fraction'])
    if 'query_snp_mean' in expected:
        assert scopes['query']['mean_accessible_snp_density'] == pytest.approx(expected['query_snp_mean'])
    if 'query_longest_inaccessible_run' in expected:
        assert scopes['query']['longest_inaccessible_run']['bases'] == expected['query_longest_inaccessible_run']
    if 'query_meets_threshold' in expected:
        assert scopes['query']['meets_ranking_accessibility_threshold'] is expected['query_meets_threshold']


def assert_parity(javascript, python, path='summary'):
    if (isinstance(javascript, (int, float)) and not isinstance(javascript, bool)
            and isinstance(python, (int, float)) and not isinstance(python, bool)):
        assert javascript == pytest.approx(python, abs=1e-12), path
        return
    assert type(javascript) is type(python), path
    if isinstance(python, dict):
        assert javascript.keys() == python.keys(), path
        for key in python:
            assert_parity(javascript[key], python[key], f'{path}.{key}')
    elif isinstance(python, list):
        assert len(javascript) == len(python), path
        for index, (javascript_item, python_item) in enumerate(zip(javascript, python)):
            assert_parity(javascript_item, python_item, f'{path}[{index}]')
    else:
        assert javascript == python, path


def test_python_implementation_covers_shared_v1_fixture_cases():
    fixture = load_fixture()
    assert fixture['summary_version'] == SUMMARY_VERSION
    for case in fixture['cases']:
        summary = summarize_query(case['result'], case['annotation'])
        assert summary['summary_version'] == SUMMARY_VERSION
        assert summary['ranking_accessibility_threshold'] == RANKING_ACCESSIBILITY_THRESHOLD
        assert_fixture_expectations(case, summary)


def test_python_and_browser_javascript_match_shared_fixtures():
    node = shutil.which('node')
    if node is None:
        pytest.skip('Node is required only for cross-language query-summary parity tests.')
    fixture = load_fixture()
    javascript = json.loads(subprocess.run(
        [node, str(ROOT / 'tools/query_summary_node.js'), str(FIXTURE_PATH)],
        check=True,
        capture_output=True,
        text=True,
    ).stdout)
    python = [
        {'name': case['name'], 'summary': summarize_query(case['result'], case['annotation'])}
        for case in fixture['cases']
    ]
    assert_parity(javascript, python)


def test_dataframe_adapter_preserves_unknown_qc_and_finite_denominators():
    frame = pd.DataFrame({
        'chromosome': ['2L'] * 4,
        'pos': [10, 11, 12, 13],
        'Cs_s': [0.1, float('nan'), 0.5, 0.7],
        'snp_density_s': [0.9, 0.8, float('nan'), 0.2],
        'is_accessible': [True, False, True, False],
    })

    query = scope_map(summarize_dataframe(frame))['query']

    assert query['finite_cs_bases'] == 3
    assert query['mean_cs'] == pytest.approx((0.1 + 0.5 + 0.7) / 3)
    assert query['accessible_bases'] == 2
    assert query['finite_accessible_snp_bases'] == 1
    assert query['mean_accessible_snp_density'] == pytest.approx(0.9)
    assert query['longest_inaccessible_run'] == {'bases': 1, 'start': 11, 'end': 11}


def test_selected_exact_isoform_replaces_gene_span_display_annotation():
    gene = {
        'id': 'AGAPISOFORM', 'chromosome': '2R', 'start': 100, 'end': 200,
        'strand': 1, 'transcript_id': 'AGAPISOFORM-RB', 'exons': [],
        'cds_start': None, 'cds_end': None,
    }
    representative = {**gene, 'transcript_id': 'AGAPISOFORM-RA', 'start': 110, 'end': 190}
    selected = {
        **gene, 'start': 125, 'end': 175,
        'exons': [{'start': 125, 'end': 150}, {'start': 160, 'end': 175}],
    }

    assert select_transcript_annotation(gene, [representative, selected]) is selected


def test_rejects_mismatched_lengths_and_annotation_chromosomes():
    result = {
        'chromosome': '2L', 'start': 1, 'end': 2,
        'values': {'Cs': [0.1], 'snp_density': [0.2, 0.3], 'status': [1, 1]},
    }
    with pytest.raises(ValueError, match='inclusive query length'):
        summarize_query(result)
    result['values']['Cs'] = [0.1, 0.2]
    with pytest.raises(ValueError, match='same chromosome'):
        summarize_query(result, {
            'chromosome': '3L', 'start': 1, 'end': 2, 'strand': 1,
            'transcript_id': 'AGAP-X', 'exons': [], 'cds_start': None, 'cds_end': None,
        })
