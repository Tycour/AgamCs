import json
import shutil
import subprocess
from pathlib import Path

import pytest

from AgamCs.query_report import REPORT_VERSION, build_report, validate_report


ROOT = Path(__file__).resolve().parents[1]
FIXTURE_PATH = ROOT / 'tests/fixtures/query-report-v1-cases.json'


def assert_parity(javascript, python, path='report'):
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


def test_report_schema_and_explicit_unavailable_ranking():
    fixture = json.loads(FIXTURE_PATH.read_text(encoding='utf-8'))
    case = fixture['cases'][0]
    report = build_report(
        case['result'], annotation=case['annotation'],
        transcript_annotations=case['transcript_annotations'], ranking=case['ranking'],
        query_state=case['query_state'], provenance=case['provenance'], display=case['display'],
    )
    validate_report(report)
    assert report['report_version'] == REPORT_VERSION
    assert report['selected_annotation']['transcript_id'] == 'AGAPTEST-RB'
    assert report['rankings'] == {
        'availability': 'unavailable',
        'reason': 'No static gene ranking is available for this query.',
        'value': None,
    }
    scope = report['accessibility_audit']['scopes'][0]
    assert scope['accessible_bases'] == 2
    assert scope['mean_accessible_snp_density'] == pytest.approx(0.5)
    assert '2/4 accessible bases' in report['figure_caption']
    assert 'QC-failed bases are unknown' in report['figure_caption']


def test_schema_rejects_missing_or_invalid_coordinates():
    report = build_report({
        'chromosome': '2L', 'start': 1, 'end': 1,
        'values': {'Cs': [0.1], 'snp_density': [0.2], 'status': [1]},
    }, provenance={'assembly': 'AgamP4'})
    report.pop('figure_caption')
    with pytest.raises(ValueError, match='missing required'):
        validate_report(report)
    report['figure_caption'] = 'caption'
    report['query_state']['coordinates']['end'] = 0
    with pytest.raises(ValueError, match='invalid'):
        validate_report(report)


def test_python_and_browser_reports_match_shared_fixture():
    node = shutil.which('node')
    if node is None:
        pytest.skip('Node is required only for cross-language report parity tests.')
    fixture = json.loads(FIXTURE_PATH.read_text(encoding='utf-8'))
    javascript = json.loads(subprocess.run(
        [node, str(ROOT / 'tools/query_report_node.js')], input=json.dumps(fixture),
        check=True, capture_output=True, text=True,
    ).stdout)
    python = []
    for case in fixture['cases']:
        python.append({'name': case['name'], 'report': build_report(
            case['result'], annotation=case['annotation'],
            transcript_annotations=case['transcript_annotations'], ranking=case['ranking'],
            query_state=case['query_state'], provenance=case['provenance'], display=case['display'],
        )})
    assert_parity(javascript, python)
