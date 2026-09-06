# main.py

import argparse
import json
import os
from pathlib import Path
from .gene_regions import (
    load_annotation_cache,
    load_lookup_cache,
    parse_list_values,
    read_list_file,
    resolve_accession_plot_details,
    save_annotation_cache,
    save_lookup_cache,
)


def _plot_resolution(value):
    from .plot_model import validate_plot_resolution

    try:
        return validate_plot_resolution(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError(str(error)) from error


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
    accessibility_file=None,
    transcript_annotations=None,
    heatmap_mode='binned',
    signal_bins='adaptive',
    heatmap_bins='adaptive',
    gene_ranking=None,
    report_json=False,
    padding=0,
):
    from .create_heatmap import create_heatmap, plot_cs_snp_density
    from .fetch_score import fetch_scores
    from .plot_signal_summary import plot_cs_snp_summary

    results_dir = os.path.join(results_root, output_name)
    os.makedirs(results_dir, exist_ok=True)

    tsv_filename = os.path.join(results_dir, 'temp_scores.tsv')
    score_frame = fetch_scores(
        region,
        'Cs,score,snp_density,stack,stack_norm,phyloP',
        tsv_filename,
        data_source=data_source,
        reference_file=reference_file,
        remote_url=remote_url,
        accessibility_file=accessibility_file,
    )

    heatmap_png_path = os.path.join(results_dir, f"{output_name}_heatmap.png")
    if heatmap_mode == 'binned':
        from .heatmap_renderer import render_heatmap

        render_heatmap(
            tsv_filename,
            os.path.join(results_dir, f"{output_name}_heatmap.svg"),
            heatmap_png_path,
            gene_annotation=gene_annotation,
            transcript_annotations=transcript_annotations,
            bins=heatmap_bins,
        )
    elif heatmap_mode == 'base-level':
        create_heatmap(
            tsv_filename,
            heatmap_png_path,
            gene_annotation=gene_annotation,
        )
    else:
        raise ValueError(f'Unsupported heatmap mode: {heatmap_mode}')

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
        bins=signal_bins,
    )

    if gene_ranking is not None:
        from .gene_ranking import format_gene_ranking

        ranking_path = os.path.join(results_dir, 'gene_rankings.json')
        Path(ranking_path).write_text(
            json.dumps(gene_ranking, indent=2) + '\n', encoding='utf-8',
        )
        print(format_gene_ranking(gene_ranking))
        print(f'Gene ranking saved as {ranking_path}')

    if report_json:
        from .plot_model import dataframe_to_result, resolve_bin_count
        from .query_report import build_report, validate_report
        from .species_topology import load_species_topology

        if score_frame is None:
            raise ValueError('Report JSON requires fetch_scores to return the exact query table.')
        report_result = dataframe_to_result(score_frame)
        report_result['stackTopology'] = load_species_topology()
        query_start, query_end = report_result['start'], report_result['end']
        width = query_end - query_start + 1
        report = build_report(
            report_result,
            annotation=gene_annotation,
            transcript_annotations=transcript_annotations or (),
            ranking=gene_ranking,
            query_state={
                'mode': 'accession' if gene_annotation else 'coordinates',
                'accession': gene_annotation.get('id') if gene_annotation else None,
                'padding_bases_per_side': padding if gene_annotation else 0,
            },
            display={
                'start': query_start,
                'end': query_end,
                'signal_resolution_bins': resolve_bin_count(width, 'signal', signal_bins),
                'heatmap_resolution_bins': resolve_bin_count(width, 'heatmap', heatmap_bins),
            },
        )
        validate_report(report)
        report_path = os.path.join(results_dir, f'{output_name}_report.json')
        Path(report_path).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        print(f'Reproducible report saved as {report_path}')

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
        jobs.append((region, output_name, None, []))

    for region in read_list_file(args.regions_file) if args.regions_file else []:
        jobs.append((region, region.replace(':', '_').replace('-', '_'), None, []))

    accessions = parse_list_values(args.accessions)
    if args.accessions_file:
        accessions.extend(read_list_file(args.accessions_file))

    for accession in accessions:
        try:
            before_lookup_cache = dict(lookup_cache) if lookup_cache is not None else None
            before_annotation_cache = dict(annotation_cache) if annotation_cache is not None else None
            region, gene_annotation, transcript_annotations = resolve_accession_plot_details(
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
        jobs.append((region, accession, gene_annotation, transcript_annotations))

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
        '--report-json', action='store_true',
        help='Write an additive versioned reproducible JSON report beside each output.',
    )
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
    parser.add_argument(
        '--accessibility-file',
        help='Optional override for the bundled Ag1000G accessibility companion track',
    )
    parser.add_argument('--highlight', nargs='+',
                        help='One or more ranges to highlight. E.g., --highlight 5887000-5888000')
    parser.add_argument(
        '--heatmap-mode',
        choices=('binned', 'base-level'),
        default='binned',
        help=(
            'Heatmap renderer: contract-driven adaptive/optional display bins with SVG and '
            'PNG (default), or the legacy per-base PNG.'
        ),
    )
    parser.add_argument(
        '--signal-bins',
        type=_plot_resolution,
        default='adaptive',
        metavar='adaptive|INTEGER',
        help=(
            'Cs/SNP display resolution: adaptive (one bin per base through 1,000 '
            'bases, then capped at 1,000 bins) or a positive integer through 1,000.'
        ),
    )
    parser.add_argument(
        '--heatmap-bins',
        type=_plot_resolution,
        default='adaptive',
        metavar='adaptive|INTEGER',
        help=(
            'Binned heatmap display resolution: adaptive (one bin per base through '
            '1,000 bases, then capped at 1,000 bins) or a positive integer through '
            '1,000. The legacy '
            '--heatmap-mode base-level remains per-base.'
        ),
    )

    args = parser.parse_args()
    jobs = build_jobs(args)
    batch_mode = len(jobs) > 1 or args.regions_file or args.accessions or args.accessions_file
    results_root = os.path.join('results', Path(args.output).stem) if batch_mode else 'results'

    ranking_document = None
    ranking_load_attempted = False

    for region, output_name, gene_annotation, transcript_annotations in jobs:
        gene_ranking = None
        ranking_accession = gene_annotation.get('id') if gene_annotation else None
        if ranking_accession:
            try:
                from .gene_ranking import load_gene_rankings, ranking_for_gene

                if not ranking_load_attempted:
                    ranking_document = load_gene_rankings()
                    ranking_load_attempted = True
                gene_ranking = ranking_for_gene(ranking_accession, ranking_document)
            except (FileNotFoundError, ValueError) as error:
                ranking_load_attempted = True
                print(f'Warning: gene ranking unavailable: {error}')
        print(f'Processing {output_name}: {region}')
        process_region(
            region=region,
            output_name=output_name,
            highlight_ranges=args.highlight,
            keep_tsv=args.keep_tsv,
            results_root=results_root,
            gene_annotation=gene_annotation,
            transcript_annotations=transcript_annotations,
            heatmap_mode=args.heatmap_mode,
            signal_bins=args.signal_bins,
            heatmap_bins=args.heatmap_bins,
            data_source=args.data_source,
            reference_file=args.reference_file,
            remote_url=args.remote_url,
            accessibility_file=args.accessibility_file,
            gene_ranking=gene_ranking,
            report_json=args.report_json,
            padding=args.padding,
        )


if __name__ == "__main__":
    main()
