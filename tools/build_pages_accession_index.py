"""Build the versioned accession-to-region index used by the Pages client.

The generated file is deliberately static. It records the annotation release
and exact source checksum so browser results cannot move when a live service
changes. The production index is generated from the official VectorBase 68
GFF in one pass; the smaller JSON source mode remains useful for tests and
reviewed fixtures.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import unquote


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = REPOSITORY_ROOT / 'data' / 'accession_annotation_cache.json'
DEFAULT_OUTPUT = REPOSITORY_ROOT / 'docs' / 'assets' / 'data' / 'accession-index.json'
ASSEMBLY = 'AgamP4'
GENE_BUILD = 'AgamP4.14'
INDEX_VERSION = 'agamcs-agamp4.14-v3'
VERIFIED_ON = '2026-08-04'
VECTORBASE_RELEASE = '68'
VECTORBASE_GFF_NAME = 'VectorBase-68_AgambiaePEST.gff'
VECTORBASE_GFF_URL = (
    'https://vectorbase.org/common/downloads/release-68/AgambiaePEST/gff/data/'
    + VECTORBASE_GFF_NAME
)
ACCESSION_PATTERN = re.compile(r'^AGAP\d{6}$')
TRANSCRIPT_PATTERN = re.compile(r'^AGAP\d{6}(?:-[A-Z0-9.]+|\.[A-Z0-9.]+)$')
CHROMOSOMES = {'2L', '2R', '3L', '3R', 'X'}
SEQUENCE_PREFIX = 'AgamP4_'
REQUIRED_ANNOTATION_FIELDS = {
    'id', 'assembly', 'chromosome', 'start', 'end', 'strand',
    'transcript_id', 'exons', 'cds_start', 'cds_end',
}
TRANSCRIPT_FEATURES = {
    'mRNA', 'tRNA', 'rRNA', 'pre_miRNA', 'snRNA', 'ncRNA', 'SRP_RNA',
    'snoRNA', 'lnc_RNA', 'RNase_P_RNA', 'RNase_MRP_RNA',
    'pseudogenic_transcript',
}


def source_sha256(path: Path) -> str:
    """Return the checksum of the exact source snapshot."""
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def validate_annotation(accession: str, annotation: dict) -> None:
    """Validate one browser-facing gene annotation."""
    missing = REQUIRED_ANNOTATION_FIELDS - annotation.keys()
    if missing:
        raise ValueError(f'{accession} is missing fields: {", ".join(sorted(missing))}')
    if not ACCESSION_PATTERN.fullmatch(accession) or annotation['id'] != accession:
        raise ValueError(f'Invalid or mismatched accession: {accession}')
    if annotation['assembly'] != ASSEMBLY:
        raise ValueError(f'{accession} is not on {ASSEMBLY}')
    if annotation['chromosome'] not in CHROMOSOMES:
        raise ValueError(f'{accession} has an unsupported chromosome')
    start, end = annotation['start'], annotation['end']
    if not isinstance(start, int) or not isinstance(end, int) or start < 1 or end < start:
        raise ValueError(f'{accession} has invalid one-based coordinates')
    if annotation['strand'] not in (-1, 1):
        raise ValueError(f'{accession} strand must be -1 or 1')
    if not annotation['transcript_id']:
        raise ValueError(f'{accession} has no representative transcript')
    if not isinstance(annotation['exons'], list) or not annotation['exons']:
        raise ValueError(f'{accession} must contain at least one exon')
    for exon in annotation['exons']:
        exon_start, exon_end = exon.get('start'), exon.get('end')
        if not isinstance(exon_start, int) or not isinstance(exon_end, int):
            raise ValueError(f'{accession} has a non-integer exon')
        if exon_start < start or exon_end > end or exon_end < exon_start:
            raise ValueError(f'{accession} has an exon outside the gene interval')
    cds_start, cds_end = annotation['cds_start'], annotation['cds_end']
    if (cds_start is None) != (cds_end is None):
        raise ValueError(f'{accession} must provide both CDS bounds or neither')
    if cds_start is not None and not (start <= cds_start <= cds_end <= end):
        raise ValueError(f'{accession} has CDS bounds outside the gene interval')


def load_source(path: Path) -> dict[str, dict]:
    """Read and validate a small local JSON annotation snapshot."""
    source = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(source, dict) or not source:
        raise ValueError('The annotation source must be a non-empty object.')
    for accession, annotation in source.items():
        validate_annotation(accession, annotation)
    return source


def parse_gff_attributes(value: str) -> dict[str, str]:
    """Parse the simple key=value attributes used by the release-68 GFF."""
    attributes = {}
    for item in value.split(';'):
        if not item or '=' not in item:
            continue
        key, raw_value = item.split('=', 1)
        attributes[key] = unquote(raw_value)
    return attributes


def _chromosome(sequence_id: str) -> str | None:
    if not sequence_id.startswith(SEQUENCE_PREFIX):
        return None
    chromosome = sequence_id[len(SEQUENCE_PREFIX):]
    return chromosome if chromosome in CHROMOSOMES else None


def _parents(attributes: dict[str, str]) -> list[str]:
    return [parent for parent in attributes.get('Parent', '').split(',') if parent]


def _choose_transcript(candidates: list[dict]) -> dict:
    """Choose a stable representative transcript matching the CLI policy.

    Coding transcripts are preferred, then the transcript with the widest
    genomic span. Ties use the accession-like transcript identifier so output
    remains deterministic and normally favours the release's ``-RA`` model.
    """
    return min(
        candidates,
        key=lambda transcript: (
            -bool(transcript['cds']),
            -(transcript['end'] - transcript['start'] + 1),
            transcript['id'],
        ),
    )


def load_gff_catalogue(path: Path) -> tuple[dict[str, dict], dict[str, dict], dict[str, list[str]]]:
    """Build supported gene annotations and every transcript model from one GFF pass."""
    genes: dict[str, dict] = {}
    transcripts: dict[str, dict] = {}

    with path.open(encoding='utf-8') as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line or line.startswith('#'):
                continue
            fields = line.rstrip('\n').split('\t')
            if len(fields) != 9:
                raise ValueError(f'Invalid GFF record on line {line_number}')
            sequence_id, _, feature, start_text, end_text, _, strand_text, _, raw_attributes = fields
            chromosome = _chromosome(sequence_id)
            if chromosome is None:
                continue
            attributes = parse_gff_attributes(raw_attributes)
            identifier = attributes.get('ID', '')
            start, end = int(start_text), int(end_text)
            strand = {'+': 1, '-': -1}.get(strand_text)

            if feature.endswith('gene') and ACCESSION_PATTERN.fullmatch(identifier):
                if strand is None:
                    raise ValueError(f'{identifier} has no strand on line {line_number}')
                genes[identifier] = {
                    'id': identifier,
                    'assembly': ASSEMBLY,
                    'chromosome': chromosome,
                    'start': start,
                    'end': end,
                    'strand': strand,
                }
                continue

            parents = _parents(attributes)
            if feature in TRANSCRIPT_FEATURES and identifier and len(parents) == 1:
                transcripts[identifier] = {
                    'id': identifier,
                    'gene_id': parents[0],
                    'start': start,
                    'end': end,
                    'strand': strand,
                    'exons': [],
                    'cds': [],
                }
                continue

            if feature not in {'exon', 'CDS'}:
                continue
            for parent in parents:
                transcript = transcripts.get(parent)
                if transcript is None:
                    continue
                interval = {'start': start, 'end': end}
                target = transcript['exons'] if feature == 'exon' else transcript['cds']
                if interval not in target:
                    target.append(interval)

    candidates_by_gene: dict[str, list[dict]] = {}
    for transcript in transcripts.values():
        if transcript['gene_id'] in genes and transcript['exons']:
            candidates_by_gene.setdefault(transcript['gene_id'], []).append(transcript)

    source: dict[str, dict] = {}
    transcript_models: dict[str, dict] = {}
    transcript_ids_by_gene: dict[str, list[str]] = {}
    missing_transcripts = []
    for accession in sorted(genes):
        candidates = candidates_by_gene.get(accession, [])
        if not candidates:
            missing_transcripts.append(accession)
            continue
        gene = genes[accession]
        ordered_candidates = sorted(candidates, key=lambda candidate: candidate['id'])
        transcript_ids_by_gene[accession] = [candidate['id'] for candidate in ordered_candidates]
        for candidate in ordered_candidates:
            candidate_exons = sorted(
                candidate['exons'],
                key=lambda interval: (interval['start'], interval['end']),
                reverse=gene['strand'] == -1,
            )
            candidate_cds = candidate['cds']
            model = {
                'gene_accession': accession,
                'start': candidate['start'],
                'end': candidate['end'],
                'exons': [[interval['start'], interval['end']] for interval in candidate_exons],
                'cds_start': min((interval['start'] for interval in candidate_cds), default=None),
                'cds_end': max((interval['end'] for interval in candidate_cds), default=None),
            }
            transcript_annotation = {
                **gene,
                'start': model['start'],
                'end': model['end'],
                'transcript_id': candidate['id'],
                'exons': candidate_exons,
                'cds_start': model['cds_start'],
                'cds_end': model['cds_end'],
            }
            validate_annotation(accession, transcript_annotation)
            transcript_models[candidate['id']] = model

        transcript = _choose_transcript(candidates)
        model = transcript_models[transcript['id']]
        annotation = {
            **gene,
            'transcript_id': transcript['id'],
            'exons': [
                {'start': interval[0], 'end': interval[1]}
                for interval in model['exons']
            ],
            'cds_start': model['cds_start'],
            'cds_end': model['cds_end'],
        }
        validate_annotation(accession, annotation)
        source[accession] = annotation

    if missing_transcripts:
        preview = ', '.join(missing_transcripts[:5])
        raise ValueError(
            f'{len(missing_transcripts)} supported genes have no transcript/exon model: {preview}'
        )
    if not source:
        raise ValueError('The GFF did not contain supported AGAP gene models.')
    return source, transcript_models, transcript_ids_by_gene


def load_gff_source(path: Path) -> dict[str, dict]:
    """Return representative gene annotations for callers using the legacy helper."""
    return load_gff_catalogue(path)[0]


def _default_transcript_catalogue(
    source: dict[str, dict],
) -> tuple[dict[str, dict], dict[str, list[str]]]:
    """Represent each reviewed JSON record as its single known transcript."""
    models = {}
    ids_by_gene = {}
    for accession, annotation in source.items():
        transcript_id = annotation['transcript_id']
        models[transcript_id] = {
            'gene_accession': accession,
            'start': annotation['start'],
            'end': annotation['end'],
            'exons': [[exon['start'], exon['end']] for exon in annotation['exons']],
            'cds_start': annotation['cds_start'],
            'cds_end': annotation['cds_end'],
        }
        ids_by_gene[accession] = [transcript_id]
    return models, ids_by_gene


def _index_document(
    source: dict[str, dict],
    source_path: Path,
    *,
    bulk_gff: bool,
    transcript_models: dict[str, dict] | None = None,
    transcript_ids_by_gene: dict[str, list[str]] | None = None,
) -> dict:
    if transcript_models is None or transcript_ids_by_gene is None:
        transcript_models, transcript_ids_by_gene = _default_transcript_catalogue(source)
    accessions = {
        accession: {
            'status': 'current',
            'region': f"{annotation['chromosome']}:{annotation['start']}-{annotation['end']}",
            'transcript_ids': transcript_ids_by_gene[accession],
            'annotation': annotation,
        }
        for accession, annotation in sorted(source.items())
    }
    if bulk_gff:
        source_name = f'VEuPathDB VectorBase release {VECTORBASE_RELEASE}'
        source_url = VECTORBASE_GFF_URL
        released = '2024-04'
        verification = (
            'All supported AGAP gene and transcript models, including every exon and CDS record, were '
            'parsed deterministically from the official release GFF; the reviewed example '
            'annotations remain exact regression fixtures.'
        )
    else:
        source_name = 'Reviewed local annotation snapshot'
        source_url = 'https://metazoa.ensembl.org/Anopheles_gambiae/Info/Annotation'
        released = '2022-08'
        verification = 'Coordinates and transcript structure are pinned in the reviewed source snapshot.'

    return {
        'schema_version': 2,
        'index_version': INDEX_VERSION,
        'assembly': ASSEMBLY,
        'coordinate_convention': '1-based inclusive',
        'annotation': {
            'gene_build': GENE_BUILD,
            'release': f'VectorBase {VECTORBASE_RELEASE}' if bulk_gff else GENE_BUILD,
            'released': released,
            'source': source_name,
            'source_url': source_url,
            'source_file': source_path.name,
            'verified_on': VERIFIED_ON,
            'verification': verification,
            'source_snapshot_sha256': source_sha256(source_path),
        },
        'coverage': {
            'chromosomes': sorted(CHROMOSOMES),
            'statement': (
                'Includes current AGAP genes and their transcript isoforms on the five chromosome '
                'arrays available to the browser. Unplaced and unknown scaffolds are not queryable.'
            ),
        },
        'refresh_policy': {
            'mode': 'manual review only',
            'statement': (
                'Never refresh silently. Rebuild from a reviewed release, run regression '
                'validation, and bump index_version before publication.'
            ),
        },
        'live_lookup': {
            'enabled': False,
            'statement': 'Live Ensembl lookup is intentionally disabled; the browser uses this versioned release.',
        },
        'accessions': accessions,
        'transcripts': dict(sorted(transcript_models.items())),
        'aliases': {},
        'retired': {},
    }


def build_index(source_path: Path) -> dict:
    """Create an index from the small JSON source mode."""
    return _index_document(load_source(source_path), source_path, bulk_gff=False)


def build_index_from_gff(gff_path: Path) -> dict:
    """Create the complete production index from the official bulk GFF."""
    source, transcript_models, transcript_ids_by_gene = load_gff_catalogue(gff_path)
    return _index_document(
        source,
        gff_path,
        bulk_gff=True,
        transcript_models=transcript_models,
        transcript_ids_by_gene=transcript_ids_by_gene,
    )


def validate_index(index: dict) -> None:
    """Validate a generated index without needing the source GFF."""
    if index.get('schema_version') != 2:
        raise ValueError('Unsupported or missing accession-index schema_version.')
    if index.get('index_version') != INDEX_VERSION:
        raise ValueError('Unexpected accession-index version.')
    if index.get('assembly') != ASSEMBLY:
        raise ValueError('Unexpected accession-index assembly.')
    if index.get('annotation', {}).get('gene_build') != GENE_BUILD:
        raise ValueError('Unexpected accession-index annotation build.')
    digest = index.get('annotation', {}).get('source_snapshot_sha256', '')
    if not re.fullmatch(r'[0-9a-f]{64}', digest):
        raise ValueError('Invalid accession-index source checksum.')
    if index.get('live_lookup', {}).get('enabled') is not False:
        raise ValueError('Live lookup must remain disabled for the versioned prototype.')
    if not isinstance(index.get('aliases'), dict) or not isinstance(index.get('retired'), dict):
        raise ValueError('Aliases and retired accessions must be explicit objects.')
    accessions = index.get('accessions')
    if not isinstance(accessions, dict) or not accessions:
        raise ValueError('The accession index must contain records.')
    for accession, record in accessions.items():
        if record.get('status') != 'current':
            raise ValueError(f'{accession} has an unexpected status')
        validate_annotation(accession, record.get('annotation', {}))
        annotation = record['annotation']
        expected_region = f"{annotation['chromosome']}:{annotation['start']}-{annotation['end']}"
        if record.get('region') != expected_region:
            raise ValueError(f'{accession} region does not match its annotation')
        transcript_ids = record.get('transcript_ids')
        if not isinstance(transcript_ids, list) or not transcript_ids:
            raise ValueError(f'{accession} has no transcript identifiers')
        if annotation['transcript_id'] not in transcript_ids:
            raise ValueError(f'{accession} representative transcript is missing from its isoform list')

    transcript_models = index.get('transcripts')
    if not isinstance(transcript_models, dict) or not transcript_models:
        raise ValueError('The accession index must contain transcript models.')
    observed_by_gene: dict[str, list[str]] = {}
    for transcript_id, model in transcript_models.items():
        if not TRANSCRIPT_PATTERN.fullmatch(transcript_id):
            raise ValueError(f'Invalid transcript identifier: {transcript_id}')
        accession = model.get('gene_accession')
        gene_record = accessions.get(accession)
        if gene_record is None:
            raise ValueError(f'{transcript_id} points to an unavailable gene')
        exons = model.get('exons')
        if not isinstance(exons, list) or not exons:
            raise ValueError(f'{transcript_id} has no exon intervals')
        annotation_exons = []
        for interval in exons:
            if not isinstance(interval, list) or len(interval) != 2:
                raise ValueError(f'{transcript_id} has an invalid exon interval')
            annotation_exons.append({'start': interval[0], 'end': interval[1]})
        annotation = {
            **gene_record['annotation'],
            'start': model.get('start'),
            'end': model.get('end'),
            'transcript_id': transcript_id,
            'exons': annotation_exons,
            'cds_start': model.get('cds_start'),
            'cds_end': model.get('cds_end'),
        }
        validate_annotation(accession, annotation)
        gene_annotation = gene_record['annotation']
        if not (
            gene_annotation['start'] <= annotation['start']
            and annotation['end'] <= gene_annotation['end']
        ):
            raise ValueError(f'{transcript_id} extends beyond its gene interval')
        observed_by_gene.setdefault(accession, []).append(transcript_id)

    for accession, record in accessions.items():
        if sorted(record['transcript_ids']) != sorted(observed_by_gene.get(accession, [])):
            raise ValueError(f'{accession} transcript list does not match the transcript catalogue')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    sources = parser.add_mutually_exclusive_group()
    sources.add_argument('--source', type=Path, help='Small reviewed JSON annotation source.')
    sources.add_argument('--gff', type=Path, help='Official VectorBase release-68 GFF source.')
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--verify', action='store_true', help='Validate the committed output without rebuilding it.')
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.verify:
        index = json.loads(args.output.read_text(encoding='utf-8'))
        validate_index(index)
        print(
            f"Verified {len(index['accessions'])} gene and "
            f"{len(index['transcripts'])} transcript record(s)."
        )
        return
    if args.gff:
        index = build_index_from_gff(args.gff)
    else:
        index = build_index(args.source or DEFAULT_SOURCE)
    validate_index(index)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(index, separators=(',', ':')) + '\n', encoding='utf-8')
    try:
        output_label = args.output.relative_to(REPOSITORY_ROOT)
    except ValueError:
        output_label = args.output
    print(
        f"Wrote {output_label} with {len(index['accessions'])} genes and "
        f"{len(index['transcripts'])} transcripts."
    )


if __name__ == '__main__':
    main()
