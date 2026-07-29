# create_heatmap.py

import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.ticker import MaxNLocator, FuncFormatter
from matplotlib.font_manager import FontProperties
from matplotlib.patches import Patch, Rectangle


INACCESSIBLE_COLOR = '#969696'

# The taxon order and topology follow the whole-genome alignment described in
# https://doi.org/10.3390/insects12020097, on which this resource is based.
# Branch lengths are deliberately omitted: the source alignment supports the
# relationships shown here, but the heatmap is not intended to be a calibrated
# evolutionary-distance plot.
SPECIES_LABELS = [
    'A. coluzzii', 'A. arabiensis', 'A. quadriannulatus', 'A. melas', 'A. merus',
    'A. epiroticus', 'A. christyi', 'A. sinensis', 'A. minimus', 'A. maculatus',
    'A. culicifacies', 'A. stephensi', 'A. funestus', 'A. atroparvus', 'A. dirus',
    'A. farauti', 'A. darlingi', 'A. albimanus', 'Ae. aegypti',
    'C. quinquefasciatus', 'D. melanogaster',
]

# Nested clades are arranged in the same top-to-bottom order as the alignment.
SPECIES_TREE = (
    (
        (((('A. coluzzii', 'A. arabiensis'), 'A. quadriannulatus'),
          ('A. melas', 'A. merus')), 'A. epiroticus'),
        ('A. christyi', ('A. sinensis', ('A. minimus', ('A. maculatus',
         ('A. culicifacies', ('A. stephensi', ('A. funestus',
          ('A. atroparvus', ('A. dirus', 'A. farauti'))))))))),
    ),
    (('A. darlingi', 'A. albimanus'),
     ('Ae. aegypti', ('C. quinquefasciatus', 'D. melanogaster'))),
)

CLADE_STYLES = (
    (range(0, 5), '#2166ac', '#d9edf7'),       # gambiae complex
    (range(5, 16), '#6a51a3', '#eee5f7'),     # other Old World Anopheles
    (range(16, 18), '#238b45', '#e1f3e5'),    # New World Anopheles
    (range(18, 21), '#b35806', '#fbe6cf'),    # non-Anopheles outgroups
)


def _draw_species_tree(ax, tree=SPECIES_TREE, labels=SPECIES_LABELS):
    """Draw a compact cladogram whose tips align with heatmap rows."""
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
    """Colour label text and backgrounds by increasingly distant clades."""
    for indices, foreground, background in CLADE_STYLES:
        for index in indices:
            label = ax.get_yticklabels()[index]
            label.set_color(foreground)
            label.set_fontproperties(FontProperties(style='italic', weight='semibold'))
            label.set_bbox({'facecolor': background, 'edgecolor': 'none',
                            'boxstyle': 'round,pad=0.16'})


def _accessibility_mask(data):
    """Return a conservative boolean callability mask from a queried TSV."""
    if 'is_accessible' not in data:
        # Retain support for TSVs produced before the companion track existed.
        return pd.Series(True, index=data.index, dtype=bool)

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
        zorder=0,
        label='Inaccessible / QC-failed (SNP density unknown)',
    )


def create_heatmap(input_file, output_image_path, gene_annotation=None):
    data = pd.read_csv(input_file, sep='\t')

    # Extract the relevant columns for sequence identity
    sequence_identity_cols = data.filter(regex='^stack_(?!norm)')
    sequence_identity_cols.columns = [col.replace('stack_', '') for col in sequence_identity_cols.columns]

    # Extract the position column
    positions = data['pos']

    # Create a custom colormap
    cmap = LinearSegmentedColormap.from_list('custom_red', ['black', 'red', 'white'])

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
    heatmap_data = sequence_identity_cols.loc[order].T

    # The tree occupies its own narrow axis so its tips remain locked to rows;
    # the optional gene-model axis shares the heatmap's genomic x coordinates.
    fig = plt.figure(figsize=(12, 6 if gene_annotation else 5), layout='constrained')
    grid = fig.add_gridspec(
        2 if gene_annotation else 1, 2,
        width_ratios=(1.8, 8.2),
        height_ratios=(5, 1.55) if gene_annotation else None,
        hspace=0.05,
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
    mesh = ax.pcolormesh(edges, range(len(SPECIES_LABELS) + 1), heatmap_data,
                         cmap=cmap, shading='flat')
    fig.colorbar(mesh, ax=ax, label='Sequence Identity', pad=0.02)
    ax.set_ylim(len(SPECIES_LABELS), 0)
    ax.set_yticks([index + 0.5 for index in range(len(SPECIES_LABELS))],
                  labels=SPECIES_LABELS)
    _style_species_labels(ax)
    _draw_species_tree(tree_ax)

    # Set x-axis ticks to be regularly interspaced
    ax.xaxis.set_major_locator(MaxNLocator(nbins=7, integer=True, steps=[1, 2, 5, 10]))

    # Rotate the x-axis labels for better readability
    ax.tick_params(axis='x', labelrotation=45)

    x_limits = (sorted_positions.min(), sorted_positions.max())
    ax.set_xlim(*x_limits)
    if gene_ax is not None:
        ax.tick_params(axis='x', which='both', bottom=False, labelbottom=False)
        _draw_gene_model(gene_ax, gene_annotation, x_limits)
    else:
        ax.xaxis.set_major_formatter(FuncFormatter(lambda x, _pos: f'{int(x):,}'))
        ax.set_xlabel(
            f'Position in plotted region (bp; Chromosome {chromosome}: '
            f'{start_pos:,}–{end_pos:,})'
        )

    # Save the plot to a file
    fig.savefig(output_image_path)
    plt.close(fig)

def _gene_coordinate_mapper(annotation):
    """Return a genomic-to-transcription coordinate transform (5' to 3')."""
    gene_start = int(annotation['start'])
    gene_end = int(annotation['end'])
    if int(annotation.get('strand', 1)) == -1:
        return lambda position: gene_end - position
    return lambda position: position - gene_start


def _annotation_landmarks(annotation, max_exon_ticks=8):
    """Build uncluttered x ticks at the TSS, exon starts, and TES."""
    to_gene_position = _gene_coordinate_mapper(annotation)
    exons = annotation.get('exons') or []
    strand = int(annotation.get('strand', 1))

    if len(exons) > max_exon_ticks:
        selected_indices = {
            round(index * (len(exons) - 1) / (max_exon_ticks - 1))
            for index in range(max_exon_ticks)
        }
    else:
        selected_indices = set(range(len(exons)))

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
    """Draw one representative transcript beneath the signal plot."""
    to_gene_position = _gene_coordinate_mapper(annotation)
    gene_length = int(annotation['end']) - int(annotation['start'])
    exons = annotation.get('exons') or []
    cds_start = annotation.get('cds_start')
    cds_end = annotation.get('cds_end')

    ax.annotate(
        '',
        xy=(gene_length, 0),
        xytext=(0, 0),
        arrowprops={'arrowstyle': '-|>', 'color': '#4d4d4d', 'linewidth': 1.2},
        zorder=1,
    )

    for exon in exons:
        left, right = sorted((
            to_gene_position(int(exon['start'])),
            to_gene_position(int(exon['end'])),
        ))
        ax.add_patch(Rectangle(
            (left, -0.24),
            max(1, right - left),
            0.48,
            facecolor='#9ecae1',
            edgecolor='#08519c',
            linewidth=0.8,
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
                    (cds_left, -0.34),
                    max(1, cds_right - cds_left),
                    0.68,
                    facecolor='#2171b5',
                    edgecolor='#084594',
                    linewidth=0.8,
                    zorder=3,
                ))

    strand_label = '−' if int(annotation.get('strand', 1)) == -1 else '+'
    transcript_label = annotation.get('transcript_id') or annotation.get('id')
    ax.text(
        sum(x_limits) / 2,
        0.58,
        f'{transcript_label} ({strand_label} strand; shown 5′→3′)',
        ha='center',
        va='center',
        fontsize=9,
    )
    ax.set_xlim(*x_limits)
    ax.set_ylim(-0.55, 0.9)
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
                facecolor='#9ecae1',
                edgecolor='#08519c',
                label=noncoding_label,
            )
        ]
        if cds_start is not None and cds_end is not None:
            legend_items.append(Patch(facecolor='#2171b5', edgecolor='#084594', label='CDS'))
        ax.legend(
            handles=legend_items,
            loc='upper right',
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
        fig = plt.figure(figsize=(9, 5), layout='constrained')
        grid = fig.add_gridspec(2, 1, height_ratios=(5, 1.35), hspace=0.06)
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

    ax1.plot(plot_positions, cs_values, color='blue', label='Conservation Score')
    ax1.set_ylabel('Conservation Score', color='blue')
    ax1.tick_params(axis='y', labelcolor='blue')
    ax1.set_ylim(0, 1)

    ax2 = ax1.twinx()  # Create a twin Axes sharing the x-axis
    snp_line, = ax2.plot(
        plot_positions,
        snp_density_values,
        color='green',
        label='SNP density (accessible bases)',
    )
    inaccessible_patch = _shade_inaccessible(ax2, plot_positions, accessible)
    ax2.set_ylabel('SNP Density', color='green')
    ax2.tick_params(axis='y', labelcolor='green')
    ax2.set_ylim(0, 1)
    if inaccessible_patch is not None:
        ax2.legend(
            handles=[snp_line, inaccessible_patch],
            loc='upper right',
            frameon=False,
            fontsize=8,
        )

    ax1.set_title('Cs and SNP Density')

    ax1.set_xlim(*x_limits)
    if gene_ax is not None:
        ax1.tick_params(axis='x', which='both', bottom=False, labelbottom=False)
        _draw_gene_model(gene_ax, gene_annotation, x_limits)
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
