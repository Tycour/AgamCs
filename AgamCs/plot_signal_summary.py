"""Alternative, binned view of conservation and SNP-density signals.

The original base-level plot remains in :mod:`AgamCs.create_heatmap`.  This
module adds a complementary view that turns within-window variation into
percentile ribbons instead of connecting every observation with an opaque
line.
"""

from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.lines import Line2D
from matplotlib.patches import Patch
from matplotlib.ticker import FuncFormatter, MaxNLocator

from .create_heatmap import _draw_gene_model, _gene_coordinate_mapper


CONSERVATION_COLOR = '#175a9e'
CONSERVATION_MID_COLOR = '#4292c6'
CONSERVATION_OUTER_COLOR = '#9ecae1'
SNP_COLOR = '#238b45'


def _bin_signal(positions, values, bins=240):
    """Summarise a signal in equally sized positional bins.

    Returns one row per non-empty bin with its mean position, mean value, and
    the 10th, 25th, 50th, 75th, and 90th percentiles.
    """
    if bins < 1:
        raise ValueError('bins must be at least 1')

    frame = pd.DataFrame({
        'position': pd.to_numeric(positions, errors='coerce'),
        'value': pd.to_numeric(values, errors='coerce'),
    }).dropna()
    if frame.empty:
        raise ValueError('The signal contains no finite positions and values.')

    minimum = frame['position'].min()
    maximum = frame['position'].max()
    span = maximum - minimum
    bin_count = min(int(bins), len(frame))

    if span == 0:
        frame['_bin'] = 0
    else:
        frame['_bin'] = (
            ((frame['position'] - minimum) * bin_count / span)
            .astype(int)
            .clip(upper=bin_count - 1)
        )

    grouped = frame.groupby('_bin', sort=True)
    quantiles = grouped['value'].quantile([0.10, 0.25, 0.50, 0.75, 0.90]).unstack()
    summary = grouped.agg(position=('position', 'mean'), mean=('value', 'mean'))
    summary[['q10', 'q25', 'median', 'q75', 'q90']] = quantiles
    return summary.reset_index(drop=True)


def _parse_highlight_ranges(ranges, to_plot_position):
    """Convert genomic ``start-end`` strings into displayed coordinates."""
    parsed = []
    for value in ranges or []:
        try:
            start, end = map(int, value.split('-'))
        except ValueError:
            print(
                f"Warning: Could not parse highlight range '{value}'. "
                "Please use 'start-end' format."
            )
            continue
        parsed.append(sorted((to_plot_position(start), to_plot_position(end))))
    return parsed


def _style_signal_axis(ax):
    """Apply light structural styling without competing with the signal."""
    ax.grid(axis='y', color='#d9d9d9', linewidth=0.6, alpha=0.7)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.set_axisbelow(True)


def plot_cs_snp_summary(
    input_file,
    output_image_path,
    highlight_ranges=None,
    gene_annotation=None,
    bins=240,
):
    """Plot a volatility-aware summary beside the existing raw signal plot.

    Conservation is shown as a binned median line with 25th–75th and 10th–90th
    percentile ribbons.  SNP density is placed on a separate aligned axis and
    shown as a binned mean, avoiding a second y-axis over the conservation
    profile.

    Args:
        input_file (str): Input TSV containing ``pos``, ``Cs_C``, and
            ``snp_density_s`` columns.
        output_image_path (str): Destination for the new summary PNG.
        highlight_ranges (list, optional): Absolute genomic ``start-end``
            intervals to shade.
        gene_annotation (dict, optional): Gene and representative-transcript
            annotation used by the existing annotated plot.
        bins (int): Maximum number of positional bins. Defaults to 240.
    """
    data = pd.read_csv(input_file, sep='\t')
    positions = pd.to_numeric(data['pos'], errors='coerce')
    cs_values = pd.to_numeric(data['Cs_C'], errors='coerce')
    snp_values = pd.to_numeric(data['snp_density_s'], errors='coerce')

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
    cs_summary = _bin_signal(plot_positions, cs_values, bins=bins)
    snp_summary = _bin_signal(plot_positions, snp_values, bins=bins)

    if gene_annotation:
        fig = plt.figure(figsize=(9, 6), layout='constrained')
        grid = fig.add_gridspec(3, 1, height_ratios=(4.2, 1.25, 1.55), hspace=0.05)
        cs_ax = fig.add_subplot(grid[0])
        snp_ax = fig.add_subplot(grid[1], sharex=cs_ax)
        gene_ax = fig.add_subplot(grid[2], sharex=cs_ax)
    else:
        fig, (cs_ax, snp_ax) = plt.subplots(
            2,
            1,
            figsize=(9, 5),
            sharex=True,
            gridspec_kw={'height_ratios': (4.2, 1.25)},
        )
        gene_ax = None

    for left, right in _parse_highlight_ranges(highlight_ranges, to_plot_position):
        cs_ax.axvspan(left, right, color='#737373', alpha=0.18, zorder=0)
        snp_ax.axvspan(left, right, color='#737373', alpha=0.18, zorder=0)

    x_cs = cs_summary['position'].to_numpy()
    cs_ax.fill_between(
        x_cs,
        cs_summary['q10'].to_numpy(),
        cs_summary['q90'].to_numpy(),
        color=CONSERVATION_OUTER_COLOR,
        alpha=0.38,
        linewidth=0,
        zorder=1,
    )
    cs_ax.fill_between(
        x_cs,
        cs_summary['q25'].to_numpy(),
        cs_summary['q75'].to_numpy(),
        color=CONSERVATION_MID_COLOR,
        alpha=0.45,
        linewidth=0,
        zorder=2,
    )
    cs_ax.plot(
        x_cs,
        cs_summary['median'].to_numpy(),
        color=CONSERVATION_COLOR,
        linewidth=1.25,
        zorder=3,
    )
    cs_ax.set_ylim(0, 1)
    cs_ax.set_ylabel('Conservation score')
    cs_ax.set_title('Binned conservation profile and SNP density')
    cs_ax.legend(
        handles=[
            Line2D([0], [0], color=CONSERVATION_COLOR, linewidth=1.5, label='Median'),
            Patch(facecolor=CONSERVATION_MID_COLOR, alpha=0.45, label='25th–75th percentile'),
            Patch(facecolor=CONSERVATION_OUTER_COLOR, alpha=0.5, label='10th–90th percentile'),
        ],
        loc='upper left',
        frameon=False,
        fontsize=8,
        ncol=3,
    )

    x_snp = snp_summary['position'].to_numpy()
    snp_mean = snp_summary['mean'].to_numpy()
    snp_ax.fill_between(x_snp, 0, snp_mean, color=SNP_COLOR, alpha=0.25, linewidth=0)
    snp_ax.plot(x_snp, snp_mean, color=SNP_COLOR, linewidth=1.1)
    snp_ax.set_ylim(0, 1)
    snp_ax.set_ylabel('SNP\ndensity')
    snp_ax.text(
        0.01,
        0.82,
        'Mean within the same positional bins',
        transform=snp_ax.transAxes,
        fontsize=8,
        color='#4d4d4d',
        va='top',
    )
    if snp_summary['mean'].max() == 0:
        snp_ax.text(
            0.99,
            0.82,
            'No SNP density signal in this interval',
            transform=snp_ax.transAxes,
            fontsize=8,
            color='#4d4d4d',
            ha='right',
            va='top',
        )

    for axis in (cs_ax, snp_ax):
        _style_signal_axis(axis)
        axis.set_xlim(*x_limits)

    cs_ax.tick_params(axis='x', which='both', bottom=False, labelbottom=False)
    if gene_ax is not None:
        snp_ax.tick_params(axis='x', which='both', bottom=False, labelbottom=False)
        _draw_gene_model(gene_ax, gene_annotation, x_limits)
    else:
        snp_ax.xaxis.set_major_formatter(FuncFormatter(lambda x, _pos: f'{int(x):,}'))
        snp_ax.xaxis.set_major_locator(
            MaxNLocator(nbins=7, integer=True, steps=[1, 2, 5, 10])
        )
        snp_ax.set_xlabel(
            f'Position in plotted region (bp; Chromosome {chromosome}: '
            f'{start_pos:,.0f}–{end_pos:,.0f})'
        )
        fig.tight_layout()

    output_path = Path(output_image_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=150)
    plt.close(fig)

