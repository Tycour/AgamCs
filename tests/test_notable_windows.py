import json
import shutil
import subprocess
from pathlib import Path

import pytest

from AgamCs.notable_windows import ANALYSIS_VERSION, analyze_notable_windows


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_PATH = ROOT / 'tests/fixtures/notable-windows-v1-cases.json'


def coordinates(rows):
    return [[row['start'], row['end']] for row in rows]


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
def test_notable_windows_shared_fixtures(case):
    analysis = analyze_notable_windows(
        case['result'], case.get('annotation'), window_size=case['window_size'], top_windows=case['top_windows'],
    )
    expected = case['expect']
    assert analysis['analysis_version'] == ANALYSIS_VERSION
    if 'windows' in expected:
        assert [[row['start'], row['end'], row['total_bases']] for row in analysis['windows']] == expected['windows']
    if 'features' in expected:
        assert [row['selected_transcript_feature'] for row in analysis['windows']] == expected['features']
    if 'highest_mean_cs' in expected:
        assert coordinates(analysis['highest_mean_cs_windows']) == expected['highest_mean_cs']
    if 'lowest_mean_snp_density' in expected:
        assert coordinates(analysis['lowest_mean_snp_density_windows']) == expected['lowest_mean_snp_density']
    if 'accessible_bases' in expected:
        assert [row['accessible_bases'] for row in analysis['windows']] == expected['accessible_bases']


@pytest.mark.skipif(shutil.which('node') is None, reason='Node is required for cross-language parity testing.')
@pytest.mark.parametrize('case', json.loads(FIXTURE_PATH.read_text())['cases'], ids=lambda case: case['name'])
def test_python_and_browser_notable_windows_match(case):
    expected = analyze_notable_windows(
        case['result'], case.get('annotation'), window_size=case['window_size'], top_windows=case['top_windows'],
    )
    completed = subprocess.run(
        ['node', 'tools/notable_windows_node.js'], input=json.dumps(case), text=True,
        capture_output=True, check=True, cwd=ROOT,
    )
    assert_same_document(json.loads(completed.stdout), expected)
