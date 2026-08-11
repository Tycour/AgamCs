import matplotlib
import matplotlib.pyplot as plt
import pandas as pd
import pytest

matplotlib.use('Agg')

from AgamCs.create_heatmap import (
    CDS_FACE_COLOR,
    SPECIES_GENOME_CODES,
    SPECIES_LABELS,
    _cds_boundary_positions,
    _cds_segments,
    _draw_cds_boundary_guides,
    _draw_cds_strip,
    _draw_species_tree,
    _annotation_landmarks,
    _draw_gene_model,
    _gene_coordinate_mapper,
    _heatmap_colormap,
    _ordered_sequence_identity,
    create_heatmap,
    plot_cs_snp_density,
)
from AgamCs.gene_regions import (
    annotation_from_ensembl_record,
    annotation_from_gff,
    resolve_accession_details,
)
from AgamCs.species_topology import (
    SPECIES_TOPOLOGY,
    topology_tip_codes,
    validate_species_topology,
)


def test_species_tree_tips_align_with_all_heatmap_rows():
    fig, axis = plt.subplots()
    _draw_species_tree(axis)

    horizontal_tip_ys = {
        line.get_ydata()[0]
        for line in axis.lines
        if len(set(line.get_ydata())) == 1
        and max(line.get_xdata()) == axis.get_xlim()[1] - 0.15
    }
    assert horizontal_tip_ys == {
        index + 0.5 for index in range(len(SPECIES_LABELS))
    }
    assert axis.get_ylim() == (len(SPECIES_LABELS), 0)
    plt.close(fig)


def test_species_topology_covers_every_genome_code_once_in_display_order():
    tips = topology_tip_codes(SPECIES_TOPOLOGY['tree'])

    assert tips == SPECIES_GENOME_CODES
    assert len(tips) == len(set(tips))
    assert validate_species_topology(
        SPECIES_TOPOLOGY, SPECIES_GENOME_CODES,
    ) is SPECIES_TOPOLOGY


def test_gambiae_complex_is_an_intentional_polytomy():
    anopheles = SPECIES_TOPOLOGY['tree']['children'][0]['children'][0]
    gambiae_complex = anopheles['children'][0]

    assert gambiae_complex['name'] == 'gambiae complex'
    assert gambiae_complex['children'] == SPECIES_GENOME_CODES[:5]
    assert all(isinstance(child, str) for child in gambiae_complex['children'])


def test_sequence_identity_rows_follow_genome_codes_not_tsv_column_order():
    columns = {
        f'stack_{code}': [index, index + 100]
        for index, code in enumerate(reversed(SPECIES_GENOME_CODES))
    }
    data = pd.DataFrame(columns)

    matrix = _ordered_sequence_identity(data, position_order=[1, 0])

    assert matrix.index.tolist() == SPECIES_GENOME_CODES
    assert matrix.loc['AchrA1'].tolist() == [115, 15]
    assert matrix.loc['AsinC2'].tolist() == [114, 14]
    assert matrix.loc['AepiE1'].tolist() == [113, 13]


def test_species_rows_retain_taxonomy_aware_cladogram_order():
    assert SPECIES_GENOME_CODES[-3:] == ['AaegL5', 'CpipJ2', 'DmelP6']
    assert SPECIES_GENOME_CODES.index('CpipJ2') > SPECIES_GENOME_CODES.index('AalbS2')
    assert SPECIES_LABELS[0] == 'An. coluzzii'
    assert SPECIES_LABELS[-2] == 'Cx. quinquefasciatus'


def test_sequence_identity_rows_require_all_metadata_species():
    data = pd.DataFrame({'stack_AcolM1': [100]})

    with pytest.raises(ValueError, match='missing expected stack rows'):
        _ordered_sequence_identity(data, position_order=[0])


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


def test_cds_boundary_guides_repeat_across_panels():
    fig, axes = plt.subplots(2, 1)
    positions = _cds_boundary_positions(example_annotation())

    guides = _draw_cds_boundary_guides(axes, example_annotation())

    assert positions == [50, 100, 300, 350]
    assert len(guides) == len(positions) * len(axes)
    assert all(guide.get_gid() == 'cds-boundary-guide' for guide in guides)
    assert all(guide.get_linewidth() == 0.85 for guide in guides)
    assert {
        float(guide.get_xdata()[0]) for guide in guides
    } == set(positions)
    plt.close(fig)


def test_cds_boundaries_bracket_every_coding_segment():
    annotation = {
        'start': 100,
        'end': 700,
        'strand': 1,
        'cds_start': 150,
        'cds_end': 650,
        'exons': [
            {'start': 100, 'end': 200},
            {'start': 300, 'end': 400},
            {'start': 600, 'end': 700},
        ],
    }

    assert _cds_boundary_positions(annotation) == [50, 100, 200, 300, 500, 550]


def test_heatmap_cds_strip_matches_coding_segments():
    fig, axis = plt.subplots()

    patches = _draw_cds_strip(axis, example_annotation())

    assert _cds_segments(example_annotation()) == [(50, 100), (300, 350)]
    assert [(patch.get_x(), patch.get_width()) for patch in patches] == [
        (50, 50),
        (300, 50),
    ]
    assert all(patch.get_gid() == 'cds-strip' for patch in patches)
    assert all(patch.get_facecolor() == matplotlib.colors.to_rgba(CDS_FACE_COLOR)
               for patch in patches)
    plt.close(fig)


def test_cds_boundary_guides_are_omitted_without_cds_annotation():
    annotation = example_annotation()
    annotation['cds_start'] = None
    annotation['cds_end'] = None
    fig, axis = plt.subplots()

    assert _cds_boundary_positions(annotation) == []
    assert _draw_cds_boundary_guides((axis,), annotation) == []
    plt.close(fig)


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


def test_gene_model_draws_introns_only_between_exons():
    fig, ax = plt.subplots(figsize=(6, 2))

    _draw_gene_model(ax, example_annotation(), (0, 400))

    introns = [line for line in ax.lines if line.get_gid() == 'intron-line']
    assert len(introns) == 1
    assert introns[0].get_xdata().tolist() == [100, 300]
    assert len(set(introns[0].get_ydata())) == 1
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


def test_heatmap_renders_with_viridis(tmp_path):
    input_path = tmp_path / 'scores.tsv'
    output_path = tmp_path / 'heatmap.png'
    frame = pd.DataFrame({
        'chromosome': ['3L', '3L'],
        'pos': [100, 101],
    })
    for index, code in enumerate(reversed(SPECIES_GENOME_CODES)):
        frame[f'stack_{code}'] = [0, 70 + index]
    frame.to_csv(input_path, sep='\t', index=False)

    create_heatmap(input_path, output_path)

    assert _heatmap_colormap().name == 'viridis'
    assert output_path.stat().st_size > 0
