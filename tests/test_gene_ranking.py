import json

import h5py
import numpy as np
import pytest

from AgamCs import gene_ranking
from tools import build_gene_rankings


def annotation(accession, chromosome, start, end, exons):
    return {
        'id': accession,
        'assembly': 'AgamP4',
        'chromosome': chromosome,
        'start': start,
        'end': end,
        'strand': 1,
        'transcript_id': f'{accession}-RA',
        'exons': [{'start': left, 'end': right} for left, right in exons],
        'cds_start': None,
        'cds_end': None,
    }


def test_builds_complete_span_and_exon_rankings_with_explicit_ties(tmp_path):
    index = {
        'schema_version': 2,
        'index_version': 'test-index-v1',
        'assembly': 'AgamP4',
        'annotation': {
            'gene_build': 'AgamP4.14',
            'release': 'VectorBase 68',
            'source_snapshot_sha256': 'a' * 64,
        },
        'accessions': {
            'AGAP000001': {'annotation': annotation('AGAP000001', '2L', 1, 4, [(1, 2)])},
            'AGAP000002': {'annotation': annotation('AGAP000002', '2L', 5, 8, [(5, 6)])},
            'AGAP000003': {'annotation': annotation('AGAP000003', 'X', 1, 4, [(1, 2)])},
        },
    }
    score_path = tmp_path / 'scores.h5'
    with h5py.File(score_path, 'w') as root:
        root.create_group('2L').create_dataset(
            'Cs', data=np.array([[0, 0, 0, 0, 1, 1, 1, 1]], dtype='f4'),
        )
        root.create_group('X').create_dataset(
            'Cs', data=np.array([[1, 1, 1, 1]], dtype='f4'),
        )
    with h5py.File(score_path, 'r') as root:
        document = build_gene_rankings.build_gene_rankings(root, index, 'b' * 64)

    build_gene_rankings.validate_gene_rankings(document, index)
    assert document['cohorts'] == {
        'global_gene_count': 3,
        'chromosome_gene_counts': {'2L': 2, 'X': 1},
    }
    low = document['records']['AGAP000001']['gene_span']
    assert low['mean_cs'] == 0
    assert low['global'] == {'rank': 3, 'ties': 1, 'percentile': 0.0}
    high = document['records']['AGAP000002']['representative_exons']
    assert high['global'] == {'rank': 1, 'ties': 2, 'percentile': 75.0}
    assert high['chromosome'] == {'rank': 1, 'ties': 1, 'percentile': 100.0}


def test_lookup_and_format_preserve_denominators_and_warning(tmp_path):
    path = tmp_path / 'gene-rankings.json'
    document = {
        'schema_version': 1,
        'ranking_version': 'test-v1',
        'assembly': 'AgamP4',
        'coordinate_index_version': 'index-v1',
        'score_source': {'interpretation': 'warning'},
        'percentile_method': 'method',
        'metrics': {},
        'cohorts': {'global_gene_count': 3, 'chromosome_gene_counts': {'2L': 2}},
        'records': {
            'AGAP000001': {
                'chromosome': '2L',
                'representative_transcript': 'AGAP000001-RA',
                'gene_span': {
                    'bases': 4, 'mean_cs': 0.25,
                    'global': {'rank': 2, 'ties': 1, 'percentile': 50.0},
                    'chromosome': {'rank': 1, 'ties': 2, 'percentile': 50.0},
                },
                'representative_exons': {
                    'bases': 2, 'mean_cs': 0.5,
                    'global': {'rank': 1, 'ties': 1, 'percentile': 100.0},
                    'chromosome': {'rank': 1, 'ties': 1, 'percentile': 100.0},
                },
            },
        },
    }
    path.write_text(json.dumps(document), encoding='utf-8')

    ranking = gene_ranking.ranking_for_gene('agap000001', path=path)
    assert ranking['accession'] == 'AGAP000001'
    assert gene_ranking.ranking_for_gene('AGAP999999', document=document) is None
    rendered = gene_ranking.format_gene_ranking(ranking)
    assert '2 of 3; 50.00th percentile' in rendered
    assert '1–2 (tie) of 2; 50.00th percentile' in rendered
    assert 'scaled separately by chromosome arm' in rendered


def test_validation_rejects_incomplete_accession_coverage():
    with pytest.raises(ValueError, match='exact accession-index gene set'):
        build_gene_rankings.validate_gene_rankings(
            {
                'schema_version': 1,
                'ranking_version': build_gene_rankings.RANKING_VERSION,
                'assembly': 'AgamP4',
                'coordinate_index_version': 'test',
                'cohorts': {'global_gene_count': 1, 'chromosome_gene_counts': {'2L': 1}},
                'records': {
                    'AGAP000001': {
                        'chromosome': '2L',
                        'gene_span': {'bases': 1, 'mean_cs': 0},
                        'representative_exons': {'bases': 1, 'mean_cs': 0},
                    },
                },
            },
            {'index_version': 'test', 'accessions': {'AGAP000002': {}}},
        )
