# AgamCs

**Use AgamCs in your browser:** [open the AgamCs research portal](https://tycour.github.io/AgamCs/).

The GitHub Pages portal is the easiest way to query a current AgamP4.14
`AGAP...` gene or exact transcript isoform on 2L, 2R, 3L, 3R, or X—or to enter
AgamP4 coordinates—then inspect the figures and download exact values. It is
available without installation. The command-line tool below is intended for
local, batch, and reproducible workflows.

AgamCs retrieves conservation data for the *Anopheles gambiae* AgamP4 genome
and turns it into readable gene- or region-level figures. You can query an
`AGAP...` gene accession or genomic coordinates and generate:

- a binned conservation (Cs) and SNP-density summary;
- the original base-level Cs/SNP plot; and
- a cross-species identity heatmap with an aligned transcript model.

## Command-line installation

AgamCs is installed from the GitHub source tree for now. On macOS or Linux, the
simplest route is to create a fresh Conda environment so AgamCs and its
dependencies do not affect your other Python projects:

```commandline
conda create -n agamcs python=3.12 pip
conda activate agamcs
git clone https://github.com/Tycour/AgamCs.git
cd AgamCs
python -m pip install --upgrade pip
python -m pip install -e .
```

If you do not use Conda, create a virtual environment with any Python 3.11 or
newer interpreter:

```commandline
git clone https://github.com/Tycour/AgamCs.git
cd AgamCs
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e .
```

Check that the command was installed:

```commandline
agamcs --help
```

Query a gene by accession:

```commandline
agamcs --accessions AGAP006241 --output AGAP006241
```

Or query a one-based, inclusive AgamP4 region:

```commandline
agamcs --region 3R:5886340-5889928 --output my_region
```

Results are written below `results/<output>/`. Gene accessions are resolved
online through Ensembl/VectorBase and include the representative transcript
model. The command writes a summary PNG, a base-level Cs/SNP-density PNG, a
cross-species heatmap PNG, and the exact intermediate `temp_scores.tsv` file.
Use `--padding 500` to include flanking bases around accession-derived regions.

For development and tests, install the test extra:

```commandline
python -m pip install -e ".[test]"
python -m pytest
```

## Example figures

![Binned conservation and SNP-density summary for AGAP006241](results/AGAP006241/AGAP006241/AGAP006241_cs_snp_summary.png)

![Base-level conservation and SNP-density plot for AGAP006241](results/AGAP006241/AGAP006241/AGAP006241_cs_snp_density.png)

![AGAP006241 cross-species identity heatmap](results/AGAP006241/AGAP006241/AGAP006241_heatmap.png)

These are static PNGs produced by the CLI. The Pages portal renders the same
scientific views as interactive browser SVGs and also provides exact TSV and
SVG downloads.

### How to read the plots

Cs is calculated at each genomic base, while SNP density is a 20 bp sliding-
window average assigned to each base. This summary then groups the displayed
region into up to 240 bins: the dark-blue line is median Cs, the blue ribbons
show the 25th–75th and 10th–90th percentiles, and green is mean SNP density over
QC-passing bases in each bin. Grey marks bases that failed the Ag1000G
accessibility mask; their SNP density is unknown, not zero. The compact
transcript uses outlined light-blue UTRs, taller dark-blue CDS blocks, and thin
lines for introns. Dashed guides bracket every CDS segment in both signal
panels.

[CNEr](https://doi.org/10.1371/journal.pcbi.1006940) is a toolkit that finds
highly conserved regions by scanning genome alignments for windows above chosen
sequence-identity thresholds. Here it used 30 bp and 50 bp windows; detected
interval identities were then mapped onto every covered AgamP4 base. The
heatmap therefore has per-base columns, but neighbouring bases can share one
window-derived identity value. Viridis shows the assigned identity percentage;
charcoal means no interval was detected, not measured 0% identity. Thin
dark-blue blocks and dashed guides mark CDS segments. Species-label colours
progress from the *A. gambiae* complex through other *Anopheles* to the
outgroups; these are broad visual groups, not numeric distance bins.

The tree is a compact, unscaled, evidence-bounded cladogram loaded from the
shared genome-code topology in `AgamCs/data/species_topology.json`. It retains
only cited broad relationships and uses polytomies wherever the conservation
archive does not provide an authoritative split. In particular, heatmap row
order is not used to resolve the introgressed *gambiae* complex. Horizontal
branch lengths are arbitrary and must not be read as evolutionary time or
substitutions per site. The broad topology follows the molecular context in
[Neafsey et al.](https://doi.org/10.1126/science.1258522), while the conservative
handling of the *gambiae* complex reflects the introgression demonstrated by
[Fontaine et al.](https://doi.org/10.1126/science.1258524). The four label
colours remain visual groups rather than clades or distance bins: dark purple =
*gambiae* complex; purple = other *Anopheles*; pink = New World *Anopheles*;
orange = outgroups.

Method details are available in the
[original paper](https://doi.org/10.3390/insects12020097) and the
[source-pipeline documentation](https://github.com/nkran/AgamP4_conservation_score#storage).

## Batch queries and highlights

Process several genes at once:

```commandline
agamcs --accessions AGAP008118 AGAP001234 --output accession_batch
agamcs --accessions-file accessions.txt --output accession_batch
```

The accession file should contain one `AGAP...` ID per line. Each gene gets its
own subdirectory. `--highlight` accepts absolute genomic `start-end` ranges.

For accession queries, figures are displayed 5′→3′ and positions are relative
to the transcription start site, including minus-strand genes. Coordinate-only
queries start at 0 bp relative to the requested interval.

## Data and SNP quality control

By default, AgamCs uses a local `data/AgamP4_conservation.h5` if present and
otherwise reads only the requested interval from the public Zenodo archive.
For fully offline use, download
[`AgamP4_conservation.h5`](https://zenodo.org/record/4304586/files/AgamP4_conservation.h5)
to the `data` directory and use `--data-source local`.

Every new query also carries the published Ag1000G Phase 2 AR1 accessibility
status. AgamCs never changes the archived SNP-density values: it masks failed
QC positions only in the figure and shades them grey. Older TSVs without QC
columns are matched back to the bundled accessibility track when plotted, so
missing QC metadata is never silently treated as PASS. Technical provenance
and the rebuild procedure are in
[`docs/accessibility-track.md`](docs/accessibility-track.md).

## Web portal

Try the [no-install GitHub Pages portal](https://tycour.github.io/AgamCs/).
Its versioned VectorBase-68 index resolves 13,097 AgamP4.14 genes and 15,317
transcript isoforms on the five supported chromosomes; it uses the published
AgamP4 conservation arrays. A bare gene ID retains
the representative-transcript default while showing every isoform as aligned
annotation rows beneath both plots; an exact ID such as `AGAP000040-RA` uses
that isoform's transcript span, exons and CDS bounds. Gene, transcript and
coordinate queries read only the required `Cs`, raw SNP-density, species-stack,
and separate QC ranges from the Zenodo data and render live browser plots;
featured examples remain as shortcuts in the same query form. Queries are
limited to 20,000 bases, and failed accessibility/QC positions remain separate
from the raw SNP-density values and are shown as unknown. Publishing and
implementation details are documented in
[`docs/github-pages-prototype.md`](docs/github-pages-prototype.md).
For larger intervals, custom highlight ranges, local-HDF5 use, and fully
reproducible batch output, use the CLI.

## Optional annotation files

Online accession lookup is the normal workflow. For offline or pinned
coordinates, `--annotation` accepts a VectorBase-style GFF3 (including
exon/CDS structure) or a CSV/TSV with either a `region` column or
`chromosome`, `start`, and `end` columns.

```text
accession	region
AGAP008118	3R:5886340-5889928
```

## Tests

```commandline
python -m pytest -q
```
