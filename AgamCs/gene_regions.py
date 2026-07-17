from pathlib import Path
import json
import time
from socket import timeout as SocketTimeout
from urllib.error import HTTPError, URLError
from urllib.parse import unquote
from urllib.request import Request, urlopen


ACCESSION_COLUMNS = ('accession', 'gene_id', 'id', 'gene')
CHROMOSOME_COLUMNS = ('chromosome', 'chrom', 'seqid', 'contig')
START_COLUMNS = ('start', 'begin')
END_COLUMNS = ('end', 'stop')
ENSEMBL_LOOKUP_URL = 'https://rest.ensembl.org/lookup/id/{accession}?content-type=application/json'
LOOKUP_CACHE_PATH = Path(__file__).resolve().parents[1] / 'data' / 'accession_region_cache.json'
ANNOTATION_CACHE_PATH = Path(__file__).resolve().parents[1] / 'data' / 'accession_annotation_cache.json'
CONSERVATION_ASSEMBLY = 'AgamP4'


def parse_list_values(values):
    items = []
    for value in values or []:
        for item in str(value).replace(',', ' ').split():
            item = item.strip()
            if item:
                items.append(item)
    return items


def read_list_file(path):
    path = Path(path)
    values = []
    for line in path.read_text().splitlines():
        line = line.split('#', 1)[0]
        values.extend(parse_list_values([line]))
    return values


def normalize_chromosome(chromosome):
    chromosome = str(chromosome)
    if chromosome.startswith('AgamP4_'):
        return chromosome.replace('AgamP4_', '', 1)
    return chromosome


def format_region(chromosome, start, end, padding=0):
    start = max(1, int(start) - int(padding))
    end = int(end) + int(padding)
    return f'{normalize_chromosome(chromosome)}:{start}-{end}'


def add_padding_to_region(region, padding=0):
    chromosome, start, end = parse_region(region)
    return format_region(chromosome, start, end, padding)


def parse_region(region):
    chromosome, positions = region.split(':', 1)
    start, end = positions.split('-', 1)
    return normalize_chromosome(chromosome), int(start), int(end)


def parse_attributes(attributes):
    parsed = {}
    for item in attributes.split(';'):
        if not item:
            continue
        if '=' in item:
            key, value = item.split('=', 1)
        elif ' ' in item:
            key, value = item.split(' ', 1)
        else:
            continue
        parsed[key.strip()] = unquote(value.strip().strip('"'))
    return parsed


def accession_matches(accession, attributes):
    accession = accession.lower()
    for value in attributes.values():
        values = str(value).replace(',', ' ').split()
        for candidate in values:
            candidate = candidate.split(':')[-1]
            if candidate.lower() == accession:
                return True
    return False


def resolve_from_gff(accession, annotation_file, padding=0):
    with Path(annotation_file).open() as handle:
        for line in handle:
            if not line.strip() or line.startswith('#'):
                continue

            parts = line.rstrip('\n').split('\t')
            if len(parts) != 9:
                continue

            seqid, _source, feature_type, start, end, _score, _strand, _phase, attributes = parts
            if feature_type.lower() not in {'gene', 'pseudogene'}:
                continue

            parsed_attributes = parse_attributes(attributes)
            if accession_matches(accession, parsed_attributes):
                return format_region(seqid, start, end, padding)

    raise KeyError(f'Accession {accession} was not found in {annotation_file}')


def find_column(columns, candidates):
    normalized = {column.lower(): column for column in columns}
    for candidate in candidates:
        if candidate in normalized:
            return normalized[candidate]
    return None


def resolve_from_table(accession, annotation_file, padding=0):
    import pandas as pd

    path = Path(annotation_file)
    sep = '\t' if path.suffix.lower() in {'.tsv', '.txt'} else ','
    annotation = pd.read_csv(path, sep=sep)

    accession_column = find_column(annotation.columns, ACCESSION_COLUMNS)
    region_column = find_column(annotation.columns, ('region',))
    chromosome_column = find_column(annotation.columns, CHROMOSOME_COLUMNS)
    start_column = find_column(annotation.columns, START_COLUMNS)
    end_column = find_column(annotation.columns, END_COLUMNS)

    if accession_column is None:
        raise ValueError(
            f'{annotation_file} must include one of these accession columns: '
            f'{", ".join(ACCESSION_COLUMNS)}'
        )

    matches = annotation[annotation[accession_column].astype(str).str.lower() == accession.lower()]
    if matches.empty:
        raise KeyError(f'Accession {accession} was not found in {annotation_file}')

    row = matches.iloc[0]
    if region_column is not None:
        chromosome, start, end = parse_region(row[region_column])
        return format_region(chromosome, start, end, padding)

    if not all((chromosome_column, start_column, end_column)):
        raise ValueError(
            f'{annotation_file} must include either a region column or chromosome/start/end columns'
        )

    return format_region(row[chromosome_column], row[start_column], row[end_column], padding)


def fetch_ensembl_record(accession, expand=False):
    """Fetch a gene record, optionally including transcripts and exons."""
    url = ENSEMBL_LOOKUP_URL.format(accession=accession)
    if expand:
        url += ';expand=1'
    request = Request(url, headers={'Accept': 'application/json'})

    last_error = None
    for attempt in range(3):
        try:
            with urlopen(request, timeout=45) as response:
                record = json.loads(response.read().decode())
            break
        except HTTPError as error:
            if error.code == 404:
                raise KeyError(f'Accession {accession} was not found by Ensembl/VectorBase') from error
            if error.code not in {408, 429, 500, 502, 503, 504}:
                raise RuntimeError(f'Could not query Ensembl/VectorBase for {accession}: HTTP {error.code}') from error
            last_error = error
        except (TimeoutError, SocketTimeout, URLError) as error:
            last_error = error

        if attempt < 2:
            time.sleep(2 ** attempt)
    else:
        raise RuntimeError(
            f'Could not query Ensembl/VectorBase for {accession} after 3 attempts. '
            'Check your network connection or use --annotation for offline lookup.'
        ) from last_error

    return record


def resolve_from_ensembl(accession, padding=0):
    record = fetch_ensembl_record(accession)
    return region_from_ensembl_record(accession, record, padding)


def region_from_ensembl_record(accession, record, padding=0):
    required_fields = ('seq_region_name', 'start', 'end')
    missing_fields = [field for field in required_fields if field not in record]
    if missing_fields:
        raise ValueError(
            f'Ensembl/VectorBase response for {accession} did not include: '
            f'{", ".join(missing_fields)}'
        )

    return format_region(record['seq_region_name'], record['start'], record['end'], padding)


def annotation_from_ensembl_record(accession, record):
    """Reduce an expanded Ensembl record to the fields needed by the plot."""
    region_from_ensembl_record(accession, record)
    strand = int(record.get('strand', 1))
    transcripts = record.get('Transcript') or []

    def transcript_rank(transcript):
        return (
            bool(transcript.get('is_canonical')),
            bool(transcript.get('Translation')),
            int(transcript.get('end', 0)) - int(transcript.get('start', 0)),
        )

    transcript = max(transcripts, key=transcript_rank) if transcripts else None
    exons = []
    cds_start = None
    cds_end = None
    transcript_id = None

    if transcript is not None:
        transcript_id = transcript.get('id')
        exons = [
            {'start': int(exon['start']), 'end': int(exon['end'])}
            for exon in transcript.get('Exon', [])
            if 'start' in exon and 'end' in exon
        ]
        exons.sort(key=lambda exon: exon['start'], reverse=strand == -1)

        translation = transcript.get('Translation') or {}
        if 'start' in translation and 'end' in translation:
            cds_start = int(translation['start'])
            cds_end = int(translation['end'])

    return {
        'id': record.get('id', accession),
        'assembly': record.get('assembly_name'),
        'chromosome': normalize_chromosome(record['seq_region_name']),
        'start': int(record['start']),
        'end': int(record['end']),
        'strand': strand,
        'transcript_id': transcript_id,
        'exons': exons,
        'cds_start': cds_start,
        'cds_end': cds_end,
    }


def _normalized_feature_ids(value):
    return {
        item.strip().split(':')[-1].lower()
        for item in str(value or '').replace(' ', ',').split(',')
        if item.strip()
    }


def annotation_from_gff(accession, annotation_file):
    """Read a gene and one representative transcript from a GFF3 file."""
    records = []
    with Path(annotation_file).open() as handle:
        for line in handle:
            if not line.strip() or line.startswith('#'):
                continue
            parts = line.rstrip('\n').split('\t')
            if len(parts) != 9:
                continue
            seqid, _source, feature_type, start, end, _score, strand, _phase, attributes = parts
            records.append({
                'chromosome': normalize_chromosome(seqid),
                'type': feature_type.lower(),
                'start': int(start),
                'end': int(end),
                'strand': -1 if strand == '-' else 1,
                'attributes': parse_attributes(attributes),
            })

    gene = next(
        (
            record for record in records
            if record['type'] in {'gene', 'pseudogene'}
            and accession_matches(accession, record['attributes'])
        ),
        None,
    )
    if gene is None:
        raise KeyError(f'Accession {accession} was not found in {annotation_file}')

    gene_ids = {accession.lower()}
    for key in ('ID', 'gene_id', 'Name', 'locus_tag'):
        gene_ids.update(_normalized_feature_ids(gene['attributes'].get(key)))

    transcript_types = {'transcript', 'mrna'}
    transcripts = [
        record for record in records
        if (record['type'] in transcript_types or record['type'].endswith('rna'))
        and gene_ids.intersection(_normalized_feature_ids(record['attributes'].get('Parent')))
    ]

    def transcript_children(transcript, feature_types):
        transcript_ids = set()
        for key in ('ID', 'transcript_id', 'Name'):
            transcript_ids.update(_normalized_feature_ids(transcript['attributes'].get(key)))
        return [
            record for record in records
            if record['type'] in feature_types
            and transcript_ids.intersection(_normalized_feature_ids(record['attributes'].get('Parent')))
        ]

    if transcripts:
        transcript = max(
            transcripts,
            key=lambda item: (
                len(transcript_children(item, {'cds'})) > 0,
                item['end'] - item['start'],
            ),
        )
        exons = transcript_children(transcript, {'exon'})
        cds = transcript_children(transcript, {'cds'})
        transcript_id = (
            transcript['attributes'].get('ID')
            or transcript['attributes'].get('transcript_id')
            or transcript['attributes'].get('Name')
        )
    else:
        transcript = gene
        exons = [
            record for record in records
            if record['type'] == 'exon'
            and gene_ids.intersection(_normalized_feature_ids(record['attributes'].get('Parent')))
        ]
        cds = [
            record for record in records
            if record['type'] == 'cds'
            and gene_ids.intersection(_normalized_feature_ids(record['attributes'].get('Parent')))
        ]
        transcript_id = None

    exon_intervals = [
        {'start': record['start'], 'end': record['end']}
        for record in exons
    ]
    exon_intervals.sort(key=lambda exon: exon['start'], reverse=gene['strand'] == -1)

    return {
        'id': accession,
        'assembly': None,
        'chromosome': gene['chromosome'],
        'start': gene['start'],
        'end': gene['end'],
        'strand': gene['strand'],
        'transcript_id': transcript_id,
        'exons': exon_intervals,
        'cds_start': min((record['start'] for record in cds), default=None),
        'cds_end': max((record['end'] for record in cds), default=None),
    }


def load_lookup_cache(cache_path=LOOKUP_CACHE_PATH):
    try:
        return json.loads(Path(cache_path).read_text())
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError:
        return {}


def load_annotation_cache(cache_path=ANNOTATION_CACHE_PATH):
    return load_lookup_cache(cache_path)


def save_lookup_cache(cache, cache_path=LOOKUP_CACHE_PATH):
    cache_path = Path(cache_path)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, indent=2, sort_keys=True) + '\n')


def save_annotation_cache(cache, cache_path=ANNOTATION_CACHE_PATH):
    save_lookup_cache(cache, cache_path)


def validate_annotation_assembly(accession, annotation):
    assembly = annotation.get('assembly')
    if assembly and assembly != CONSERVATION_ASSEMBLY:
        raise ValueError(
            f'{accession} annotation uses {assembly}, but the conservation data use '
            f'{CONSERVATION_ASSEMBLY}. Use a matching GFF3 annotation instead.'
        )


def resolve_accession_details(
    accession,
    annotation_file=None,
    padding=0,
    region_cache=None,
    annotation_cache=None,
):
    """Return a padded region plus optional transcript annotation for plotting."""
    cache_key = accession.upper()

    if annotation_file is not None:
        if Path(annotation_file).suffix.lower() in {'.gff', '.gff3'}:
            annotation = annotation_from_gff(accession, annotation_file)
            region = format_region(
                annotation['chromosome'], annotation['start'], annotation['end'], padding
            )
            return region, annotation
        return resolve_from_table(accession, annotation_file, padding), None

    if annotation_cache is not None and cache_key in annotation_cache:
        annotation = annotation_cache[cache_key]
        validate_annotation_assembly(accession, annotation)
        region = format_region(
            annotation['chromosome'], annotation['start'], annotation['end'], padding
        )
        return region, annotation

    try:
        record = fetch_ensembl_record(accession, expand=True)
    except Exception:
        if region_cache is not None and cache_key in region_cache:
            return add_padding_to_region(region_cache[cache_key], padding), None
        raise

    annotation = annotation_from_ensembl_record(accession, record)
    validate_annotation_assembly(accession, annotation)
    unpadded_region = format_region(
        annotation['chromosome'], annotation['start'], annotation['end']
    )
    if region_cache is not None:
        region_cache[cache_key] = unpadded_region
    if annotation_cache is not None:
        annotation_cache[cache_key] = annotation
    return add_padding_to_region(unpadded_region, padding), annotation


def resolve_accession(accession, annotation_file=None, padding=0, cache=None):
    if annotation_file is None:
        cache_key = accession.upper()
        if cache is not None and cache_key in cache:
            return add_padding_to_region(cache[cache_key], padding)

        region = resolve_from_ensembl(accession, padding=0)
        if cache is not None:
            cache[cache_key] = region
        return add_padding_to_region(region, padding)

    suffix = Path(annotation_file).suffix.lower()
    if suffix in {'.gff', '.gff3'}:
        return resolve_from_gff(accession, annotation_file, padding)
    return resolve_from_table(accession, annotation_file, padding)
