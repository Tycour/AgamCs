# GitHub Pages prototype

This directory contains a zero-runtime-cost, static prototype of the AgamCs web
experience. It deliberately uses a precomputed result: GitHub Pages cannot run
the Python/Shiny server in `AgamCs/app.py`.

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

## Prototype boundary

- Included: responsive interface, one precomputed accession, both current plot
  types, PNG downloads, interpretation/QC guidance, keyboard-accessible tabs,
  and an isolated direct-HDF5 benchmark for small coordinate intervals.
- Not included: arbitrary accessions or coordinates, live Ensembl lookup,
  server-side plotting, or a full interactive browser query experience.

The example catalogue is now accompanied by an isolated Stage 5 feasibility
reader. It accepts a coordinate interval of at most 20,000 bases, reads only
the `Cs` and unchanged `snp_density` chunks through HTTP range requests, and
reports cold/warm performance. Stage 6 accepts this direct HDF5 route for the
next coordinate-only prototype without repackaging the source archive; it does
not yet replace the precomputed explorer.

Rebuild its compact reference and pinned local validation hashes with:

```bash
.venv/bin/python tools/build_pages_query_assets.py
```

Use `--verify` to confirm that committed query assets match the bundled
Kerchunk reference and, when available, the local HDF5. The outcome and the
decision gate for any browser-optimized derivative are documented in
[`browser-hdf5-feasibility.md`](browser-hdf5-feasibility.md).
