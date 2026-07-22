# Ag1000G Phase 2 AR1 accessibility companion track

## Purpose and query semantics

`AgamCs/data/Ag1000G_phase2_AR1_accessibility.h5` annotates each queried
AgamP4 base without modifying the conservation archive. In particular,
`snp_density_s` retains its published numeric value in TSV output.

The interpretation rule is:

| `is_accessible` | `quality_status` | Stored SNP density | Interpretation in plots |
|---|---|---|---|
| true | `PASS` | zero | Callable zero; displayed as zero |
| true | `PASS` | non-zero | Callable signal; displayed normally |
| false | one or more FILTER labels | any value | Unknown/uncertain; masked and shaded grey |

Non-PASS rows describe site accessibility/QC. They must not be interpreted as
confirmed variants.

## Provenance

- Release: [Ag1000G Phase 2 AR1](https://www.malariagen.net/data_package/ag1000g-phase-2-ar1/), released 6 November 2017.
- Assembly and coordinates: AgamP4, one-based inclusive.
- Source file: [public `accessibility/accessibility.h5`](https://ngs.sanger.ac.uk/production/ag1000g/phase2/AR1/accessibility/accessibility.h5).
- Source HTTP metadata used for this build: 2,005,427,410 bytes; last modified
  `2016-07-04T16:45:20Z`.
- Companion SHA-256:
  `00fc146b977233c537d6189db891be55153038033d922014804ef5210acb260a`.

The source URL, release, assembly, source size, source modification time, schema
version, and ordered bit fields are also stored as root HDF5 attributes.

## Status-byte schema

Each uncompressed byte preserves all source booleans. A set FILTER bit means
that the position failed that published criterion.

| Bit | Source array | TSV label | Published criterion |
|---:|---|---|---|
| 0 | `is_accessible` | `PASS` when set and no filter bit is set | Position is accessible |
| 1 | `filter_dust` | `RepeatDUST` | Repeat predicted by DUST |
| 2 | `filter_high_coverage` | `HighCoverage` | More than 20 samples have coverage over twice the chromosome mode |
| 3 | `filter_high_mq0` | `HighMQ0` | More than one sample has over 10% ambiguously mapped (MQ0) reads |
| 4 | `filter_low_coverage` | `LowCoverage` | More than 114 samples have coverage below half the chromosome mode |
| 5 | `filter_low_mq` | `LowMQ` | More than 114 samples have average mapping quality below 30 |
| 6 | `filter_n` | `RefN` | Reference base is N |
| 7 | `filter_no_coverage` | `NoCoverage` | More than one sample has no coverage |

Multiple failed filters are retained as semicolon-separated labels. The
builder rejects any source chunk in which `is_accessible` differs from the
logical complement of all seven filter arrays.

## Storage and coverage

The five chromosome-arm datasets use unsigned bytes, 65,536-base chunks,
shuffle, and gzip level 9. The 230,466,657 input status bytes compress to a
5,578,437-byte HDF5 file. Queries open it with HDF5 mode `r` and decompress only
the chunks overlapping the requested interval.

| Arm | Bases | Accessible bases |
|---|---:|---:|
| 2L | 49,364,325 | 28,193,050 |
| 2R | 61,545,105 | 39,534,863 |
| 3L | 41,963,435 | 24,946,488 |
| 3R | 53,200,684 | 32,436,343 |
| X | 24,393,108 | 14,606,989 |

Counts for every individual filter are stored as chromosome-group attributes.

## Rebuild and validation

From the repository root:

```commandline
python tools/build_accessibility_track.py
python -m pytest -q
shasum -a 256 AgamCs/data/Ag1000G_phase2_AR1_accessibility.h5
```

The builder accepts an offline mirror through `--source`. It validates source
array presence, boolean types, equal lengths, one-based `pos` endpoints, and
agreement between the accessibility mask and filter bits. Tests verify the
status encoding, read-only reader, quality labels, preservation of density
values, and missing-versus-callable-zero plot aggregation.
