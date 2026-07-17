import os
from shiny import App, render, ui, reactive
from fetch_score import fetch_scores
from create_heatmap import create_heatmap

# Define the UI
app_ui = ui.page_fluid(
    ui.panel_title("AgamCs Web Interface"),
    ui.layout_sidebar(
        ui.sidebar(
            ui.input_text("region", "Genomic Region", "3R:5886340-5889928"),
            ui.input_text("output_file", "Output Image File", "output_heatmap.png"),
            ui.input_action_button("run_button", "Run")
        ),
        ui.main_panel(
            ui.output_image("heatmap", "Heatmap")
        )
    )
)

# Define the server
def server(input, output, session):
    @reactive.Effect
    @reactive.event(input.run_button)
    def run_agamcs():
        region = input.region()
        output_file = input.output_file()
        temp_output_file = 'temp_scores.tsv'

        fetch_scores(region, 'Cs,score,snp_density,stack,stack_norm,phyloP', temp_output_file)
        create_heatmap(temp_output_file, output_file)
        os.remove(temp_output_file)

        output.heatmap.set_src(output_file)

# Create the app
app = App(app_ui, server)

# Run the app
if __name__ == "__main__":
    app.run()