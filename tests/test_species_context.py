import json
import shutil
import subprocess
from pathlib import Path

import pytest

from AgamCs.species_context import ANALYSIS_VERSION, analyze_species_context


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_PATH = ROOT / 'tests/fixtures/species-context-v1-cases.json'


def expand_case(case):
    stack = []
    for runs in case['row_runs']:
        row = [value for count, value in runs for _ in range(count)]
        assert len(row) == case['end'] - case['start'] + 1
        stack.extend(row)
    return {
        'result': {
            'chromosome': case['chromosome'], 'start': case['start'], 'end': case['end'],
            'stackRows': case['rows'], 'stackSpecies': case['labels'],
            'values': {'stack': stack},
        },
        'topology': case['topology'],
    }


def assert_same_document(actual, expected):
    if isinstance(expected, dict):
        assert actual.keys() == expected.keys()
        for key in expected:
            assert_same_document(actual[key], expected[key])
    elif isinstance(expected, list):
        assert len(actual) == len(expected)
        for actual_value, expected_value in zip(actual, expected):
            assert_same_document(actual_value, expected_value)
    elif isinstance(expected, float):
        assert actual == pytest.approx(expected, abs=1e-12)
    else:
        assert actual == expected


@pytest.mark.parametrize('case', json.loads(FIXTURE_PATH.read_text())['cases'], ids=lambda case: case['name'])
def test_species_context_shared_fixtures(case):
    inputs = expand_case(case)
    analysis = analyze_species_context(inputs['result'], inputs['topology'])
    expected = case['expect']
    assert analysis['analysis_version'] == ANALYSIS_VERSION
    assert [row['detected_bases'] for row in analysis['species']] == expected['species_detected_bases']
    assert [row['longest_undetected_run']['bases'] for row in analysis['species']] == expected['species_longest_runs']
    assert [
        row['lowest_qualifying_identity_window']['start']
        if row['lowest_qualifying_identity_window'] else None
        for row in analysis['species']
    ] == expected['species_window_starts']
    root = analysis['clades'][0]
    assert root['is_polytomy'] is expected['root_is_polytomy']
    if 'root_species_count' in expected:
        assert root['species_count'] == expected['root_species_count']
        assert root['possible_species_bases'] == expected['root_possible_species_bases']
        assert root['detected_bases'] == expected['root_detected_bases']
    if 'pair_species_count' in expected:
        pair = next(row for row in analysis['clades'] if row['name'] == 'Pair')
        assert pair['species_count'] == expected['pair_species_count']
        assert pair['possible_species_bases'] == expected['pair_possible_species_bases']
        assert pair['detected_bases'] == expected['pair_detected_bases']
        assert pair['lowest_qualifying_identity_window']['start'] == expected['pair_window_start']
        assert pair['longest_undetected_run']['bases'] == expected['pair_longest_run']


def test_zero_coded_positions_are_not_measured_zero_identity():
    case = json.loads(FIXTURE_PATH.read_text())['cases'][0]
    inputs = expand_case(case)
    analysis = analyze_species_context(inputs['result'], inputs['topology'])
    assert analysis['species'][1]['mean_identity_detected'] == 80
    assert analysis['species'][2]['mean_identity_detected'] is None
    assert analysis['zero_semantics'].startswith('No detected CNEr interval')


@pytest.mark.skipif(shutil.which('node') is None, reason='Node is required for cross-language parity testing.')
@pytest.mark.parametrize('case', json.loads(FIXTURE_PATH.read_text())['cases'], ids=lambda case: case['name'])
def test_python_and_browser_species_context_match(case):
    inputs = expand_case(case)
    expected = analyze_species_context(inputs['result'], inputs['topology'])
    completed = subprocess.run(
        ['node', 'tools/species_context_node.js'], input=json.dumps(inputs), text=True,
        capture_output=True, check=True, cwd=ROOT,
    )
    assert_same_document(json.loads(completed.stdout), expected)
