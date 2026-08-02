"""Validate the self-contained assets and essential structure of the Pages site."""

from __future__ import annotations

import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

from build_pages_accession_index import validate_index
from build_pages_examples import load_catalogue, verify_assets


ROOT = Path(__file__).resolve().parents[1] / 'docs'
PAGES = (ROOT / 'index.html', ROOT / '404.html')
EXAMPLES_PATH = ROOT / 'examples.json'
ACCESSION_INDEX_PATH = ROOT / 'assets/data/accession-index.json'
QUERY_ASSETS = (
    ROOT / 'assets/data/score-reference.json',
    ROOT / 'assets/data/accessibility-reference.json',
    ROOT / 'assets/data/query-manifest.json',
    ROOT / 'assets/data/query-validation.json',
    ROOT / 'assets/data/plot-validation.json',
    ROOT / 'assets/query-worker.js',
    ROOT / 'assets/live-plots.js',
    ROOT / 'assets/accession-lookup.js',
    ACCESSION_INDEX_PATH,
)
QUERY_ARRAYS = {'Cs', 'snp_density', 'stack'}
VALIDATION_ARRAYS = QUERY_ARRAYS | {'status'}
QUERY_CHROMOSOMES = {'2L', '2R', '3L', '3R', 'X'}
REQUIRED_META_NAMES = {'description', 'theme-color', 'twitter:card'}
REQUIRED_META_PROPERTIES = {'og:type', 'og:title', 'og:description', 'og:url', 'og:image'}


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
        if 'Early research prototype' not in page.read_text(encoding='utf-8'):
            errors.append('index.html: early prototype status is not stated')
        required_ids = {
            'benchmark-form', 'live-accession', 'accession-query-panel',
            'coordinate-query-panel', 'resolved-accession',
        }
        if missing_ids := required_ids - checker.ids:
            errors.append(f'index.html: missing live-query controls: {sorted(missing_ids)}')
    return errors


def validate_examples() -> list[str]:
    """Ensure every catalogue example points to committed image assets."""
    try:
        catalogue = load_catalogue(EXAMPLES_PATH)
    except (OSError, ValueError) as error:
        return [f'could not read examples.json: {error}']
    return [f'missing generated asset: {path.relative_to(ROOT)}'
            for path in verify_assets(catalogue['examples'], ROOT / 'assets')]


def validate_accessions() -> list[str]:
    """Validate the pinned index and its overlap with precomputed examples."""
    try:
        index = json.loads(ACCESSION_INDEX_PATH.read_text(encoding='utf-8'))
        validate_index(index)
        catalogue = load_catalogue(EXAMPLES_PATH)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        return [f'could not validate accession index: {error}']

    errors = []
    if len(index['accessions']) != 15:
        errors.append('accession index must contain the 15 reviewed prototype records')
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


def main() -> None:
    errors: list[str] = []
    for page in PAGES:
        if not page.exists():
            errors.append(f'missing required page: {page.name}')
        else:
            errors.extend(validate_page(page))
    errors.extend(validate_examples())
    errors.extend(validate_accessions())
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
        if manifest.get('maximum_query_bases') != 20_000:
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
        validation_arrays = validation.get('arrays', {})
        if set(validation_arrays) != VALIDATION_ARRAYS:
            errors.append('browser-query validation fixture has unexpected arrays')
        for name, details in validation_arrays.items():
            digest = details.get('sha256_bytes', '')
            if len(digest) != 64 or any(character not in '0123456789abcdef' for character in digest):
                errors.append(f'invalid browser-query SHA-256 for {name}')
        if plot_validation.get('region') != validation.get('region'):
            errors.append('plot-validation fixture does not match query validation region')
        if len(plot_validation.get('cs', ())) != 240:
            errors.append('plot-validation fixture has unexpected Cs display bins')
        heatmap = plot_validation.get('heatmap', ())
        if len(heatmap) != 21 or any(len(row) != 500 for row in heatmap):
            errors.append('plot-validation fixture has unexpected heatmap dimensions')
    if errors:
        raise SystemExit('\n'.join(errors))
    print(f'Validated {len(PAGES)} Pages documents and their local assets.')


if __name__ == '__main__':
    main()
