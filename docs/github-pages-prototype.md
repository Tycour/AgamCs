# GitHub Pages prototype

This directory contains the zero-runtime-cost, static AgamCs web experience.
The client resolves genes from a committed annotation index and retrieves only
the required scientific-data byte ranges in the browser; there is no separate
server-hosted interface.

## Preview locally

From the repository root:

```bash
python3 -m http.server 8000 --directory docs
```

Then open `http://127.0.0.1:8000`.

Before committing a Pages change, verify the documents and local assets:

```bash
python3 tools/check_pages_site.py
```

GitHub Actions runs the same check for relevant pull requests and after Pages
changes reach `main`.

The Pages workflow also checks the browser JavaScript and the accession
resolver's current, missing, retired, and ambiguous-ID behaviour with Node 22.
It also checks coordinate bounds, full-download refusal, transient network
handling, decoded-cache invalidation, and the final partial HDF5 chunk.

The published interface has one query portal. Versioned accessions, manual
coordinates, and the labelled precomputed-example shortcuts all use the same
browser reader and render into the same result area; there is no separate
static demo form.

## Rebuild the example catalogue

[`examples.json`](examples.json) pins each accession's AgamP4 coordinates and
representative transcript structure. It therefore avoids an online accession
lookup and does not silently change when upstream annotations are updated.
With a Python 3.11+ environment containing AgamCs' normal plotting
dependencies and a local HDF5 file, rebuild every example with:

```bash
.venv/bin/python tools/build_pages_examples.py --data-source local
```

The command writes only the profile and heatmap PNGs below
`docs/assets/examples/`. To rebuild one accession, add for example
`--accession AGAP008118`; to check the committed assets without reading score
data, use `--verify`.

## Publish from GitHub

After these files are merged into the repository's default branch:

1. Open **Settings → Pages** in the GitHub repository.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the default branch and the `/docs` folder, then save.
4. Wait for the Pages deployment shown under **Actions** to complete.

No secret, server, package install, or JavaScript build is required.

Every Pages release must bump the shared version in `index.html`, `site.js`,
and `query-worker.js`. These query-string versions prevent an older cached
worker or manifest from surviving a normal deployment refresh.

## Refresh the versioned accession index

The live browser form uses a committed index containing all 13,097 AGAP genes
and 15,317 transcript isoforms on the five AgamP4 chromosome arrays exposed by
the browser data. Bare gene accessions retain the representative-transcript
default and show every isoform as an aligned annotation row beneath both live
plots; exact transcript IDs select their own span, exons and CDS bounds. The
client does not contact Ensembl or VectorBase at query time. Download the
official VectorBase release-68 GFF and rebuild the index with:

```bash
curl -L --fail --output /tmp/VectorBase-68_AgambiaePEST.gff \
  https://vectorbase.org/common/downloads/release-68/AgambiaePEST/gff/data/VectorBase-68_AgambiaePEST.gff
.venv/bin/python tools/build_pages_accession_index.py \
  --gff /tmp/VectorBase-68_AgambiaePEST.gff
```

The reviewed source SHA-256 is
`916a1e0e4d4613d36be31dc03c53871f6f62c94f4d8bc4662d0002131658c0c7`.
Use `--verify` to validate the committed index without retaining the 25 MB GFF.
Refreshes are manual: review the new release, compare the regression records,
bump `index_version`, and publish through normal review. Never update the
committed index silently. Unknown accessions stay unresolved; retired and
ambiguous mappings must be recorded explicitly before they can produce
tailored messages.

## Prototype boundary

- Included: four precomputed examples; a versioned 13,097-gene and
  15,317-transcript AgamP4.14 index covering 2L, 2R, 3L, 3R, and X; direct
  transcript-ID input, an isoform selector, and stacked all-isoform annotation
  tracks for gene queries; independent manual
  coordinates; live `Cs`, unchanged SNP density,
  species-stack and accessibility/QC queries up to the 200,000-base browser
  query limit; interactive browser plots; exact TSV downloads; and explicit
  annotation provenance.
- Not included: genes on unplaced/unknown scaffolds, IDs absent from the
  VectorBase-68 annotation, live Ensembl lookup, intervals over 200,000 bases,
  or server-side plotting.

The example catalogue is accompanied by the Stage 7–9 browser client. It
accepts a versioned AgamP4.14 gene or transcript accession, or an independent
AgamP4 interval within the 200,000-base browser query limit. It reads only the
required `Cs`, unchanged `snp_density`, species
`stack`, and separate accessibility chunks through HTTP range requests.
Decoding runs in a persistent worker with a bounded in-memory chunk cache, so
repeat and nearby queries can reuse data without freezing the interface. Exact
values are previewed, plotted interactively, and downloadable as TSV.

The 200,000-base inclusive limit is an engineering/browser ceiling, not a
biological threshold. It supports 13,080 of the 13,097 indexed genes
(99.8702%); 17 complete gene loci are longer and remain CLI-only. Plot display
resolution stays fixed at 240 signal bins and 500 heatmap bins, while the TSV
retains every queried base and all 21 exact stack values. The worker accepts
only HTTP 206 range responses, continues to refuse HTTP 200 full-file
responses, and preserves the archived raw SNP-density plus separate
QC-failed/unknown semantics.

The browser reads a generated manifest for chromosome bounds, array names,
coordinate convention, source provenance, and the query limit. Accessibility
is kept separate from raw SNP density; inaccessible positions are presented as
unknown and never rewritten as zeros or proof of invariance.

Rebuild its compact reference and pinned local validation hashes with:

```bash
.venv/bin/python tools/build_pages_query_assets.py
```

Use `--verify` to confirm that committed query assets match the bundled
Kerchunk reference and, when available, the local HDF5. The outcome and the
decision gate for any browser-optimized derivative are documented in
[`browser-hdf5-feasibility.md`](browser-hdf5-feasibility.md).
The Step 10 release matrix and remaining publication gate are recorded in
[`browser-release-validation.md`](browser-release-validation.md).
