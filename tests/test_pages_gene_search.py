import copy
import gzip
import json

import pytest

from tools import build_pages_gene_search


def accession_index():
    return {
        'index_version': 'test-index-v1',
        'assembly': 'AgamP4',
        'accessions': {
            'AGAP000001': {
                'annotation': {
                    'chromosome': '2L', 'start': 10, 'end': 30,
                },
            },
            'AGAP000002': {
                'annotation': {
                    'chromosome': '3R', 'start': 40, 'end': 60,
                },
            },
        },
    }


def write_index(path):
    path.write_text(json.dumps(accession_index()), encoding='utf-8')


def source_lines():
    return (
        '##gff-version 3\n'
        '2L\tVectorBase\tgene\t10\t30\t.\t+\t.\t'
        'ID=gene:AGAP000001;Name=ZPG;biotype=protein_coding;'
        'description=Innexin inx2 [Source:UniProtKB/TrEMBL%3BAcc:TEST]\n'
        'AgamP4_3R\tVectorBase\tgene\t40\t60\t.\t-\t.\t'
        'ID=AGAP000002;Name=ZPG;biotype=protein_coding\n'
        'UNKN\tVectorBase\tgene\t1\t2\t.\t+\t.\t'
        'ID=gene:AGAP999999;Name=Ignored\n'
    )


def test_builds_names_only_after_exact_coordinate_join(tmp_path):
    source = tmp_path / 'genes.gff3.gz'
    with gzip.open(source, 'wt', encoding='utf-8') as handle:
        handle.write(source_lines())
    index_path = tmp_path / 'accession-index.json'
    write_index(index_path)

    document = build_pages_gene_search.build_gene_search(source, index_path)
    build_pages_gene_search.validate_gene_search(document, accession_index())

    assert document['coordinate_index_version'] == 'test-index-v1'
    assert document['coverage']['gene_records_checked'] == 2
    assert document['coverage']['named_gene_records'] == 2
    assert document['coverage']['ambiguous_name_groups'] == 1
    assert document['coverage']['genes_with_ambiguous_names'] == 2
    assert document['names']['AGAP000001'] == {
        'name': 'ZPG',
        'biotype': 'protein_coding',
        'description': 'Innexin inx2',
    }
    assert document['names']['AGAP000002'] == {
        'name': 'ZPG',
        'biotype': 'protein_coding',
    }


def test_rejects_coordinate_drift(tmp_path):
    source = tmp_path / 'genes.gff3'
    source.write_text(source_lines().replace('\t40\t60\t', '\t41\t60\t'), encoding='utf-8')
    index_path = tmp_path / 'accession-index.json'
    write_index(index_path)

    with pytest.raises(ValueError, match='coordinates disagree'):
        build_pages_gene_search.build_gene_search(source, index_path)


def test_rejects_missing_indexed_genes(tmp_path):
    source = tmp_path / 'genes.gff3'
    source.write_text(source_lines().split('AgamP4_3R')[0], encoding='utf-8')
    index_path = tmp_path / 'accession-index.json'
    write_index(index_path)

    with pytest.raises(ValueError, match='missing 1 indexed genes'):
        build_pages_gene_search.build_gene_search(source, index_path)


def test_validation_recalculates_ambiguity_counts(tmp_path):
    source = tmp_path / 'genes.gff3'
    source.write_text(source_lines(), encoding='utf-8')
    index_path = tmp_path / 'accession-index.json'
    write_index(index_path)
    document = build_pages_gene_search.build_gene_search(source, index_path)
    invalid = copy.deepcopy(document)
    invalid['coverage']['ambiguous_name_groups'] = 0

    with pytest.raises(ValueError, match='ambiguous_name_groups'):
        build_pages_gene_search.validate_gene_search(invalid, accession_index())
