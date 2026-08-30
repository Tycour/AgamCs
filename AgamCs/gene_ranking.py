"""Load and present bundled AgamP4.14 gene-level Cs and SNP rankings."""

from __future__ import annotations

import json
from pathlib import Path


CS_FILENAME = 'gene-cs-rankings.json'
SNP_FILENAME = 'gene-snp-rankings.json'


def get_ranking_path(filename: str, path=None) -> Path:
    requested = Path(path).expanduser().resolve() if path else None
    candidates = [
        requested,
        Path(__file__).resolve().parent / 'data' / filename,
        Path(__file__).resolve().parents[1] / 'docs/assets/data' / filename,
    ]
    for candidate in candidates:
        if candidate is not None and candidate.exists():
            return candidate
    raise FileNotFoundError(f'Bundled gene-ranking asset is unavailable: {filename}')


def _load(filename: str, path=None) -> dict:
    document = json.loads(get_ranking_path(filename, path).read_text(encoding='utf-8'))
    if (document.get('schema_version') != 1 or document.get('assembly') != 'AgamP4'
            or not isinstance(document.get('records'), dict)):
        raise ValueError(f'The {filename} asset is not compatible with this AgamCs release.')
    return document


def load_gene_rankings(cs_path=None, snp_path=None) -> dict:
    """Load the two independently versioned ranking assets."""
    documents, errors = {}, []
    for key, filename, path in (
        ('cs', CS_FILENAME, cs_path),
        ('snp_density', SNP_FILENAME, snp_path),
    ):
        try:
            documents[key] = _load(filename, path)
        except (FileNotFoundError, ValueError) as error:
            errors.append(str(error))
    if not documents:
        raise FileNotFoundError('; '.join(errors))
    return documents


def ranking_for_gene(accession: str, documents: dict | None = None,
                     cs_path=None, snp_path=None) -> dict | None:
    rankings = documents if documents is not None else load_gene_rankings(cs_path, snp_path)
    normalized = str(accession).upper()
    cs_record = rankings.get('cs', {}).get('records', {}).get(normalized)
    snp_record = rankings.get('snp_density', {}).get('records', {}).get(normalized)
    if cs_record is None and snp_record is None:
        return None
    shared = cs_record or snp_record
    result = {
        'accession': normalized,
        'chromosome': shared['chromosome'],
        'representative_transcript': shared['representative_transcript'],
    }
    if cs_record is not None:
        document = rankings['cs']
        result['cs'] = {
            'ranking_version': document['ranking_version'],
            'score_source': document['score_source'],
            'percentile_method': document['percentile_method'],
            'cohorts': document['cohorts'],
            'gene_span': cs_record['gene_span'],
            'representative_exons': cs_record['representative_exons'],
        }
    if snp_record is not None:
        document = rankings['snp_density']
        result['snp_density'] = {
            'ranking_version': document['ranking_version'],
            'score_source': document['score_source'],
            'accessibility_source': document['accessibility_source'],
            'minimum_accessible_fraction': document['minimum_accessible_fraction'],
            'percentile_method': document['percentile_method'],
            'cohorts': document['cohorts'],
            'gene_span': snp_record['gene_span'],
            'representative_exons': snp_record['representative_exons'],
        }
    return result


def rank_label(statistics: dict, cohort_size: int) -> str:
    first = statistics['rank']
    last = first + statistics['ties'] - 1
    position = f'{first:,}' if first == last else f'{first:,}–{last:,} (tie)'
    return f'{position} of {cohort_size:,}; {statistics["percentile"]:.2f}th percentile'


def _scope_lines(ranking: dict, key: str, field: str, value_label: str) -> list[str]:
    section = ranking[key]
    chromosome = ranking['chromosome']
    lines = []
    for metric, label in (
        ('gene_span', 'Whole gene span'),
        ('representative_exons', 'Representative-transcript exons'),
    ):
        summary = section[metric]
        if key == 'snp_density' and not summary['eligible']:
            percent = 100 * summary['accessible_fraction']
            lines.append(
                f'  {label}: not ranked — {percent:.1f}% accessible '
                f'({summary["accessible_bases"]:,}/{summary["total_bases"]:,}); 80% required.'
            )
            continue
        cohorts = section['cohorts']
        if key == 'cs':
            global_count = cohorts['global_gene_count']
            arm_count = cohorts['chromosome_gene_counts'][chromosome]
        else:
            global_count = cohorts['global_eligible_gene_counts'][metric]
            arm_count = cohorts['chromosome_eligible_gene_counts'][metric][chromosome]
        lines.append(
            f'  {label}: {value_label} {summary[field]:.6f}; global '
            f'{rank_label(summary["global"], global_count)}; {chromosome} '
            f'{rank_label(summary["chromosome"], arm_count)}.'
        )
    return lines


def format_gene_ranking(ranking: dict) -> str:
    lines = [f"Gene rankings for {ranking['accession']} ({ranking['chromosome']}):"]
    if 'cs' in ranking:
        lines.append('Cs percentile (higher = more conserved):')
        lines.extend(_scope_lines(ranking, 'cs', 'mean_cs', 'mean Cs'))
        lines.append(
            '  Cs caveat: the pooled global rank is descriptive because v1 Cs was '
            'scaled separately by chromosome arm.'
        )
    if 'snp_density' in ranking:
        lines.append('Low-variation percentile (higher = lower accessible-base SNP density):')
        lines.extend(_scope_lines(
            ranking, 'snp_density', 'mean_snp_density',
            'mean accessible-base SNP density',
        ))
        lines.append(
            '  SNP caveat: QC-failed bases are unknown; this archived 20-base-window '
            'density is not allele frequency or independent conservation evidence.'
        )
    return '\n'.join(lines)
