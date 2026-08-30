import json

import h5py
import numpy as np
import pytest

from AgamCs import gene_ranking
from tools import build_gene_rankings


def annotation(accession, chromosome, start, end, exons):
    return {
        'id': accession, 'assembly': 'AgamP4', 'chromosome': chromosome,
        'start': start, 'end': end, 'strand': 1,
        'transcript_id': f'{accession}-RA',
        'exons': [{'start': left, 'end': right} for left, right in exons],
        'cds_start': None, 'cds_end': None,
    }


def test_builds_cs_and_qc_eligible_low_variation_rankings(tmp_path):
    index = {
        'schema_version': 2, 'index_version': 'test-index-v1', 'assembly': 'AgamP4',
        'annotation': {'gene_build': 'AgamP4.14', 'release': 'VectorBase 68',
                       'source_snapshot_sha256': 'a' * 64},
        'accessions': {
            'AGAP000001': {'annotation': annotation('AGAP000001', '2L', 1, 5, [(1, 5)])},
            'AGAP000002': {'annotation': annotation('AGAP000002', '2L', 6, 10, [(6, 10)])},
            'AGAP000003': {'annotation': annotation('AGAP000003', 'X', 1, 5, [(1, 5)])},
            'AGAP000004': {'annotation': annotation('AGAP000004', 'X', 6, 10, [(6, 10)])},
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
        root.create_group('2L').create_dataset('status', data=np.array([1, 1, 1, 1, 0] + [1] * 5, dtype='u1'))
        root.create_group('X').create_dataset('status', data=np.array([1, 1, 1, 0, 0] + [0] * 5, dtype='u1'))
    with h5py.File(score_path, 'r') as scores, h5py.File(qc_path, 'r') as qc:
        cs = build_gene_rankings.build_cs_rankings(scores, index, 'b' * 64)
        snp = build_gene_rankings.build_snp_rankings(scores, qc, index, 'b' * 64, 'c' * 64)

    build_gene_rankings.validate_cs_rankings(cs, index)
    build_gene_rankings.validate_snp_rankings(snp, index)
    assert cs['records']['AGAP000001']['gene_span']['global']['rank'] == 4
    assert snp['cohorts']['global_eligible_gene_counts']['gene_span'] == 2
    exact_threshold = snp['records']['AGAP000001']['gene_span']
    assert exact_threshold['accessible_fraction'] == 0.8
    assert exact_threshold['eligible'] is True
    assert exact_threshold['global'] == {'rank': 1, 'ties': 1, 'percentile': 100.0}
    assert snp['records']['AGAP000002']['gene_span']['global']['percentile'] == 0.0
    below = snp['records']['AGAP000003']['gene_span']
    assert below['eligible'] is False and below['global'] is None
    unknown = snp['records']['AGAP000004']['gene_span']
    assert unknown['accessible_bases'] == 0 and unknown['mean_snp_density'] is None


def test_lookup_and_format_report_both_denominators_and_ineligibility(tmp_path):
    cs_path, snp_path = tmp_path / 'cs.json', tmp_path / 'snp.json'
    shared = {'chromosome': '2L', 'representative_transcript': 'AGAP000001-RA'}
    stat = {'rank': 1, 'ties': 1, 'percentile': 100.0}
    cs = {
        'schema_version': 1, 'ranking_version': 'cs-v1', 'assembly': 'AgamP4',
        'coordinate_index_version': 'index-v1', 'score_source': {'interpretation': 'warning'},
        'percentile_method': 'method',
        'cohorts': {'global_gene_count': 3, 'chromosome_gene_counts': {'2L': 2}},
        'records': {'AGAP000001': {**shared,
            'gene_span': {'bases': 4, 'mean_cs': 0.25, 'global': stat, 'chromosome': stat},
            'representative_exons': {'bases': 2, 'mean_cs': 0.5, 'global': stat, 'chromosome': stat}}},
    }
    ineligible = {'total_bases': 10, 'accessible_bases': 7, 'accessible_fraction': 0.7,
                  'mean_snp_density': 0.2, 'eligible': False, 'global': None, 'chromosome': None}
    snp = {
        'schema_version': 1, 'ranking_version': 'snp-v1', 'assembly': 'AgamP4',
        'coordinate_index_version': 'index-v1', 'score_source': {}, 'accessibility_source': {},
        'minimum_accessible_fraction': 0.8, 'percentile_method': 'method',
        'cohorts': {'global_eligible_gene_counts': {'gene_span': 1, 'representative_exons': 1},
                    'chromosome_eligible_gene_counts': {'gene_span': {'2L': 1}, 'representative_exons': {'2L': 1}}},
        'records': {'AGAP000001': {**shared, 'gene_span': ineligible,
            'representative_exons': {**ineligible, 'accessible_bases': 9,
                'accessible_fraction': 0.9, 'eligible': True, 'global': stat, 'chromosome': stat}}},
    }
    cs_path.write_text(json.dumps(cs)); snp_path.write_text(json.dumps(snp))
    ranking = gene_ranking.ranking_for_gene('agap000001', cs_path=cs_path, snp_path=snp_path)
    rendered = gene_ranking.format_gene_ranking(ranking)
    assert 'Cs percentile' in rendered
    assert 'Low-variation percentile' in rendered
    assert 'not ranked — 70.0% accessible (7/10); 80% required' in rendered
    assert '1 of 1; 100.00th percentile' in rendered


def test_validation_rejects_incomplete_accession_coverage():
    with pytest.raises(ValueError, match='exact accession-index gene set'):
        build_gene_rankings.validate_cs_rankings(
            {'schema_version': 1, 'ranking_version': build_gene_rankings.CS_RANKING_VERSION,
             'assembly': 'AgamP4', 'coordinate_index_version': 'test',
             'cohorts': {'global_gene_count': 1, 'chromosome_gene_counts': {'2L': 1}},
             'records': {'AGAP000001': {}}},
            {'index_version': 'test', 'accessions': {'AGAP000002': {}}},
        )
