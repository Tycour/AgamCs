"""Build the checked-in static examples for the GitHub Pages prototype.

The manifest pins accession coordinates and transcript annotations so rebuilding
does not need an online Ensembl lookup or change when upstream annotations move.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import tempfile
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = REPOSITORY_ROOT / 'docs' / 'examples.json'
DEFAULT_OUTPUT_ROOT = REPOSITORY_ROOT / 'docs' / 'assets'
CACHE_ROOT = Path(tempfile.gettempdir()) / 'agamcs-pages-matplotlib'
REQUIRED_EXAMPLE_KEYS = {
    'accession', 'region', 'transcript_id', 'strand', 'feature_summary',
    'description', 'qc_note', 'annotation', 'assets',
}
REQUIRED_ASSET_KEYS = {'summary', 'heatmap'}


def load_accession_list(path: Path) -> list[str]:
    """Read a commented accession list in the same format as the CLI."""
    accessions = []
    for line in path.read_text(encoding='utf-8').splitlines():
        content = line.split('#', 1)[0].replace(',', ' ')
        accessions.extend(content.split())
    return accessions


def load_catalogue(path: Path) -> dict:
    """Load and validate the small, pinned catalogue manifest."""
    catalogue = json.loads(path.read_text(encoding='utf-8'))
    if catalogue.get('schema_version') != 1:
        raise ValueError('Unsupported or missing examples.json schema_version.')
    examples = catalogue.get('examples')
    if not isinstance(examples, list) or not examples:
        raise ValueError('examples.json must contain at least one example.')

    accessions = set()
    for example in examples:
        missing = REQUIRED_EXAMPLE_KEYS - example.keys()
        if missing:
            raise ValueError(f"Example is missing fields: {', '.join(sorted(missing))}")
        accession = example['accession']
        if accession in accessions:
            raise ValueError(f'Duplicate accession in examples.json: {accession}')
        accessions.add(accession)
        if not isinstance(example['annotation'].get('exons'), list):
            raise ValueError(f'{accession} annotation must contain an exon list.')
        asset_keys = set(example['assets'])
        if asset_keys != REQUIRED_ASSET_KEYS:
            raise ValueError(f'{accession} assets must be exactly {sorted(REQUIRED_ASSET_KEYS)}.')
        for relative_path in example['assets'].values():
            asset_path = Path(relative_path)
            if asset_path.is_absolute() or '..' in asset_path.parts or asset_path.suffix != '.png':
                raise ValueError(f'{accession} has an unsafe PNG asset path: {relative_path!r}')
    return catalogue


def selected_examples(catalogue: dict, accessions: list[str]) -> list[dict]:
    """Return all examples or a user-selected subset in manifest order."""
    selected = set(accessions)
    examples = [example for example in catalogue['examples'] if not selected or example['accession'] in selected]
    missing = selected - {example['accession'] for example in examples}
    if missing:
        raise ValueError(f'Unknown example accession(s): {", ".join(sorted(missing))}')
    return examples


def output_paths(example: dict, output_root: Path) -> dict[str, Path]:
    """Resolve a manifest's safe asset paths below one output root."""
    return {name: output_root / relative_path for name, relative_path in example['assets'].items()}


def verify_assets(examples: list[dict], output_root: Path) -> list[Path]:
    """Return missing generated assets for a catalogue subset."""
    return [path for example in examples for path in output_paths(example, output_root).values() if not path.exists()]


def build_example(example: dict, output_root: Path, data_source: str) -> None:
    """Use the normal plotting pipeline, then copy its two web-facing outputs."""
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault('MPLCONFIGDIR', str(CACHE_ROOT))
    from AgamCs.main import process_region

    with tempfile.TemporaryDirectory(prefix='agamcs-pages-example-') as temporary_directory:
        process_region(
            example['region'],
            example['accession'],
            keep_tsv=False,
            results_root=temporary_directory,
            gene_annotation=example['annotation'],
            data_source=data_source,
        )
        generated = Path(temporary_directory) / example['accession']
        sources = {
            'summary': generated / f"{example['accession']}_cs_snp_summary.png",
            'heatmap': generated / f"{example['accession']}_heatmap.png",
        }
        for name, destination in output_paths(example, output_root).items():
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(sources[name], destination)
            print(f'Wrote {destination.relative_to(REPOSITORY_ROOT)}')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument('--output-root', type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument('--accession', action='append', default=[], help='Build one catalogue accession; repeat as needed.')
    parser.add_argument('--data-source', choices=('local', 'remote', 'auto'), default='local')
    parser.add_argument('--verify', action='store_true', help='Check that expected generated files exist without rebuilding.')
    parser.add_argument('--dry-run', action='store_true', help='Print the selected examples without reading score data.')
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    catalogue = load_catalogue(args.manifest)
    examples = selected_examples(catalogue, args.accession)
    output_root = args.output_root.resolve()
    if args.verify:
        missing = verify_assets(examples, output_root)
        if missing:
            raise SystemExit('Missing generated asset(s):\n' + '\n'.join(str(path) for path in missing))
        print(f'Verified {len(examples)} catalogue example(s).')
        return
    for example in examples:
        print(f"Building {example['accession']}: {example['region']} ({example['feature_summary']})")
        if not args.dry_run:
            build_example(example, output_root, args.data_source)


if __name__ == '__main__':
    main()
