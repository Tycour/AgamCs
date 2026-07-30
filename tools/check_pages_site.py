"""Validate the self-contained assets and essential structure of the Pages site."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse

from build_pages_examples import load_catalogue, verify_assets


ROOT = Path(__file__).resolve().parents[1] / 'docs'
PAGES = (ROOT / 'index.html', ROOT / '404.html')
EXAMPLES_PATH = ROOT / 'examples.json'
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
    return errors


def validate_examples() -> list[str]:
    """Ensure every catalogue example points to committed image assets."""
    try:
        catalogue = load_catalogue(EXAMPLES_PATH)
    except (OSError, ValueError) as error:
        return [f'could not read examples.json: {error}']
    return [f'missing generated asset: {path.relative_to(ROOT)}'
            for path in verify_assets(catalogue['examples'], ROOT / 'assets')]


def main() -> None:
    errors: list[str] = []
    for page in PAGES:
        if not page.exists():
            errors.append(f'missing required page: {page.name}')
        else:
            errors.extend(validate_page(page))
    errors.extend(validate_examples())
    if errors:
        raise SystemExit('\n'.join(errors))
    print(f'Validated {len(PAGES)} Pages documents and their local assets.')


if __name__ == '__main__':
    main()
