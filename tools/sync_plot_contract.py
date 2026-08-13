#!/usr/bin/env python3
"""Synchronize the generated GitHub Pages copy of the plot contract."""

from __future__ import annotations

import argparse
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'AgamCs/data/plot-contract.json'
TARGET = ROOT / 'docs/assets/data/plot-contract.json'


def synchronize(check=False):
    """Copy the canonical contract or fail if the generated copy has drifted."""
    source = SOURCE.read_bytes()
    target = TARGET.read_bytes() if TARGET.exists() else None
    if check:
        if target != source:
            raise SystemExit(
                'Generated Pages plot contract is stale; run '
                'python tools/sync_plot_contract.py.'
            )
        return False
    if target == source:
        return False
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_bytes(source)
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--check', action='store_true',
        help='Fail instead of writing when the Pages copy differs.',
    )
    args = parser.parse_args()
    changed = synchronize(check=args.check)
    if changed:
        print(f'Synchronized {TARGET.relative_to(ROOT)} from {SOURCE.relative_to(ROOT)}.')


if __name__ == '__main__':
    main()
