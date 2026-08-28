# Browser HDF5 feasibility benchmark

## Purpose

This Stage 5 experiment asks whether the existing Zenodo-hosted HDF5 can serve
small coordinate queries directly to a static GitHub Pages client. It does not
repackage the archive or alter the scientific values.

The default interval is `2L:28585064-28586748` (AGAP006241). The worker reads
`Cs` and raw `snp_density`, refuses non-range responses, decompresses the
existing zlib chunks, and checks SHA-256 hashes generated from the local HDF5.

## Decision gate

Direct HDF5 passes only when all of the following are demonstrated:

- the host returns HTTP 206 and the browser never downloads the full archive;
- both arrays exactly match the pinned local-HDF5 hashes;
- native deflate decoding works in the supported browsers;
- a 5–20 kb query has acceptable latency, transfer size, and decoded memory;
- cold and warm results work on supported desktop browsers.

The page reports each run's request count, compressed bytes, cold/warm time,
cache hits, and decoded-cache memory estimate. Chromium's non-standard heap
measurement is shown when available; other browsers receive the deterministic
decoded-buffer estimate.

Client-side SHA-256 is an optional validation aid. If a browser exposes no
`crypto.subtle` implementation, the query remains usable and reports that hash
validation is unavailable rather than treating successful data retrieval as a
benchmark failure.

## Results (30 July 2026)

The pinned 1,685-base interval passed in both tested desktop engines:

| Browser | Cold | Warm | Ranges | Transfer | Decoded cache | Validation |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Chrome | 781 ms | 0.2 ms | 2 | 1.41 MiB | 2.94 MiB | Exact SHA-256 match |
| Safari | 990 ms | 0.0 ms | 2 | 1.41 MiB | 2.94 MiB | Exact SHA-256 match |

Chrome at a 390 × 844 constrained viewport retained a usable single-column
layout. A 21-base query deliberately crossing a chunk boundary completed in
830 ms using four ranges, transferring 1.24 MiB and caching 5.88 MiB decoded.
Invalid and over-20,000-base intervals were rejected before any worker query.

These are point-in-time development measurements, not service guarantees.
Network location, Zenodo load, cache state, and device resources will change
the observed timings.

## Stage 6 decision: retain the original HDF5

The direct-query approach is accepted for the next prototype stage. The
authoritative HDF5 stays unchanged on Zenodo, and the committed compact
reference remains a read-only map to its byte ranges. No browser-specific
derivative is created or published at this point.

The supported Stage 7 boundary is deliberately narrow:

- Desktop Chrome and Safari.
- One-based inclusive AgamP4 coordinate queries, up to 20,000 bases.
- `Cs` and archived, unmodified `snp_density` only.
- The existing Zenodo HDF5 URL and the versioned committed range reference.

The reader must continue to refuse full-file responses, identify the source
dataset in its result metadata, and describe unavailable hash validation as a
degraded check rather than a failed query.

This decision applies only to `Cs` and `snp_density`. Benchmark `stack`
separately before implementing a live heatmap; its multi-row layout may justify
a browser-optimized derivative even if the two one-dimensional tracks remain
direct HDF5 reads.

## Stage 7 implementation

The accepted route is implemented as a coordinate-query engine. Its worker
keeps a least-recently-used decoded-chunk cache capped at 64 MiB for the page
session. The client validates chromosome membership, coordinate ordering,
chromosome bounds, and the 20,000-base limit before sending a request. Results
include exact typed arrays, transfer/cache diagnostics, source provenance, a
five-position preview, and an exact TSV download.

The pinned AGAP006241 interval retains its local-HDF5 SHA-256 check. Other
valid intervals are not labelled as locally validated, and any range, decode,
or pinned-fixture failure is shown as a query error.

## Engineering finding

The reference metadata maps both requested arrays to zlib-compressed HDF5
chunks covering roughly 328–481 thousand bases depending on chromosome. A
small interval usually needs one compressed chunk per array, so the benchmark
will measure substantial read amplification even though it uses only two HTTP
ranges. Browser measurements are intentionally required before deciding
whether this is acceptable or a browser-optimized derivative is warranted.

Accessibility is deliberately excluded from this experiment. Raw SNP density
is never masked or rewritten; accessibility remains a separate companion track
for a later, separately reviewed stage.

## Stage 8 interactive plots (2 August 2026)

The browser client now extends the same direct-query route to the 21-row raw
`stack` matrix. The existing compact accessibility/QC HDF5 is queried as a
separate, immutable companion; the conservation HDF5 remains unchanged and no
browser derivative has been created.

For the pinned 1,685-base AGAP006241 interval, development Chromium requested
24 byte ranges, transferred 1.92 MiB, and completed in 1.84 s. SHA-256 checks
matched the local HDF5 values for `Cs`, raw `snp_density`, `stack`, and the
accessibility status byte. The browser's 240-bin signal summaries matched the
existing Python summary functions, and its 21 × 500 heatmap display cells
matched a Python fixture generated from the same exact `stack` slice and
display reducer.

The live figures preserve the current plotting semantics:

- median Cs with 25th–75th and 10th–90th percentile ribbons;
- mean SNP density over accessible bases, with QC-failed bases shaded as
  unknown rather than converted to zero;
- metadata-ordered species labels and an explicit categorical colour for no
  detected CNEr interval;
- pinned plus- and minus-strand gene models shown 5′→3′ with aligned exon and
  CDS landmarks;
- display-only downsampling, while the TSV retains every queried base, the raw
  QC status byte, and all 21 exact `stack` values.

The pinned minus-strand AGAP008118 interval and an arbitrary unannotated
coordinate interval were also exercised successfully. Cross-browser
publication regression testing remains part of Stage 10 rather than this
implementation step.

## Stage 10 release candidate (3 August 2026)

The release candidate expands exact Python-reader validation to eight regions
covering every chromosome arm, plus- and minus-strand genes, both chromosome
boundaries, and fully, partly, and non-accessible QC states. The matrix and
publication gate are documented in
[`browser-release-validation.md`](browser-release-validation.md).

Release testing found and fixed two browser-specific defects: stale cached
workers could survive ordinary reloads, and the final physical HDF5 chunk was
incorrectly expected to shrink to the logical chromosome length. Static asset
versioning now invalidates old workers and manifests, while the boundary reader
accepts a full physical chunk before slicing to the requested logical bases.

Repeated synthetic queries can also trigger Zenodo HTTP 429 responses. The
worker now limits concurrent range requests, retries only transient network and
HTTP failures with bounded backoff, reports retries, and continues to refuse
HTTP 200 responses that could represent a full-file download.

## Phase 2 engineering ceiling (27 August 2026)

The approved Pages ceiling is now 200,000 one-based inclusive bases. This is an
engineering/browser boundary, not a biological threshold. It covers 13,080 of
13,097 indexed genes (99.8702%); the remaining 17 complete loci are CLI-only.
Measurements in this document are point-in-time observations, not service
guarantees, and do not imply that the ceiling is biologically meaningful.

The higher ceiling does not change the transport or scientific contracts. The
worker still requires HTTP 206, refuses HTTP 200 full-file responses, uses four
concurrent range slots and six bounded attempts, and caps decoded chunks at
64 MiB. A query-scoped abort signal now stops active siblings and removes queued
work after a terminal range, network, size, or decode failure. HTTP 429 extends
one worker-wide bounded cooldown deadline which every new or retried range
consults before fetching.

Display plots now default to deterministic adaptive resolution: signal uses
`max(1, min(length, 240, floor(length / 20)))` bins and heatmap uses
`max(1, min(length, 500, floor(length / 30)))` bins. Users may select 60, 120,
240, 500, or 1,000 display bins, clamped to locus length. Exact TSV downloads
retain all queried bases and all 21 stack values. The archived raw
SNP-density array remains unchanged, and failed accessibility/QC positions
remain separately represented as unknown rather than zero.
