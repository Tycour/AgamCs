import json
from pathlib import Path

from AgamCs.gene_regions import read_list_file


ROOT = Path(__file__).resolve().parents[1]


def test_batch_example_is_current_and_structurally_representative():
    accessions = read_list_file(ROOT / 'batch_accessions_example.txt')
    index = json.loads(
        (ROOT / 'docs/assets/data/accession-index.json').read_text(encoding='utf-8')
    )
    query_manifest = json.loads(
        (ROOT / 'docs/assets/data/query-manifest.json').read_text(encoding='utf-8')
    )

    assert len(accessions) == 10
    assert len(accessions) == len(set(accessions))

    records = [index['accessions'][accession] for accession in accessions]
    annotations = [record['annotation'] for record in records]

    assert all(record['status'] == 'current' for record in records)
    assert {annotation['chromosome'] for annotation in annotations} == {
        '2L', '2R', '3L', '3R', 'X'
    }
    assert {annotation['strand'] for annotation in annotations} == {-1, 1}
    assert {annotation['cds_start'] is None for annotation in annotations} == {
        False, True
    }
    assert min(len(record['transcript_ids']) for record in records) == 1
    assert max(len(record['transcript_ids']) for record in records) >= 10
    assert all(
        annotation['end'] - annotation['start'] + 1
        <= query_manifest['maximum_query_bases']
        for annotation in annotations
    )
