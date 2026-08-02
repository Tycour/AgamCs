"""Build the pinned accession-to-region index used by the Pages client.

The generated file is deliberately static.  It records the annotation build
and the verification snapshot so browser results cannot move when the live
Ensembl service changes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = REPOSITORY_ROOT / 'data' / 'accession_annotation_cache.json'
DEFAULT_OUTPUT = REPOSITORY_ROOT / 'docs' / 'assets' / 'data' / 'accession-index.json'
ASSEMBLY = 'AgamP4'
GENE_BUILD = 'AgamP4.14'
INDEX_VERSION = 'agamcs-agamp4.14-v1'
VERIFIED_ON = '2026-08-02'
ACCESSION_PATTERN = re.compile(r'^AGAP\d{6}$')
CHROMOSOMES = {'2L', '2R', '3L', '3R', 'X'}
REQUIRED_ANNOTATION_FIELDS = {
    'id', 'assembly', 'chromosome', 'start', 'end', 'strand',
    'transcript_id', 'exons', 'cds_start', 'cds_end',
}


def source_sha256(path: Path) -> str:
    """Return the checksum of the exact source snapshot."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


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
    """Read and validate the local annotation snapshot."""
    source = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(source, dict) or not source:
        raise ValueError('The annotation source must be a non-empty object.')
    for accession, annotation in source.items():
        validate_annotation(accession, annotation)
    return source


def build_index(source_path: Path) -> dict:
    """Create the deterministic browser index document."""
    source = load_source(source_path)
    accessions = {}
    for accession in sorted(source):
        annotation = source[accession]
        accessions[accession] = {
            'status': 'current',
            'region': f"{annotation['chromosome']}:{annotation['start']}-{annotation['end']}",
            'annotation': annotation,
        }
    return {
        'schema_version': 1,
        'index_version': INDEX_VERSION,
        'assembly': ASSEMBLY,
        'coordinate_convention': '1-based inclusive',
        'annotation': {
            'gene_build': GENE_BUILD,
            'released': '2022-08',
            'source': 'VEuPathDB VectorBase via Ensembl Metazoa',
            'source_url': 'https://metazoa.ensembl.org/Anopheles_gambiae/Info/Annotation',
            'verified_on': VERIFIED_ON,
            'verification': (
                'All pinned coordinates, strands, representative transcripts, exons, and CDS bounds '
                'matched expanded Ensembl REST records.'
            ),
            'source_snapshot_sha256': source_sha256(source_path),
        },
        'refresh_policy': {
            'mode': 'manual review only',
            'statement': (
                'Never refresh silently. Re-verify every record, review annotation changes, and bump '
                'index_version before publication.'
            ),
        },
        'live_lookup': {
            'enabled': False,
            'statement': 'Live Ensembl lookup is intentionally disabled in this prototype.',
        },
        'accessions': accessions,
        'aliases': {},
        'retired': {},
    }


def validate_index(index: dict) -> None:
    """Validate a generated index without needing the ignored source cache."""
    if index.get('schema_version') != 1:
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
        raise ValueError('Live lookup must remain disabled for the pinned prototype.')
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--verify', action='store_true', help='Validate the committed output without rebuilding it.')
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.verify:
        index = json.loads(args.output.read_text(encoding='utf-8'))
        validate_index(index)
        print(f"Verified {len(index['accessions'])} pinned accession record(s).")
        return
    index = build_index(args.source)
    validate_index(index)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(index, indent=2) + '\n', encoding='utf-8')
    print(f"Wrote {args.output.relative_to(REPOSITORY_ROOT)} with {len(index['accessions'])} records.")


if __name__ == '__main__':
    main()
