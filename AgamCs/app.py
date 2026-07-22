"""Shiny lab demo backed by local HDF5 or Zenodo HTTP range requests."""

import logging
import re
from pathlib import Path
from tempfile import TemporaryDirectory

from shiny import App, reactive, render, req, ui

from AgamCs.create_heatmap import create_heatmap
from AgamCs.fetch_score import fetch_scores, parse_region
from AgamCs.gene_regions import (
    load_annotation_cache,
    load_lookup_cache,
    resolve_accession_details,
    save_annotation_cache,
    save_lookup_cache,
)
from AgamCs.plot_signal_summary import plot_cs_snp_summary


LOGGER = logging.getLogger(__name__)
MAX_WEB_REGION_BASES = 250_000
QUERY_MODES = ('accession', 'region')
_SAFE_STEM_PATTERN = re.compile(r'[^A-Za-z0-9._-]+')


def normalize_region(region, maximum_bases=MAX_WEB_REGION_BASES):
    """Validate and canonicalize a one-based, inclusive web-app interval."""
    chromosome, start, end = parse_region(str(region or '').strip())
    length = end - start + 1
    if length > maximum_bases:
        raise ValueError(
            f'The web demo accepts intervals up to {maximum_bases:,} bp; '
            f'this request spans {length:,} bp. Use the CLI for larger regions.'
        )
    return f'{chromosome}:{start}-{end}'


def parse_highlight_ranges(value):
    """Parse comma-, semicolon-, or whitespace-separated genomic ranges."""
    value = str(value or '').strip()
    if not value:
        return []

    ranges = []
    for item in re.split(r'[\s,;]+', value):
        match = re.fullmatch(r'(\d+)-(\d+)', item)
        if match is None:
            raise ValueError(
                f"Invalid highlight range {item!r}; use absolute start-end "
                "coordinates such as 5887000-5887100."
            )
        start, end = map(int, match.groups())
        if start < 1 or end < start:
            raise ValueError(
                f"Invalid highlight range {item!r}; coordinates must satisfy "
                '1 <= start <= end.'
            )
        ranges.append(f'{start}-{end}')
    return ranges


def resolve_web_request(region=None, accession=None, padding=0):
    """Resolve a web request into a validated region and optional annotation."""
    try:
        padding = int(padding)
    except (TypeError, ValueError) as error:
        raise ValueError('Padding must be a whole number of base pairs.') from error
    if padding < 0:
        raise ValueError('Padding cannot be negative.')

    accession = str(accession or '').strip()
    if not accession:
        return normalize_region(region), None

    lookup_cache = load_lookup_cache()
    annotation_cache = load_annotation_cache()
    before_lookup_cache = dict(lookup_cache)
    before_annotation_cache = dict(annotation_cache)
    resolved_region, gene_annotation = resolve_accession_details(
        accession,
        padding=padding,
        region_cache=lookup_cache,
        annotation_cache=annotation_cache,
    )

    if lookup_cache != before_lookup_cache:
        save_lookup_cache(lookup_cache)
    if annotation_cache != before_annotation_cache:
        save_annotation_cache(annotation_cache)

    return normalize_region(resolved_region), gene_annotation


def resolve_web_query(query_mode, accession=None, region=None, padding=0):
    """Select exactly one query input according to the visible UI mode."""
    if query_mode not in QUERY_MODES:
        raise ValueError('Choose either Gene accession or Genomic region.')
    if query_mode == 'accession':
        if not str(accession or '').strip():
            raise ValueError('Enter a gene accession, for example AGAP011592.')
        return resolve_web_request(accession=accession, padding=padding)
    if not str(region or '').strip():
        raise ValueError('Enter an AgamP4 region, for example 3R:5886340-5889928.')
    return resolve_web_request(region=region)


def result_stem(query_mode, accession, region):
    """Return a short, safe base name for generated downloads."""
    if query_mode == 'accession':
        label = str(accession or '').strip()
    else:
        label = str(region or '').strip().replace(':', '_')
    stem = _SAFE_STEM_PATTERN.sub('_', label).strip('._-')
    return stem or 'agamcs'


def build_plot_bundle(
    region,
    data_source,
    output_dir,
    gene_annotation=None,
    highlight_ranges=None,
    output_stem='agamcs',
    progress=None,
):
    """Fetch one interval and render all web-app outputs from the same TSV."""
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    scores_path = output_dir / f'{output_stem}_scores.tsv'
    heatmap_path = output_dir / f'{output_stem}_heatmap.png'
    cs_profile_path = output_dir / f'{output_stem}_cs_profile.png'

    if progress:
        progress(0.25, 'Reading scores and accessibility', f'Fetching {region}')
    fetch_scores(
        region,
        'Cs,snp_density,stack',
        scores_path,
        data_source=data_source,
    )

    if progress:
        progress(0.65, 'Rendering plots', 'Creating the heatmap')
    create_heatmap(scores_path, heatmap_path)

    if progress:
        progress(0.82, 'Rendering plots', 'Creating the Cs profile')
    plot_cs_snp_summary(
        scores_path,
        cs_profile_path,
        highlight_ranges=highlight_ranges,
        gene_annotation=gene_annotation,
    )

    if progress:
        progress(1, 'Results ready', 'Plots and score table are available')
    return {
        'heatmap': heatmap_path,
        'cs_profile': cs_profile_path,
        'scores': scores_path,
    }


def run_web_request(
    query_mode,
    accession,
    region,
    padding,
    highlights,
    data_source,
    output_dir,
    progress=None,
):
    """Resolve, validate, fetch, and render one complete web request."""
    if progress:
        progress(0.05, 'Validating request', 'Checking coordinates and options')
    highlight_ranges = parse_highlight_ranges(highlights)
    resolved_region, gene_annotation = resolve_web_query(
        query_mode,
        accession=accession,
        region=region,
        padding=padding,
    )
    stem = result_stem(query_mode, accession, resolved_region)
    bundle = build_plot_bundle(
        resolved_region,
        data_source,
        output_dir,
        gene_annotation=gene_annotation,
        highlight_ranges=highlight_ranges,
        output_stem=stem,
        progress=progress,
    )
    _chromosome, start, end = parse_region(resolved_region)
    return {
        **bundle,
        'region': resolved_region,
        'length': end - start + 1,
        'query_mode': query_mode,
        'query_label': str(accession).strip() if query_mode == 'accession' else resolved_region,
        'highlight_count': len(highlight_ranges),
        'data_source': data_source,
    }


def user_error_message(error):
    """Turn expected input, lookup, and transport errors into concise UI text."""
    if isinstance(error, (ValueError, FileNotFoundError, ImportError)):
        return str(error)
    detail = str(error).strip()
    if detail:
        return f'Could not generate results: {detail}'
    return 'Could not generate results. Check the server log for details.'


app_ui = ui.page_sidebar(
    ui.sidebar(
        ui.input_radio_buttons(
            'query_mode',
            'Find scores by',
            {'accession': 'Gene accession', 'region': 'Genomic region'},
            selected='accession',
            inline=True,
        ),
        ui.panel_conditional(
            "input.query_mode === 'accession'",
            ui.input_text('accession', 'Gene accession', 'AGAP011592'),
            ui.input_numeric(
                'padding',
                'Padding (bp)',
                0,
                min=0,
                step=100,
            ),
            ui.help_text('Accession mode resolves and draws the representative transcript.'),
        ),
        ui.panel_conditional(
            "input.query_mode === 'region'",
            ui.input_text('region', 'AgamP4 region', '3R:5886340-5889928'),
            ui.help_text('Region mode plots genomic coordinates without a transcript model.'),
        ),
        ui.input_text_area(
            'highlights',
            'Highlight ranges (optional)',
            rows=2,
            placeholder='5887000-5887100, 5887600-5887700',
            spellcheck='false',
        ),
        ui.help_text('Use absolute genomic start-end coordinates, separated by commas or spaces.'),
        ui.input_select(
            'data_source',
            'Data source',
            {'remote': 'Zenodo (remote)', 'auto': 'Auto-detect', 'local': 'Local HDF5'},
            selected='remote',
        ),
        ui.input_action_button('run_button', 'Generate plots', class_='btn-primary', width='100%'),
        title='Query',
        open='desktop',
    ),
    ui.p(
        'Explore AgamP4 conservation scores without downloading the full 3.7 GB archive. '
        'The remote mode reads only the compressed chunks needed for this interval. '
        'Grey SNP-density regions failed the published accessibility/QC mask and are unknown.'
    ),
    ui.output_ui('run_status'),
    ui.output_ui('download_controls'),
    ui.navset_card_tab(
        ui.nav_panel('Cs profile', ui.output_image('cs_profile')),
        ui.nav_panel('Heatmap', ui.output_image('heatmap')),
        selected='Cs profile',
        full_screen=True,
    ),
    title='AgamCs conservation explorer',
    window_title='AgamCs conservation explorer',
)


def server(input, output, session):
    workspace = TemporaryDirectory(prefix='agamcs-web-')
    session.on_ended(workspace.cleanup)

    @reactive.calc
    @reactive.event(input.run_button)
    def run_result():
        try:
            with ui.Progress(min=0, max=1) as progress:
                result = run_web_request(
                    input.query_mode(),
                    input.accession(),
                    input.region(),
                    input.padding(),
                    input.highlights(),
                    input.data_source(),
                    Path(workspace.name),
                    progress=lambda value, message, detail: progress.set(
                        value=value,
                        message=message,
                        detail=detail,
                    ),
                )
        except Exception as error:  # The UI reports a concise error; the log keeps context.
            LOGGER.exception('AgamCs web request failed')
            message = user_error_message(error)
            ui.notification_show(
                message,
                type='error',
                duration=None,
                id='agamcs-run-result',
            )
            return {'error': message}

        ui.notification_show(
            f"Results ready for {result['query_label']}",
            type='message',
            duration=4,
            id='agamcs-run-result',
        )
        return result

    def successful_result():
        result = run_result()
        req(not result.get('error'))
        return result

    @output
    @render.ui
    def run_status():
        result = run_result()
        if result.get('error'):
            return ui.div(
                ui.strong('Request failed. '),
                result['error'],
                class_='alert alert-danger',
                role='alert',
            )
        highlight_text = (
            f"; {result['highlight_count']} highlighted range(s)"
            if result['highlight_count']
            else ''
        )
        return ui.div(
            ui.strong('Ready: '),
            ui.code(result['region']),
            f" ({result['length']:,} bp; {result['data_source']} source{highlight_text})",
            class_='alert alert-success',
            role='status',
        )

    @output
    @render.ui
    def download_controls():
        successful_result()
        return ui.div(
            ui.download_button('download_cs_profile', 'Download Cs profile'),
            ui.download_button('download_heatmap', 'Download heatmap'),
            ui.download_button('download_scores', 'Download TSV'),
            class_='d-flex flex-wrap gap-2 mb-3',
        )

    @output
    @render.image
    def cs_profile():
        result = successful_result()
        return {
            'src': str(result['cs_profile']),
            'alt': f"Binned Cs and SNP density profile for {result['region']}",
            'style': 'max-width: 100%; height: auto;',
        }

    @output
    @render.image
    def heatmap():
        result = successful_result()
        return {
            'src': str(result['heatmap']),
            'alt': f"Conservation heatmap for {result['region']}",
            'style': 'max-width: 100%; height: auto;',
        }

    @render.download
    def download_cs_profile():
        return str(successful_result()['cs_profile'])

    @render.download
    def download_heatmap():
        return str(successful_result()['heatmap'])

    @render.download
    def download_scores():
        return str(successful_result()['scores'])


app = App(app_ui, server)


if __name__ == '__main__':
    app.run()
