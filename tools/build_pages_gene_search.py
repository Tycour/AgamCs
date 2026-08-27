"""Build the versioned gene-symbol search asset used by the Pages client.

The browser's coordinates and transcript models remain pinned in
``accession-index.json``.  This smaller companion asset adds official GFF
``Name`` values and display-only descriptions from a separately identified
annotation export.  Every source gene must match the accession index by stable
identifier and exact coordinates before any name is published.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ACCESSION_INDEX = (
    REPOSITORY_ROOT / 'docs' / 'assets' / 'data' / 'accession-index.json'
)
DEFAULT_OUTPUT = REPOSITORY_ROOT / 'docs' / 'assets' / 'data' / 'gene-search.json'
ASSEMBLY = 'AgamP4'
SEARCH_VERSION = 'agamcs-agamp4-gene-names-v1'
SOURCE_RELEASE = 'Ensembl Metazoa 62'
SOURCE_RELEASED = '2025-09'
SOURCE_URL = (
    'https://ftp.ensemblgenomes.ebi.ac.uk/pub/metazoa/release-62/gff3/'
    'anopheles_gambiae/Anopheles_gambiae.AgamP4.62.gff3.gz'
)
VERIFIED_ON = '2026-08-27'
CHROMOSOMES = {'2L', '2R', '3L', '3R', 'X'}
ACCESSION_PATTERN = re.compile(r'^AGAP\d{6}$')
CHECKSUM_PATTERN = re.compile(r'^[0-9a-f]{64}$')
SOURCE_SUFFIX_PATTERN = re.compile(r'\s*\[Source:.*\]\s*$')


def source_sha256(path: Path) -> str:
    """Return the checksum of the exact compressed or plain source snapshot."""
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def parse_gff_attributes(value: str) -> dict[str, str]:
    """Parse GFF3 key-value attributes and percent-decode their values."""
    attributes = {}
    for item in value.split(';'):
        if not item or '=' not in item:
            continue
        key, raw_value = item.split('=', 1)
        attributes[key] = unquote(raw_value)
    return attributes


def _open_gff(path: Path):
    if path.suffix == '.gz':
        return gzip.open(path, mode='rt', encoding='utf-8')
    return path.open(encoding='utf-8')


def _chromosome(sequence_id: str) -> str | None:
    chromosome = sequence_id.removeprefix(f'{ASSEMBLY}_')
    return chromosome if chromosome in CHROMOSOMES else None


def _gene_accession(attributes: dict[str, str]) -> str:
    identifier = attributes.get('gene_id') or attributes.get('ID', '')
    return identifier.removeprefix('gene:')


def _clean_description(value: str | None) -> str | None:
    if not value:
        return None
    description = SOURCE_SUFFIX_PATTERN.sub('', value).strip()
    return description or None


def _duplicate_statistics(names: dict[str, dict]) -> tuple[int, int]:
    accessions_by_name: dict[str, list[str]] = defaultdict(list)
    for accession, record in names.items():
        accessions_by_name[record['name'].casefold()].append(accession)
    ambiguous = [accessions for accessions in accessions_by_name.values() if len(accessions) > 1]
    return len(ambiguous), sum(len(accessions) for accessions in ambiguous)


def load_accession_index(path: Path) -> dict:
    """Load the coordinate authority used to validate every name record."""
    index = json.loads(path.read_text(encoding='utf-8'))
    if index.get('assembly') != ASSEMBLY or not isinstance(index.get('accessions'), dict):
        raise ValueError('The accession index is not a compatible AgamP4 index.')
    return index


def build_gene_search(gff_path: Path, accession_index_path: Path) -> dict:
    """Join official gene names to the pinned index after exact coordinate checks."""
    index = load_accession_index(accession_index_path)
    expected = index['accessions']
    observed: set[str] = set()
    names: dict[str, dict] = {}

    with _open_gff(gff_path) as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line or line.startswith('#'):
                continue
            fields = line.rstrip('\n').split('\t')
            if len(fields) != 9:
                raise ValueError(f'Invalid GFF record on line {line_number}')
            sequence_id, _, feature, start_text, end_text, _, _, _, raw_attributes = fields
            chromosome = _chromosome(sequence_id)
            if chromosome is None or not feature.endswith('gene'):
                continue
            attributes = parse_gff_attributes(raw_attributes)
            accession = _gene_accession(attributes)
            if not ACCESSION_PATTERN.fullmatch(accession) or accession not in expected:
                continue
            if accession in observed:
                raise ValueError(f'Duplicate gene record in source: {accession}')
            observed.add(accession)

            annotation = expected[accession]['annotation']
            coordinates = (chromosome, int(start_text), int(end_text))
            expected_coordinates = (
                annotation['chromosome'], annotation['start'], annotation['end'],
            )
            if coordinates != expected_coordinates:
                raise ValueError(
                    f'{accession} coordinates disagree with the accession index: '
                    f'{coordinates!r} != {expected_coordinates!r}'
                )

            name = attributes.get('Name', '').strip()
            if not name:
                continue
            record = {
                'name': name,
                'biotype': attributes.get('biotype', feature.removesuffix('_gene')),
            }
            description = _clean_description(attributes.get('description'))
            if description:
                record['description'] = description
            names[accession] = record

    missing = sorted(set(expected) - observed)
    if missing:
        preview = ', '.join(missing[:5])
        raise ValueError(
            f'The naming source is missing {len(missing)} indexed genes: {preview}'
        )
    if not names:
        raise ValueError('The naming source did not contain any supported gene names.')

    ambiguous_groups, genes_with_ambiguous_names = _duplicate_statistics(names)
    named_with_descriptions = sum('description' in record for record in names.values())
    return {
        'schema_version': 1,
        'search_version': SEARCH_VERSION,
        'assembly': ASSEMBLY,
        'coordinate_index_version': index['index_version'],
        'source': {
            'release': SOURCE_RELEASE,
            'released': SOURCE_RELEASED,
            'url': SOURCE_URL,
            'file': gff_path.name,
            'snapshot_sha256': source_sha256(gff_path),
            'verified_on': VERIFIED_ON,
            'name_field': 'GFF3 Name',
            'description_usage': 'Display context only; descriptions are not search identifiers.',
        },
        'coverage': {
            'gene_records_checked': len(observed),
            'named_gene_records': len(names),
            'named_records_with_description': named_with_descriptions,
            'ambiguous_name_groups': ambiguous_groups,
            'genes_with_ambiguous_names': genes_with_ambiguous_names,
            'statement': (
                'Every source gene matched the pinned accession index by canonical AGAP '
                'identifier and exact AgamP4 coordinates. Missing names remain explicitly unnamed.'
            ),
        },
        'live_lookup': False,
        'names': dict(sorted(names.items())),
    }


def validate_gene_search(document: dict, accession_index: dict) -> None:
    """Validate a generated search asset without retaining the source GFF."""
    if document.get('schema_version') != 1:
        raise ValueError('Unsupported or missing gene-search schema_version.')
    if document.get('search_version') != SEARCH_VERSION:
        raise ValueError('Unexpected gene-search version.')
    if document.get('assembly') != ASSEMBLY:
        raise ValueError('Unexpected gene-search assembly.')
    if document.get('coordinate_index_version') != accession_index.get('index_version'):
        raise ValueError('Gene-search and accession-index versions disagree.')
    if document.get('live_lookup') is not False:
        raise ValueError('Live gene-name lookup must remain disabled.')
    checksum = document.get('source', {}).get('snapshot_sha256', '')
    if not CHECKSUM_PATTERN.fullmatch(checksum):
        raise ValueError('Invalid gene-search source checksum.')

    indexed_accessions = accession_index.get('accessions', {})
    names = document.get('names')
    if not isinstance(names, dict) or not names:
        raise ValueError('The gene-search asset must contain named genes.')
    for accession, record in names.items():
        if accession not in indexed_accessions:
            raise ValueError(f'Gene-search record is absent from the accession index: {accession}')
        if not ACCESSION_PATTERN.fullmatch(accession):
            raise ValueError(f'Invalid gene-search accession: {accession}')
        if not isinstance(record, dict) or not isinstance(record.get('name'), str):
            raise ValueError(f'{accession} has no gene name.')
        if not record['name'].strip() or not isinstance(record.get('biotype'), str):
            raise ValueError(f'{accession} has an invalid name or biotype.')
        if 'description' in record and (
            not isinstance(record['description'], str) or not record['description'].strip()
        ):
            raise ValueError(f'{accession} has an invalid description.')

    coverage = document.get('coverage', {})
    expected_counts = {
        'gene_records_checked': len(indexed_accessions),
        'named_gene_records': len(names),
        'named_records_with_description': sum(
            'description' in record for record in names.values()
        ),
    }
    ambiguous_groups, genes_with_ambiguous_names = _duplicate_statistics(names)
    expected_counts.update({
        'ambiguous_name_groups': ambiguous_groups,
        'genes_with_ambiguous_names': genes_with_ambiguous_names,
    })
    for field, expected in expected_counts.items():
        if coverage.get(field) != expected:
            raise ValueError(f'Gene-search coverage field {field!r} must equal {expected}.')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gff', type=Path, help='Official plain or gzip-compressed GFF3 source.')
    parser.add_argument('--accession-index', type=Path, default=DEFAULT_ACCESSION_INDEX)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--verify', action='store_true', help='Validate the committed output.')
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    accession_index = load_accession_index(args.accession_index)
    if args.verify:
        document = json.loads(args.output.read_text(encoding='utf-8'))
        validate_gene_search(document, accession_index)
        print(
            f"Verified {len(document['names']):,} gene-name record(s) against "
            f"{len(accession_index['accessions']):,} indexed genes."
        )
        return
    if args.gff is None:
        raise SystemExit('--gff is required unless --verify is used.')
    document = build_gene_search(args.gff, args.accession_index)
    validate_gene_search(document, accession_index)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(document, separators=(',', ':')) + '\n', encoding='utf-8'
    )
    try:
        output_label = args.output.relative_to(REPOSITORY_ROOT)
    except ValueError:
        output_label = args.output
    print(
        f"Wrote {output_label} with {len(document['names']):,} named genes "
        f"from {document['coverage']['gene_records_checked']:,} checked records."
    )


if __name__ == '__main__':
    main()
