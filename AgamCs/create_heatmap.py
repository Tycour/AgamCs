# create_heatmap.py

import pandas as pd
import seaborn as sns
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.ticker import MaxNLocator, FixedLocator


def create_heatmap(input_file, output_image_path):
    data = pd.read_csv(input_file, sep='\t')
    sequence_identity_cols = data.iloc[:, 9:30]
    sequence_identity_cols.columns = [col.replace('stack_', '') for col in sequence_identity_cols.columns]
    positions = data['pos']

    cmap = LinearSegmentedColormap.from_list('custom_red', ['black', 'red', 'white'])

    plt.figure(figsize=(12, 8))
    ax = sns.heatmap(sequence_identity_cols.T, cmap=cmap, cbar_kws={'label': 'Sequence Identity'}, yticklabels=True)
    ax.set_xlabel('Position along the chromosome')
    ax.set_ylabel('Species')
    ax.set_title(
        f'Sequence Identity between Different Species for Gene of Interest\n(Positions {positions.min()} to {positions.max()})')

    # Automatically set the x-axis ticks to regularly spaced intervals
    locator = MaxNLocator(integer=True, prune='both', nbins='auto')
    ax.xaxis.set_major_locator(locator)
    ax.figure.canvas.draw()  # Force a draw to calculate tick positions

    # Get the tick positions and set the labels using FixedLocator
    tick_positions = ax.get_xticks()
    tick_labels = [positions.iloc[int(pos)] for pos in tick_positions if int(pos) < len(positions)]
    ax.xaxis.set_major_locator(FixedLocator(tick_positions))
    ax.set_xticklabels(tick_labels, rotation=45)

    plt.savefig(output_image_path)
    plt.show()
