"""Minimal Shiny prototype backed by Zenodo HTTP range requests."""

from pathlib import Path
from tempfile import TemporaryDirectory

from shiny import App, reactive, render, ui

from AgamCs.create_heatmap import create_heatmap
from AgamCs.fetch_score import fetch_scores


app_ui = ui.page_fluid(
    ui.panel_title('AgamCs remote prototype'),
    ui.p(
        'Enter an AgamP4 interval. The server reads only the required compressed '
        'HDF5 chunks from the archived Zenodo dataset.'
    ),
    ui.layout_sidebar(
        ui.sidebar(
            ui.input_text('region', 'Genomic region', '3R:5886340-5889928'),
            ui.input_select(
                'data_source',
                'Data source',
                {'remote': 'Zenodo (remote)', 'auto': 'Auto-detect', 'local': 'Local HDF5'},
                selected='remote',
            ),
            ui.input_action_button('run_button', 'Run'),
        ),
        ui.output_image('heatmap'),
    ),
)


def server(input, output, session):
    workspace = TemporaryDirectory(prefix='agamcs-web-')
    session.on_ended(workspace.cleanup)

    @output
    @render.image
    @reactive.event(input.run_button)
    def heatmap():
        output_dir = Path(workspace.name)
        scores_path = output_dir / 'scores.tsv'
        image_path = output_dir / 'heatmap.png'

        fetch_scores(
            input.region(),
            'Cs,snp_density,stack',
            scores_path,
            data_source=input.data_source(),
        )
        create_heatmap(scores_path, image_path)
        return {
            'src': str(image_path),
            'alt': f'AgamCs conservation heatmap for {input.region()}',
            'style': 'max-width: 100%; height: auto;',
        }


app = App(app_ui, server)


if __name__ == '__main__':
    app.run()
