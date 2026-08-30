"""Load and present the bundled AgamP4.14 gene-level Cs rankings."""

from __future__ import annotations

import json
from pathlib import Path


RANKING_FILENAME = 'gene-rankings.json'


def get_ranking_path(path=None) -> Path:
    requested = Path(path).expanduser().resolve() if path else None
    candidates = [
        requested,
        Path(__file__).resolve().parent / 'data' / RANKING_FILENAME,
        Path(__file__).resolve().parents[1] / 'docs' / 'assets' / 'data' / RANKING_FILENAME,
    ]
    for candidate in candidates:
        if candidate is not None and candidate.exists():
            return candidate
    raise FileNotFoundError(f'Bundled gene-ranking asset is unavailable: {RANKING_FILENAME}')


def load_gene_rankings(path=None) -> dict:
    document = json.loads(get_ranking_path(path).read_text(encoding='utf-8'))
    if (
        document.get('schema_version') != 1
        or document.get('assembly') != 'AgamP4'
        or not isinstance(document.get('records'), dict)
    ):
        raise ValueError('The gene-ranking asset is not compatible with this AgamCs release.')
    return document


def ranking_for_gene(accession: str, document: dict | None = None, path=None) -> dict | None:
    rankings = document if document is not None else load_gene_rankings(path)
    record = rankings['records'].get(str(accession).upper())
    if record is None:
        return None
    return {
        'accession': str(accession).upper(),
        'ranking_version': rankings['ranking_version'],
        'coordinate_index_version': rankings['coordinate_index_version'],
        'score_source': rankings['score_source'],
        'percentile_method': rankings['percentile_method'],
        'metrics': rankings['metrics'],
        'cohorts': rankings['cohorts'],
        **record,
    }


def rank_label(statistics: dict, cohort_size: int) -> str:
    first = statistics['rank']
    last = first + statistics['ties'] - 1
    position = f'{first:,}' if first == last else f'{first:,}–{last:,} (tie)'
    return f'{position} of {cohort_size:,}; {statistics["percentile"]:.2f}th percentile'


def format_gene_ranking(ranking: dict) -> str:
    global_count = ranking['cohorts']['global_gene_count']
    chromosome = ranking['chromosome']
    arm_count = ranking['cohorts']['chromosome_gene_counts'][chromosome]
    lines = [
        f"Gene conservation ranking for {ranking['accession']} ({chromosome}):",
    ]
    for metric, label in (
        ('gene_span', 'Whole gene span'),
        ('representative_exons', 'Representative-transcript exons'),
    ):
        summary = ranking[metric]
        lines.append(
            f'  {label}: mean Cs {summary["mean_cs"]:.6f}; global '
            f'{rank_label(summary["global"], global_count)}; {chromosome} '
            f'{rank_label(summary["chromosome"], arm_count)}.'
        )
    lines.append(
        '  Interpretation: pooled genome-wide ranks are descriptive because v1 Cs was '
        'scaled separately by chromosome arm.'
    )
    return '\n'.join(lines)
