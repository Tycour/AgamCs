"""Offline Matplotlib renderer for the canonical AgamCs heatmap model."""

from __future__ import annotations

import html
import re
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.patches import Patch, Rectangle

from .create_heatmap import (
    CLADE_STYLES,
    CDS_EDGE_COLOR,
    CDS_FACE_COLOR,
    INTRON_COLOR,
    SPECIES_GENOME_CODES,
    SPECIES_LABELS,
    UTR_EDGE_COLOR,
    UTR_FACE_COLOR,
    _cds_segments,
    _draw_species_tree,
    _gene_coordinate_mapper,
)
from .plot_model import (
    blended_identity_rgb,
    build_plot_model,
    dataframe_to_result,
    interpolate_identity_rgb,
    load_plot_contract,
    transcript_annotations_for_display,
)


def _figure_coordinates(geometry, x, y):
    return x / geometry['width'], 1 - y / geometry['height']


def _draw_transcript_rows(fig, geometry, annotation, transcript_annotations, y_top):
    mapper = _gene_coordinate_mapper(annotation)
    minimum, maximum = 0, int(annotation['end']) - int(annotation['start'])
    axis_height = max(40, len(transcript_annotations) * 24 + 18)
    left = geometry['plotLeft'] / geometry['width']
    bottom = 1 - (y_top + axis_height) / geometry['height']
    width = geometry['plotWidth'] / geometry['width']
    axis = fig.add_axes([left, bottom, width, axis_height / geometry['height']])
    axis.set_xlim(minimum, maximum)
    axis.set_ylim(-0.5, len(transcript_annotations) - 0.5)
    for row, transcript in enumerate(reversed(transcript_annotations)):
        selected = transcript.get('transcript_id') == annotation.get('transcript_id')
        exons = []
        for exon in transcript.get('exons') or []:
            left_x, right_x = sorted((mapper(int(exon['start'])), mapper(int(exon['end']))))
            exons.append((left_x, right_x, exon))
        exons.sort()
        for first, second in zip(exons, exons[1:]):
            axis.plot([first[1], second[0]], [row, row], color=INTRON_COLOR,
                      linewidth=2 if selected else 1.4)
        for left_x, right_x, exon in exons:
            axis.add_patch(Rectangle(
                (left_x, row - 0.18), max(1, right_x - left_x), 0.36,
                facecolor=UTR_FACE_COLOR, edgecolor=UTR_EDGE_COLOR,
                linewidth=1.2 if selected else 0.8,
            ))
            if transcript.get('cds_start') is not None and transcript.get('cds_end') is not None:
                overlap_start = max(int(exon['start']), int(transcript['cds_start']))
                overlap_end = min(int(exon['end']), int(transcript['cds_end']))
                if overlap_start <= overlap_end:
                    cds_left, cds_right = sorted((mapper(overlap_start), mapper(overlap_end)))
                    axis.add_patch(Rectangle(
                        (cds_left, row - 0.28), max(1, cds_right - cds_left), 0.56,
                        facecolor=CDS_FACE_COLOR, edgecolor=CDS_EDGE_COLOR,
                        linewidth=1.2 if selected else 0.8,
                    ))
        axis.text(-0.01, row, transcript.get('transcript_id', ''),
                  transform=axis.get_yaxis_transform(), ha='right', va='center',
                  fontsize=7, fontweight='bold' if selected else 'normal')
    axis.axis('off')


def _add_svg_accessibility(path, title, description):
    """Add a screen-reader title and description to Matplotlib SVG output."""
    text = Path(path).read_text(encoding='utf-8')
    labelled_content = (
        f'<title id="agamcs-heatmap-title">{html.escape(title)}</title>'
        f'<desc id="agamcs-heatmap-description">{html.escape(description)}</desc>'
    )
    text = re.sub(
        r'(<svg\b[^>]*?)>',
        lambda match: (
            f'{match.group(1)} role="img" '
            'aria-labelledby="agamcs-heatmap-title agamcs-heatmap-description">'
            f'{labelled_content}'
        ),
        text,
        count=1,
        flags=re.DOTALL,
    )
    Path(path).write_text(text, encoding='utf-8')


def render_heatmap(
    input_file,
    svg_output_path,
    png_output_path,
    gene_annotation=None,
    transcript_annotations=None,
    bins='adaptive',
):
    """Render the canonical binned heatmap to SVG and PNG offline."""
    contract = load_plot_contract()
    data = pd.read_csv(input_file, sep='\t')
    result = dataframe_to_result(data)
    model = build_plot_model(
        result, gene_annotation, transcript_annotations, contract,
        heatmap_bins=bins,
    )
    applied_annotation = gene_annotation if model['annotationApplied'] else None
    transcript_annotations = transcript_annotations_for_display(
        applied_annotation, transcript_annotations,
    )
    geometry = model['rendering']['geometry']
    layout = contract['heatmap_layout']

    fig = plt.figure(
        figsize=(geometry['width'] / 72, geometry['height'] / 72),
        dpi=72,
        facecolor='white',
    )
    plot_bottom = 1 - (geometry['rowTop'] + geometry['plotHeight']) / geometry['height']
    heatmap_axis = fig.add_axes([
        geometry['plotLeft'] / geometry['width'],
        plot_bottom,
        geometry['plotWidth'] / geometry['width'],
        geometry['plotHeight'] / geometry['height'],
    ])
    bin_count = model['heatmap']['binCount']
    for row_index, row in enumerate(model['heatmap']['cells']):
        for bin_index, cell in enumerate(row):
            rgb = np.asarray(blended_identity_rgb(
                cell['identity'], cell['detectedFraction'], contract,
            )) / 255
            heatmap_axis.add_patch(Rectangle(
                (bin_index, row_index), 1.002, 1.002,
                facecolor=rgb, edgecolor='none', linewidth=0,
            ))
    if applied_annotation:
        minimum = model['heatmap']['minimum']
        maximum = model['heatmap']['maximum']
        span = maximum - minimum
        map_x = lambda value: (
            bin_count / 2 if span == 0 else (value - minimum) / span * bin_count
        )
        for left, right in _cds_segments(applied_annotation):
            left_x, right_x = sorted((map_x(left), map_x(right)))
            heatmap_axis.add_patch(Rectangle(
                (left_x, -0.38), max(0.5, right_x - left_x), 0.32,
                facecolor=CDS_FACE_COLOR, edgecolor=CDS_EDGE_COLOR,
                linewidth=0.7, clip_on=False,
            ))
            for boundary in (left_x, right_x):
                heatmap_axis.axvline(
                    boundary, color='white', linewidth=0.7,
                    linestyle=(0, (4, 3)), alpha=0.72,
                )
    heatmap_axis.set_xlim(0, bin_count)
    heatmap_axis.set_ylim(len(result['stackRows']), 0)
    heatmap_axis.axis('off')

    tree_axis = fig.add_axes([
        22 / geometry['width'], plot_bottom,
        44 / geometry['width'], geometry['plotHeight'] / geometry['height'],
    ])
    _draw_species_tree(tree_axis)
    for row_index, label in enumerate(SPECIES_LABELS):
        x, y = _figure_coordinates(
            geometry, geometry['plotLeft'] - 12,
            geometry['rowTop'] + (row_index + 0.68) * geometry['rowHeight'],
        )
        fig.text(x, y, label, ha='right', va='center', fontsize=7.9,
                 fontstyle='italic', fontweight='semibold', color='#172925')
        clade_index = next(
            index for index, (_name, codes, _foreground, _background)
            in enumerate(CLADE_STYLES) if SPECIES_GENOME_CODES[row_index] in codes
        )
        foreground = CLADE_STYLES[clade_index][2]
        strip_y = 1 - (
            geometry['rowTop'] + (row_index + 1) * geometry['rowHeight'] - 2
        ) / geometry['height']
        fig.add_artist(Rectangle(
            (72 / geometry['width'], strip_y),
            4 / geometry['width'],
            (geometry['rowHeight'] - 4) / geometry['height'],
            transform=fig.transFigure, facecolor=foreground, edgecolor='none',
        ))

    title_x, title_y = _figure_coordinates(geometry, geometry['plotLeft'], 27)
    fig.text(title_x, title_y, layout['title'], ha='left', va='baseline',
             fontsize=13, fontweight='bold', color='#172925')
    subtitle_x, subtitle_y = _figure_coordinates(geometry, geometry['plotLeft'], 49)
    fig.text(
        subtitle_x, subtitle_y,
        f"{len(result['stackRows'])} metadata-ordered species · {bin_count} display bins",
        ha='left', va='baseline', fontsize=8.5, color='#5d6b67',
    )
    legend_y = geometry['rowTop'] + geometry['plotHeight'] + 27
    legend_x, legend_fig_y = _figure_coordinates(geometry, geometry['plotLeft'], legend_y)
    fig.legend(
        handles=[Patch(facecolor=np.asarray(contract['palette']['no_interval_rgb']) / 255,
                       label=layout['no_interval_label'])],
        loc='center left', bbox_to_anchor=(legend_x, legend_fig_y),
        frameon=False, fontsize=8,
    )
    gradient_axis = fig.add_axes([
        700 / geometry['width'],
        1 - legend_y / geometry['height'],
        190 / geometry['width'],
        13 / geometry['height'],
    ])
    gradient = np.asarray([
        interpolate_identity_rgb(value, contract) for value in np.linspace(0, 100, 256)
    ], dtype=float)[None, :, :] / 255
    gradient_axis.imshow(gradient, aspect='auto', interpolation='nearest')
    gradient_axis.axis('off')
    fig.text(*_figure_coordinates(geometry, 696, legend_y + 16), '0',
             ha='center', va='baseline', fontsize=7, color='#5d6b67')
    fig.text(*_figure_coordinates(geometry, 894, legend_y + 16), '100',
             ha='center', va='baseline', fontsize=7, color='#5d6b67')
    fig.text(
        *_figure_coordinates(geometry, 795, legend_y + 32),
        layout['identity_label'], ha='center', va='baseline', fontsize=8, color='#5d6b67',
    )
    for index, (name, _codes, foreground, _background) in enumerate(CLADE_STYLES):
        column, row = index % 2, index // 2
        fig.text(*_figure_coordinates(geometry, 36 + column * 108, 43 + row * 18),
                 name, ha='left', va='baseline', fontsize=6.5, color=foreground)
    fig.text(*_figure_coordinates(geometry, 22, 22), 'Evidence-bounded cladogram',
             ha='left', va='baseline', fontsize=7, color='#5d6b67')

    if applied_annotation:
        _draw_transcript_rows(
            fig, geometry, applied_annotation, transcript_annotations, legend_y + 60,
        )
        fig.text(
            *_figure_coordinates(geometry, (geometry['plotLeft'] + geometry['plotRight']) / 2,
                                  geometry['height'] - 24),
            f"Position relative to {applied_annotation['id']} transcription start (bp)",
            ha='center', va='baseline', fontsize=8.5, color='#172925',
        )

    description = (
        f"Cross-species conserved-interval heatmap for {result['chromosome']}:"
        f"{result['start']}-{result['end']}; {bin_count} display bins. "
        "Zero means no detected CNEr interval, not measured zero percent identity. "
        "QC-failed SNP positions remain unknown."
    )
    svg_output_path = Path(svg_output_path)
    png_output_path = Path(png_output_path)
    svg_output_path.parent.mkdir(parents=True, exist_ok=True)
    png_output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(svg_output_path, format='svg', dpi=72, metadata={
        'Description': description,
    })
    fig.savefig(png_output_path, format='png', dpi=72, facecolor='white')
    plt.close(fig)
    _add_svg_accessibility(svg_output_path, layout['title'], description)
    return model
