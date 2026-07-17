# create_heatmap.py

import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.ticker import MaxNLocator, FuncFormatter
from matplotlib.font_manager import FontProperties
from matplotlib.patches import Patch, Rectangle


def create_heatmap(input_file, output_image_path):
    import seaborn as sns

    data = pd.read_csv(input_file, sep='\t')

    # Extract the relevant columns for sequence identity
    sequence_identity_cols = data.filter(regex='^stack_(?!norm)')
    sequence_identity_cols.columns = [col.replace('stack_', '') for col in sequence_identity_cols.columns]

    # Extract the position column
    positions = data['pos']

    # Create a custom colormap
    cmap = LinearSegmentedColormap.from_list('custom_red', ['black', 'red', 'white'])

    # List of species names
    species_labels = [
        'A. coluzzii', 'A. arabiensis', 'A. quadriannulatus', 'A. melas', 'A. merus',
        'A. epiroticus', 'A. christyi', 'A. sinensis', 'A. minimus', 'A. maculatus',
        'A. culicifacies', 'A. stephensi', 'A. funestus', 'A. atroparvus', 'A. dirus',
        'A. farauti', 'A. darlingi', 'A. albimanus', 'Ae. aegypti',
        'C. quinquefasciatus', 'D. melanogaster'
    ]

    # Create a heatmap
    plt.figure(figsize=(9, 4))
    ax = sns.heatmap(sequence_identity_cols.T, cmap=cmap, cbar_kws={'label': 'Sequence Identity'}, yticklabels=species_labels)
    ax.set_xlabel(f"Chromosome {data['chromosome'][0]} position (bp)")

    # Set species labels in italics
    for text in ax.get_yticklabels():
        text.set_fontproperties(FontProperties(style='italic'))

    # Set x-axis ticks to be regularly interspaced
    ax.xaxis.set_major_locator(MaxNLocator(integer=True))

    # Rotate the x-axis labels for better readability
    plt.xticks(rotation=45)

    # Save the plot to a file
    plt.tight_layout()
    plt.savefig(output_image_path)
    plt.close()

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
    ax.set_xticks(tick_positions, tick_labels)
    ax.tick_params(axis='x', labelsize=8)
    rendered_labels = ax.get_xticklabels()
    if rendered_labels:
        rendered_labels[0].set_ha('left')
        rendered_labels[-1].set_ha('right')
    plotted_span = max(1, x_limits[1] - x_limits[0])
    for index in range(1, len(tick_positions)):
        if tick_positions[index] - tick_positions[index - 1] < plotted_span * 0.08:
            rendered_labels[index - 1].set_ha('right')
            rendered_labels[index].set_ha('left')
    ax.set_xlabel(
        f"Position relative to {annotation.get('id', 'gene')} transcription start (bp)"
    )

    if exons:
        legend_items = [Patch(facecolor='#9ecae1', edgecolor='#08519c', label='UTR / exon')]
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
    Plots Cs and SNP density and adds highlighted vertical regions.

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
    snp_density_values = data['snp_density_s']

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
    ax2.plot(plot_positions, snp_density_values, color='green', label='SNP Density')
    ax2.set_ylabel('SNP Density', color='green')
    ax2.tick_params(axis='y', labelcolor='green')
    ax2.set_ylim(0, 1)

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
