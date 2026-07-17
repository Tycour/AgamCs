import matplotlib
import pandas as pd
import pytest

matplotlib.use('Agg')

from AgamCs.plot_signal_summary import _bin_signal, plot_cs_snp_summary


def test_bin_signal_reports_median_and_percentile_ribbons():
    summary = _bin_signal(
        positions=pd.Series(range(8)),
        values=pd.Series([0.0, 0.2, 0.4, 0.6, 0.1, 0.3, 0.5, 0.7]),
        bins=2,
    )

    assert len(summary) == 2
    assert summary.loc[0, 'median'] == pytest.approx(0.3)
    assert summary.loc[0, 'q10'] < summary.loc[0, 'q25']
    assert summary.loc[0, 'q25'] < summary.loc[0, 'q75']
    assert summary.loc[0, 'q75'] < summary.loc[0, 'q90']


def test_summary_plot_renders_without_replacing_raw_plot(tmp_path):
    input_path = tmp_path / 'scores.tsv'
    output_path = tmp_path / 'summary.png'
    pd.DataFrame({
        'chromosome': ['3L'] * 8,
        'pos': range(100, 108),
        'Cs_C': [0.0, 0.8, 0.1, 0.9, 0.2, 1.0, 0.1, 0.7],
        'snp_density_s': [0.0, 0.0, 0.2, 0.0, 0.3, 0.0, 0.0, 0.1],
    }).to_csv(input_path, sep='\t', index=False)

    plot_cs_snp_summary(input_path, output_path, bins=4)

    assert output_path.stat().st_size > 0
