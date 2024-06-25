# AgamCs/main.py

import argparse
from .fetch_score import fetch_scores
from .create_heatmap import create_heatmap
import os


def main():
    parser = argparse.ArgumentParser(description="Fetch conservation scores and create a heatmap.")
    parser.add_argument('--region', required=True, help='Genomic region (e.g., 3R:5886340-5889928)')
    parser.add_argument('--output', required=True, help='Output image file for the heatmap')

    args = parser.parse_args()
    region = args.region
    output_image_path = args.output

    temp_output_file = 'temp_scores.tsv'

    fetch_scores(region, 'Cs,score,snp_density,stack,stack_norm,phyloP', temp_output_file)
    create_heatmap(temp_output_file, output_image_path)

    os.remove(temp_output_file)


if __name__ == "__main__":
    main()
