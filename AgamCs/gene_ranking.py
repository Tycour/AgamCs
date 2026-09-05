"""Load and present bundled AgamP4.14 gene-level Cs and SNP rankings."""

from __future__ import annotations

import json
from pathlib import Path


CS_FILENAME = 'gene-cs-rankings.json'
SNP_FILENAME = 'gene-snp-rankings.json'
SCHEMA_VERSION = 2
SCOPES = (
    'gene_span', 'representative_exons', 'representative_cds',
    'representative_utr', 'representative_introns',
)
SCOPE_LABELS = {
    'gene_span': 'Whole gene span',
    'representative_exons': 'Representative-transcript exons',
    'representative_cds': 'Representative-transcript CDS',
    'representative_utr': 'Representative-transcript UTR',
    'representative_introns': 'Representative-transcript introns',
}
CS_FIELDS = ('total_bases', 'bases_assessed', 'mean_cs', 'global', 'chromosome')
SNP_FIELDS = (
    'total_bases', 'accessible_bases', 'bases_assessed', 'accessible_fraction',
    'mean_snp_density', 'global', 'chromosome',
)


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
    if (document.get('schema_version') != SCHEMA_VERSION
            or document.get('assembly') != 'AgamP4'
            or document.get('scope_order') != list(SCOPES)
            or not isinstance(document.get('records'), dict)):
        raise ValueError(f'The {filename} asset is not compatible with this AgamCs release.')
    return document


def _statistics(row, cohort_denominator):
    if row is None:
        return None
    if not isinstance(row, list) or len(row) != 3:
        raise ValueError('Invalid compact gene-ranking statistics.')
    return {
        'rank': row[0], 'ties': row[1], 'percentile': row[2],
        'cohort_denominator': cohort_denominator,
    }


def _scope_state(summary: dict, kind: str, threshold: float | None = None) -> str:
    total = summary['total_bases']
    if total is None:
        return 'not_ranked_unavailable'
    if total == 0:
        return 'not_ranked_zero_bases'
    if kind == 'snp_density':
        fraction = summary['accessible_fraction']
        if fraction is None or fraction < threshold:
            return 'not_ranked_ineligible'
    value_field = 'mean_cs' if kind == 'cs' else 'mean_snp_density'
    if not summary['bases_assessed'] or summary[value_field] is None:
        return 'not_ranked_unavailable'
    if summary['global'] is None or summary['chromosome'] is None:
        return 'not_ranked_unavailable'
    return 'ranked'


def _decode_scopes(document: dict, record: list, kind: str) -> dict:
    if not isinstance(record, list) or len(record) != 3:
        raise ValueError('Invalid compact gene-ranking record.')
    chromosome, representative_transcript, rows = record
    fields = CS_FIELDS if kind == 'cs' else SNP_FIELDS
    if not isinstance(rows, list) or len(rows) != len(SCOPES):
        raise ValueError('Invalid compact gene-ranking scope collection.')
    threshold = (float(document['minimum_accessible_fraction'])
                 if kind == 'snp_density' else None)
    scopes = {}
    for name, row in zip(SCOPES, rows):
        if not isinstance(row, list) or len(row) != len(fields):
            raise ValueError(f'Invalid compact {name} ranking summary.')
        summary = dict(zip(fields, row))
        global_count = document['cohorts']['global_ranked_scope_counts'][name]
        arm_count = document['cohorts']['chromosome_ranked_scope_counts'][name][chromosome]
        summary['global'] = _statistics(summary['global'], global_count)
        summary['chromosome'] = _statistics(summary['chromosome'], arm_count)
        summary['global_cohort_denominator'] = global_count
        summary['chromosome_cohort_denominator'] = arm_count
        summary['rank_state'] = _scope_state(summary, kind, threshold)
        summary['representative_transcript'] = representative_transcript
        scopes[name] = summary
    return {
        'chromosome': chromosome,
        'representative_transcript': representative_transcript,
        'scopes': scopes,
    }


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
    cs_row = rankings.get('cs', {}).get('records', {}).get(normalized)
    snp_row = rankings.get('snp_density', {}).get('records', {}).get(normalized)
    if cs_row is None and snp_row is None:
        return None
    cs_record = (_decode_scopes(rankings['cs'], cs_row, 'cs') if cs_row is not None else None)
    snp_record = (_decode_scopes(rankings['snp_density'], snp_row, 'snp_density')
                  if snp_row is not None else None)
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
            **cs_record['scopes'],
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
            **snp_record['scopes'],
        }
    return result


def rank_label(statistics: dict) -> str:
    first = statistics['rank']
    last = first + statistics['ties'] - 1
    position = f'{first:,}' if first == last else f'{first:,}–{last:,} (tie)'
    return (
        f'{position} of {statistics["cohort_denominator"]:,}; '
        f'{statistics["percentile"]:.2f}th percentile'
    )


def _scope_lines(ranking: dict, key: str, field: str, value_label: str) -> list[str]:
    section = ranking[key]
    chromosome = ranking['chromosome']
    lines = []
    for metric, label in SCOPE_LABELS.items():
        summary = section[metric]
        state = summary['rank_state']
        if state != 'ranked':
            if state == 'not_ranked_zero_bases':
                detail = 'zero-base partition'
            elif state == 'not_ranked_ineligible':
                percent = 100 * summary['accessible_fraction']
                detail = (
                    f'{percent:.1f}% accessible '
                    f'({summary["accessible_bases"]:,}/{summary["total_bases"]:,}); 80% required'
                )
            else:
                detail = (
                    f'evidence unavailable; {summary["bases_assessed"]:,}/'
                    f'{summary["total_bases"] or 0:,} bases assessed'
                )
            observed = summary.get(field)
            value = f'{value_label} {observed:.6f}; ' if observed is not None else 'NA; '
            lines.append(
                f'  {label}: {value}Not ranked — {detail}; representative transcript '
                f'{summary["representative_transcript"] or "NA"}; eligible cohorts: global '
                f'{summary["global_cohort_denominator"]:,}, {chromosome} '
                f'{summary["chromosome_cohort_denominator"]:,}.'
            )
            continue
        coverage = f'{summary["bases_assessed"]:,}/{summary["total_bases"]:,} bases assessed'
        if key == 'snp_density':
            coverage += (
                f'; {100 * summary["accessible_fraction"]:.1f}% accessible '
                f'({summary["accessible_bases"]:,}/{summary["total_bases"]:,})'
            )
        lines.append(
            f'  {label}: {value_label} {summary[field]:.6f}; {coverage}; global '
            f'{rank_label(summary["global"])}; {chromosome} '
            f'{rank_label(summary["chromosome"])}; representative transcript '
            f'{summary["representative_transcript"]}.'
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
