"""Validate the self-contained assets and essential structure of the Pages site."""

from __future__ import annotations

import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

from build_pages_accession_index import validate_index
from build_pages_examples import load_accession_list, load_catalogue, verify_assets
from build_pages_gene_search import validate_gene_search
from build_gene_rankings import validate_cs_rankings, validate_snp_rankings


ROOT = Path(__file__).resolve().parents[1] / 'docs'
PAGES = (ROOT / 'index.html', ROOT / '404.html')
EXAMPLES_PATH = ROOT / 'examples.json'
BATCH_ACCESSIONS_PATH = ROOT.parent / 'batch_accessions_example.txt'
ACCESSION_INDEX_PATH = ROOT / 'assets/data/accession-index.json'
GENE_SEARCH_PATH = ROOT / 'assets/data/gene-search.json'
CS_RANKINGS_PATH = ROOT / 'assets/data/gene-cs-rankings.json'
SNP_RANKINGS_PATH = ROOT / 'assets/data/gene-snp-rankings.json'
PACKAGED_CS_RANKINGS_PATH = ROOT.parent / 'AgamCs/data/gene-cs-rankings.json'
PACKAGED_SNP_RANKINGS_PATH = ROOT.parent / 'AgamCs/data/gene-snp-rankings.json'
QUERY_ASSETS = (
    ROOT / 'assets/data/score-reference.json',
    ROOT / 'assets/data/accessibility-reference.json',
    ROOT / 'assets/data/query-manifest.json',
    ROOT / 'assets/data/query-validation.json',
    ROOT / 'assets/data/plot-validation.json',
    ROOT / 'assets/query-worker.js',
    ROOT / 'assets/plot-model.js',
    ROOT / 'assets/query-summary.js',
    ROOT / 'assets/query-intervals.js',
    ROOT / 'assets/notable-windows.js',
    ROOT / 'assets/species-context.js',
    ROOT / 'assets/query-report.js',
    ROOT / 'assets/live-plots.js',
    ROOT / 'assets/query-contract.js',
    ROOT / 'assets/query-interaction.js',
    ROOT / 'assets/query-permalink.js',
    ROOT / 'assets/accession-lookup.js',
    ROOT / 'assets/gene-search.js',
    ROOT / 'assets/gene-ranking.js',
    ACCESSION_INDEX_PATH,
    GENE_SEARCH_PATH,
    CS_RANKINGS_PATH,
    SNP_RANKINGS_PATH,
    ROOT / 'assets/data/plot-contract.json',
)
QUERY_ARRAYS = {'Cs', 'snp_density', 'stack'}
VALIDATION_ARRAYS = QUERY_ARRAYS | {'status'}
QUERY_CHROMOSOMES = {'2L', '2R', '3L', '3R', 'X'}
REQUIRED_META_NAMES = {'author', 'description', 'theme-color', 'twitter:card'}
REQUIRED_META_PROPERTIES = {'og:type', 'og:title', 'og:description', 'og:url', 'og:image'}
FORBIDDEN_PAGES_SUFFIXES = {'.h5', '.hdf5', '.zarr', '.zip', '.tar', '.gz'}
MAX_PAGES_FILE_BYTES = 10 * 1024 * 1024
EXPECTED_ACCESSION_RECORDS = 13_096
EXPECTED_TRANSCRIPT_RECORDS = 15_316
EXPECTED_ACCESSION_SOURCE_SHA256 = '916a1e0e4d4613d36be31dc03c53871f6f62c94f4d8bc4662d0002131658c0c7'
EXPECTED_GENE_SEARCH_RECORDS = 2_254
EXPECTED_GENE_SEARCH_SOURCE_SHA256 = 'fb1e13c3265b966901cd01524bb16d49ff854c3a002745489daaeae54f638bce'
REQUIRED_ACCESSIONS = {'AGAP001683', 'AGAP004568'}
REQUIRED_TRANSCRIPTS = {'AGAP000040-RA', 'AGAP000040-RB', 'AGAP000040-RC'}
RELEASE_PATTERN = re.compile(r"(?:PAGES|WORKER)_RELEASE\s*=\s*['\"]([^'\"]+)['\"]")
HTML_RELEASE_PATTERN = re.compile(r"[?&]v=([A-Za-z0-9._-]+)")
ANALYTICS_ID_PATTERN = re.compile(r'data-measurement-id=["\'](G-[A-Za-z0-9]+)["\']')


class PageChecker(HTMLParser):
    """Collect a page's ids, local URLs, image alt text, and metadata."""

    def __init__(self) -> None:
        super().__init__()
        self.ids: set[str] = set()
        self.errors: list[str] = []
        self.local_urls: list[str] = []
        self.meta_names: set[str] = set()
        self.meta_properties: set[str] = set()
        self.title = ''
        self.form_count = 0
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        identifier = attributes.get('id')
        if identifier:
            if identifier in self.ids:
                self.errors.append(f'duplicate id {identifier!r}')
            self.ids.add(identifier)

        if tag == 'html' and attributes.get('lang') != 'en':
            self.errors.append('document language must be English (lang="en")')
        if tag == 'title':
            self._in_title = True
        if tag == 'form':
            self.form_count += 1
        if tag == 'img' and not attributes.get('alt'):
            self.errors.append('image is missing alternative text')
        if tag == 'meta':
            if attributes.get('name'):
                self.meta_names.add(attributes['name'])
            if attributes.get('property'):
                self.meta_properties.add(attributes['property'])

        for attribute in ('href', 'src'):
            value = attributes.get(attribute)
            if value:
                self.local_urls.append(value)

    def handle_endtag(self, tag: str) -> None:
        if tag == 'title':
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data


def is_local_url(value: str) -> bool:
    parsed = urlparse(value)
    return not parsed.scheme and not parsed.netloc and not value.startswith('#')


def validate_local_url(page: Path, value: str) -> str | None:
    if not is_local_url(value):
        return None
    path = urlparse(value).path
    if not path:
        return None
    target = (page.parent / unquote(path)).resolve()
    try:
        target.relative_to(ROOT.resolve())
    except ValueError:
        return f'local URL escapes docs: {value!r}'
    if not target.exists():
        return f'missing local asset: {value!r}'
    return None


def validate_page(page: Path) -> list[str]:
    checker = PageChecker()
    checker.feed(page.read_text(encoding='utf-8'))
    errors = [f'{page.relative_to(ROOT)}: {error}' for error in checker.errors]
    if not checker.title.strip():
        errors.append(f'{page.relative_to(ROOT)}: document has no title')

    for url in checker.local_urls:
        error = validate_local_url(page, url)
        if error:
            errors.append(f'{page.relative_to(ROOT)}: {error}')

    if page.name == 'index.html':
        missing_names = REQUIRED_META_NAMES - checker.meta_names
        missing_properties = REQUIRED_META_PROPERTIES - checker.meta_properties
        if missing_names:
            errors.append(f'index.html: missing meta names: {sorted(missing_names)}')
        if missing_properties:
            errors.append(f'index.html: missing Open Graph properties: {sorted(missing_properties)}')
        page_text = page.read_text(encoding='utf-8')
        if 'Anopheles gambiae' not in page_text:
            errors.append('index.html: public copy must name Anopheles gambiae')
        for retired_positioning in ('prototype', 'preview'):
            if retired_positioning in page_text.lower():
                errors.append(
                    'index.html: retired prototype/preview positioning remains: '
                    f'{retired_positioning!r}'
                )
        required_ids = {
            'explorer', 'benchmark-form', 'live-accession', 'example-select',
            'two-gene-comparison', 'comparison-form', 'comparison-left-accession',
            'comparison-right-accession', 'comparison-submit', 'comparison-cancel',
            'comparison-status', 'comparison-results', 'comparison-locus-grid',
            'comparison-table-body', 'comparison-left-tsv', 'comparison-right-tsv',
            'comparison-export', 'comparison-left-heading', 'comparison-right-heading',
            'comparison-left-partition-heading', 'comparison-right-partition-heading',
            'comparison-partitions', 'comparison-partition-table-body',
            'query-options', 'accession-query-options',
            'featured-example-strip', 'featured-example-actions',
            'about', 'about-title',
            'accession-padding',
            'padding-help',
            'accession-combobox', 'accession-suggestions-panel',
            'accession-suggestions', 'accession-suggestions-note',
            'accession-search-status',
            'accession-query-panel', 'isoform-control', 'isoform-select',
            'isoform-help', 'coordinate-query-panel',
            'results-portal', 'resolved-accession',
            'resolved-gene-id',
            'query-summary', 'query-summary-subject', 'query-summary-version',
            'query-summary-body', 'summary-method-note', 'ranking-section',
            'summary-cs-ranking-card', 'summary-cs-rank-span',
            'summary-cs-rank-exons', 'summary-cs-rank-cds',
            'summary-cs-rank-utr', 'summary-cs-rank-introns',
            'summary-cs-ranking-note',
            'summary-snp-ranking-card', 'summary-snp-rank-span',
            'summary-snp-rank-exons', 'summary-snp-rank-cds',
            'summary-snp-rank-utr', 'summary-snp-rank-introns',
            'summary-snp-ranking-note',
            'live-visuals', 'live-signals-heading', 'live-heatmap-heading',
            'live-signal-download', 'live-heatmap-download',
            'signal-resolution', 'heatmap-resolution', 'plot-resolution-status',
            'plot-range-current', 'plot-range-select', 'plot-range-back',
            'plot-range-reset', 'plot-range-start', 'plot-range-end',
            'plot-range-apply', 'plot-range-status',
            'species-display-controls', 'species-display-order',
            'species-select-all', 'species-clear-all', 'species-checkbox-grid',
            'clade-collapse-grid', 'species-display-status',
            'species-context', 'species-context-subject', 'species-context-version',
            'species-context-body', 'species-context-method',
            'query-report-actions', 'query-report-status', 'query-report-version',
            'query-report-download', 'copy-methods', 'copy-figure-caption',
            'show-overlapping-annotations', 'overlap-annotation-help',
            'copy-query-permalink', 'query-permalink-status',
            'analytics-settings', 'analytics-consent', 'analytics-consent-title',
            'analytics-consent-description', 'analytics-consent-status',
            'analytics-accept', 'analytics-reject',
        }
        if missing_ids := required_ids - checker.ids:
            errors.append(f'index.html: missing live-query controls: {sorted(missing_ids)}')
        obsolete_ids = {
            'query-form', 'live-query', 'profile-panel', 'heatmap-panel',
            'summary-accessible', 'query-preview', 'live-accession-list',
        }
        if retained_ids := obsolete_ids & checker.ids:
            errors.append(f'index.html: duplicate demo/live-query UI remains: {sorted(retained_ids)}')
        if 'Featured examples' not in page_text:
            errors.append('index.html: featured examples must remain a labelled query shortcut')
        if 'Demo result' in page_text:
            errors.append('index.html: obsolete demo-result presentation remains')
        if 'First five returned positions' in page_text:
            errors.append('index.html: obsolete per-position preview remains')
        for required_summary_text in (
            'Exact query and selected-transcript summaries',
            'agamcs-query-summary-v1', 'Accessibility', 'Cs percentile',
            'Low-variation percentile',
            'Species and encoded-clade context', 'agamcs-species-context-v1',
            'Reproducible query report', 'agamcs-query-report-v2',
            'species × query-base denominators',
            'Find a gene or genomic region.',
            'Options and featured examples',
            'Data source, QC and query limits',
            'Gene accession, symbol, or transcript accession',
            'Transcript isoform', 'Thomas Courty', 'Windbichler Lab',
            'Imperial College London', 'Query processing runs in your browser',
            'only if you accept them', 'accessions, coordinates, interval names and bounds, results, filenames, and errors',
        ):
            if required_summary_text not in page_text:
                errors.append(
                    f'index.html: query summary is missing {required_summary_text!r}'
                )
        diagnostic_labels = {
            'Query time', 'Cache hits', 'HTTP ranges', 'Transferred',
            'Decoded cache', 'Local validation',
        }
        if retained_labels := {label for label in diagnostic_labels if label in page_text}:
            errors.append(
                'index.html: engineering diagnostics remain in the public result portal: '
                f'{sorted(retained_labels)}'
            )
        if checker.form_count != 2:
            errors.append(f'index.html: expected one primary query form and one two-gene comparison form, found {checker.form_count}')
    return errors


def validate_analytics() -> list[str]:
    """Require explicit, consented, privacy-bounded Pages analytics wiring."""
    index_text = PAGES[0].read_text(encoding='utf-8')
    analytics_path = ROOT / 'assets/analytics.js'
    errors = []
    match = ANALYTICS_ID_PATTERN.search(index_text)
    if not match:
        errors.append('index.html: analytics tag is missing a GA4 Measurement ID')
    elif re.fullmatch(
        r'G-(?:X+|TEST[A-Z0-9]*|LOCAL[A-Z0-9]*|PLACEHOLDER[A-Z0-9]*)',
        match.group(1),
        flags=re.IGNORECASE,
    ):
        errors.append('index.html: replace the placeholder GA4 Measurement ID')
    if 'assets/analytics.js?' not in index_text:
        errors.append('index.html: versioned analytics script is missing')
    if not analytics_path.exists():
        errors.append('missing Pages analytics controller: assets/analytics.js')
        return errors

    analytics_text = analytics_path.read_text(encoding='utf-8')
    for required_fragment in (
        'query_success', 'file_download', 'query_mode', 'query_kind',
        'artifact_type', 'allow_google_signals: false',
        'allow_ad_personalization_signals: false', 'safePageLocation',
        'safePageReferrer',
    ):
        if required_fragment not in analytics_text:
            errors.append(f'analytics controller is missing {required_fragment!r}')
    if 'assets/analytics.js' in PAGES[1].read_text(encoding='utf-8'):
        errors.append('404.html must remain outside analytics for the first release')
    site_text = (ROOT / 'assets/site.js').read_text(encoding='utf-8')
    for required_hook in (
        "trackUsage('query_success'",
        "trackUsage('file_download', { artifact_type: 'tsv' })",
        "trackUsage('file_download', { artifact_type: 'signal_svg' })",
        "trackUsage('file_download', { artifact_type: 'heatmap_svg' })",
        "trackUsage('file_download', { artifact_type: 'report_json' })",
    ):
        if required_hook not in site_text:
            errors.append(f'site analytics integration is missing {required_hook!r}')
    return errors


def validate_examples() -> list[str]:
    """Ensure the catalogue matches the public batch example and its assets."""
    try:
        catalogue = load_catalogue(EXAMPLES_PATH)
        batch_accessions = load_accession_list(BATCH_ACCESSIONS_PATH)
        naming_index = json.loads(GENE_SEARCH_PATH.read_text(encoding='utf-8'))
    except (OSError, ValueError) as error:
        return [f'could not read examples.json: {error}']
    errors = [f'missing generated asset: {path.relative_to(ROOT)}'
              for path in verify_assets(catalogue['examples'], ROOT / 'assets')]
    catalogue_accessions = [example['accession'] for example in catalogue['examples']]
    if catalogue_accessions != batch_accessions:
        errors.append(
            'featured examples must match batch_accessions_example.txt in the same order'
        )
    quick_examples = sorted(
        (example for example in catalogue['examples'] if example['quick_rank'] is not None),
        key=lambda example: example['quick_rank'],
    )
    if [example['accession'] for example in quick_examples] != [
        'AGAP008212', 'AGAP002560', 'AGAP008288',
    ]:
        errors.append('quick examples must be CYP6M2, Orco, and TIM in that order')
    for example in catalogue['examples']:
        expected_symbol = naming_index.get('names', {}).get(example['accession'], {}).get('name')
        if example['symbol'] != expected_symbol:
            errors.append(
                f"featured-example symbol disagrees with the pinned naming index: {example['accession']}"
            )
    labelled = {example['accession']: example['labels'] for example in catalogue['examples']}
    required_labels = {
        'AGAP010815': ('Complex', 'QC-limited'),
        'AGAP004707': ('High complexity', 'Partial QC'),
        'AGAP010449': ('4 exons', 'All QC failed'),
    }
    for accession, (complexity, qc) in required_labels.items():
        labels = labelled.get(accession, {})
        if complexity not in labels.get('complexity', '') or qc not in labels.get('qc', ''):
            errors.append(f'featured example lacks explicit QC/complexity labels: {accession}')
    return errors


def validate_accessions() -> list[str]:
    """Validate the release index and its overlap with precomputed examples."""
    try:
        index = json.loads(ACCESSION_INDEX_PATH.read_text(encoding='utf-8'))
        validate_index(index)
        catalogue = load_catalogue(EXAMPLES_PATH)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return [f'could not validate accession index: {error}']

    errors = []
    if len(index['accessions']) != EXPECTED_ACCESSION_RECORDS:
        errors.append(
            f'accession index must contain all {EXPECTED_ACCESSION_RECORDS:,} supported '
            'VectorBase-68 records'
        )
    if len(index['transcripts']) != EXPECTED_TRANSCRIPT_RECORDS:
        errors.append(
            f'accession index must contain all {EXPECTED_TRANSCRIPT_RECORDS:,} supported '
            'VectorBase-68 transcript records'
        )
    if index['annotation']['source_snapshot_sha256'] != EXPECTED_ACCESSION_SOURCE_SHA256:
        errors.append('accession index does not match the reviewed VectorBase-68 GFF checksum')
    if index.get('coverage', {}).get('privacy_filtered_gene_records') != 1 \
            or index.get('coverage', {}).get('privacy_filtered_transcript_records') != 1:
        errors.append('accession index is missing the reviewed public-curation exclusion counts')
    for accession in sorted(REQUIRED_ACCESSIONS):
        if accession not in index['accessions']:
            errors.append(f'required arbitrary-accession regression record is missing: {accession}')
    for transcript_id in sorted(REQUIRED_TRANSCRIPTS):
        if transcript_id not in index['transcripts']:
            errors.append(f'required isoform regression record is missing: {transcript_id}')
    for example in catalogue['examples']:
        accession = example['accession']
        record = index['accessions'].get(accession)
        if record is None:
            errors.append(f'precomputed example is missing from accession index: {accession}')
            continue
        if record['region'] != example['region']:
            errors.append(f'accession-index region disagrees with example: {accession}')
        if record['annotation'] != example['annotation']:
            errors.append(f'accession-index annotation disagrees with example: {accession}')
    return errors


def validate_gene_names() -> list[str]:
    """Validate official symbols and their exact join to the accession index."""
    try:
        index = json.loads(ACCESSION_INDEX_PATH.read_text(encoding='utf-8'))
        search = json.loads(GENE_SEARCH_PATH.read_text(encoding='utf-8'))
        validate_gene_search(search, index)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return [f'could not validate gene-name index: {error}']

    errors = []
    if len(search['names']) != EXPECTED_GENE_SEARCH_RECORDS:
        errors.append(
            f'gene-name index must contain {EXPECTED_GENE_SEARCH_RECORDS:,} official symbols'
        )
    if search['source']['snapshot_sha256'] != EXPECTED_GENE_SEARCH_SOURCE_SHA256:
        errors.append('gene-name index does not match the reviewed AgamP4 naming snapshot')
    if search['names'].get('AGAP006241', {}).get('name') != 'ZPG':
        errors.append('gene-name index is missing the AGAP006241/ZPG regression mapping')
    mocs2 = sorted(
        accession for accession, record in search['names'].items()
        if record['name'].casefold() == 'mocs2'
    )
    if mocs2 != ['AGAP004289', 'AGAP004290', 'AGAP013168']:
        errors.append('gene-name index no longer preserves the ambiguous Mocs2 mappings')
    if search['coverage']['gene_records_checked'] != len(index['accessions']):
        errors.append('gene-name source was not checked against every indexed gene')
    return errors


def validate_rankings() -> list[str]:
    """Require exact full-index ranking coverage and package/browser parity."""
    try:
        index = json.loads(ACCESSION_INDEX_PATH.read_text(encoding='utf-8'))
        cs = json.loads(CS_RANKINGS_PATH.read_text(encoding='utf-8'))
        snp = json.loads(SNP_RANKINGS_PATH.read_text(encoding='utf-8'))
        validate_cs_rankings(cs, index)
        validate_snp_rankings(snp, index)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return [f'could not validate gene rankings: {error}']

    errors = []
    for package, browser in (
        (PACKAGED_CS_RANKINGS_PATH, CS_RANKINGS_PATH),
        (PACKAGED_SNP_RANKINGS_PATH, SNP_RANKINGS_PATH),
    ):
        if not package.exists():
            errors.append(f'packaged gene-ranking asset is missing: {package.name}')
        elif package.read_bytes() != browser.read_bytes():
            errors.append(f'package and browser gene-ranking assets differ: {package.name}')
    expected_cs = {
        'gene_span': 13097,
        'representative_exons': 13097,
        'representative_cds': 12614,
        'representative_utr': 10874,
        'representative_introns': 11532,
    }
    if cs['cohorts']['global_ranked_scope_counts'] != expected_cs:
        errors.append('Cs ranking denominator no longer preserves its reviewed source cohort')
    expected_eligible = {
        'gene_span': 8305,
        'representative_exons': 10165,
        'representative_cds': 10498,
        'representative_utr': 7514,
        'representative_introns': 6052,
    }
    if snp['cohorts']['global_ranked_scope_counts'] != expected_eligible:
        errors.append('SNP ranking denominators no longer match the reviewed 80% QC cohorts')
    return errors


def validate_pages_payload() -> list[str]:
    """Ensure Pages contains only the small client and metadata assets."""
    errors = []
    for path in ROOT.rglob('*'):
        if not path.is_file():
            continue
        relative = path.relative_to(ROOT)
        if path.suffix.lower() in FORBIDDEN_PAGES_SUFFIXES:
            errors.append(f'forbidden data archive in Pages payload: {relative}')
        if path.stat().st_size > MAX_PAGES_FILE_BYTES:
            errors.append(f'Pages asset exceeds 10 MiB safety limit: {relative}')
    return errors


def validate_release_versions() -> list[str]:
    """Require one cache-busting release ID across the page and worker graph."""
    index_versions = set(HTML_RELEASE_PATTERN.findall(PAGES[0].read_text(encoding='utf-8')))
    errors = []
    if len(index_versions) != 1:
        errors.append(f'index.html must use one release version, found: {sorted(index_versions)}')
        return errors

    expected = next(iter(index_versions))
    for relative in ('assets/site.js', 'assets/query-worker.js'):
        text = (ROOT / relative).read_text(encoding='utf-8')
        match = RELEASE_PATTERN.search(text)
        if not match:
            errors.append(f'{relative} does not declare its release version')
        elif match.group(1) != expected:
            errors.append(
                f'{relative} release {match.group(1)!r} does not match index.html {expected!r}'
            )
    return errors


def validate_local_preview_guard() -> list[str]:
    """Require direct-file previews to fail with actionable server guidance."""
    site_text = (ROOT / 'assets/site.js').read_text(encoding='utf-8')
    required_fragments = (
        "window.location.protocol === 'file:'",
        'python3 -m http.server 8000 --directory docs',
        'benchmarkSubmit.disabled = true',
        'if (!queryWorker)',
    )
    return [
        f'local preview guard is missing {fragment!r}'
        for fragment in required_fragments
        if fragment not in site_text
    ]


def validate_vectorbase_gene_links() -> list[str]:
    """Keep resolved gene labels linked to the official VectorBase record."""
    site_text = (ROOT / 'assets/site.js').read_text(encoding='utf-8')
    required_fragments = (
        'function renderVectorBaseGeneLink',
        'https://vectorbase.org/vectorbase/app/record/gene/',
        "document.querySelector('#resolved-accession-id')",
        "document.querySelector('#resolved-gene-id')",
        "geneSearchSnapshot?.names?.[resolution.geneAccession]?.name",
    )
    return [
        f'VectorBase gene-link integration is missing {fragment!r}'
        for fragment in required_fragments
        if fragment not in site_text
    ]


def validate_live_plot_renderer() -> list[str]:
    """Keep the browser heatmap annotation convention aligned with the CLI."""
    text = (ROOT / 'assets/live-plots.js').read_text(encoding='utf-8')
    errors = []
    if 'heatmap-cds-strip' not in text:
        errors.append('live heatmap is missing its aligned CDS annotation strip')
    if 'transcript-model-row' not in text or 'transcriptAnnotationsForDisplay' not in text:
        errors.append('live plots are missing the shared multi-transcript annotation track')
    if (
        'function vectorBaseGeneUrl' not in text
        or 'https://vectorbase.org/vectorbase/app/record/gene/' not in text
        or "class: 'annotation-record-link'" not in text
    ):
        errors.append('live plot transcript labels are missing VectorBase gene-record links')
    site = (ROOT / 'assets/site.js').read_text(encoding='utf-8')
    if 'installHeatmapTooltip' not in text or 'installSignalTooltip' not in text:
        errors.append('live plots are missing browser-only tooltip enhancements')
    if 'installPlotRangeSelector' not in text or 'rangeFromDisplayBins' not in text:
        errors.append('live plots are missing outward-snapped range selection')
    if 'loadPlotContract' not in site or 'configurePlotContract' not in site:
        errors.append('live plots do not load the versioned plot contract')
    if 'plotZoomHistory' not in site or 'resetPlotRange' not in site:
        errors.append('live plots are missing retained-data zoom history and reset controls')
    packaged_contract = ROOT.parent / 'AgamCs/data/plot-contract.json'
    browser_contract = ROOT / 'assets/data/plot-contract.json'
    if not packaged_contract.exists() or packaged_contract.read_bytes() != browser_contract.read_bytes():
        errors.append(
            'generated Pages plot contract is stale; run tools/sync_plot_contract.py'
        )
    return errors


def validate_query_summary_contract() -> list[str]:
    """Keep the browser summary wired to the reviewed v1 semantics."""
    summary = (ROOT / 'assets/query-summary.js').read_text(encoding='utf-8')
    site = (ROOT / 'assets/site.js').read_text(encoding='utf-8')
    index = (ROOT / 'index.html').read_text(encoding='utf-8')
    errors = []
    for fragment in (
        "SUMMARY_VERSION = 'agamcs-query-summary-v1'",
        'RANKING_ACCESSIBILITY_THRESHOLD = 0.8',
        'finite_cs_bases', 'accessible_bases', 'accessible_fraction',
        'mean_accessible_snp_density', 'longest_inaccessible_run',
        'selectTranscriptAnnotation',
    ):
        if fragment not in summary:
            errors.append(f'query-summary v1 implementation is missing {fragment!r}')
    for fragment in (
        'resolution ? annotation : null',
        'QC-failed bases remain unknown, never zero',
        'ranking reference; not a rank',
    ):
        if fragment not in site:
            errors.append(f'query-summary UI is missing {fragment!r}')
    if 'Representative-transcript gene rankings' not in index:
        errors.append('ranking section no longer identifies representative-transcript rankings')
    return errors


def validate_query_hardening() -> list[str]:
    """Pin the Phase 2 submit, over-limit, cancellation, and cooldown guards."""
    errors = []
    interaction_path = ROOT / 'assets/query-interaction.js'
    if not interaction_path.exists():
        return ['missing Pages query-interaction controller']
    interaction = interaction_path.read_text(encoding='utf-8')
    for fragment in (
        'let queryInFlight = false',
        'if (queryInFlight) return false',
        "button.setAttribute('aria-busy', 'true')",
        'finally',
    ):
        if fragment not in interaction:
            errors.append(f'query-interaction controller is missing {fragment!r}')
    site = (ROOT / 'assets/site.js').read_text(encoding='utf-8')
    for fragment in (
        'complete-locus-over-limit',
        'remains available through the CLI',
        'installQuerySubmissionGuard',
    ):
        if fragment not in site:
            errors.append(f'site query lifecycle is missing {fragment!r}')
    worker = (ROOT / 'assets/query-worker.js').read_text(encoding='utf-8')
    for fragment in (
        'const controller = new AbortController()',
        'signal: context.signal',
        'cancelQueuedRanges',
        'rangeCooldownUntil',
        'waitForRangeCooldown',
    ):
        if fragment not in worker:
            errors.append(f'query worker hardening is missing {fragment!r}')
    return errors


def main() -> None:
    errors: list[str] = []
    for page in PAGES:
        if not page.exists():
            errors.append(f'missing required page: {page.name}')
        else:
            errors.extend(validate_page(page))
    errors.extend(validate_examples())
    errors.extend(validate_accessions())
    errors.extend(validate_gene_names())
    errors.extend(validate_rankings())
    errors.extend(validate_pages_payload())
    errors.extend(validate_analytics())
    errors.extend(validate_release_versions())
    errors.extend(validate_local_preview_guard())
    errors.extend(validate_vectorbase_gene_links())
    errors.extend(validate_live_plot_renderer())
    errors.extend(validate_query_summary_contract())
    errors.extend(validate_query_hardening())
    for asset in QUERY_ASSETS:
        if not asset.exists() or asset.stat().st_size == 0:
            errors.append(f'missing browser-query asset: {asset.relative_to(ROOT)}')
    if all(asset.exists() for asset in QUERY_ASSETS[:5]):
        reference = json.loads(QUERY_ASSETS[0].read_text())
        accessibility_reference = json.loads(QUERY_ASSETS[1].read_text())
        manifest = json.loads(QUERY_ASSETS[2].read_text())
        validation = json.loads(QUERY_ASSETS[3].read_text())
        plot_validation = json.loads(QUERY_ASSETS[4].read_text())
        if not str(reference.get('templates', {}).get('source', '')).startswith('https://'):
            errors.append('browser-query source must use HTTPS')
        expected_metadata = {
            f'{chromosome}/{array}/.zarray'
            for chromosome in QUERY_CHROMOSOMES
            for array in QUERY_ARRAYS
        }
        if not expected_metadata.issubset(reference.get('refs', {})):
            errors.append('browser-query index is missing required array metadata')
        exposed = {
            key.split('/')[1]
            for key in reference.get('refs', {})
            if len(key.split('/')) >= 3
        }
        if exposed != QUERY_ARRAYS:
            errors.append(f'browser-query index exposes unexpected arrays: {sorted(exposed)}')
        expected_status_metadata = {
            f'{chromosome}/status/.zarray'
            for chromosome in QUERY_CHROMOSOMES
        }
        if not expected_status_metadata.issubset(accessibility_reference.get('refs', {})):
            errors.append('accessibility index is missing required status metadata')
        if not str(accessibility_reference.get('templates', {}).get('source', '')).startswith('https://'):
            errors.append('accessibility source must use HTTPS')
        if manifest.get('assembly') != 'AgamP4':
            errors.append('browser-query manifest has an unexpected assembly')
        if manifest.get('coordinate_convention') != '1-based inclusive':
            errors.append('browser-query manifest has an unexpected coordinate convention')
        if manifest.get('maximum_query_bases') != 200_000:
            errors.append('browser-query manifest has an unexpected query limit')
        if set(manifest.get('chromosomes', {})) != QUERY_CHROMOSOMES:
            errors.append('browser-query manifest has unexpected chromosomes')
        if set(manifest.get('arrays', ())) != QUERY_ARRAYS:
            errors.append('browser-query manifest has unexpected arrays')
        accessibility = manifest.get('accessibility', {})
        if accessibility.get('available') is not True:
            errors.append('browser-query manifest must expose live accessibility')
        if len(accessibility.get('sha256', '')) != 64:
            errors.append('browser-query manifest has an invalid accessibility checksum')
        stack = manifest.get('stack', {})
        if len(stack.get('rows', ())) != 21 or len(stack.get('species', ())) != 21:
            errors.append('browser-query manifest has invalid stack metadata')
        validation_cases = validation.get('cases', ())
        if validation.get('schema_version') != 3 or len(validation_cases) < 8:
            errors.append('browser-query release validation matrix is missing or incomplete')
        case_ids = [case.get('id') for case in validation_cases]
        if len(case_ids) != len(set(case_ids)):
            errors.append('browser-query release validation case IDs are not unique')
        if {case.get('chromosome') for case in validation_cases} != QUERY_CHROMOSOMES:
            errors.append('browser-query release validation does not cover every chromosome')
        qc_classes = {case.get('expected_qc') for case in validation_cases}
        if qc_classes != {'fully_accessible', 'partly_accessible', 'no_accessible_bases'}:
            errors.append('browser-query release validation does not cover all QC states')
        strands = {case.get('strand') for case in validation_cases if case.get('accession')}
        if strands != {-1, 1}:
            errors.append('browser-query release validation must include plus- and minus-strand genes')
        has_left_boundary = False
        has_right_boundary = False
        for case in validation_cases:
            chromosome = case.get('chromosome')
            start, end = case.get('start'), case.get('end')
            if start == 1:
                has_left_boundary = True
            if chromosome in manifest.get('chromosomes', {}) and end == manifest['chromosomes'][chromosome]['length']:
                has_right_boundary = True
            if case.get('region') != f'{chromosome}:{start}-{end}':
                errors.append(f"release validation region fields disagree: {case.get('id')}")
            if case.get('bases') != end - start + 1:
                errors.append(f"release validation base count disagrees: {case.get('id')}")
            accessible_bases = case.get('accessible_bases')
            if not isinstance(accessible_bases, int) or not 0 <= accessible_bases <= case.get('bases', -1):
                errors.append(f"release validation accessibility count is invalid: {case.get('id')}")
            validation_arrays = case.get('arrays', {})
            if set(validation_arrays) != VALIDATION_ARRAYS:
                errors.append(f"release validation has unexpected arrays: {case.get('id')}")
            for name, details in validation_arrays.items():
                digest = details.get('sha256_bytes', '')
                if len(digest) != 64 or any(character not in '0123456789abcdef' for character in digest):
                    errors.append(f"invalid browser-query SHA-256 for {case.get('id')}/{name}")
        if not has_left_boundary or not has_right_boundary:
            errors.append('browser-query release validation must include both chromosome boundaries')
        default_case = next(
            (case for case in validation_cases if case.get('id') == validation.get('default_case')),
            None,
        )
        if not default_case or plot_validation.get('region') != default_case.get('region'):
            errors.append('plot-validation fixture does not match the default release validation case')
        contract = json.loads((ROOT / 'assets/data/plot-contract.json').read_text())
        plotted_bases = default_case.get('bases', 0) if default_case else 0
        adaptive_maximum = contract.get('binning', {}).get('safety_maximum_bins', 0)
        expected_signal_bins = min(plotted_bases, adaptive_maximum)
        expected_heatmap_bins = min(plotted_bases, adaptive_maximum)
        if plot_validation.get('schema_version') != 2:
            errors.append('plot-validation fixture has an unexpected schema version')
        if plot_validation.get('signal_bins') != expected_signal_bins \
                or len(plot_validation.get('cs', ())) != expected_signal_bins:
            errors.append('plot-validation fixture has unexpected Cs display bins')
        heatmap = plot_validation.get('heatmap', ())
        if plot_validation.get('heatmap_bins') != expected_heatmap_bins \
                or len(heatmap) != 21 \
                or any(len(row) != expected_heatmap_bins for row in heatmap):
            errors.append('plot-validation fixture has unexpected heatmap dimensions')
    if errors:
        raise SystemExit('\n'.join(errors))
    print(f'Validated {len(PAGES)} Pages documents and their local assets.')


if __name__ == '__main__':
    main()
