import json
import sys

import pytest

from AgamCs import create_heatmap, fetch_score, heatmap_renderer, main, plot_signal_summary


def _stub_plot_pipeline(monkeypatch, observed):
    def fake_fetch(_region, _fields, path, **_kwargs):
        observed['tsv'] = path

    monkeypatch.setattr(fetch_score, 'fetch_scores', fake_fetch)
    monkeypatch.setattr(
        create_heatmap, 'create_heatmap',
        lambda source, target, **kwargs: observed.setdefault(
            'base', (source, target, kwargs),
        ),
    )
    monkeypatch.setattr(
        heatmap_renderer, 'render_heatmap',
        lambda source, svg, png, **kwargs: observed.setdefault(
            'binned', (source, svg, png, kwargs),
        ),
    )
    monkeypatch.setattr(create_heatmap, 'plot_cs_snp_density', lambda *_args, **_kwargs: None)
    monkeypatch.setattr(plot_signal_summary, 'plot_cs_snp_summary', lambda *_args, **_kwargs: None)


def test_default_pipeline_writes_canonical_svg_and_compatible_png(tmp_path, monkeypatch):
    observed = {}
    _stub_plot_pipeline(monkeypatch, observed)
    representative = {'transcript_id': 'AGAPTEST-RA'}
    transcripts = [representative, {'transcript_id': 'AGAPTEST-RB'}]

    main.process_region(
        '2L:1-3',
        'AGAPTEST',
        results_root=tmp_path,
        gene_annotation=representative,
        transcript_annotations=transcripts,
    )

    assert 'base' not in observed
    _source, svg, png, kwargs = observed['binned']
    assert svg.endswith('AGAPTEST_heatmap.svg')
    assert png.endswith('AGAPTEST_heatmap.png')
    assert kwargs == {
        'gene_annotation': representative,
        'transcript_annotations': transcripts,
        'bins': 'adaptive',
    }


def test_explicit_base_level_mode_preserves_legacy_renderer(tmp_path, monkeypatch):
    observed = {}
    _stub_plot_pipeline(monkeypatch, observed)

    main.process_region(
        '2L:1-3',
        'manual',
        results_root=tmp_path,
        heatmap_mode='base-level',
    )

    assert 'binned' not in observed
    assert observed['base'][1].endswith('manual_heatmap.png')


def test_accession_pipeline_writes_and_reports_gene_ranking(tmp_path, monkeypatch, capsys):
    observed = {}
    _stub_plot_pipeline(monkeypatch, observed)
    ranking = {
        'accession': 'AGAPTEST',
        'chromosome': '2L',
        'ranking_version': 'test-v1',
        'coordinate_index_version': 'index-v1',
        'score_source': {},
        'percentile_method': 'test',
        'metrics': {},
        'cohorts': {'global_gene_count': 2, 'chromosome_gene_counts': {'2L': 2}},
        'gene_span': {
            'mean_cs': 0.25,
            'global': {'rank': 2, 'ties': 1, 'percentile': 0.0},
            'chromosome': {'rank': 2, 'ties': 1, 'percentile': 0.0},
        },
        'representative_exons': {
            'mean_cs': 0.75,
            'global': {'rank': 1, 'ties': 1, 'percentile': 100.0},
            'chromosome': {'rank': 1, 'ties': 1, 'percentile': 100.0},
        },
    }

    main.process_region(
        '2L:1-3',
        'AGAPTEST',
        results_root=tmp_path,
        gene_ranking=ranking,
    )

    path = tmp_path / 'AGAPTEST' / 'gene_conservation_ranking.json'
    assert json.loads(path.read_text()) == ranking
    output = capsys.readouterr().out
    assert 'Gene conservation ranking for AGAPTEST' in output
    assert 'global 2 of 2; 0.00th percentile' in output


def test_cli_parser_defaults_to_binned_and_accepts_legacy_mode(monkeypatch):
    calls = []
    monkeypatch.setattr(
        main, 'build_jobs',
        lambda _args: [('2L:1-3', 'manual', None, [])],
    )
    monkeypatch.setattr(main, 'process_region', lambda **kwargs: calls.append(kwargs))

    monkeypatch.setattr(sys, 'argv', ['agamcs', '--region', '2L:1-3'])
    main.main()
    assert calls[-1]['heatmap_mode'] == 'binned'
    assert calls[-1]['signal_bins'] == 'adaptive'
    assert calls[-1]['heatmap_bins'] == 'adaptive'

    monkeypatch.setattr(
        sys, 'argv',
        ['agamcs', '--region', '2L:1-3', '--heatmap-mode', 'base-level'],
    )
    main.main()
    assert calls[-1]['heatmap_mode'] == 'base-level'


def test_cli_parser_accepts_bounded_explicit_plot_resolutions(monkeypatch):
    calls = []
    monkeypatch.setattr(main, 'build_jobs', lambda _args: [('2L:1-3', 'manual', None, [])])
    monkeypatch.setattr(main, 'process_region', lambda **kwargs: calls.append(kwargs))
    monkeypatch.setattr(
        sys, 'argv',
        ['agamcs', '--region', '2L:1-3', '--signal-bins', '120', '--heatmap-bins', '1000'],
    )

    main.main()

    assert calls[-1]['signal_bins'] == 120
    assert calls[-1]['heatmap_bins'] == 1000


@pytest.mark.parametrize('value', ['0', '-1', '1.5', 'many', '1001'])
def test_cli_parser_rejects_invalid_plot_resolutions(monkeypatch, value):
    monkeypatch.setattr(sys, 'argv', ['agamcs', '--region', '2L:1-3', '--signal-bins', value])
    with pytest.raises(SystemExit, match='2'):
        main.main()
