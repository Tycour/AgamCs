import matplotlib
import matplotlib.pyplot as plt
import pandas as pd

matplotlib.use('Agg')

from AgamCs.create_heatmap import (
    _annotation_landmarks,
    _draw_gene_model,
    _gene_coordinate_mapper,
    plot_cs_snp_density,
)
from AgamCs.gene_regions import (
    annotation_from_ensembl_record,
    annotation_from_gff,
    resolve_accession_details,
)


def example_annotation():
    return {
        'id': 'AGAPTEST',
        'assembly': 'AgamP4',
        'chromosome': '3L',
        'start': 100,
        'end': 500,
        'strand': -1,
        'transcript_id': 'AGAPTEST-RA',
        'exons': [
            {'start': 400, 'end': 500},
            {'start': 100, 'end': 200},
        ],
        'cds_start': 150,
        'cds_end': 450,
    }


def test_minus_strand_coordinates_run_from_tss_to_tes():
    annotation = example_annotation()
    coordinate = _gene_coordinate_mapper(annotation)

    assert coordinate(500) == 0
    assert coordinate(100) == 400

    positions, labels = _annotation_landmarks(annotation)
    assert positions == [0, 300, 400]
    assert labels == ['TSS / E1\n0', 'E2\n300', 'TES\n400']


def test_squished_exon_landmark_labels_never_overlap():
    annotation = {
        'id': 'AGAPDENSE',
        'chromosome': '3L',
        'start': 100,
        'end': 10_100,
        'strand': 1,
        'transcript_id': 'AGAPDENSE-RA',
        'exons': [
            {'start': 100, 'end': 200},
            {'start': 5_000, 'end': 5_020},
            {'start': 5_050, 'end': 5_070},
            {'start': 5_100, 'end': 5_120},
            {'start': 5_150, 'end': 5_170},
            {'start': 10_000, 'end': 10_100},
        ],
        'cds_start': 150,
        'cds_end': 10_050,
    }
    fig, ax = plt.subplots(figsize=(9, 2))
    _draw_gene_model(ax, annotation, (0, 10_000))
    fig.canvas.draw()

    renderer = fig.canvas.get_renderer()
    labels = [artist for artist in ax.texts if artist.get_gid() == 'gene-landmark-label']
    bounds = [label.get_window_extent(renderer) for label in labels]
    assert len({round(label.get_window_extent(renderer).y0) for label in labels}) > 1
    assert all(
        not first.overlaps(second)
        for index, first in enumerate(bounds)
        for second in bounds[index + 1:]
    )
    assert [text.get_text() for text in ax.get_legend().get_texts()] == ['UTR', 'CDS']
    plt.close(fig)


def test_non_coding_transcript_legend_uses_exon_label():
    annotation = example_annotation()
    annotation.pop('cds_start')
    annotation.pop('cds_end')
    fig, ax = plt.subplots(figsize=(6, 2))
    _draw_gene_model(ax, annotation, (0, 400))

    assert [text.get_text() for text in ax.get_legend().get_texts()] == ['Exon']
    plt.close(fig)


def test_expanded_ensembl_record_uses_canonical_transcript():
    record = {
        'id': 'AGAPTEST',
        'assembly_name': 'AgamP4',
        'seq_region_name': '3L',
        'start': 100,
        'end': 500,
        'strand': -1,
        'Transcript': [
            {
                'id': 'AGAPTEST-RB',
                'start': 150,
                'end': 450,
                'is_canonical': 0,
                'Exon': [{'start': 150, 'end': 450}],
            },
            {
                'id': 'AGAPTEST-RA',
                'start': 100,
                'end': 500,
                'is_canonical': 1,
                'Exon': [
                    {'start': 100, 'end': 200},
                    {'start': 400, 'end': 500},
                ],
                'Translation': {'start': 150, 'end': 450},
            },
        ],
    }

    annotation = annotation_from_ensembl_record('AGAPTEST', record)

    assert annotation['transcript_id'] == 'AGAPTEST-RA'
    assert annotation['exons'] == [
        {'start': 400, 'end': 500},
        {'start': 100, 'end': 200},
    ]
    assert annotation['cds_start'] == 150
    assert annotation['cds_end'] == 450


def test_cached_annotation_resolves_without_an_online_lookup():
    annotation = example_annotation()
    region, resolved = resolve_accession_details(
        'AGAPTEST',
        padding=25,
        region_cache={},
        annotation_cache={'AGAPTEST': annotation},
    )

    assert region == '3L:75-525'
    assert resolved == annotation


def test_vectorbase_style_gff_supplies_exons_and_cds(tmp_path):
    gff_path = tmp_path / 'annotation.gff3'
    gff_path.write_text(
        '##gff-version 3\n'
        'AgamP4_3L\tVectorBase\tgene\t100\t500\t.\t-\t.\tID=gene:AGAPTEST;Name=AGAPTEST\n'
        'AgamP4_3L\tVectorBase\tmRNA\t100\t500\t.\t-\t.\tID=transcript:AGAPTEST-RA;Parent=gene:AGAPTEST\n'
        'AgamP4_3L\tVectorBase\texon\t400\t500\t.\t-\t.\tParent=transcript:AGAPTEST-RA\n'
        'AgamP4_3L\tVectorBase\texon\t100\t200\t.\t-\t.\tParent=transcript:AGAPTEST-RA\n'
        'AgamP4_3L\tVectorBase\tCDS\t150\t200\t.\t-\t0\tParent=transcript:AGAPTEST-RA\n'
        'AgamP4_3L\tVectorBase\tCDS\t400\t450\t.\t-\t0\tParent=transcript:AGAPTEST-RA\n'
    )

    annotation = annotation_from_gff('AGAPTEST', gff_path)

    assert annotation['chromosome'] == '3L'
    assert annotation['strand'] == -1
    assert annotation['transcript_id'] == 'transcript:AGAPTEST-RA'
    assert annotation['exons'] == [
        {'start': 400, 'end': 500},
        {'start': 100, 'end': 200},
    ]
    assert annotation['cds_start'] == 150
    assert annotation['cds_end'] == 450


def test_annotation_plot_renders_with_genomic_highlights(tmp_path):
    input_path = tmp_path / 'scores.tsv'
    output_path = tmp_path / 'plot.png'
    pd.DataFrame({
        'chromosome': ['3L'] * 5,
        'pos': [100, 200, 300, 400, 500],
        'Cs_C': [0.1, 0.3, 0.2, 0.8, 0.4],
        'snp_density_s': [0.0, 0.1, 0.0, 0.2, 0.0],
        'is_accessible': [True, False, True, False, True],
        'quality_status': [
            'PASS', 'LowCoverage', 'PASS', 'RepeatDUST', 'PASS',
        ],
    }).to_csv(input_path, sep='\t', index=False)

    plot_cs_snp_density(
        input_path,
        output_path,
        highlight_ranges=['150-250'],
        gene_annotation=example_annotation(),
    )

    assert output_path.stat().st_size > 0
