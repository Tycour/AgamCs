import json
import sys

import pandas as pd
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
    ranked = lambda mean, rank: {
        'total_bases': 3, 'bases_assessed': 3, 'mean_cs': mean,
        'rank_state': 'ranked', 'representative_transcript': 'AGAPTEST-RA',
        'global': {'rank': rank, 'ties': 1, 'percentile': 100.0 if rank == 1 else 0.0,
                   'cohort_denominator': 2},
        'chromosome': {'rank': rank, 'ties': 1, 'percentile': 100.0 if rank == 1 else 0.0,
                       'cohort_denominator': 2},
    }
    absent = {
        'total_bases': 0, 'bases_assessed': 0, 'mean_cs': None,
        'rank_state': 'not_ranked_zero_bases',
        'representative_transcript': 'AGAPTEST-RA',
        'global_cohort_denominator': 0, 'chromosome_cohort_denominator': 0,
        'global': None, 'chromosome': None,
    }
    ranking = {
        'accession': 'AGAPTEST',
        'chromosome': '2L',
        'representative_transcript': 'AGAPTEST-RA',
        'cs': {
            'cohorts': {},
            'gene_span': ranked(0.25, 2),
            'representative_exons': ranked(0.75, 1),
            'representative_cds': ranked(0.80, 1),
            'representative_utr': absent,
            'representative_introns': absent,
        },
    }

    main.process_region(
        '2L:1-3',
        'AGAPTEST',
        results_root=tmp_path,
        gene_ranking=ranking,
    )

    path = tmp_path / 'AGAPTEST' / 'gene_rankings.json'
    assert json.loads(path.read_text()) == ranking
    output = capsys.readouterr().out
    assert 'Gene rankings for AGAPTEST' in output
    assert 'Cs percentile' in output
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


def test_report_json_is_additive_and_uses_stable_batch_output_names(tmp_path, monkeypatch):
    observed = {}
    _stub_plot_pipeline(monkeypatch, observed)
    from AgamCs.create_heatmap import SPECIES_GENOME_CODES

    def fake_fetch(_region, _fields, _path, **_kwargs):
        frame = pd.DataFrame({
            'chromosome': ['2L', '2L'], 'pos': [1, 2],
            'Cs_C': [0.2, 0.4], 'snp_density_s': [0.1, 0.2],
            'is_accessible': [True, False],
        })
        for index, code in enumerate(SPECIES_GENOME_CODES):
            frame[f'stack_{code}'] = [50 + index, 0]
        return frame

    monkeypatch.setattr(fetch_score, 'fetch_scores', fake_fetch)
    main.process_region(
        '2L:1-2', 'AGAPTEST', results_root=tmp_path,
        report_json=True, padding=15,
        gene_annotation={
            'id': 'AGAPTEST', 'transcript_id': 'AGAPTEST-RA', 'chromosome': '2L',
            'start': 1, 'end': 2, 'strand': 1,
            'exons': [{'start': 1, 'end': 2}], 'cds_start': 1, 'cds_end': 2,
        },
    )

    report_path = tmp_path / 'AGAPTEST' / 'AGAPTEST_report.json'
    report = json.loads(report_path.read_text())
    assert report['report_version'] == 'agamcs-query-report-v1'
    assert report['query_state']['padding_bases_per_side'] == 15
    assert report['query_state']['coordinates'] == {'chromosome': '2L', 'start': 1, 'end': 2}


def test_cli_parser_forwards_report_json_without_changing_defaults(monkeypatch):
    calls = []
    monkeypatch.setattr(main, 'build_jobs', lambda _args: [('2L:1-3', 'manual', None, [])])
    monkeypatch.setattr(main, 'process_region', lambda **kwargs: calls.append(kwargs))
    monkeypatch.setattr(sys, 'argv', ['agamcs', '--region', '2L:1-3', '--report-json'])
    main.main()
    assert calls[-1]['report_json'] is True
    assert calls[-1]['padding'] == 0


def test_report_json_keeps_one_named_artifact_per_batch_job(monkeypatch):
    calls = []
    monkeypatch.setattr(
        main, 'build_jobs',
        lambda _args: [('2L:1-3', 'AGAP000001', None, []), ('2R:4-6', 'AGAP000002', None, [])],
    )
    monkeypatch.setattr(main, 'process_region', lambda **kwargs: calls.append(kwargs))
    monkeypatch.setattr(sys, 'argv', [
        'agamcs', '--accessions', 'AGAP000001', 'AGAP000002',
        '--output', 'batch-report', '--report-json',
    ])
    main.main()
    assert [(call['output_name'], call['results_root'], call['report_json']) for call in calls] == [
        ('AGAP000001', 'results/batch-report', True),
        ('AGAP000002', 'results/batch-report', True),
    ]


@pytest.mark.parametrize('value', ['0', '-1', '1.5', 'many', '1001'])
def test_cli_parser_rejects_invalid_plot_resolutions(monkeypatch, value):
    monkeypatch.setattr(sys, 'argv', ['agamcs', '--region', '2L:1-3', '--signal-bins', value])
    with pytest.raises(SystemExit, match='2'):
        main.main()
