import copy
import json

import pytest

from tools import build_pages_accession_index


def annotation(accession='AGAP000001'):
    return {
        'id': accession,
        'assembly': 'AgamP4',
        'chromosome': '2L',
        'start': 10,
        'end': 30,
        'strand': 1,
        'transcript_id': f'{accession}-RA',
        'exons': [{'start': 10, 'end': 30}],
        'cds_start': 12,
        'cds_end': 28,
    }


def write_source(path, records):
    path.write_text(json.dumps(records), encoding='utf-8')


def test_build_index_pins_annotation_and_provenance(tmp_path):
    source = tmp_path / 'annotations.json'
    expected = annotation()
    write_source(source, {'AGAP000001': expected})

    index = build_pages_accession_index.build_index(source)
    build_pages_accession_index.validate_index(index)

    assert index['index_version'] == 'agamcs-agamp4.14-v1'
    assert index['annotation']['gene_build'] == 'AgamP4.14'
    assert index['annotation']['source_snapshot_sha256'] == build_pages_accession_index.source_sha256(source)
    assert index['live_lookup']['enabled'] is False
    assert index['aliases'] == {}
    assert index['retired'] == {}
    assert index['accessions']['AGAP000001'] == {
        'status': 'current',
        'region': '2L:10-30',
        'annotation': expected,
    }


def test_build_index_rejects_mismatched_assembly(tmp_path):
    source = tmp_path / 'annotations.json'
    invalid = annotation()
    invalid['assembly'] = 'AgamP3'
    write_source(source, {'AGAP000001': invalid})

    with pytest.raises(ValueError, match='is not on AgamP4'):
        build_pages_accession_index.build_index(source)


def test_validate_index_rejects_silent_live_lookup(tmp_path):
    source = tmp_path / 'annotations.json'
    write_source(source, {'AGAP000001': annotation()})
    index = build_pages_accession_index.build_index(source)
    invalid = copy.deepcopy(index)
    invalid['live_lookup']['enabled'] = True

    with pytest.raises(ValueError, match='Live lookup must remain disabled'):
        build_pages_accession_index.validate_index(invalid)
