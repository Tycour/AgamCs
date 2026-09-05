import json
from pathlib import Path

import h5py
import numpy as np
import pytest

from AgamCs import gene_ranking
from tools import build_gene_rankings


FIXTURE = Path(__file__).parent / 'fixtures/gene-ranking-v2-cases.json'


def annotation(accession, chromosome, start, end, exons, cds=None, strand=1):
    return {
        'id': accession, 'assembly': 'AgamP4', 'chromosome': chromosome,
        'start': start, 'end': end, 'strand': strand,
        'transcript_id': f'{accession}-RA',
        'exons': [{'start': left, 'end': right} for left, right in exons],
        'cds_start': cds[0] if cds else None, 'cds_end': cds[1] if cds else None,
    }


def test_partition_intervals_merge_exons_and_keep_noncoding_cds_and_utr_absent():
    coding = annotation(
        'AGAP000001', '2L', 1, 12, [(1, 4), (4, 7), (10, 12)],
        cds=(3, 11), strand=-1,
    )
    intervals = build_gene_rankings._annotation_intervals(coding, coding, 'AGAP000001')
    assert intervals == {
        'gene_span': [(1, 12)],
        'representative_exons': [(1, 7), (10, 12)],
        'representative_cds': [(3, 7), (10, 11)],
        'representative_utr': [(1, 2), (12, 12)],
        'representative_introns': [(8, 9)],
    }

    noncoding = annotation('AGAP000002', 'X', 20, 25, [(20, 22), (24, 25)])
    intervals = build_gene_rankings._annotation_intervals(
        noncoding, noncoding, 'AGAP000002',
    )
    assert intervals['representative_cds'] == []
    assert intervals['representative_utr'] == []
    assert intervals['representative_introns'] == [(23, 23)]


def test_builds_partition_rankings_with_threshold_edge_ineligible_and_failed_qc(tmp_path):
    index = {
        'schema_version': 2, 'index_version': 'test-index-v1', 'assembly': 'AgamP4',
        'annotation': {'gene_build': 'AgamP4.14', 'release': 'VectorBase 68',
                       'source_snapshot_sha256': 'a' * 64},
        'accessions': {
            'AGAP000001': {'annotation': annotation(
                'AGAP000001', '2L', 1, 5, [(1, 5)], cds=(1, 5),
            )},
            'AGAP000002': {'annotation': annotation(
                'AGAP000002', '2L', 6, 10, [(6, 10)], cds=(6, 10),
            )},
            'AGAP000003': {'annotation': annotation(
                'AGAP000003', 'X', 1, 5, [(1, 5)], cds=(1, 5), strand=-1,
            )},
            'AGAP000004': {'annotation': annotation(
                'AGAP000004', 'X', 6, 10, [(6, 10)], cds=(6, 10),
            )},
        },
    }
    score_path, qc_path = tmp_path / 'scores.h5', tmp_path / 'qc.h5'
    with h5py.File(score_path, 'w') as root:
        arm = root.create_group('2L')
        arm.create_dataset('Cs', data=np.array([[0] * 5 + [1] * 5], dtype='f4'))
        arm.create_dataset('snp_density', data=np.array([[0.1] * 5 + [0.5] * 5], dtype='f4'))
        arm = root.create_group('X')
        arm.create_dataset('Cs', data=np.array([[1] * 10], dtype='f4'))
        arm.create_dataset('snp_density', data=np.array([[0.2] * 10], dtype='f4'))
    with h5py.File(qc_path, 'w') as root:
        root.create_group('2L').create_dataset(
            'status', data=np.array([1, 1, 1, 1, 0] + [1] * 5, dtype='u1'),
        )
        root.create_group('X').create_dataset(
            'status', data=np.array([1, 1, 1, 0, 0] + [0] * 5, dtype='u1'),
        )
    with h5py.File(score_path, 'r') as scores, h5py.File(qc_path, 'r') as qc:
        cs = build_gene_rankings.build_cs_rankings(scores, index, 'b' * 64)
        snp = build_gene_rankings.build_snp_rankings(
            scores, qc, index, 'b' * 64, 'c' * 64,
        )

    build_gene_rankings.validate_cs_rankings(cs, index)
    build_gene_rankings.validate_snp_rankings(snp, index)
    first = gene_ranking.ranking_for_gene(
        'AGAP000001', {'cs': cs, 'snp_density': snp},
    )
    assert first['cs']['gene_span']['global']['rank'] == 4
    exact_threshold = first['snp_density']['representative_cds']
    assert exact_threshold['accessible_fraction'] == 0.8
    assert exact_threshold['rank_state'] == 'ranked'
    assert exact_threshold['global']['rank'] == 1
    assert exact_threshold['global']['cohort_denominator'] == 2

    below = gene_ranking.ranking_for_gene(
        'AGAP000003', {'cs': cs, 'snp_density': snp},
    )['snp_density']['representative_cds']
    assert below['rank_state'] == 'not_ranked_ineligible'
    assert below['global'] is None
    unknown = gene_ranking.ranking_for_gene(
        'AGAP000004', {'cs': cs, 'snp_density': snp},
    )['snp_density']['representative_cds']
    assert unknown['accessible_bases'] == 0
    assert unknown['bases_assessed'] == 0
    assert unknown['mean_snp_density'] is None
    assert unknown['rank_state'] == 'not_ranked_ineligible'
    assert first['cs']['representative_utr']['rank_state'] == 'not_ranked_zero_bases'


def test_python_consumer_matches_shared_browser_fixture_and_formats_na_states(tmp_path):
    fixture = json.loads(FIXTURE.read_text())
    cs_path, snp_path = tmp_path / 'cs.json', tmp_path / 'snp.json'
    cs_path.write_text(json.dumps(fixture['documents']['cs']))
    snp_path.write_text(json.dumps(fixture['documents']['snp_density']))
    ranking = gene_ranking.ranking_for_gene(
        'agap000001', cs_path=cs_path, snp_path=snp_path,
    )

    assert ranking['accession'] == fixture['expected']['accession']
    assert [ranking['cs'][scope]['rank_state'] for scope in gene_ranking.SCOPES] == (
        fixture['expected']['cs_states']
    )
    assert [ranking['snp_density'][scope]['rank_state'] for scope in gene_ranking.SCOPES] == (
        fixture['expected']['snp_states']
    )
    assert ranking['cs']['representative_cds']['global']['cohort_denominator'] == 1
    assert ranking['snp_density']['representative_introns']['global_cohort_denominator'] == 0
    rendered = gene_ranking.format_gene_ranking(ranking)
    assert 'Representative-transcript CDS' in rendered
    assert '4/5 bases assessed; 80.0% accessible (4/5)' in rendered
    assert 'Not ranked — 75.0% accessible (3/4); 80% required' in rendered
    assert 'NA; Not ranked — zero-base partition' in rendered
    assert 'representative transcript AGAP000001-RA' in rendered


def test_validation_rejects_incomplete_accession_coverage():
    fixture = json.loads(FIXTURE.read_text())['documents']['cs']
    with pytest.raises(ValueError, match='exact accession-index gene set'):
        build_gene_rankings.validate_cs_rankings(
            fixture,
            {'index_version': None, 'accessions': {'AGAP000002': {}}},
        )


def test_checked_in_rankings_preserve_anonymous_source_cohort_context():
    root = Path(__file__).resolve().parents[1]
    index = json.loads((root / 'docs/assets/data/accession-index.json').read_text())
    cs = json.loads((root / 'AgamCs/data/gene-cs-rankings.json').read_text())
    snp = json.loads((root / 'AgamCs/data/gene-snp-rankings.json').read_text())

    build_gene_rankings.validate_cs_rankings(cs, index)
    build_gene_rankings.validate_snp_rankings(snp, index)
    assert len(cs['records']) == len(snp['records']) == len(index['accessions']) == 13_096
    assert len(cs['redacted_records']) == len(snp['redacted_records']) == 1
    assert cs['cohorts']['global_ranked_scope_counts'] == {
        'gene_span': 13_097,
        'representative_exons': 13_097,
        'representative_cds': 12_614,
        'representative_utr': 10_874,
        'representative_introns': 11_532,
    }
    assert snp['cohorts']['global_ranked_scope_counts'] == {
        'gene_span': 8_305,
        'representative_exons': 10_165,
        'representative_cds': 10_498,
        'representative_utr': 7_514,
        'representative_introns': 6_052,
    }

    documents = {'cs': cs, 'snp_density': snp}
    eligible = gene_ranking.ranking_for_gene('AGAP008212', documents)
    assert all(
        eligible['snp_density'][scope]['rank_state'] == 'ranked'
        for scope in gene_ranking.SCOPES
    )
    edge = gene_ranking.ranking_for_gene('AGAP001352', documents)
    assert edge['snp_density']['representative_introns']['accessible_fraction'] == 0.8
    assert edge['snp_density']['representative_introns']['rank_state'] == 'ranked'
    noncoding = gene_ranking.ranking_for_gene('AGAP000729', documents)
    assert noncoding['cs']['representative_cds']['rank_state'] == 'not_ranked_zero_bases'
    assert noncoding['cs']['representative_utr']['rank_state'] == 'not_ranked_zero_bases'
    failed = gene_ranking.ranking_for_gene('AGAP012201', documents)
    assert failed['snp_density']['gene_span']['rank_state'] == 'not_ranked_ineligible'
    assert failed['snp_density']['gene_span']['bases_assessed'] == 0
    alternative = gene_ranking.ranking_for_gene('AGAP008288', documents)
    assert alternative['representative_transcript'] == 'AGAP008288-RA'
