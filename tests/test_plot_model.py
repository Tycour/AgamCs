import json
import shutil
import subprocess
import sys
from pathlib import Path

import h5py
import matplotlib.image as mpimg
import numpy as np
import pandas as pd
import pytest

from AgamCs.create_heatmap import SPECIES_GENOME_CODES, SPECIES_LABELS
from AgamCs.heatmap_renderer import render_heatmap
from AgamCs.plot_model import (
    blended_identity_rgb,
    build_plot_model,
    dataframe_to_result,
    heatmap_geometry,
    load_plot_contract,
    resolve_bin_count,
    validate_plot_resolution,
)


ROOT = Path(__file__).resolve().parents[1]
CASE_PATH = ROOT / 'tests/fixtures/plot-model-cases.json'
NODE_RUNNER = ROOT / 'tools/plot_model_node.js'


def _node_executable():
    executable = shutil.which('node')
    if executable:
        return executable
    pytest.skip('Node is required only for cross-language development parity tests.')


def _annotation(specification):
    record = specification.get('annotation')
    if not record:
        return None
    start = specification['start'] + record['start_offset']
    end = specification['start'] + record['end_offset']
    return {
        'id': record['id'],
        'assembly': 'AgamP4',
        'chromosome': record['chromosome'],
        'start': start,
        'end': end,
        'strand': record['strand'],
        'transcript_id': f"{record['id']}-RA",
        'exons': [{'start': start, 'end': start + 5}, {'start': end - 7, 'end': end}],
        'cds_start': start + 2,
        'cds_end': end - 2,
    }


def _transcript_annotations(annotation):
    if not annotation:
        return []
    alternate = {
        **annotation,
        'transcript_id': f"{annotation['id']}-RB",
        'start': annotation['start'] + 1,
        'end': annotation['end'] - 1,
    }
    return [annotation, alternate]


def _stack_value(mode, row, index):
    detected = 45 + ((row * 7 + index * 3) % 56)
    if mode == 'zero':
        return 0.0
    if mode == 'sparse':
        return float(detected) if (index + row * 11) % 97 == 0 else 0.0
    if mode == 'periodic':
        return 0.0 if (index + row) % 5 == 0 else float(detected)
    return float(detected)


def _synthetic_result(specification):
    length = specification['length']
    stack = [
        _stack_value(specification['stack_mode'], row, index)
        for row in range(len(SPECIES_GENOME_CODES))
        for index in range(length)
    ]
    if specification['qc_mode'] == 'failed':
        status = [0] * length
    elif specification['qc_mode'] == 'mixed':
        status = [0 if index % 7 in {2, 3} else 1 for index in range(length)]
    else:
        status = [1] * length
    return {
        'chromosome': specification['chromosome'],
        'start': specification['start'],
        'end': specification['start'] + length - 1,
        'stackRows': list(SPECIES_GENOME_CODES),
        'stackSpecies': list(SPECIES_LABELS),
        'values': {
            'Cs': [((index * 17) % 101) / 100 for index in range(length)],
            'snp_density': [((index * 7) % 21) / 20 for index in range(length)],
            'status': status,
            'stack': stack,
        },
    }


def _javascript_model(
    result, annotation, transcript_annotations=None,
    signal_bins='adaptive', heatmap_bins='adaptive',
):
    process = subprocess.run(
        [_node_executable(), str(NODE_RUNNER)],
        input=json.dumps({
            'result': result,
            'annotation': annotation,
            'transcriptAnnotations': transcript_annotations,
            'signalBins': signal_bins,
            'heatmapBins': heatmap_bins,
        }),
        text=True,
        capture_output=True,
        check=True,
        timeout=90,
    )
    return json.loads(process.stdout)


def _javascript_palette_samples(samples):
    process = subprocess.run(
        [_node_executable(), str(NODE_RUNNER)],
        input=json.dumps({'palette_samples': samples}),
        text=True,
        capture_output=True,
        check=True,
        timeout=90,
    )
    return json.loads(process.stdout)


def _assert_close(actual, expected, path='model'):
    if isinstance(actual, (int, float)) and not isinstance(actual, bool) \
            and isinstance(expected, (int, float)) and not isinstance(expected, bool):
        assert actual == pytest.approx(expected, abs=2e-12), path
        return
    assert type(actual) is type(expected), f'{path}: {type(actual)} != {type(expected)}'
    if isinstance(actual, dict):
        assert actual.keys() == expected.keys(), path
        for key in actual:
            _assert_close(actual[key], expected[key], f'{path}.{key}')
    elif isinstance(actual, list):
        assert len(actual) == len(expected), path
        for index, (actual_item, expected_item) in enumerate(zip(actual, expected)):
            _assert_close(actual_item, expected_item, f'{path}[{index}]')
    else:
        assert actual == expected, path


@pytest.mark.parametrize(
    'specification',
    json.loads(CASE_PATH.read_text())['cases'],
    ids=lambda specification: specification['id'],
)
def test_python_and_pages_models_match_for_complete_synthetic_cases(specification):
    result = _synthetic_result(specification)
    annotation = _annotation(specification)
    transcript_annotations = _transcript_annotations(annotation)

    python_model = build_plot_model(result, annotation, transcript_annotations)
    javascript_model = _javascript_model(result, annotation, transcript_annotations)

    _assert_close(python_model, javascript_model)
    if specification['id'] == 'all-zero-cner':
        assert all(
            cell['identity'] == 0 and cell['detectedFraction'] == 0
            for row in python_model['heatmap']['cells'] for cell in row
        )
    if specification['id'] == 'all-qc-failed':
        assert all(record['mean'] is None for record in python_model['signal']['snp'])
    if specification['id'] == 'mir989-length':
        assert python_model['signal']['binCount'] == 131
        assert python_model['heatmap']['binCount'] == 131
    if specification['id'] == 'agap006241-length':
        assert python_model['signal']['binCount'] == 1000
        assert python_model['heatmap']['binCount'] == 1000
    if specification['id'] == 'agap008118-length':
        assert python_model['signal']['binCount'] == 1000
        assert python_model['heatmap']['binCount'] == 1000
    if specification['id'] == 'maximum-20000-bases':
        assert python_model['heatmap']['binCount'] == 1000
        assert sum(map(len, python_model['heatmap']['bins'])) == 20_000
    if specification['id'] in {
        'prospective-maximum-50000-bases',
        'phase2-100000-bases',
        'phase2-150000-bases',
        'phase2-maximum-200000-bases',
    }:
        assert python_model['signal']['binCount'] == 1000
        assert python_model['heatmap']['binCount'] == 1000
        assert sum(map(len, python_model['heatmap']['bins'])) == specification['length']


def test_adaptive_and_explicit_resolution_rules_are_bounded_and_clamped():
    contract = load_plot_contract()
    assert resolve_bin_count(1, 'signal', contract=contract) == 1
    assert resolve_bin_count(7, 'signal', contract=contract) == 7
    assert resolve_bin_count(23, 'signal', contract=contract) == 23
    assert resolve_bin_count(23, 'heatmap', contract=contract) == 23
    assert resolve_bin_count(131, 'signal', contract=contract) == 131
    assert resolve_bin_count(131, 'heatmap', contract=contract) == 131
    assert resolve_bin_count(1685, 'signal', contract=contract) == 1000
    assert resolve_bin_count(1685, 'heatmap', contract=contract) == 1000
    assert resolve_bin_count(17_947, 'signal', contract=contract) == 1000
    assert resolve_bin_count(17_947, 'heatmap', contract=contract) == 1000
    assert resolve_bin_count(25, 'signal', 1000, contract) == 25
    for choice in contract['binning']['explicit_choices']:
        assert validate_plot_resolution(str(choice), contract) == choice
    for invalid in (0, -1, 1.5, '1.5', 'many', 1001, True):
        with pytest.raises(ValueError, match='plot resolution'):
            validate_plot_resolution(invalid, contract)


def test_all_explicit_resolutions_match_javascript_and_leave_source_values_unchanged():
    specification = next(
        item for item in json.loads(CASE_PATH.read_text())['cases']
        if item['id'] == 'sparse-detection'
    )
    result = _synthetic_result(specification)
    before = json.dumps(result, sort_keys=True)
    contract = load_plot_contract()
    for signal_bins in contract['binning']['explicit_choices']:
        for heatmap_bins in contract['binning']['explicit_choices']:
            python_model = build_plot_model(
                result, signal_bins=signal_bins, heatmap_bins=heatmap_bins,
            )
            javascript_model = _javascript_model(
                result, None, signal_bins=signal_bins, heatmap_bins=heatmap_bins,
            )
            _assert_close(python_model, javascript_model)
            assert python_model['signal']['binCount'] == min(signal_bins, specification['length'])
            assert python_model['heatmap']['binCount'] == min(heatmap_bins, specification['length'])
    assert json.dumps(result, sort_keys=True) == before


def _agap006241_result_and_annotation():
    example = json.loads((ROOT / 'docs/examples.json').read_text())['examples'][0]
    chromosome, coordinates = example['region'].split(':')
    start, end = map(int, coordinates.split('-'))
    with h5py.File(ROOT / 'data/AgamP4_conservation.h5', 'r') as scores:
        cs = np.asarray(scores[chromosome]['Cs'][0, start - 1:end], dtype='<f4')
        snp = np.asarray(scores[chromosome]['snp_density'][0, start - 1:end], dtype='<f4')
        stack = np.asarray(scores[chromosome]['stack'][:, start - 1:end], dtype='<f4')
    with h5py.File(ROOT / 'AgamCs/data/Ag1000G_phase2_AR1_accessibility.h5', 'r') as qc:
        status = np.asarray(qc[chromosome]['status'][start - 1:end], dtype='u1')
    return {
        'chromosome': chromosome,
        'start': start,
        'end': end,
        'stackRows': list(SPECIES_GENOME_CODES),
        'stackSpecies': list(SPECIES_LABELS),
        'values': {
            'Cs': cs.tolist(),
            'snp_density': snp.tolist(),
            'status': status.tolist(),
            'stack': stack.reshape(-1).tolist(),
        },
    }, example['annotation']


def test_agap006241_model_and_six_palette_samples_match_javascript_and_golden_fixture():
    result, annotation = _agap006241_result_and_annotation()
    python_model = build_plot_model(result, annotation, [annotation])
    _assert_close(python_model, _javascript_model(result, annotation, [annotation]))

    contract = load_plot_contract()
    palette_samples = contract['parity']['palette_samples']
    javascript_rgb = _javascript_palette_samples(palette_samples)
    python_rgb = [
        blended_identity_rgb(identity, fraction, contract)
        for identity, fraction in palette_samples
    ]
    for python_sample, javascript_sample in zip(python_rgb, javascript_rgb):
        assert max(abs(left - right) for left, right in zip(
            python_sample, javascript_sample,
        )) <= contract['palette']['maximum_channel_delta']

    fixture = json.loads((ROOT / 'docs/assets/data/plot-validation.json').read_text())
    assert fixture['region'] == f"{result['chromosome']}:{result['start']}-{result['end']}"
    assert python_model['signal']['binCount'] == fixture['signal_bins'] == 1000
    assert python_model['heatmap']['binCount'] == fixture['heatmap_bins'] == 1000
    for actual, expected in zip(python_model['signal']['cs'], fixture['cs']):
        for field in ('position', 'mean', 'q10', 'q25', 'median', 'q75', 'q90'):
            assert actual[field] == pytest.approx(expected[field], abs=1e-7)
    for actual, expected in zip(python_model['signal']['snp'], fixture['snp']):
        assert actual['position'] == pytest.approx(expected['position'], abs=1e-7)
        assert actual['mean'] == pytest.approx(expected['mean'], abs=1e-7)
        assert actual['accessibleFraction'] == pytest.approx(
            expected['callable_fraction'], abs=1e-12,
        )
    for actual_row, expected_row in zip(python_model['heatmap']['cells'], fixture['heatmap']):
        for actual, expected in zip(actual_row, expected_row):
            assert actual['identity'] == pytest.approx(expected['identity'], abs=2e-5)
            assert actual['detectedFraction'] == pytest.approx(
                expected['detectedFraction'], abs=1e-12,
            )


def _result_frame(result):
    frame = pd.DataFrame({
        'chromosome': result['chromosome'],
        'pos': range(result['start'], result['end'] + 1),
        'Cs_C': result['values']['Cs'],
        'snp_density_s': result['values']['snp_density'],
        'is_accessible': [bool(value & 1) for value in result['values']['status']],
    })
    width = len(frame)
    for row, code in enumerate(result['stackRows']):
        frame[f'stack_{code}'] = result['values']['stack'][row * width:(row + 1) * width]
    return frame


def test_renderer_writes_contract_geometry_svg_and_png_without_node(tmp_path, monkeypatch):
    specification = json.loads(CASE_PATH.read_text())['cases'][4]
    result = _synthetic_result(specification)
    annotation = {
        'id': 'AGAPPOC', 'assembly': 'AgamP4', 'chromosome': result['chromosome'],
        'start': result['start'], 'end': result['end'], 'strand': 1,
        'transcript_id': 'AGAPPOC-RA',
        'exons': [
            {'start': result['start'], 'end': result['start'] + 80},
            {'start': result['end'] - 100, 'end': result['end']},
        ],
        'cds_start': result['start'] + 20, 'cds_end': result['end'] - 20,
    }
    alternate = {
        **annotation,
        'transcript_id': 'AGAPPOC-RB',
        'start': result['start'] + 10,
        'end': result['end'] - 10,
    }
    tsv = tmp_path / 'scores.tsv'
    svg = tmp_path / 'parity.svg'
    png = tmp_path / 'parity.png'
    _result_frame(result).to_csv(tsv, sep='\t', index=False)

    monkeypatch.setenv('PATH', '')
    model = render_heatmap(
        tsv, svg, png, annotation, [annotation, alternate],
    )

    contract = load_plot_contract()
    expected_geometry = heatmap_geometry(21, 500, contract, annotation_count=2)
    svg_text = svg.read_text()
    assert f'viewBox="0 0 {expected_geometry["width"]} {expected_geometry["height"]}"' in svg_text
    assert 'role="img"' in svg_text
    assert 'aria-labelledby="agamcs-heatmap-title agamcs-heatmap-description"' in svg_text
    assert '<title id="agamcs-heatmap-title">' in svg_text
    assert '<desc id="agamcs-heatmap-description">' in svg_text
    assert 'Zero means no detected CNEr interval' in svg_text
    assert 'QC-failed SNP positions remain unknown' in svg_text
    assert 'Transcript models (2; selected/representative in bold)' in svg_text
    assert 'Position relative to AGAPPOC transcription start (bp)' in svg_text
    assert '<g id="matplotlib.axis_1">' in svg_text
    first_cell = model['heatmap']['cells'][0][0]
    first_rgb = blended_identity_rgb(
        first_cell['identity'], first_cell['detectedFraction'], contract,
    )
    assert f"#{''.join(f'{channel:02x}' for channel in first_rgb)}" in svg_text.lower()
    assert png.stat().st_size > 0
    assert mpimg.imread(png).shape[:2] == (
        expected_geometry['height'] * 2, expected_geometry['width'] * 2,
    )


def test_generated_contract_copy_and_tsv_are_unchanged_by_model_construction(tmp_path):
    packaged = ROOT / 'AgamCs/data/plot-contract.json'
    browser = ROOT / 'docs/assets/data/plot-contract.json'
    assert packaged.read_bytes() == browser.read_bytes()
    subprocess.run(
        [sys.executable, str(ROOT / 'tools/sync_plot_contract.py'), '--check'],
        check=True,
    )

    result = _synthetic_result(json.loads(CASE_PATH.read_text())['cases'][0])
    frame = _result_frame(result)
    path = tmp_path / 'scores.tsv'
    frame.to_csv(path, sep='\t', index=False)
    before = path.read_bytes()
    converted = dataframe_to_result(pd.read_csv(path, sep='\t'))
    build_plot_model(converted)
    assert path.read_bytes() == before
