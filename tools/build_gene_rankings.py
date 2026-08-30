"""Build versioned gene-level conservation rankings for AgamP4.14.

Two deliberately explicit summaries are calculated from the published ``Cs``
array: the complete annotated gene span, and the union of exons in the pinned
representative transcript.  Rankings are reported both across every supported
gene and within the gene's chromosome arm.  The latter is important because
the v1 score was MinMax-scaled separately on each chromosome arm.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path

import h5py
import numpy as np


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ACCESSION_INDEX = (
    REPOSITORY_ROOT / 'docs' / 'assets' / 'data' / 'accession-index.json'
)
DEFAULT_SCORE_FILE = REPOSITORY_ROOT / 'data' / 'AgamP4_conservation.h5'
DEFAULT_OUTPUT = REPOSITORY_ROOT / 'AgamCs' / 'data' / 'gene-rankings.json'
DEFAULT_BROWSER_OUTPUT = (
    REPOSITORY_ROOT / 'docs' / 'assets' / 'data' / 'gene-rankings.json'
)
RANKING_VERSION = 'agamcs-agamp4.14-gene-cs-v1'
ASSEMBLY = 'AgamP4'
METRICS = ('gene_span', 'representative_exons')


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


def _finite_mean(parts: list[np.ndarray], accession: str, metric: str) -> tuple[int, float]:
    values = np.concatenate([np.asarray(part, dtype=np.float64) for part in parts])
    finite = values[np.isfinite(values)]
    if not finite.size:
        raise ValueError(f'{accession} has no finite Cs values for {metric}.')
    return int(finite.size), float(finite.mean())


def _metric_summary(dataset, annotation: dict, accession: str) -> dict[str, dict]:
    start, end = int(annotation['start']), int(annotation['end'])
    span_bases, span_mean = _finite_mean(
        [dataset[0, start - 1:end]], accession, 'gene_span',
    )
    exon_intervals = _merged_intervals(annotation.get('exons') or [])
    if not exon_intervals:
        raise ValueError(f'{accession} has no representative-transcript exons.')
    exon_bases, exon_mean = _finite_mean(
        [dataset[0, exon_start - 1:exon_end] for exon_start, exon_end in exon_intervals],
        accession,
        'representative_exons',
    )
    return {
        'gene_span': {'bases': span_bases, 'mean_cs': span_mean},
        'representative_exons': {'bases': exon_bases, 'mean_cs': exon_mean},
    }


def _ranking_stats(values: list[tuple[str, float]]) -> dict[str, dict]:
    """Return descending rank and an other-gene midrank percentile.

    The percentile is the percentage of *other* cohort genes with a lower
    value, with half weight assigned to tied other genes.  It therefore maps a
    unique cohort minimum to 0 and a unique maximum to 100.
    """
    groups: dict[float, list[str]] = defaultdict(list)
    for accession, value in values:
        groups[value].append(accession)

    result: dict[str, dict] = {}
    cohort_size = len(values)
    lower_count = 0
    for value in sorted(groups):
        accessions = sorted(groups[value])
        tie_count = len(accessions)
        greater_count = cohort_size - lower_count - tie_count
        percentile = 100.0 if cohort_size == 1 else (
            100.0 * (lower_count + (tie_count - 1) / 2) / (cohort_size - 1)
        )
        for accession in accessions:
            result[accession] = {
                'rank': greater_count + 1,
                'ties': tie_count,
                'percentile': percentile,
            }
        lower_count += tie_count
    return result


def _attach_rankings(records: dict[str, dict]) -> None:
    chromosomes = sorted({record['chromosome'] for record in records.values()})
    for metric in METRICS:
        global_stats = _ranking_stats([
            (accession, record[metric]['mean_cs'])
            for accession, record in records.items()
        ])
        arm_stats = {
            chromosome: _ranking_stats([
                (accession, record[metric]['mean_cs'])
                for accession, record in records.items()
                if record['chromosome'] == chromosome
            ])
            for chromosome in chromosomes
        }
        for accession, record in records.items():
            record[metric]['global'] = global_stats[accession]
            record[metric]['chromosome'] = arm_stats[record['chromosome']][accession]


def build_gene_rankings(score_root, accession_index: dict, score_sha256: str) -> dict:
    if accession_index.get('schema_version') != 2:
        raise ValueError('The accession index must use schema version 2.')
    if accession_index.get('assembly') != ASSEMBLY:
        raise ValueError(f'The accession index must use {ASSEMBLY}.')

    records = {}
    for accession, index_record in sorted(accession_index['accessions'].items()):
        annotation = index_record['annotation']
        chromosome = annotation['chromosome']
        if chromosome not in score_root or 'Cs' not in score_root[chromosome]:
            raise ValueError(f'Cs is unavailable for {accession} on {chromosome}.')
        metric_summary = _metric_summary(
            score_root[chromosome]['Cs'], annotation, accession,
        )
        records[accession] = {
            'chromosome': chromosome,
            'representative_transcript': annotation['transcript_id'],
            **metric_summary,
        }

    _attach_rankings(records)
    chromosome_counts = Counter(record['chromosome'] for record in records.values())
    return {
        'schema_version': 1,
        'ranking_version': RANKING_VERSION,
        'assembly': ASSEMBLY,
        'coordinate_index_version': accession_index['index_version'],
        'generated_browser_copy': 'docs/assets/data/gene-rankings.json',
        'score_source': {
            'file': 'AgamP4_conservation.h5',
            'array': 'Cs',
            'zenodo_record': 4304586,
            'sha256': score_sha256,
            'interpretation': (
                'Published v1 Cs values were MinMax-scaled separately by chromosome arm. '
                'Genome-wide percentiles are descriptive pooled ranks, not a chromosome-'
                'independent biological calibration; same-arm ranks are provided alongside them.'
            ),
        },
        'annotation_source': {
            'gene_build': accession_index['annotation']['gene_build'],
            'release': accession_index['annotation']['release'],
            'source_snapshot_sha256': accession_index['annotation']['source_snapshot_sha256'],
        },
        'percentile_method': (
            'Percentage of other cohort genes with lower mean Cs, assigning half weight '
            'to tied other genes. Higher values indicate higher conservation.'
        ),
        'metrics': {
            'gene_span': (
                'Arithmetic mean of finite per-base Cs across the one-based inclusive '
                'annotated gene span, including exons and introns.'
            ),
            'representative_exons': (
                'Arithmetic mean of finite per-base Cs across the union of exons in the '
                'pinned representative transcript.'
            ),
        },
        'cohorts': {
            'global_gene_count': len(records),
            'chromosome_gene_counts': dict(sorted(chromosome_counts.items())),
        },
        'records': records,
    }


def validate_gene_rankings(document: dict, accession_index: dict | None = None) -> None:
    if document.get('schema_version') != 1:
        raise ValueError('Unsupported or missing gene-ranking schema_version.')
    if document.get('ranking_version') != RANKING_VERSION:
        raise ValueError('Unexpected gene-ranking version.')
    if document.get('assembly') != ASSEMBLY:
        raise ValueError('Unexpected gene-ranking assembly.')
    records = document.get('records')
    if not isinstance(records, dict) or not records:
        raise ValueError('Gene rankings must contain records.')
    if document.get('cohorts', {}).get('global_gene_count') != len(records):
        raise ValueError('Global ranking denominator does not match the records.')

    chromosome_counts = Counter(record.get('chromosome') for record in records.values())
    if document['cohorts'].get('chromosome_gene_counts') != dict(sorted(chromosome_counts.items())):
        raise ValueError('Chromosome ranking denominators do not match the records.')
    if accession_index is not None:
        if document.get('coordinate_index_version') != accession_index.get('index_version'):
            raise ValueError('Gene rankings and accession index versions disagree.')
        if set(records) != set(accession_index.get('accessions', {})):
            raise ValueError('Gene rankings do not cover the exact accession-index gene set.')

    expected = {
        metric: _ranking_stats([
            (accession, record[metric]['mean_cs'])
            for accession, record in records.items()
        ])
        for metric in METRICS
    }
    expected_by_chromosome = {
        (metric, chromosome): _ranking_stats([
            (accession, record[metric]['mean_cs'])
            for accession, record in records.items()
            if record['chromosome'] == chromosome
        ])
        for metric in METRICS
        for chromosome in chromosome_counts
    }
    for accession, record in records.items():
        chromosome = record.get('chromosome')
        for metric in METRICS:
            summary = record.get(metric, {})
            if not isinstance(summary.get('bases'), int) or summary['bases'] < 1:
                raise ValueError(f'{accession} has invalid {metric} base coverage.')
            if not math.isfinite(summary.get('mean_cs', math.nan)):
                raise ValueError(f'{accession} has an invalid {metric} mean.')
            if summary.get('global') != expected[metric][accession]:
                raise ValueError(f'{accession} has stale global {metric} ranking statistics.')
            if summary.get('chromosome') != expected_by_chromosome[
                metric, chromosome
            ][accession]:
                raise ValueError(f'{accession} has stale chromosome {metric} ranking statistics.')


def _write_json(path: Path, document: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(document, separators=(',', ':')) + '\n', encoding='utf-8')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--score-file', type=Path, default=DEFAULT_SCORE_FILE)
    parser.add_argument('--accession-index', type=Path, default=DEFAULT_ACCESSION_INDEX)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--browser-output', type=Path, default=DEFAULT_BROWSER_OUTPUT)
    parser.add_argument('--verify', action='store_true')
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    index = json.loads(args.accession_index.read_text(encoding='utf-8'))
    if args.verify:
        document = json.loads(args.output.read_text(encoding='utf-8'))
        validate_gene_rankings(document, index)
        if args.browser_output.read_bytes() != args.output.read_bytes():
            raise ValueError('Package and browser gene-ranking assets differ.')
        print(f"Verified {len(document['records']):,} gene-ranking records.")
        return

    with h5py.File(args.score_file, mode='r') as score_root:
        document = build_gene_rankings(score_root, index, sha256_file(args.score_file))
    validate_gene_rankings(document, index)
    _write_json(args.output, document)
    _write_json(args.browser_output, document)
    print(f"Wrote {len(document['records']):,} gene-ranking records to both assets.")


if __name__ == '__main__':
    main()
