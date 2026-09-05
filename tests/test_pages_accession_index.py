import copy
import hashlib
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

    assert index['schema_version'] == 2
    assert index['index_version'] == 'agamcs-agamp4.14-v4'
    assert index['annotation']['gene_build'] == 'AgamP4.14'
    assert index['annotation']['source_snapshot_sha256'] == build_pages_accession_index.source_sha256(source)
    assert index['live_lookup']['enabled'] is False
    assert index['coverage']['privacy_filtered_gene_records'] == 0
    assert index['coverage']['privacy_filtered_transcript_records'] == 0
    assert index['aliases'] == {}
    assert index['retired'] == {}
    assert index['accessions']['AGAP000001'] == {
        'status': 'current',
        'region': '2L:10-30',
        'transcript_ids': ['AGAP000001-RA'],
        'annotation': expected,
    }
    assert index['transcripts']['AGAP000001-RA'] == {
        'gene_accession': 'AGAP000001',
        'start': 10,
        'end': 30,
        'exons': [[10, 30]],
        'cds_start': 12,
        'cds_end': 28,
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


def test_public_index_curation_uses_non_publishing_digests(monkeypatch):
    accession = 'AGAP000001'
    digest = hashlib.sha256(accession.encode('ascii')).hexdigest()
    monkeypatch.setattr(build_pages_accession_index, 'PUBLIC_EXCLUSION_DIGESTS', frozenset({digest}))

    assert build_pages_accession_index.include_in_public_index(accession) is False
    assert build_pages_accession_index.include_in_public_index('AGAP000002') is True


def test_bulk_gff_builds_supported_gene_models_and_chooses_representative_transcript(tmp_path):
    gff = tmp_path / 'VectorBase-68_AgambiaePEST.gff'
    gff.write_text(
        '##gff-version 3\n'
        'AgamP4_2R\tVEuPathDB\tprotein_coding_gene\t100\t500\t.\t+\t.\tID=AGAP004568\n'
        'AgamP4_2R\tVEuPathDB\tmRNA\t100\t300\t.\t+\t.\tID=AGAP004568-RA;Parent=AGAP004568\n'
        'AgamP4_2R\tVEuPathDB\texon\t100\t150\t.\t+\t.\tID=e1;Parent=AGAP004568-RA\n'
        'AgamP4_2R\tVEuPathDB\tmRNA\t100\t500\t.\t+\t.\tID=AGAP004568-RB;Parent=AGAP004568\n'
        'AgamP4_2R\tVEuPathDB\texon\t100\t200\t.\t+\t.\tID=e2;Parent=AGAP004568-RB\n'
        'AgamP4_2R\tVEuPathDB\texon\t400\t500\t.\t+\t.\tID=e3;Parent=AGAP004568-RB\n'
        'AgamP4_2R\tVEuPathDB\tCDS\t120\t200\t.\t+\t0\tID=c1;Parent=AGAP004568-RB\n'
        'AgamP4_2R\tVEuPathDB\tCDS\t400\t450\t.\t+\t0\tID=c2;Parent=AGAP004568-RB\n'
        'AgamP4_3L\tVEuPathDB\tncRNA_gene\t700\t800\t.\t-\t.\tID=AGAP004569\n'
        'AgamP4_3L\tVEuPathDB\trRNA\t700\t800\t.\t-\t.\tID=AGAP004569-RA;Parent=AGAP004569\n'
        'AgamP4_3L\tVEuPathDB\texon\t700\t730\t.\t-\t.\tID=e4;Parent=AGAP004569-RA\n'
        'AgamP4_3L\tVEuPathDB\texon\t780\t800\t.\t-\t.\tID=e5;Parent=AGAP004569-RA\n'
        'AgamP4_UNKN\tVEuPathDB\tprotein_coding_gene\t1\t20\t.\t+\t.\tID=AGAP004570\n',
        encoding='utf-8',
    )

    index = build_pages_accession_index.build_index_from_gff(gff)
    build_pages_accession_index.validate_index(index)

    assert set(index['accessions']) == {'AGAP004568', 'AGAP004569'}
    coding = index['accessions']['AGAP004568']['annotation']
    assert coding['transcript_id'] == 'AGAP004568-RB'
    assert coding['exons'] == [{'start': 100, 'end': 200}, {'start': 400, 'end': 500}]
    assert (coding['cds_start'], coding['cds_end']) == (120, 450)
    assert index['accessions']['AGAP004568']['transcript_ids'] == [
        'AGAP004568-RA', 'AGAP004568-RB',
    ]
    assert index['transcripts']['AGAP004568-RA'] == {
        'gene_accession': 'AGAP004568',
        'start': 100,
        'end': 300,
        'exons': [[100, 150]],
        'cds_start': None,
        'cds_end': None,
    }
    assert index['transcripts']['AGAP004568-RB']['exons'] == [[100, 200], [400, 500]]
    noncoding = index['accessions']['AGAP004569']['annotation']
    assert noncoding['exons'] == [{'start': 780, 'end': 800}, {'start': 700, 'end': 730}]
    assert noncoding['cds_start'] is None
    assert index['annotation']['source_url'] == build_pages_accession_index.VECTORBASE_GFF_URL
    assert index['coverage']['chromosomes'] == ['2L', '2R', '3L', '3R', 'X']
