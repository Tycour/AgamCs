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

## Publish from GitHub

After these files are merged into the repository's default branch:

1. Open **Settings → Pages** in the GitHub repository.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the default branch and the `/docs` folder, then save.
4. Wait for the Pages deployment shown under **Actions** to complete.

No secret, server, package install, or JavaScript build is required.

## Prototype boundary

- Included: responsive interface, one precomputed accession, both current plot
  types, PNG downloads, interpretation/QC guidance, and keyboard-accessible tabs.
- Not included: arbitrary accessions or coordinates, live Ensembl lookup,
  server-side plotting, or direct browser reads from the large HDF5 archive.

The next practical increment is a small catalogue of precomputed examples and
their TSV files. Arbitrary live queries should remain in the CLI/Shiny service
until the data is repackaged into a browser-efficient format and the plotting
logic is intentionally ported to JavaScript or WebAssembly.
