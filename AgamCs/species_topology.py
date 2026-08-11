"""Load and validate the shared, evidence-bounded species topology."""

from __future__ import annotations

import json
from pathlib import Path


SPECIES_TOPOLOGY_PATH = Path(__file__).with_name('data') / 'species_topology.json'


def topology_tip_codes(node: str | dict) -> list[str]:
    """Return genome-code tips in their declared display order."""
    if isinstance(node, str):
        return [node]
    if not isinstance(node, dict) or not isinstance(node.get('children'), list):
        raise ValueError('topology nodes must be genome codes or child-bearing objects')
    tips = []
    for child in node['children']:
        tips.extend(topology_tip_codes(child))
    return tips


def validate_species_topology(
    topology: dict, expected_codes: list[str] | tuple[str, ...] | None = None,
) -> dict:
    """Reject malformed, duplicated, missing, or unexpectedly ordered tips."""
    if topology.get('schema_version') != 1:
        raise ValueError('unsupported species-topology schema')
    tips = topology_tip_codes(topology.get('tree'))
    duplicates = sorted({code for code in tips if tips.count(code) > 1})
    if duplicates:
        raise ValueError(f'duplicate species-topology tips: {duplicates}')
    if expected_codes is not None and tips != list(expected_codes):
        raise ValueError('species-topology tips do not match the expected genome-code order')
    return topology


def load_species_topology(path: Path = SPECIES_TOPOLOGY_PATH) -> dict:
    """Load the canonical package-data topology."""
    return validate_species_topology(json.loads(path.read_text()))


SPECIES_TOPOLOGY = load_species_topology()
SPECIES_TREE = SPECIES_TOPOLOGY['tree']
