# AgamP4 guide catalogue scale benchmark

Measured 17 October 2026. Machine-readable evidence: [guide-scale-benchmark.json](guide-scale-benchmark.json). Large inputs, raw exports, compressed sample catalogues, logs and completion records remain in `/Volumes/Thomas/codex/AgamCs-guide-design/scale-benchmark/`.

**Distribution is practical; a complete scoring build needs more work.** The website's five chromosome arms contain 21,620,583 complete NGG candidate loci. Five 10 kb scoring samples project to about 1.61 GB of compressed browser catalogue data, but approximately 24 days of serial CRISPOR scoring under the tested two-CPU configuration. A nested-batch check also found that native CRISPOR's definition of an intended target changes some counts and scores with input length. That behaviour must be addressed before generating a production catalogue.

## Exact candidate counts

The supplied reference checksum matches the prototype: `dd0d2bf6fd9913a7887873753306bd14db399552a5703a099aea0af055c8b505`.

Enumeration counts each genomic locus and strand with a complete A/C/G/T 20-base spacer and NGG PAM. It includes overlapping PAMs, excludes targets containing N, and does not deduplicate spacer sequences or score these sites.

| Website chromosome | Reference bases | Candidate loci |
|---|---:|---:|
| 2L | 49,364,325 | 4,635,592 |
| 2R | 61,545,105 | 5,914,055 |
| 3L | 41,963,435 | 3,789,640 |
| 3R | 53,200,684 | 4,913,824 |
| X | 24,393,108 | 2,367,472 |
| **Website total** | **230,466,657** | **21,620,583** |

All 153 supplied FASTA records together contain 24,513,729 candidate loci. The additional records remain in every off-target search; they do not need their own candidate catalogue while the website only accepts queries on the five arms above.

Across the arms, median 10 kb tiles own approximately 921–996 candidates. Complete, aligned 200 kb tile spans have maxima of 23,040–24,204 owned sites, depending on chromosome. Ownership uses the lower genomic coordinate of the complete target, so a few sites near a span's far edge may extend outside it. A production query must still require the complete spacer plus PAM to lie within the requested interval.

## Measured scoring batches

The existing full-reference BWA/2bit indexes were reused. No index was rebuilt. CRISPOR used the same pinned image and source as the prototype, NGG candidates and off-target PAMs, up to four mismatches, and `--effScores fusi,doench --minAltPamScore 101`. Containers were limited to two CPUs and 2 GiB memory.

| Chromosome | Input interval, inclusive | Bases | Guides | Wall seconds | JSON gzip, decimal KB |
|---|---|---:|---:|---:|---:|
| 2L | 1,000,000–1,000,999 | 1,000 | 60 | 14.58 | 5.7 |
| 2L | 1,000,000–1,004,999 | 5,000 | 400 | 47.82 | 30.6 |
| 2L | 1,000,000–1,009,999 | 10,000 | 914 | 76.42 | 69.3 |
| 2R | 18,823,520–18,833,519 | 10,000 | 1,013 | 105.63 | 74.2 |
| 3L | 2,035,609–2,045,608 | 10,000 | 715 | 74.54 | 54.3 |
| 3R | 29,383,754–29,393,753 | 10,000 | 825 | 76.68 | 62.6 |
| X | 6,131,342–6,141,341 | 10,000 | 1,069 | 101.20 | 77.7 |

The five 10 kb inputs cover 50 kb of distinct sequence and 4,536 candidate loci. The 1 kb and 5 kb samples are nested controls and are excluded from the aggregate projection. The 2L locus intentionally reuses the original repetitive benchmark; other starts were selected deterministically with seed 20261017. The 2R input contains 219 N bases. These samples are not a random genome-wide performance survey.

Wall time includes container startup and query/scoring/export. It excludes image restoration, index building, validation and catalogue compression. Fresh CRISPOR temporary directories prevent reuse of scored-query caches, while operating-system index caching can persist between batches. Peak container cgroup memory over all runs was about 1.15 GiB; this includes container cache and is not host-wide peak memory.

All seven inputs agree with independent `samtools faidx` extraction. The importer checked each exported guide's reference sequence and strand, independently enumerated complete NGG candidates, checked score order, verified off-target PAM scope, and reconciled exported off-target rows with native counts. These mechanical checks do not resolve the scoring semantics described below.

## Planning projections

These are extrapolations for 21,620,583 candidate loci from the five primary samples, using total measured seconds or bytes divided by total sample guides. They are not measurements of a completed genome-wide build, confidence intervals, or forecasts for a future scoring adapter. Repetition, batch size, hardware, deduplication and parallel execution can change them.

| Quantity | Projection |
|---|---:|
| Serial scoring at aggregate sample rate | 575 hours / 24.0 days |
| Serial scoring using fastest and slowest sample rates | 502–626 hours / 20.9–26.1 days |
| Current pretty JSON schema | 19.62 GB |
| Current schema, minified JSON | 11.67 GB |
| Current schema, gzip level 6 | 1.61 GB |
| Same guide fields as positional JSON rows, gzip level 6 | 1.21 GB |
| Native off-target TSV archive, uncompressed | 398 GB |
| Native off-target TSV archive, gzip level 6 | 60.79 GB |

GB here means decimal gigabytes. The positional-row experiment preserves the guide fields and provenance but has no production schema or browser loader; it is a size comparison only. Numeric columnar/HDF5 storage was not benchmarked.

At the observed compressed bytes per guide, a typical 200 kb query with around 19,000–20,000 guides would transfer approximately 1.4–1.5 MB of guide records; the densest aligned spans would approach 1.8 MB. This excludes index downloads, block overfetch, HTTP overhead and the existing Cs/SNP data. The current table must be performance-tested with this many rows; all candidates should remain accessible if paging or deferred rendering is needed.

The browser catalogue and the raw audit archive have very different storage requirements. The projected 1.61 GB catalogue fits within Zenodo's normal per-record quota. The projected 60.79 GB compressed raw archive exceeds the default quota and needs a separate retention/publication decision. Local scratch files should be reclaimed per validated batch during a production build.

## Batch-dependent exact-match exclusion

| Nested input comparison | Shared guides | Guides with changed evidence |
|---|---:|---:|
| 1 kb versus 5 kb | 60 | 8 |
| 5 kb versus 10 kb | 400 | 0 |
| 1 kb versus 10 kb | 60 | 8 |

The installed CRISPOR source explicitly excludes every zero-mismatch hit inside `inputPos` as an intended target (`annotateOfftargets`, source lines 1915 onward; source SHA256 `2ec794d22263d8201c2f124075da49234d1a7892e6b432909ccd9485787b0797`). The current importer then adds back one intended site. This undercounts total exact reference matches when a larger input contains another perfect match, and the native specificity scores can change too.

For example, the guide at 2L:1,000,861–1,000,883 (+), spacer `TTATGGCCACAATACGTATG`, has another perfect match at 2L:1,002,392–1,002,414 (−). That second site is an off-target in the 1 kb run, but is excluded as intended in the 5 kb run. The reported exact-match total changes from 5 to 4, MIT specificity from 5 to 6, and CFD specificity from 74 to 75. The changed row is visible in the saved TSVs. The eight differences are in the machine-readable report. Doench 2016 predictions agreed for the shared guides in these comparisons.

Consequently, source-batch size cannot define production targeting semantics. Guide-site evidence should remain the same when a visitor changes query width or crosses a catalogue block boundary. Scores in this benchmark are native CRISPOR exports; they have not been corrected or published as production coverage.

## The next two development steps

### 1. Establish scoring for one intended locus per guide

Keep CRISPOR's scoring formulas and activity model, while making the intended-site exclusion explicit for each guide's chromosome, coordinates and strand. An adapter around CRISPOR's existing scoring functions is the preferred production direction; separate tiny native CRISPOR runs are useful as an independent validation reference, but millions of separate process starts would add substantial overhead. A tool switch is a larger scientific/implementation decision and is not implied by this benchmark.

Require identical counts, specificity and activity for the same guide across nested inputs and alternative batch boundaries, including repeated sites and sites near interval ends. Supply consistent reference flanks for activity and sequence display. Keep every additional exact copy visible and preserve CRISPOR's documented specificity ordering, including a tested rule for ties after merging batches. A source-batch rank is provenance, not a global genome rank.

Recheck throughput after that adapter is validated. A 24-day serial laptop build is a substantial commitment. If institutional batch compute is available, independent resumable jobs using the same reference and pinned runtime are preferable to tying up the laptop for weeks. Parallel speedup and memory/I/O scaling have not yet been measured.

### 2. Choose and prove the production storage/retrieval contract

| Option | Practical fit | Main work/trade-off |
|---|---|---|
| **Indexed compressed JSON blocks inside one data file per chromosome** | **Recommended first pilot for Zenodo** | Retains familiar records and permits a browser to fetch only the indexed bytes needed for a query. Requires a versioned coordinate/byte index, integrity checks and real browser range/CORS testing. A small manifest pins the reference, scoring adapter and release. |
| Separate compressed JSON files per genomic tile | Simplest file handling on a host that supports many objects | At 10 kb there would be 23,050 tile files; at 100 kb there would still be thousands. This does not fit one ordinary Zenodo record. An object-storage/CDN account or different packaging is needed. |
| Indexed numeric/sequence columns in HDF5 or a similar format | Useful longer-term structured dataset | Can use typed arrays and the site's existing range-request principle. Guide-specific indexing, string/sequence representation, decoding and browser validation need additional work. Further size gains have not been measured. |

Zenodo currently documents a maximum of 100 files and 50 GB per record: [Manage files](https://help.zenodo.org/docs/deposit/manage-files/). Serving a whole compressed chromosome catalogue for every query would still download far more data than necessary; the index must select independently decodable blocks.

Pilot the chosen contract on bounded coverage before a complete run: padded batch inputs, one owner per guide, stable genomic IDs, resumable completion manifests, query assembly across block boundaries, exact inclusion of spacer plus PAM, query-wide ordering, unknown/missing states, and a browser test at the 200 kb query limit. Retain the existing Cs/SNP context calculation. Only after this proof should the corrected full catalogue be generated and published.

## Reproduce or resume

The work remains in the chat-attached `codex/guide-design` worktree and draft PR. The bounded benchmark tool is `tools/benchmark_guide_scale.py`; tests are `tests/test_guide_scale.py`. Existing raw outputs are sufficient for inspection and summaries.

```sh
# Reads completed outputs; performs no CRISPOR search or index build.
python3 tools/benchmark_guide_scale.py summarize
```

To rerun missing batches, first mount the saved scratch image and restore the archived task images as documented in external `STORAGE.md`, then use `prepare` and `run --cleanup-restored-images`. The runner skips validated batches, recovers a successful raw export if validation was interrupted, limits each batch to 240 seconds and the scoring stage to 1,200 seconds, limits per-batch scratch/output to 512 MiB, and stops on low free space (6 GiB internal, 20 GiB external, 4 GiB scratch). Completed CRISPOR process records and validated/compressed-result records are separate, with input hashes preserved. The restored task image tags were removed after the successful run; unrelated Docker images and containers were preserved.
