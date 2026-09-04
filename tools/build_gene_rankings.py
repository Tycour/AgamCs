"""Build versioned AgamP4.14 gene-level Cs and SNP-density rankings.

Both outputs summarize the complete annotated gene span and the union of exons
in the pinned representative transcript. Cs ranks include every indexed gene.
SNP-density ranks include only genes for which at least 80% of focal bases pass
the companion Ag1000G accessibility mask; failed bases remain unknown.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ACCESSION_INDEX = ROOT / 'docs/assets/data/accession-index.json'
DEFAULT_SCORE_FILE = ROOT / 'data/AgamP4_conservation.h5'
DEFAULT_ACCESSIBILITY_FILE = ROOT / 'AgamCs/data/Ag1000G_phase2_AR1_accessibility.h5'
CS_FILENAME = 'gene-cs-rankings.json'
SNP_FILENAME = 'gene-snp-rankings.json'
DEFAULT_CS_OUTPUT = ROOT / 'AgamCs/data' / CS_FILENAME
DEFAULT_CS_BROWSER_OUTPUT = ROOT / 'docs/assets/data' / CS_FILENAME
DEFAULT_SNP_OUTPUT = ROOT / 'AgamCs/data' / SNP_FILENAME
DEFAULT_SNP_BROWSER_OUTPUT = ROOT / 'docs/assets/data' / SNP_FILENAME
CS_RANKING_VERSION = 'agamcs-agamp4.14-gene-cs-v1'
SNP_RANKING_VERSION = 'agamcs-agamp4.14-gene-snp-density-v1'
RANKING_VERSION = CS_RANKING_VERSION
ASSEMBLY = 'AgamP4'
METRICS = ('gene_span', 'representative_exons')
MIN_ACCESSIBLE_FRACTION = 0.8
PRESERVED_CS_RANKING_CONTEXT = ({
    'chromosome': '3L',
    'gene_span': {'bases': 131, 'mean_cs': 0.3467839052829579},
    'representative_exons': {'bases': 131, 'mean_cs': 0.3467839052829579},
},)
PRESERVED_SNP_RANKING_CONTEXT = ({
    'chromosome': '3L',
    'gene_span': {
        'total_bases': 131, 'accessible_bases': 131, 'accessible_fraction': 1.0,
        'mean_snp_density': 0.058396947264443826, 'eligible': True,
        'global': None, 'chromosome': None,
    },
    'representative_exons': {
        'total_bases': 131, 'accessible_bases': 131, 'accessible_fraction': 1.0,
        'mean_snp_density': 0.058396947264443826, 'eligible': True,
        'global': None, 'chromosome': None,
    },
},)


def _records_with_preserved_context(index: dict, records: dict, context: tuple) -> tuple[dict, list[str]]:
    """Include anonymous values only when the public index records a curation exclusion."""
    excluded = int(index.get('coverage', {}).get('privacy_filtered_gene_records', 0))
    if excluded != len(context):
        return records, []
    combined = dict(records)
    keys = []
    for position, record in enumerate(context, start=1):
        key = f'__redacted_record_{position}'
        combined[key] = copy.deepcopy(record)
        keys.append(key)
    return combined, keys


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _merged_intervals(intervals: list[dict]) -> list[tuple[int, int]]:
    ordered = sorted((int(item['start']), int(item['end'])) for item in intervals)
    merged: list[list[int]] = []
    for start, end in ordered:
        if start < 1 or end < start:
            raise ValueError(f'Invalid exon interval: {start}-{end}')
        if not merged or start > merged[-1][1] + 1:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)
    return [(start, end) for start, end in merged]


def _annotation_intervals(annotation: dict, accession: str) -> dict[str, list[tuple[int, int]]]:
    start, end = int(annotation['start']), int(annotation['end'])
    if start < 1 or end < start:
        raise ValueError(f'{accession} has an invalid gene span.')
    exons = _merged_intervals(annotation.get('exons') or [])
    if not exons:
        raise ValueError(f'{accession} has no representative-transcript exons.')
    return {'gene_span': [(start, end)], 'representative_exons': exons}


def _parts(dataset, intervals: list[tuple[int, int]]) -> list:
    import numpy as np

    prefix = (0,) if dataset.ndim == 2 else ()
    return [
        np.asarray(dataset[prefix + (slice(start - 1, end),)])
        for start, end in intervals
    ]


def _cs_summary(dataset, intervals: dict, accession: str) -> dict[str, dict]:
    import numpy as np

    summaries = {}
    for metric, regions in intervals.items():
        values = np.concatenate(_parts(dataset, regions)).astype(np.float64, copy=False)
        finite = values[np.isfinite(values)]
        if not finite.size:
            raise ValueError(f'{accession} has no finite Cs values for {metric}.')
        summaries[metric] = {'bases': int(finite.size), 'mean_cs': float(finite.mean())}
    return summaries


def _snp_summary(snp_dataset, status_dataset, intervals: dict) -> dict[str, dict]:
    import numpy as np

    summaries = {}
    for metric, regions in intervals.items():
        values = np.concatenate(_parts(snp_dataset, regions)).astype(np.float64, copy=False)
        status = np.concatenate(_parts(status_dataset, regions))
        accessible = (status & 1) == 1
        total = int(accessible.size)
        observed_count = int(np.count_nonzero(accessible))
        observed = values[accessible & np.isfinite(values)]
        if observed.size != observed_count:
            raise ValueError(f'{metric} has non-finite SNP density at accessible bases.')
        fraction = observed_count / total
        summaries[metric] = {
            'total_bases': total,
            'accessible_bases': observed_count,
            'accessible_fraction': fraction,
            'mean_snp_density': float(observed.mean()) if observed.size else None,
            'eligible': fraction >= MIN_ACCESSIBLE_FRACTION,
            'global': None,
            'chromosome': None,
        }
    return summaries


def _ranking_stats(values: list[tuple[str, float]], higher_is_better: bool = True) -> dict[str, dict]:
    """Return competition rank plus an other-gene midrank percentile."""
    groups: dict[float, list[str]] = defaultdict(list)
    for accession, value in values:
        groups[value].append(accession)
    result = {}
    size = len(values)
    lower_count = 0
    for value in sorted(groups):
        accessions = sorted(groups[value])
        ties = len(accessions)
        greater_count = size - lower_count - ties
        favorable = lower_count if higher_is_better else greater_count
        percentile = 100.0 if size == 1 else 100.0 * (
            favorable + (ties - 1) / 2
        ) / (size - 1)
        rank = (greater_count if higher_is_better else lower_count) + 1
        for accession in accessions:
            result[accession] = {'rank': rank, 'ties': ties, 'percentile': percentile}
        lower_count += ties
    return result


def _attach_rankings(records: dict[str, dict], field: str, higher: bool) -> dict:
    chromosomes = sorted({record['chromosome'] for record in records.values()})
    global_counts, arm_counts = {}, {}
    for metric in METRICS:
        eligible = [
            (accession, record[metric][field])
            for accession, record in records.items()
            if record[metric].get('eligible', True)
        ]
        global_stats = _ranking_stats(eligible, higher)
        global_counts[metric] = len(eligible)
        arm_counts[metric] = {}
        for accession, _value in eligible:
            records[accession][metric]['global'] = global_stats[accession]
        for chromosome in chromosomes:
            arm_values = [
                (accession, value) for accession, value in eligible
                if records[accession]['chromosome'] == chromosome
            ]
            stats = _ranking_stats(arm_values, higher)
            arm_counts[metric][chromosome] = len(arm_values)
            for accession, _value in arm_values:
                records[accession][metric]['chromosome'] = stats[accession]
    return {
        'global_eligible_gene_counts': global_counts,
        'chromosome_eligible_gene_counts': arm_counts,
    }


def _validate_index(index: dict) -> None:
    if index.get('schema_version') != 2:
        raise ValueError('The accession index must use schema version 2.')
    if index.get('assembly') != ASSEMBLY:
        raise ValueError(f'The accession index must use {ASSEMBLY}.')


def _common_document(index: dict, version: str, browser_copy: str, records: dict) -> dict:
    return {
        'schema_version': 1,
        'ranking_version': version,
        'assembly': ASSEMBLY,
        'coordinate_index_version': index['index_version'],
        'generated_browser_copy': browser_copy,
        'annotation_source': {
            'gene_build': index['annotation']['gene_build'],
            'release': index['annotation']['release'],
            'source_snapshot_sha256': index['annotation']['source_snapshot_sha256'],
        },
        'records': records,
    }


def build_cs_rankings(score_root, index: dict, score_sha256: str) -> dict:
    _validate_index(index)
    records = {}
    for accession, index_record in sorted(index['accessions'].items()):
        annotation = index_record['annotation']
        chromosome = annotation['chromosome']
        if chromosome not in score_root or 'Cs' not in score_root[chromosome]:
            raise ValueError(f'Cs is unavailable for {accession} on {chromosome}.')
        intervals = _annotation_intervals(annotation, accession)
        records[accession] = {
            'chromosome': chromosome,
            'representative_transcript': annotation['transcript_id'],
            **_cs_summary(score_root[chromosome]['Cs'], intervals, accession),
        }
    ranking_records, redacted_keys = _records_with_preserved_context(
        index, records, PRESERVED_CS_RANKING_CONTEXT,
    )
    counts = _attach_rankings(ranking_records, 'mean_cs', True)
    document = _common_document(index, CS_RANKING_VERSION, f'docs/assets/data/{CS_FILENAME}', records)
    document.update({
        'redacted_records': [ranking_records[key] for key in redacted_keys],
        'ranking_context': (
            'Anonymous values from reviewed public-curation exclusions remain in cohort '
            'calculations so established ranks and denominators do not change.'
        ),
        'ranking_type': 'mean_cs',
        'score_source': {
            'file': 'AgamP4_conservation.h5', 'array': 'Cs',
            'zenodo_record': 4304586, 'sha256': score_sha256,
            'interpretation': (
                'Published v1 Cs values were MinMax-scaled separately by chromosome arm. '
                'Genome-wide percentiles are descriptive pooled ranks, not a chromosome-'
                'independent biological calibration; same-arm ranks are provided alongside them.'
            ),
        },
        'percentile_method': (
            'Percentage of other cohort genes with lower mean Cs, assigning half weight '
            'to tied other genes. Higher values indicate higher conservation.'
        ),
        'metrics': {
            'gene_span': 'Mean finite per-base Cs across the inclusive gene span.',
            'representative_exons': 'Mean finite per-base Cs across the representative exon union.',
        },
        'cohorts': {
            'global_gene_count': len(ranking_records),
            'chromosome_gene_counts': dict(sorted(Counter(
                record['chromosome'] for record in ranking_records.values()
            ).items())),
            **counts,
        },
    })
    return document


def build_snp_rankings(score_root, accessibility_root, index: dict,
                       score_sha256: str, accessibility_sha256: str) -> dict:
    _validate_index(index)
    records = {}
    for accession, index_record in sorted(index['accessions'].items()):
        annotation = index_record['annotation']
        chromosome = annotation['chromosome']
        if chromosome not in score_root or 'snp_density' not in score_root[chromosome]:
            raise ValueError(f'SNP density is unavailable for {accession} on {chromosome}.')
        if chromosome not in accessibility_root or 'status' not in accessibility_root[chromosome]:
            raise ValueError(f'Accessibility is unavailable for {accession} on {chromosome}.')
        intervals = _annotation_intervals(annotation, accession)
        records[accession] = {
            'chromosome': chromosome,
            'representative_transcript': annotation['transcript_id'],
            **_snp_summary(score_root[chromosome]['snp_density'],
                           accessibility_root[chromosome]['status'], intervals),
        }
    ranking_records, redacted_keys = _records_with_preserved_context(
        index, records, PRESERVED_SNP_RANKING_CONTEXT,
    )
    counts = _attach_rankings(ranking_records, 'mean_snp_density', False)
    document = _common_document(index, SNP_RANKING_VERSION, f'docs/assets/data/{SNP_FILENAME}', records)
    document.update({
        'redacted_records': [ranking_records[key] for key in redacted_keys],
        'ranking_context': (
            'Anonymous values from reviewed public-curation exclusions remain in cohort '
            'calculations so established ranks and denominators do not change.'
        ),
        'ranking_type': 'accessible_mean_snp_density',
        'score_source': {
            'file': 'AgamP4_conservation.h5', 'array': 'snp_density',
            'zenodo_record': 4304586, 'sha256': score_sha256,
            'interpretation': (
                'Archived pooled Ag1000G Phase 2 PASS-position SNP density in centered '
                '20-base windows. It is not allele frequency, invariant-site evidence, '
                'or an independent conservation score.'
            ),
        },
        'accessibility_source': {
            'file': 'Ag1000G_phase2_AR1_accessibility.h5', 'array': 'status',
            'accessible_status_bit': 0, 'sha256': accessibility_sha256,
            'interpretation': (
                'Only status-bit-0 accessible focal bases contribute to the mean; '
                'QC-failed bases are unknown and are not converted to zero.'
            ),
        },
        'minimum_accessible_fraction': MIN_ACCESSIBLE_FRACTION,
        'percentile_method': (
            'Percentage of other eligible cohort genes with higher accessible-base mean '
            'SNP density, assigning half weight to ties. Higher values indicate lower variation.'
        ),
        'metrics': {
            'gene_span': 'Accessible-base mean SNP density across the inclusive gene span.',
            'representative_exons': 'Accessible-base mean SNP density across the representative exon union.',
        },
        'cohorts': counts,
    })
    return document


def _validate_common(document: dict, index: dict | None, version: str) -> dict:
    if document.get('schema_version') != 1 or document.get('ranking_version') != version:
        raise ValueError('Unsupported or unexpected gene-ranking version.')
    if document.get('assembly') != ASSEMBLY:
        raise ValueError('Unexpected gene-ranking assembly.')
    records = document.get('records')
    if not isinstance(records, dict) or not records:
        raise ValueError('Gene rankings must contain records.')
    if index is not None:
        if document.get('coordinate_index_version') != index.get('index_version'):
            raise ValueError('Gene rankings and accession index versions disagree.')
        if set(records) != set(index.get('accessions', {})):
            raise ValueError('Gene rankings do not cover the exact accession-index gene set.')
    return records


def _records_with_document_context(document: dict, records: dict) -> dict:
    redacted = document.get('redacted_records', [])
    if not isinstance(redacted, list):
        raise ValueError('Redacted ranking context must be a list.')
    combined = dict(records)
    for position, record in enumerate(redacted, start=1):
        if not isinstance(record, dict) or {'accession', 'id', 'representative_transcript'} & record.keys():
            raise ValueError('Redacted ranking context must not contain gene identifiers.')
        combined[f'__redacted_record_{position}'] = record
    return combined


def _validate_ranked(document: dict, records: dict, field: str, higher: bool,
                     require_all: bool) -> None:
    for metric in METRICS:
        eligible = [(a, r[metric][field]) for a, r in records.items()
                    if require_all or r[metric].get('eligible')]
        expected = _ranking_stats(eligible, higher)
        cohorts = document['cohorts']
        actual_count = (cohorts['global_gene_count'] if require_all else
                        cohorts['global_eligible_gene_counts'][metric])
        if actual_count != len(eligible):
            raise ValueError(f'{metric} global ranking denominator is stale.')
        for accession, _value in eligible:
            if records[accession][metric].get('global') != expected[accession]:
                raise ValueError(f'{accession} has stale global {metric} ranking statistics.')
        for chromosome in sorted({record['chromosome'] for record in records.values()}):
            arm = [(a, v) for a, v in eligible if records[a]['chromosome'] == chromosome]
            arm_expected = _ranking_stats(arm, higher)
            arm_count = (cohorts['chromosome_gene_counts'][chromosome] if require_all else
                         cohorts['chromosome_eligible_gene_counts'][metric][chromosome])
            if arm_count != len(arm):
                raise ValueError(f'{metric} {chromosome} ranking denominator is stale.')
            for accession, _value in arm:
                if records[accession][metric].get('chromosome') != arm_expected[accession]:
                    raise ValueError(f'{accession} has stale chromosome {metric} ranking statistics.')


def validate_cs_rankings(document: dict, index: dict | None = None) -> None:
    records = _validate_common(document, index, CS_RANKING_VERSION)
    ranking_records = _records_with_document_context(document, records)
    chromosomes = Counter(record.get('chromosome') for record in ranking_records.values())
    cohorts = document.get('cohorts', {})
    if cohorts.get('global_gene_count') != len(ranking_records):
        raise ValueError('Global Cs denominator does not match the records.')
    if cohorts.get('chromosome_gene_counts') != dict(sorted(chromosomes.items())):
        raise ValueError('Chromosome Cs denominators do not match the records.')
    _validate_ranked(document, ranking_records, 'mean_cs', True, True)


def validate_snp_rankings(document: dict, index: dict | None = None) -> None:
    records = _validate_common(document, index, SNP_RANKING_VERSION)
    ranking_records = _records_with_document_context(document, records)
    threshold = document.get('minimum_accessible_fraction')
    if threshold != MIN_ACCESSIBLE_FRACTION:
        raise ValueError('Unexpected SNP accessibility threshold.')
    for accession, record in ranking_records.items():
        for metric in METRICS:
            summary = record.get(metric, {})
            total, accessible = summary.get('total_bases'), summary.get('accessible_bases')
            if not isinstance(total, int) or total < 1:
                raise ValueError(f'{accession} has invalid {metric} total bases.')
            if not isinstance(accessible, int) or not 0 <= accessible <= total:
                raise ValueError(f'{accession} has invalid {metric} accessible bases.')
            fraction = accessible / total
            if not math.isclose(summary.get('accessible_fraction', math.nan), fraction):
                raise ValueError(f'{accession} has stale {metric} accessibility fraction.')
            if summary.get('eligible') != (fraction >= threshold):
                raise ValueError(f'{accession} has stale {metric} eligibility.')
            mean = summary.get('mean_snp_density')
            if accessible == 0 and mean is not None:
                raise ValueError(f'{accession} must keep unobserved {metric} SNP density unknown.')
            if accessible and not math.isfinite(mean if mean is not None else math.nan):
                raise ValueError(f'{accession} has invalid {metric} SNP-density mean.')
            if not summary['eligible'] and (summary.get('global') is not None or
                                             summary.get('chromosome') is not None):
                raise ValueError(f'{accession} has ranks despite ineligible {metric} accessibility.')
    _validate_ranked(document, ranking_records, 'mean_snp_density', False, False)


build_gene_rankings = build_cs_rankings
validate_gene_rankings = validate_cs_rankings


def _write_json(path: Path, document: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, separators=(',', ':')) + '\n', encoding='utf-8')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--score-file', type=Path, default=DEFAULT_SCORE_FILE)
    parser.add_argument('--accessibility-file', type=Path, default=DEFAULT_ACCESSIBILITY_FILE)
    parser.add_argument('--accession-index', type=Path, default=DEFAULT_ACCESSION_INDEX)
    parser.add_argument('--cs-output', type=Path, default=DEFAULT_CS_OUTPUT)
    parser.add_argument('--cs-browser-output', type=Path, default=DEFAULT_CS_BROWSER_OUTPUT)
    parser.add_argument('--snp-output', type=Path, default=DEFAULT_SNP_OUTPUT)
    parser.add_argument('--snp-browser-output', type=Path, default=DEFAULT_SNP_BROWSER_OUTPUT)
    parser.add_argument('--verify', action='store_true')
    return parser.parse_args()


def main() -> None:
    import h5py

    args = parse_args()
    index = json.loads(args.accession_index.read_text(encoding='utf-8'))
    if args.verify:
        cs = json.loads(args.cs_output.read_text(encoding='utf-8'))
        snp = json.loads(args.snp_output.read_text(encoding='utf-8'))
        validate_cs_rankings(cs, index)
        validate_snp_rankings(snp, index)
        for package, browser in ((args.cs_output, args.cs_browser_output),
                                 (args.snp_output, args.snp_browser_output)):
            if browser.read_bytes() != package.read_bytes():
                raise ValueError(f'Package and browser ranking assets differ: {package.name}')
        print(f"Verified {len(cs['records']):,} Cs and {len(snp['records']):,} SNP-density records.")
        return
    score_sha256 = sha256_file(args.score_file)
    accessibility_sha256 = sha256_file(args.accessibility_file)
    with h5py.File(args.score_file, 'r') as scores, h5py.File(args.accessibility_file, 'r') as qc:
        cs = build_cs_rankings(scores, index, score_sha256)
        snp = build_snp_rankings(scores, qc, index, score_sha256, accessibility_sha256)
    validate_cs_rankings(cs, index)
    validate_snp_rankings(snp, index)
    for path, document in ((args.cs_output, cs), (args.cs_browser_output, cs),
                           (args.snp_output, snp), (args.snp_browser_output, snp)):
        _write_json(path, document)
    print(f"Wrote {len(cs['records']):,} Cs and {len(snp['records']):,} SNP-density records.")


if __name__ == '__main__':
    main()
