from pathlib import Path

import pytest

from AgamCs import app


def test_build_plot_bundle_fetches_once_and_renders_downloadable_outputs(
    tmp_path,
    monkeypatch,
):
    observed = {}
    progress_updates = []

    def fake_fetch_scores(region, arrays, output_path, data_source):
        observed['fetch'] = {
            'region': region,
            'arrays': arrays,
            'output_path': Path(output_path),
            'data_source': data_source,
        }
        Path(output_path).write_text(
            'chromosome\tpos\tCs_C\tsnp_density_s\n'
            '3R\t10\t0.1\t0.0\n'
            '3R\t11\t0.2\t0.1\n'
        )

    def fake_create_heatmap(input_path, output_path):
        observed['heatmap_input'] = Path(input_path)
        Path(output_path).write_bytes(b'heatmap')

    annotation = {'id': 'AGAPTEST'}

    def fake_plot_summary(
        input_path,
        output_path,
        highlight_ranges=None,
        gene_annotation=None,
    ):
        observed['summary_input'] = Path(input_path)
        observed['highlights'] = highlight_ranges
        observed['gene_annotation'] = gene_annotation
        Path(output_path).write_bytes(b'profile')

    monkeypatch.setattr(app, 'fetch_scores', fake_fetch_scores)
    monkeypatch.setattr(app, 'create_heatmap', fake_create_heatmap)
    monkeypatch.setattr(app, 'plot_cs_snp_summary', fake_plot_summary)

    bundle = app.build_plot_bundle(
        '3R:10-11',
        'remote',
        tmp_path,
        gene_annotation=annotation,
        highlight_ranges=['10-10'],
        output_stem='AGAPTEST',
        progress=lambda *update: progress_updates.append(update),
    )

    scores_path = tmp_path / 'AGAPTEST_scores.tsv'
    assert observed['fetch'] == {
        'region': '3R:10-11',
        'arrays': 'Cs,snp_density,stack',
        'output_path': scores_path,
        'data_source': 'remote',
    }
    assert observed['heatmap_input'] == scores_path
    assert observed['summary_input'] == scores_path
    assert observed['highlights'] == ['10-10']
    assert observed['gene_annotation'] == annotation
    assert bundle == {
        'heatmap': tmp_path / 'AGAPTEST_heatmap.png',
        'cs_profile': tmp_path / 'AGAPTEST_cs_profile.png',
        'scores': scores_path,
    }
    assert [update[0] for update in progress_updates] == [0.25, 0.65, 0.82, 1]


def test_run_web_request_returns_metadata_for_status_and_downloads(tmp_path, monkeypatch):
    observed = {}
    annotation = {'id': 'AGAPTEST'}

    def fake_resolve(query_mode, accession, region, padding):
        observed['resolve'] = (query_mode, accession, region, padding)
        return '3R:10-20', annotation

    def fake_build(
        resolved_region,
        data_source,
        output_dir,
        gene_annotation,
        highlight_ranges,
        output_stem,
        progress,
    ):
        observed['build'] = {
            'region': resolved_region,
            'source': data_source,
            'annotation': gene_annotation,
            'highlights': highlight_ranges,
            'stem': output_stem,
            'progress': progress,
        }
        return {
            'scores': tmp_path / 'AGAPTEST_scores.tsv',
            'heatmap': tmp_path / 'AGAPTEST_heatmap.png',
            'cs_profile': tmp_path / 'AGAPTEST_cs_profile.png',
        }

    monkeypatch.setattr(app, 'resolve_web_query', fake_resolve)
    monkeypatch.setattr(app, 'build_plot_bundle', fake_build)

    result = app.run_web_request(
        'accession',
        'AGAPTEST',
        'unused',
        100,
        '12-14, 18-20',
        'remote',
        tmp_path,
    )

    assert observed['resolve'] == ('accession', 'AGAPTEST', 'unused', 100)
    assert observed['build']['annotation'] == annotation
    assert observed['build']['highlights'] == ['12-14', '18-20']
    assert observed['build']['stem'] == 'AGAPTEST'
    assert result['region'] == '3R:10-20'
    assert result['length'] == 11
    assert result['query_label'] == 'AGAPTEST'
    assert result['highlight_count'] == 2
    assert result['data_source'] == 'remote'


def test_parse_highlight_ranges_accepts_supported_separators():
    assert app.parse_highlight_ranges('10-20, 30-40\n50-60;70-80') == [
        '10-20',
        '30-40',
        '50-60',
        '70-80',
    ]
    assert app.parse_highlight_ranges('') == []


@pytest.mark.parametrize('value', ['10', '10:20', '20-10', '0-10', '10-a'])
def test_parse_highlight_ranges_rejects_invalid_values(value):
    with pytest.raises(ValueError, match='highlight range'):
        app.parse_highlight_ranges(value)


def test_normalize_region_canonicalizes_commas_and_limits_web_reads():
    assert app.normalize_region('3R:1,000-1,099') == '3R:1000-1099'
    with pytest.raises(ValueError, match='Use the CLI'):
        app.normalize_region('3R:1-1001', maximum_bases=1000)


def test_resolve_web_request_uses_accession_annotation_and_saves_changed_caches(
    monkeypatch,
):
    observed = {}
    annotation = {'id': 'AGAPTEST', 'chromosome': '3R', 'start': 10, 'end': 20}

    def fake_resolve(accession, padding, region_cache, annotation_cache):
        region_cache['AGAPTEST'] = '3R:10-20'
        annotation_cache['AGAPTEST'] = annotation
        observed['resolve'] = {
            'accession': accession,
            'padding': padding,
        }
        return '3R:5-25', annotation

    monkeypatch.setattr(app, 'load_lookup_cache', lambda: {})
    monkeypatch.setattr(app, 'load_annotation_cache', lambda: {})
    monkeypatch.setattr(app, 'resolve_accession_details', fake_resolve)
    monkeypatch.setattr(
        app,
        'save_lookup_cache',
        lambda cache: observed.setdefault('lookup_cache', cache),
    )
    monkeypatch.setattr(
        app,
        'save_annotation_cache',
        lambda cache: observed.setdefault('annotation_cache', cache),
    )

    region, resolved_annotation = app.resolve_web_request(
        '3R:100-200',
        accession='AGAPTEST',
        padding=5,
    )

    assert region == '3R:5-25'
    assert resolved_annotation == annotation
    assert observed['resolve'] == {'accession': 'AGAPTEST', 'padding': 5}
    assert observed['lookup_cache'] == {'AGAPTEST': '3R:10-20'}
    assert observed['annotation_cache'] == {'AGAPTEST': annotation}


def test_resolve_web_request_leaves_plain_regions_unannotated():
    assert app.resolve_web_request('3R:100-200', accession='') == ('3R:100-200', None)


def test_resolve_web_query_uses_only_the_selected_mode(monkeypatch):
    calls = []

    def fake_resolve(region=None, accession=None, padding=0):
        calls.append((region, accession, padding))
        return '3R:1-2', None

    monkeypatch.setattr(app, 'resolve_web_request', fake_resolve)

    app.resolve_web_query('accession', accession='AGAP1', region='invalid', padding=25)
    app.resolve_web_query('region', accession='ignored', region='3R:1-2', padding=999)

    assert calls == [(None, 'AGAP1', 25), ('3R:1-2', None, 0)]


def test_result_stem_is_safe_for_download_filenames():
    assert app.result_stem('accession', ' AGAP011592 ', 'unused') == 'AGAP011592'
    assert app.result_stem('region', '', '3R:100-200') == '3R_100-200'


def test_user_error_message_preserves_expected_errors():
    assert app.user_error_message(ValueError('Bad coordinates')) == 'Bad coordinates'
    assert app.user_error_message(RuntimeError('network unavailable')) == (
        'Could not generate results: network unavailable'
    )
