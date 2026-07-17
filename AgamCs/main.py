# main.py

import argparse
import os
from pathlib import Path
from .gene_regions import (
    load_annotation_cache,
    load_lookup_cache,
    parse_list_values,
    read_list_file,
    resolve_accession_details,
    save_annotation_cache,
    save_lookup_cache,
)


def process_region(
    region,
    output_name,
    highlight_ranges=None,
    keep_tsv=True,
    results_root='results',
    gene_annotation=None,
    data_source='auto',
    reference_file=None,
    remote_url=None,
):
    from .create_heatmap import create_heatmap, plot_cs_snp_density
    from .fetch_score import fetch_scores
    from .plot_signal_summary import plot_cs_snp_summary

    results_dir = os.path.join(results_root, output_name)
    os.makedirs(results_dir, exist_ok=True)

    tsv_filename = os.path.join(results_dir, 'temp_scores.tsv')
    fetch_scores(
        region,
        'Cs,score,snp_density,stack,stack_norm,phyloP',
        tsv_filename,
        data_source=data_source,
        reference_file=reference_file,
        remote_url=remote_url,
    )

    heatmap_path = os.path.join(results_dir, f"{output_name}_heatmap.png")
    create_heatmap(tsv_filename, heatmap_path)

    cs_snp_density_output_path = os.path.join(results_dir, f"{output_name}_cs_snp_density.png")
    plot_cs_snp_density(
        tsv_filename,
        cs_snp_density_output_path,
        highlight_ranges,
        gene_annotation,
    )

    cs_snp_summary_output_path = os.path.join(
        results_dir,
        f"{output_name}_cs_snp_summary.png",
    )
    plot_cs_snp_summary(
        tsv_filename,
        cs_snp_summary_output_path,
        highlight_ranges,
        gene_annotation,
    )

    if not keep_tsv:
        os.remove(tsv_filename)
    else:
        print(f'TSV file saved as {tsv_filename}')

    print(f'Plots saved in the {results_dir} directory')


def build_jobs(args):
    jobs = []
    lookup_cache = load_lookup_cache() if args.annotation is None else None
    annotation_cache = load_annotation_cache() if args.annotation is None else None
    lookup_cache_changed = False
    annotation_cache_changed = False

    for region in parse_list_values(args.region):
        output_name = Path(args.output).stem if args.output and len(parse_list_values(args.region)) == 1 else region.replace(':', '_').replace('-', '_')
        jobs.append((region, output_name, None))

    for region in read_list_file(args.regions_file) if args.regions_file else []:
        jobs.append((region, region.replace(':', '_').replace('-', '_'), None))

    accessions = parse_list_values(args.accessions)
    if args.accessions_file:
        accessions.extend(read_list_file(args.accessions_file))

    for accession in accessions:
        try:
            before_lookup_cache = dict(lookup_cache) if lookup_cache is not None else None
            before_annotation_cache = dict(annotation_cache) if annotation_cache is not None else None
            region, gene_annotation = resolve_accession_details(
                accession,
                args.annotation,
                args.padding,
                lookup_cache,
                annotation_cache,
            )
            lookup_cache_changed = lookup_cache_changed or (
                lookup_cache is not None and before_lookup_cache != lookup_cache
            )
            annotation_cache_changed = annotation_cache_changed or (
                annotation_cache is not None and before_annotation_cache != annotation_cache
            )
        except Exception as error:
            print(f'Warning: skipped {accession}: {error}')
            continue
        jobs.append((region, accession, gene_annotation))

    if lookup_cache_changed:
        save_lookup_cache(lookup_cache)
    if annotation_cache_changed:
        save_annotation_cache(annotation_cache)

    if not jobs:
        raise ValueError('Provide --region, --regions-file, --accessions, or --accessions-file.')

    return jobs


def main():
    parser = argparse.ArgumentParser(description="Fetch conservation scores and create a heatmap and plots.")
    parser.add_argument('--region', nargs='*', help='Genomic region(s), e.g. 3R:5886340-5889928')
    parser.add_argument('--regions-file', help='Text file containing one genomic region per line')
    parser.add_argument('--accessions', nargs='*', help='Gene accession(s), e.g. AGAP008118')
    parser.add_argument('--accessions-file', help='Text file containing one gene accession per line')
    parser.add_argument('--annotation', help='Optional GFF3, CSV, or TSV file for offline accession lookup')
    parser.add_argument('--padding', type=int, default=0, help='Base pairs to add around each accession-derived region')
    parser.add_argument('--output', default='AgamCs', help='Output name for single runs or the batch directory name')
    parser.add_argument('--keep-tsv', action='store_true', default=True,
                        help='Keep the intermediate TSV file with the same name as the output image')
    parser.add_argument(
        '--data-source',
        choices=('auto', 'local', 'remote'),
        default='auto',
        help='Use local HDF5, remote Zenodo range reads, or auto-detect (default: auto)',
    )
    parser.add_argument(
        '--reference-file',
        help='Optional path to a Kerchunk reference JSON for remote reads',
    )
    parser.add_argument(
        '--remote-url',
        help='Optional HDF5 mirror URL to substitute for the bundled Zenodo URL',
    )
    parser.add_argument('--highlight', nargs='+',
                        help='One or more ranges to highlight. E.g., --highlight 5887000-5888000')

    args = parser.parse_args()
    jobs = build_jobs(args)
    batch_mode = len(jobs) > 1 or args.regions_file or args.accessions or args.accessions_file
    results_root = os.path.join('results', Path(args.output).stem) if batch_mode else 'results'

    for region, output_name, gene_annotation in jobs:
        print(f'Processing {output_name}: {region}')
        process_region(
            region,
            output_name,
            args.highlight,
            args.keep_tsv,
            results_root,
            gene_annotation,
            args.data_source,
            args.reference_file,
            args.remote_url,
        )


if __name__ == "__main__":
    main()
