# create_heatmap.py

import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.ticker import MaxNLocator, FuncFormatter
from matplotlib.font_manager import FontProperties
from matplotlib.patches import Patch, Rectangle


INACCESSIBLE_COLOR = '#969696'
NO_CNE_INTERVAL_COLOR = '#2f2f2f'
CDS_BOUNDARY_GUIDE_COLOR = '#595959'
CDS_FACE_COLOR = '#2171b5'
CDS_EDGE_COLOR = '#084594'
UTR_FACE_COLOR = '#deebf7'
UTR_EDGE_COLOR = '#2171b5'
INTRON_COLOR = '#4d4d4d'

# ``stack`` rows are keyed by reference-genome codes in the HDF5 metadata. The
# scoring factors below were verified from non-zero ``stack_norm / stack``
# ratios in the released HDF5. Keep each code, display label, and factor coupled
# so TSV column order cannot silently attach metadata to the wrong heatmap row.
_SPECIES_METADATA = (
    ('AcolM1', 'An. coluzzii', 0.05762710),
    ('AaraD1', 'An. arabiensis', 0.06529441),
    ('AquaS1', 'An. quadriannulatus', 0.07335419),
    ('AmelC2', 'An. melas', 0.08462369),
    ('AmerM2', 'An. merus', 0.08553242),
    ('AchrA1', 'An. christyi', 0.37320513),
    ('AsinC2', 'An. sinensis', 0.50000000),
    ('AepiE1', 'An. epiroticus', 0.50000000),
    ('AminM1', 'An. minimus', 0.51938444),
    ('AmacM1', 'An. maculatus', 0.54403692),
    ('AculA1', 'An. culicifacies', 0.56968802),
    ('AsteI2', 'An. stephensi', 0.58201295),
    ('AfunF1', 'An. funestus', 0.61755806),
    ('AatrE3', 'An. atroparvus', 0.66815686),
    ('AdirW1', 'An. dirus', 0.68838775),
    ('AfarF2', 'An. farauti', 0.68981272),
    ('AdarC3', 'An. darlingi', 0.69153583),
    ('AalbS2', 'An. albimanus', 0.69723785),
    ('AaegL5', 'Ae. aegypti', 0.71218956),
    ('CpipJ2', 'Cx. quinquefasciatus', 0.68016356),
    ('DmelP6', 'D. melanogaster', 0.80923682),
)
SPECIES = _SPECIES_METADATA
SPECIES_GENOME_CODES = [genome for genome, _label, _factor in SPECIES]
SPECIES_LABELS = [label for _genome, label, _factor in SPECIES]
SPECIES_SCORING_FACTORS = {
    genome: factor for genome, _label, factor in SPECIES
}
SPECIES_LABEL_BY_CODE = {
    genome: label for genome, label, _factor in SPECIES
}

GAMBIAE_COMPLEX_CODES = ('AcolM1', 'AaraD1', 'AquaS1', 'AmelC2', 'AmerM2')
OTHER_OLD_WORLD_CODES = (
    'AchrA1', 'AsinC2', 'AepiE1', 'AminM1', 'AmacM1', 'AculA1',
    'AsteI2', 'AfunF1', 'AatrE3', 'AdirW1', 'AfarF2',
)
NEW_WORLD_CODES = ('AdarC3', 'AalbS2')
OUTGROUP_CODES = ('AaegL5', 'CpipJ2', 'DmelP6')

# The taxon order and topology follow the whole-genome alignment described in
# https://doi.org/10.3390/insects12020097, on which this resource is based.
# The fitted Newick tree is not distributed with the score dataset, so this is
# a compact, representative cladogram rather than a reconstruction with fitted
# branch lengths. Its nested splits restore taxonomic orientation without
# implying that horizontal distance is evolutionary distance.
SPECIES_TREE = (
    (
        ((SPECIES_LABELS[0], SPECIES_LABELS[1]),
         (SPECIES_LABELS[2], (SPECIES_LABELS[3], SPECIES_LABELS[4]))),
        (SPECIES_LABELS[5],
         (SPECIES_LABELS[6],
          ((SPECIES_LABELS[7],
            (SPECIES_LABELS[8],
             (SPECIES_LABELS[9], SPECIES_LABELS[10]))),
           (SPECIES_LABELS[11],
            (SPECIES_LABELS[12],
             (SPECIES_LABELS[13],
              (SPECIES_LABELS[14], SPECIES_LABELS[15]))))))),
        (SPECIES_LABELS[16], SPECIES_LABELS[17]),
    ),
    ((SPECIES_LABELS[18], SPECIES_LABELS[19]), SPECIES_LABELS[20]),
)

CLADE_STYLES = (
    ('gambiae complex', GAMBIAE_COMPLEX_CODES, '#3f007d', '#eee5f7'),
    ('Other Anopheles', OTHER_OLD_WORLD_CODES, '#8c2981', '#f6e6f1'),
    ('New World', NEW_WORLD_CODES, '#cc4678', '#fae7ee'),
    (
        'Outgroups',
        OUTGROUP_CODES,
        '#d95f0e',
        '#fbe6cf',
    ),
)

def _draw_species_tree(ax, tree=SPECIES_TREE, labels=SPECIES_LABELS):
    """Draw a compact, unscaled cladogram aligned with heatmap rows."""
    y_positions = {label: index + 0.5 for index, label in enumerate(labels)}

    def depth(node):
        if isinstance(node, str):
            return 0
        return 1 + max(depth(child) for child in node)

    maximum_depth = depth(tree)

    def draw(node):
        if isinstance(node, str):
            return maximum_depth, y_positions[node]
        children = [draw(child) for child in node]
        x = maximum_depth - depth(node)
        child_ys = [child[1] for child in children]
        ax.plot([x, x], [min(child_ys), max(child_ys)], color='#4d4d4d', lw=0.8)
        for child_x, child_y in children:
            ax.plot([x, child_x], [child_y, child_y], color='#4d4d4d', lw=0.8)
        return x, sum(child_ys) / len(child_ys)

    draw(tree)
    ax.set_xlim(-0.25, maximum_depth + 0.15)
    ax.set_ylim(len(labels), 0)
    ax.axis('off')


def _style_species_labels(ax):
    """Colour label text and backgrounds by broad taxonomic group."""
    index_by_code = {
        code: index for index, code in enumerate(SPECIES_GENOME_CODES)
    }
    for _name, genome_codes, foreground, background in CLADE_STYLES:
        for code in genome_codes:
            index = index_by_code[code]
            label = ax.get_yticklabels()[index]
            label.set_color(foreground)
            label.set_fontproperties(FontProperties(style='italic', weight='semibold'))
            label.set_bbox({'facecolor': background, 'edgecolor': 'none',
                            'boxstyle': 'round,pad=0.16'})


def _clade_legend_handles():
    """Return explicit legend entries for the four label-colour groups."""
    return [
        Patch(facecolor=foreground, edgecolor='none', label=name)
        for name, _codes, foreground, _background in CLADE_STYLES
    ]


def _ordered_sequence_identity(data, position_order):
    """Return the ``stack`` matrix in metadata-backed species order."""
    columns = data.filter(regex='^stack_(?!norm)').copy()
    columns.columns = [column.replace('stack_', '', 1) for column in columns.columns]
    missing = [code for code in SPECIES_GENOME_CODES if code not in columns]
    if missing:
        raise ValueError(
            'The score table is missing expected stack rows: '
            + ', '.join(missing)
        )
    return columns.loc[position_order, SPECIES_GENOME_CODES].T


def _heatmap_colormap():
    """Return the perceptually uniform identity colour scale."""
    return plt.get_cmap('viridis')


def _accessibility_mask(data, accessibility_file=None):
    """Return a conservative callability mask, restoring old TSVs from QC data.

    Current queries carry ``is_accessible`` directly. For older score tables,
    recover the same bases from the bundled companion track instead of silently
    treating missing QC metadata as PASS.
    """
    if 'is_accessible' not in data:
        if not {'chromosome', 'pos'}.issubset(data.columns):
            raise ValueError(
                'The score table has no is_accessible column and lacks the '
                'chromosome/pos columns needed to recover QC status.'
            )

        from .accessibility import accessibility_dataframe, open_accessibility_store
        from .fetch_score import parse_region

        chromosomes = data['chromosome'].dropna().astype(str).unique()
        positions = pd.to_numeric(data['pos'], errors='coerce')
        if len(chromosomes) != 1 or positions.isna().any():
            raise ValueError(
                'QC recovery requires one chromosome and finite genomic positions.'
            )
        minimum, maximum = int(positions.min()), int(positions.max())
        region = f'{chromosomes[0]}:{minimum}-{maximum}'
        with open_accessibility_store(accessibility_file) as root:
            status = accessibility_dataframe(root, region, parse_region)
        offset = positions.astype(int) - minimum
        return pd.Series(
            status['is_accessible'].to_numpy()[offset.to_numpy()],
            index=data.index,
            dtype=bool,
        )

    values = data['is_accessible']
    if pd.api.types.is_bool_dtype(values):
        return values.fillna(False).astype(bool)
    if pd.api.types.is_numeric_dtype(values):
        return values.fillna(0).astype(int).eq(1)
    return values.astype('string').str.strip().str.lower().eq('true').fillna(False)


def _shade_inaccessible(axis, positions, accessible):
    """Shade QC-failed bases efficiently as one stepped collection."""
    frame = pd.DataFrame({
        'position': pd.to_numeric(positions, errors='coerce'),
        'accessible': pd.Series(accessible, index=getattr(positions, 'index', None)),
    }).dropna(subset=['position']).sort_values('position')
    if frame.empty or frame['accessible'].all():
        return None
    return axis.fill_between(
        frame['position'].to_numpy(),
        0,
        1,
        where=~frame['accessible'].astype(bool).to_numpy(),
        step='mid',
        transform=axis.get_xaxis_transform(),
        color=INACCESSIBLE_COLOR,
        alpha=0.22,
        linewidth=0,
        zorder=1,
        label='Inaccessible / QC-failed (SNP density unknown)',
    )


def create_heatmap(
    input_file,
    output_image_path,
    gene_annotation=None,
):
    """Plot CNEr conserved-interval identities across the queried region.

    Zero in the archived ``stack`` array is a sentinel for no detected CNEr
    interval, not an observed 0% identity. It is therefore drawn categorically
    rather than through the continuous identity colour scale.
    """
    data = pd.read_csv(input_file, sep='\t')

    # Extract the position column
    positions = data['pos']
    cmap = _heatmap_colormap()

    chromosome = data['chromosome'].iloc[0]
    start_pos, end_pos = positions.min(), positions.max()
    annotation_matches_plot = bool(
        gene_annotation
        and str(gene_annotation.get('chromosome')) == str(chromosome)
        and int(gene_annotation['start']) <= end_pos
        and int(gene_annotation['end']) >= start_pos
    )
    if annotation_matches_plot:
        to_plot_position = _gene_coordinate_mapper(gene_annotation)
    else:
        gene_annotation = None
        to_plot_position = lambda position: position - start_pos

    plot_positions = positions.map(to_plot_position)
    order = plot_positions.sort_values().index
    heatmap_data = _ordered_sequence_identity(data, order)

    # The tree occupies its own narrow axis so its tips remain locked to rows;
    # the optional gene-model axis shares the heatmap's genomic x coordinates.
    fig = plt.figure(
        figsize=(12, 5.9 if gene_annotation else 5.3),
        layout='constrained',
    )
    grid = fig.add_gridspec(
        2 if gene_annotation else 1, 2,
        width_ratios=(0.9, 9.1),
        height_ratios=(5, 0.9) if gene_annotation else None,
        hspace=0.01,
    )
    tree_ax = fig.add_subplot(grid[0, 0])
    ax = fig.add_subplot(grid[0, 1])
    gene_ax = fig.add_subplot(grid[1, 1], sharex=ax) if gene_annotation else None

    # Use genomic coordinates as the actual cell edges, rather than merely as
    # tick labels, so gene features are precisely aligned even with padding.
    sorted_positions = plot_positions.loc[order].to_numpy(dtype=float)
    if len(sorted_positions) > 1:
        midpoints = (sorted_positions[:-1] + sorted_positions[1:]) / 2
        edges = [sorted_positions[0] - (midpoints[0] - sorted_positions[0]),
                 *midpoints,
                 sorted_positions[-1] + (sorted_positions[-1] - midpoints[-1])]
    else:
        edges = [sorted_positions[0] - 0.5, sorted_positions[0] + 0.5]
    heatmap_values = heatmap_data.to_numpy(dtype=float)
    measured_values = np.ma.masked_where(
        heatmap_values == 0,
        heatmap_values,
    )
    ax.set_facecolor(NO_CNE_INTERVAL_COLOR)
    mesh = ax.pcolormesh(
        edges,
        range(len(SPECIES_LABELS) + 1),
        measured_values,
        cmap=cmap,
        vmin=0,
        vmax=100,
        shading='flat',
    )
    fig.colorbar(mesh, ax=ax, label='Identity (%)', pad=0.02)
    ax.set_title(
        'Conserved intervals mapped to AgamP4 positions',
        fontsize=10,
        pad=16,
    )
    ax.set_ylim(len(SPECIES_LABELS), 0)
    ax.set_yticks([index + 0.5 for index in range(len(SPECIES_LABELS))],
                  labels=SPECIES_LABELS)
    _style_species_labels(ax)
    _draw_species_tree(tree_ax)
    fig.legend(
        handles=_clade_legend_handles(),
        loc='upper center',
        bbox_to_anchor=(0.5, 1.055),
        frameon=False,
        fontsize=7,
        ncol=4,
    )

    # Set x-axis ticks to be regularly interspaced
    ax.xaxis.set_major_locator(MaxNLocator(nbins=7, integer=True, steps=[1, 2, 5, 10]))

    # Rotate the x-axis labels for better readability
    ax.tick_params(axis='x', labelrotation=45)

    x_limits = (sorted_positions.min(), sorted_positions.max())
    ax.set_xlim(*x_limits)
    if gene_ax is not None:
        ax.tick_params(axis='x', which='both', bottom=False, labelbottom=False)
        _draw_gene_model(gene_ax, gene_annotation, x_limits)
        _draw_cds_boundary_guides((ax,), gene_annotation)
        _draw_cds_strip(ax, gene_annotation)
    else:
        ax.xaxis.set_major_formatter(FuncFormatter(lambda x, _pos: f'{int(x):,}'))
        ax.set_xlabel(
            f'Position in plotted region (bp; Chromosome {chromosome}: '
            f'{start_pos:,}–{end_pos:,})'
        )

    # Save the plot to a file
    fig.savefig(output_image_path, dpi=150, bbox_inches='tight')
    plt.close(fig)

def _gene_coordinate_mapper(annotation):
    """Return a genomic-to-transcription coordinate transform (5' to 3')."""
    gene_start = int(annotation['start'])
    gene_end = int(annotation['end'])
    if int(annotation.get('strand', 1)) == -1:
        return lambda position: gene_end - position
    return lambda position: position - gene_start


def _selected_exon_indices(exons, maximum=8):
    """Select evenly spaced exons when a transcript has too many to label."""
    if len(exons) > maximum:
        return {
            round(index * (len(exons) - 1) / (maximum - 1))
            for index in range(maximum)
        }
    return set(range(len(exons)))


def _annotation_landmarks(annotation, max_exon_ticks=8):
    """Build uncluttered x ticks at the TSS, exon starts, and TES."""
    to_gene_position = _gene_coordinate_mapper(annotation)
    exons = annotation.get('exons') or []
    strand = int(annotation.get('strand', 1))

    selected_indices = _selected_exon_indices(exons, max_exon_ticks)

    landmarks = {}
    for index, exon in enumerate(exons):
        if index not in selected_indices:
            continue
        transcription_start = exon['end'] if strand == -1 else exon['start']
        position = int(to_gene_position(int(transcription_start)))
        label = f'E{index + 1}\n{position:,}'
        landmarks[position] = label

    gene_length = int(annotation['end']) - int(annotation['start'])
    if 0 in landmarks:
        landmarks[0] = landmarks[0].replace('E1', 'TSS / E1')
    else:
        landmarks[0] = 'TSS\n0'
    landmarks[gene_length] = f'TES\n{gene_length:,}'

    positions = sorted(landmarks)
    return positions, [landmarks[position] for position in positions]


def _cds_segments(annotation):
    """Return every exon-specific CDS segment in plot coordinates."""
    cds_start = annotation.get('cds_start')
    cds_end = annotation.get('cds_end')
    exons = annotation.get('exons') or []
    if cds_start is None or cds_end is None or not exons:
        return []

    to_gene_position = _gene_coordinate_mapper(annotation)
    segments = []
    for exon in exons:
        coding_start = max(int(exon['start']), int(cds_start))
        coding_end = min(int(exon['end']), int(cds_end))
        if coding_start > coding_end:
            continue
        segments.append(tuple(sorted((
            int(to_gene_position(coding_start)),
            int(to_gene_position(coding_end)),
        ))))
    return sorted(segments)


def _cds_boundary_positions(annotation):
    """Return both boundaries of every exon-specific CDS segment."""
    return sorted({
        position
        for segment in _cds_segments(annotation)
        for position in segment
    })


def _draw_cds_strip(axis, annotation):
    """Draw thin CDS blocks above a heatmap, aligned with boundary guides."""
    patches = []
    for left, right in _cds_segments(annotation):
        patch = Rectangle(
            (left, 1.003),
            max(1, right - left),
            0.014,
            transform=axis.get_xaxis_transform(),
            facecolor=CDS_FACE_COLOR,
            edgecolor=CDS_EDGE_COLOR,
            linewidth=0.6,
            clip_on=False,
            zorder=5,
        )
        patch.set_gid('cds-strip')
        axis.add_patch(patch)
        patches.append(patch)
    return patches


def _draw_cds_boundary_guides(axes, annotation):
    """Project every exon-specific CDS boundary through aligned data panels."""
    positions = _cds_boundary_positions(annotation)
    guides = []
    for axis in axes:
        for position in positions:
            guide = axis.axvline(
                position,
                color=CDS_BOUNDARY_GUIDE_COLOR,
                linewidth=0.85,
                linestyle=(0, (3, 2)),
                alpha=0.65,
                zorder=2.5,
            )
            guide.set_gid('cds-boundary-guide')
            guides.append(guide)
    return guides


def _draw_landmark_labels(ax, positions, labels, font_size=8, minimum_gap_pixels=8):
    """Draw collision-free landmark labels below a gene-model axis.

    Labels are assigned greedily to the first vertical row where their rendered
    horizontal bounds do not collide. Additional rows are created as needed,
    so tightly clustered exon starts remain labelled without text overlap.
    """
    ax.set_xticks(positions)
    ax.set_xticklabels([])
    ax.tick_params(axis='x', labelbottom=False)
    if not positions:
        return []

    # Resolve widths in display pixels so collision avoidance follows the
    # actual figure size and font renderer instead of an arbitrary bp cutoff.
    ax.figure.canvas.draw()
    renderer = ax.figure.canvas.get_renderer()
    font = FontProperties(size=font_size)
    row_right_edges = []
    annotations = []

    for index, (position, label) in enumerate(zip(positions, labels)):
        if index == 0:
            horizontal_alignment = 'left'
        elif index == len(positions) - 1:
            horizontal_alignment = 'right'
        else:
            horizontal_alignment = 'center'

        width = max(
            renderer.get_text_width_height_descent(line, font, ismath=False)[0]
            for line in label.splitlines()
        )
        display_x = ax.transData.transform((position, 0))[0]
        if horizontal_alignment == 'left':
            left, right = display_x, display_x + width
        elif horizontal_alignment == 'right':
            left, right = display_x - width, display_x
        else:
            left, right = display_x - width / 2, display_x + width / 2

        row = next(
            (
                row_index
                for row_index, previous_right in enumerate(row_right_edges)
                if left >= previous_right + minimum_gap_pixels
            ),
            len(row_right_edges),
        )
        if row == len(row_right_edges):
            row_right_edges.append(right)
        else:
            row_right_edges[row] = right

        annotation = ax.annotate(
            label,
            xy=(position, 0),
            xycoords=ax.get_xaxis_transform(),
            xytext=(0, -(7 + row * 24)),
            textcoords='offset points',
            ha=horizontal_alignment,
            va='top',
            fontsize=font_size,
            annotation_clip=False,
        )
        annotation.set_gid('gene-landmark-label')
        annotations.append(annotation)

    return annotations


def _draw_gene_model(ax, annotation, x_limits):
    """Draw one compact representative transcript beneath the signal plot."""
    to_gene_position = _gene_coordinate_mapper(annotation)
    exons = annotation.get('exons') or []
    cds_start = annotation.get('cds_start')
    cds_end = annotation.get('cds_end')
    model_y = 0.14

    exon_records = []
    for exon in exons:
        left, right = sorted((
            to_gene_position(int(exon['start'])),
            to_gene_position(int(exon['end'])),
        ))
        exon_records.append((left, right, exon))
    exon_records.sort(key=lambda record: (record[0], record[1]))
    exon_intervals = [(left, right) for left, right, _exon in exon_records]

    # Draw only the true gaps between exons, so introns remain visible instead
    # of becoming a line hidden behind one full-gene arrow.
    for (_left, previous_right), (next_left, _right) in zip(
        exon_intervals,
        exon_intervals[1:],
    ):
        intron, = ax.plot(
            [previous_right, next_left],
            [model_y, model_y],
            color=INTRON_COLOR,
            linewidth=1.15,
            solid_capstyle='butt',
            zorder=1,
        )
        intron.set_gid('intron-line')

    for left, right, exon in exon_records:
        ax.add_patch(Rectangle(
            (left, model_y - 0.10),
            max(1, right - left),
            0.20,
            facecolor=UTR_FACE_COLOR,
            edgecolor=UTR_EDGE_COLOR,
            linewidth=0.9,
            zorder=2,
        ))

        if cds_start is not None and cds_end is not None:
            overlap_start = max(int(exon['start']), int(cds_start))
            overlap_end = min(int(exon['end']), int(cds_end))
            if overlap_start <= overlap_end:
                cds_left, cds_right = sorted((
                    to_gene_position(overlap_start),
                    to_gene_position(overlap_end),
                ))
                ax.add_patch(Rectangle(
                    (cds_left, model_y - 0.20),
                    max(1, cds_right - cds_left),
                    0.40,
                    facecolor=CDS_FACE_COLOR,
                    edgecolor=CDS_EDGE_COLOR,
                    linewidth=0.8,
                    zorder=3,
                ))

    strand_label = '−' if int(annotation.get('strand', 1)) == -1 else '+'
    transcript_label = annotation.get('transcript_id') or annotation.get('id')
    ax.text(
        0.01,
        0.04,
        f'{transcript_label} ({strand_label} strand; shown 5′→3′)',
        transform=ax.transAxes,
        ha='left',
        va='bottom',
        fontsize=8,
    )
    ax.set_xlim(*x_limits)
    ax.set_ylim(-0.5, 0.5)
    ax.set_yticks([])
    for side in ('left', 'right', 'top'):
        ax.spines[side].set_visible(False)

    tick_positions, tick_labels = _annotation_landmarks(annotation)
    landmark_labels = _draw_landmark_labels(ax, tick_positions, tick_labels)
    label_rows = len({round(label.xyann[1]) for label in landmark_labels})
    ax.set_xlabel(
        f"Position relative to {annotation.get('id', 'gene')} transcription start (bp)",
        labelpad=8 + label_rows * 24,
    )

    if exons:
        noncoding_label = 'UTR' if cds_start is not None and cds_end is not None else 'Exon'
        legend_items = [
            Patch(
                facecolor=UTR_FACE_COLOR,
                edgecolor=UTR_EDGE_COLOR,
                label=noncoding_label,
            )
        ]
        if cds_start is not None and cds_end is not None:
            legend_items.append(Patch(
                facecolor=CDS_FACE_COLOR,
                edgecolor=CDS_EDGE_COLOR,
                label='CDS',
            ))
        ax.legend(
            handles=legend_items,
            loc='lower right',
            bbox_to_anchor=(1.0, 0.02),
            frameon=False,
            fontsize=7,
            ncol=len(legend_items),
            handlelength=1.2,
        )


def plot_cs_snp_density(
    input_file,
    output_image_path,
    highlight_ranges=None,
    gene_annotation=None,
):
    """
    Plot Cs and accessibility-aware SNP density with highlighted regions.

    The TSV's original density values are not changed. QC-failed bases are
    masked in this view and shaded as positions where density is unknown.

    Args:
        input_file (str): Path to the input TSV file.
        output_image_path (str): Path to save the output PNG image.
        highlight_ranges (list, optional): A list of strings representing coordinate
                                           ranges to highlight (e.g., ['1000-2000']). Defaults to None.
        gene_annotation (dict, optional): Gene, strand, representative transcript,
                                         exon, and CDS coordinates.
    """
    data = pd.read_csv(input_file, sep='\t')

    # Extract the position column
    positions = data['pos']

    # Extract the Cs and SNP density columns
    cs_values = data['Cs_C']
    accessible = _accessibility_mask(data)
    # Preserve the archived values in the TSV and mask only the plotted view.
    snp_density_values = pd.to_numeric(
        data['snp_density_s'], errors='coerce'
    ).where(accessible)

    # Get the chromosome name and plotted interval for labeling
    chromosome = data['chromosome'].iloc[0]
    start_pos = positions.min()
    end_pos = positions.max()

    annotation_matches_plot = bool(
        gene_annotation
        and str(gene_annotation.get('chromosome')) == str(chromosome)
        and int(gene_annotation['start']) <= end_pos
        and int(gene_annotation['end']) >= start_pos
    )
    if annotation_matches_plot:
        to_plot_position = _gene_coordinate_mapper(gene_annotation)
    else:
        gene_annotation = None
        to_plot_position = lambda position: position - start_pos

    plot_positions = positions.map(to_plot_position)
    x_limits = (plot_positions.min(), plot_positions.max())

    # Create a plot for Cs values and SNP density
    if gene_annotation:
        fig = plt.figure(figsize=(9, 4.55), layout='constrained')
        grid = fig.add_gridspec(2, 1, height_ratios=(5, 0.9), hspace=0.01)
        ax1 = fig.add_subplot(grid[0])
        gene_ax = fig.add_subplot(grid[1], sharex=ax1)
    else:
        fig, ax1 = plt.subplots(figsize=(9, 4))
        gene_ax = None

    # Function to parse and apply highlighting
    def parse_and_highlight(ranges):
        if not ranges:
            return

        for r in ranges:
            try:
                start, end = map(int, r.split('-'))
                # Draw the shaded region. zorder=0 places it behind the plot lines.
                plot_start, plot_end = sorted((
                    to_plot_position(start),
                    to_plot_position(end),
                ))
                ax1.axvspan(plot_start, plot_end, color='grey', alpha=0.3, zorder=0)
            except ValueError:
                print(f"Warning: Could not parse highlight range '{r}'. Please use 'start-end' format.")

    parse_and_highlight(highlight_ranges)

    cs_line, = ax1.plot(
        plot_positions,
        cs_values,
        color='blue',
        label='Conservation score',
        zorder=3,
    )
    ax1.set_ylabel('Conservation Score', color='blue')
    ax1.tick_params(axis='y', labelcolor='blue')
    ax1.set_ylim(0, 1)

    ax2 = ax1.twinx()  # Create a twin Axes sharing the x-axis
    snp_line, = ax2.plot(
        plot_positions,
        snp_density_values,
        color='green',
        label='SNP density (accessible bases)',
        zorder=3,
    )
    _shade_inaccessible(ax2, plot_positions, accessible)
    ax2.set_ylabel('SNP Density', color='green')
    ax2.tick_params(axis='y', labelcolor='green')
    ax2.set_ylim(0, 1)
    qc_legend_patch = Patch(
        facecolor=INACCESSIBLE_COLOR,
        alpha=0.22,
        edgecolor='none',
        label='QC failed (SNP density unknown)',
    )
    ax1.legend(
        handles=[cs_line],
        loc='upper left',
        frameon=False,
        fontsize=8,
    )
    ax2.legend(
        handles=[snp_line, qc_legend_patch],
        loc='upper right',
        frameon=False,
        fontsize=8,
    )

    ax1.set_title('Cs and SNP Density')

    ax1.set_xlim(*x_limits)
    if gene_ax is not None:
        ax1.tick_params(axis='x', which='both', bottom=False, labelbottom=False)
        _draw_gene_model(gene_ax, gene_annotation, x_limits)
        _draw_cds_boundary_guides((ax1,), gene_annotation)
    else:
        ax1.xaxis.set_major_formatter(FuncFormatter(lambda x, _pos: f'{int(x):,}'))
        ax1.xaxis.set_major_locator(
            MaxNLocator(nbins=7, integer=True, steps=[1, 2, 5, 10])
        )
        ax1.set_xlabel(
            f"Position in plotted region (bp; Chromosome {chromosome}: "
            f"{start_pos:,}–{end_pos:,})"
        )

    # Save the plot to a file
    if gene_ax is None:
        fig.tight_layout()
    fig.savefig(output_image_path)
    plt.close(fig)
