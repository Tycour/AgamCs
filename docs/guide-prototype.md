# NGG guide exploration prototype

This branch adds an optional guide table, separate conservation/variation context, and a selected-guide/PAM overlay on both existing figures and their SVG exports. It replaces the notable 100-base windows panel. The older notable-window calculation remains in the existing versioned query reports for compatibility; guide results have dedicated TSV and JSON exports. Guide selection is not yet included in general query permalinks.

## Accepted scientific behaviour

- General guide exploration, with no gene-drive-specific assumptions.
- 20-base spacers and NGG PAMs only. Candidate discovery and off-target evidence both use NGG for this release. This narrower search does not assess alternative PAMs or DNA/RNA bulges.
- CRISPOR alone supplies ranking and predictions. Preserve its native export order: descending MIT specificity, including its tie order. No weighted combination with Cs, SNP density or activity; no hard activity or sequence-quality filter.
- Show every complete spacer plus PAM within the queried interval. No gene/exon/transcript filter. Ranks in a subinterval retain their original source-batch numbers.
- Keep guides with multiple exact reference matches visible with warnings. Exact-match counts include the intended site, while the exported mismatch histogram excludes it. Missing specificity is unknown; do not infer unique targeting from it.
- Display Doench 2016 activity predictions without implying validation in Anopheles. GC, poly-T and CRISPOR motif warnings are contextual.
- Show separate spacer (20-base) and PAM (3-base) Cs/SNP summaries. Cs uses finite positions. SNP uses finite values at accessible focal bases (`status & 1`), with explicit denominators. The archived SNP value is already a centred 20-base rolling density: its mean is not a guide-specific variant count, and does not establish population invariance. No additional accessibility threshold hides guides.
- No candidate variants other than the supplied reference are searched. Unplaced/alternative sequence records remain included in the full reference. Assembly redundancy and activity in the intended experimental system remain unvalidated.

## Why CRISPOR

The full-reference benchmark found the same 60 candidates with FlashFry and CRISPOR in one 1 kb region. FlashFry discovery/scoring took about 8 seconds; CRISPOR took about 18 seconds under different resource limits. This is not evidence that one is biologically more accurate. CRISPOR was selected for this bounded prototype because it supplies a native guide ordering, activity predictions and detailed off-target exports without creating an AgamCs ranking formula. Large-catalogue throughput has not been established.

CRISPOR's documented default is specificity ordering: https://github.com/maximilianh/crisporWebsite/blob/master/manual/manual.md . The source in the actual installed image was also inspected; its `mergeGuideInfo` sorts descending MIT specificity by default. The catalogue records the image digest and source checksum.

The two original NGG count discrepancies are accounted for by CRISPOR rows containing unknown reference bases (`N`) on AgamP4_UNKN. They are not evidence of two confirmed biological off-targets. Such rows are retained in CRISPOR's native scores/counts and flagged for affected guides. The prototype does not recalculate those scores or claim exhaustive equivalence with FlashFry.

## Real, bounded coverage

| Interval | Purpose | Guides |
|---|---|---:|
| 2L:1000000–1000999 | Original repetitive benchmark | 60 |
| 2L:28585064–28586748 | AGAP006241, positive-strand gene | 197 |
| 3L:3855186–3858609 | AGAP010449, negative-strand gene | 249 |
| 3R:38377342–38377436 | AGAP009678, short noncoding interval | 9 |

Coordinates are 1-based inclusive. All 515 guides were checked against the query reference sequence on the correct strand, and independent enumeration verifies every complete NGG site was represented. Results outside one of these covered intervals explicitly say unavailable; they do not imply absence of guides. A query extending beyond a covered interval is unavailable rather than silently returning a partial list. Scores search all 153 records in the supplied reference, not just these intervals.

## Rebuild and resume

Large data, tool images and raw results remain at `/Volumes/Thomas/codex/AgamCs-guide-design`. The verified genome indices are reused; they must not be rebuilt for a UI change. The CRISPOR genome index is inside the external APFS sparse image, mounted at `/Volumes/AgamCsBench` (see external `STORAGE.md`).

The four bounded runs and their per-region completion records are in `prototype/`. `prototype/run.py` skips completed intervals, has a ten-minute per-command timeout and a 4 GiB internal free-space guard, and removes restored task Docker images on exit. Run only after mounting the image. The CRISPOR command uses `--pam NGG --mm 4 --minAltPamScore 101 --effScores fusi,doench` with a fresh per-region temporary directory. The alternative-PAM threshold excludes their scores; the importer checks every off-target PAM rather than assuming the option worked. Source checksums and exact command-file checksums are included in the catalogue.

To regenerate the compact browser catalogue from saved outputs, from this worktree:

```sh
python3 tools/build_guide_catalogue.py /Volumes/Thomas/codex/AgamCs-guide-design/prototype
```

This reads outputs and does not run searches. Browser data are in `docs/assets/data/guide-catalogue.json`. No full FASTA, native index or Docker image belongs in Git.

To preview:

```sh
python3 -m http.server 8877 --bind 127.0.0.1 --directory docs
```

Open http://127.0.0.1:8877/ and choose one of the four guide example buttons. They run an ordinary query and enable guide exploration. Cs/SNP data still use the established genomic data retrieval; no synthetic context is presented. Select a numbered guide, enable the figure overlay, and use “Zoom figures to guide” for closer inspection.

## Verification and remaining release work

Node tests cover exact context against the existing interval summarizer, missing versus zero data, reverse-strand geometry, query containment, native order, repeated-match warnings, coverage availability, export provenance and overlay clipping. Import checks validate sequences, completeness and off-target count reconciliation. Existing Pages checks and plot contract checks remain required. Browser checks exercise actual queries, selection, overlay, zoom, export, unavailable/empty states and mobile layout.

This is a reviewable prototype, not a genome-wide release. Before expanding coverage: assess catalogue throughput/output size, choose the immutable remote data packaging, review the UI and scientific limitations, and validate further representative regions. There is no requirement to repeat installation or the successful genome indexing.
