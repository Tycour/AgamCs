const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const manifest = require('../docs/assets/data/query-manifest.json');
const plotContract = require('../docs/assets/data/plot-contract.json');

require('../docs/assets/plot-model.js');
require('../docs/assets/query-summary.js');
require('../docs/assets/species-context.js');
require('../docs/assets/live-plots.js');
globalThis.AgamCsPlots.configurePlotContract(plotContract);

const {
  annotationMatches,
  cdsSegments,
  summarizeQuery,
  transcriptModelGeometry,
  transcriptAnnotationsForDisplay,
  abbreviatedSpeciesName,
  rangeFromDisplayBins,
  renderHeatmap,
  topologyTipCodes,
  validateSpeciesTopology,
  vectorBaseGeneUrl,
} = globalThis.AgamCsPlots;

class FakeElement {
  constructor(name) {
    this.name = name;
    this.attributes = new Map();
    this.children = [];
    this.listeners = new Map();
    this.style = {};
    this.hidden = false;
    this.innerHTML = '';
    this.textContent = '';
  }

  setAttribute(key, value) { this.attributes.set(key, String(value)); }

  getAttribute(key) { return this.attributes.get(key); }

  append(...children) { this.children.push(...children); }

  prepend(...children) { this.children.unshift(...children); }

  replaceChildren(...children) { this.children = [...children]; }

  addEventListener(type, listener) { this.listeners.set(type, listener); }

  getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 653 }; }
}

function siteExportHelpers() {
  const source = fs.readFileSync(path.join(__dirname, '../docs/assets/site.js'), 'utf8');
  const start = source.indexOf('function statusLabel');
  const end = source.indexOf('function displayNumber');
  assert.ok(start >= 0 && end > start, 'site TSV helpers must remain discoverable');
  const context = {};
  vm.runInNewContext(
    `${source.slice(start, end)}\nthis.exports = { statusLabel, buildTsv };`,
    context,
  );
  return context.exports;
}

function descendants(element) {
  return (element.children || []).flatMap((child) => [child, ...descendants(child)]);
}

test('annotations remain active when the query includes flanking padding', () => {
  const annotation = { chromosome: '2L', start: 100, end: 200 };
  assert.equal(annotationMatches({ chromosome: '2L', start: 75, end: 225 }, annotation), true);
  assert.equal(annotationMatches({ chromosome: '2L', start: 125, end: 225 }, annotation), false);
  assert.equal(annotationMatches({ chromosome: '3R', start: 75, end: 225 }, annotation), false);
});

test('species labels use established genus abbreviations', () => {
  assert.equal(abbreviatedSpeciesName('Anopheles coluzzii'), 'An. coluzzii');
  assert.equal(abbreviatedSpeciesName('Aedes aegypti '), 'Ae. aegypti');
  assert.equal(abbreviatedSpeciesName('Culex quinquefasciatus'), 'Cx. quinquefasciatus');
  assert.equal(abbreviatedSpeciesName('Drosophila melanogaster'), 'D. melanogaster');
});

test('annotation labels use encoded VectorBase gene URLs', () => {
  assert.equal(
    vectorBaseGeneUrl('AGAP004050'),
    'https://vectorbase.org/vectorbase/app/record/gene/AGAP004050',
  );
  assert.equal(
    vectorBaseGeneUrl('AGAP004050/unsafe'),
    'https://vectorbase.org/vectorbase/app/record/gene/AGAP004050%2Funsafe',
  );
  assert.equal(vectorBaseGeneUrl('  '), null);
});

test('plot range selection expands outward to every touched display bin', () => {
  const summary = {
    bins: [
      [{ position: 100 }, { position: 101 }],
      [{ position: 102 }, { position: 103 }],
      [{ position: 104 }, { position: 105 }],
    ],
  };
  assert.deepEqual(rangeFromDisplayBins(summary, 0.05, 0.50), { start: 100, end: 103 });
  assert.deepEqual(rangeFromDisplayBins(summary, 0.90, 0.40), { start: 102, end: 105 });
});

test('browser topology contains every metadata genome code exactly once', () => {
  const tips = topologyTipCodes(manifest.stack.topology.tree);

  assert.deepEqual(tips, manifest.stack.rows);
  assert.equal(new Set(tips).size, tips.length);
  assert.equal(
    validateSpeciesTopology(manifest.stack.topology, manifest.stack.rows),
    manifest.stack.topology.tree,
  );
});

test('browser rejects topology drift from the metadata row order', () => {
  assert.throws(
    () => validateSpeciesTopology(
      manifest.stack.topology,
      [...manifest.stack.rows].reverse(),
    ),
    /does not match the metadata genome-code order/,
  );
});

test('CDS segments intersect exon bounds in plus-strand plot coordinates', () => {
  const annotation = {
    start: 100,
    end: 500,
    strand: 1,
    cds_start: 150,
    cds_end: 350,
    exons: [{ start: 100, end: 200 }, { start: 300, end: 400 }],
  };
  assert.deepEqual(cdsSegments(annotation), [[50, 100], [200, 250]]);
});

test('CDS segments stay ordered from 5-prime to 3-prime on the minus strand', () => {
  const annotation = {
    start: 100,
    end: 500,
    strand: -1,
    cds_start: 150,
    cds_end: 350,
    exons: [{ start: 100, end: 200 }, { start: 300, end: 400 }],
  };
  assert.deepEqual(cdsSegments(annotation), [[150, 200], [300, 350]]);
});

test('plot API exposes the versioned selected-transcript query summary', () => {
  const result = {
    chromosome: '2L',
    start: 100,
    end: 105,
    values: {
      Cs: Float64Array.from([1, 2, 3, 4, 5, 6]),
      snp_density: Float64Array.from([10, 20, 30, 40, 50, 60]),
      status: Uint8Array.from([1, 0, 1, 1, 1, 0]),
    },
  };
  const annotation = {
    id: 'AGAPTEST',
    chromosome: '2L',
    start: 100,
    end: 105,
    strand: 1,
    transcript_id: 'AGAPTEST-RA',
    exons: [{ start: 100, end: 102 }, { start: 102, end: 104 }],
    cds_start: 101,
    cds_end: 103,
  };
  const summary = summarizeQuery(result, annotation);
  const scopes = Object.fromEntries(summary.scopes.map((scope) => [scope.scope_id, scope]));
  assert.equal(summary.summary_version, 'agamcs-query-summary-v1');
  assert.equal(scopes.query.total_bases, 6);
  assert.equal(scopes.query.mean_cs, 3.5);
  assert.equal(scopes.query.mean_accessible_snp_density, 32.5);
  assert.equal(scopes['exon-1'].total_bases, 3);
  assert.equal(scopes['exon-2'].total_bases, 3);
});

test('padded query summaries retain exon metrics from the contained annotation', () => {
  const result = {
    chromosome: '2L',
    start: 99,
    end: 106,
    values: {
      Cs: Float64Array.from([0, 1, 2, 3, 4, 5, 6, 7]),
      snp_density: Float64Array.from([0, 10, 20, 30, 40, 50, 60, 70]),
      status: Uint8Array.from([1, 1, 1, 1, 1, 1, 1, 1]),
    },
  };
  const annotation = {
    id: 'AGAPTEST',
    chromosome: '2L',
    start: 100,
    end: 105,
    strand: 1,
    transcript_id: 'AGAPTEST-RA',
    exons: [{ start: 101, end: 102 }, { start: 104, end: 104 }],
    cds_start: null,
    cds_end: null,
  };
  const scopes = Object.fromEntries(
    summarizeQuery(result, annotation).scopes.map((scope) => [scope.scope_id, scope]),
  );
  assert.equal(scopes.query.total_bases, 8);
  assert.equal(scopes['five-prime-flank'].total_bases, 1);
  assert.equal(scopes['three-prime-flank'].total_bases, 1);
  assert.equal(scopes.introns.total_bases, 3);
});

test('manual coordinate summaries omit exon metrics', () => {
  const result = {
    chromosome: 'X',
    start: 10,
    end: 11,
    values: {
      Cs: Float64Array.from([0.25, 0.75]),
      snp_density: Float64Array.from([0.2, 0.8]),
      status: Uint8Array.from([1, 0]),
    },
  };
  const summary = summarizeQuery(result);
  assert.equal(summary.selected_transcript, null);
  assert.deepEqual(summary.scopes.map((scope) => scope.scope_id), ['query']);
  assert.equal(summary.scopes[0].mean_cs, 0.5);
  assert.equal(summary.scopes[0].mean_accessible_snp_density, 0.2);
  const source = fs.readFileSync(path.join(__dirname, '../docs/assets/site.js'), 'utf8');
  assert.match(source, /renderQuerySummary\(\s*result,\s*resolution \? annotation : null/);
});

test('transcript models align to a shared plus-strand gene coordinate frame', () => {
  const display = { chromosome: 'X', start: 100, end: 500, strand: 1 };
  const transcript = {
    chromosome: 'X', start: 150, end: 450, strand: 1,
    exons: [{ start: 150, end: 200 }, { start: 400, end: 450 }],
    cds_start: 175, cds_end: 425,
  };
  assert.deepEqual(transcriptModelGeometry(transcript, display), {
    transcript: [50, 350],
    exons: [[50, 100], [300, 350]],
    cds: [[75, 100], [300, 325]],
  });
});

test('transcript models stay aligned in a shared minus-strand gene frame', () => {
  const display = { chromosome: '3R', start: 100, end: 500, strand: -1 };
  const transcript = {
    chromosome: '3R', start: 150, end: 450, strand: -1,
    exons: [{ start: 400, end: 450 }, { start: 150, end: 200 }],
    cds_start: 175, cds_end: 425,
  };
  assert.deepEqual(transcriptModelGeometry(transcript, display), {
    transcript: [50, 350],
    exons: [[50, 100], [300, 350]],
    cds: [[75, 100], [300, 325]],
  });
});

test('regional transcript geometry can extend beyond the queried gene frame', () => {
  const display = { chromosome: '2L', start: 100, end: 200, strand: 1 };
  const neighbouringGene = {
    chromosome: '2L', start: 210, end: 230, strand: -1,
    exons: [{ start: 210, end: 215 }, { start: 225, end: 230 }],
    cds_start: 212, cds_end: 228,
  };
  assert.deepEqual(
    transcriptModelGeometry(neighbouringGene, display, { start: 90, end: 240 }),
    {
      transcript: [110, 130],
      exons: [[110, 115], [125, 130]],
      cds: [[112, 115], [125, 128]],
    },
  );
});

test('multi-transcript tracks retain unique overlapping models on the same strand', () => {
  const display = {
    chromosome: '2L', start: 100, end: 500, strand: 1,
    transcript_id: 'AGAP000001-RB', exons: [{ start: 100, end: 500 }],
  };
  const annotations = [
    { ...display, transcript_id: 'AGAP000001-RB' },
    { ...display, transcript_id: 'AGAP000001-RA', start: 150, end: 450 },
    { ...display, transcript_id: 'AGAP000001-RA', start: 150, end: 450 },
    { ...display, transcript_id: 'AGAP000001-RC', chromosome: '3R' },
    { ...display, transcript_id: 'AGAP000001-RD', strand: -1 },
  ];
  assert.deepEqual(
    transcriptAnnotationsForDisplay(display, annotations).map((item) => item.transcript_id),
    ['AGAP000001-RA', 'AGAP000001-RB'],
  );
});

test('Pages heatmap retains accessible SVG metadata and browser-only tooltips', () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElementNS: (_namespace, name) => new FakeElement(name),
    createElement: (name) => new FakeElement(name),
  };
  try {
    const container = new FakeElement('container');
    const width = 3;
    const result = {
      chromosome: '2L', start: 10, end: 12,
      stackRows: manifest.stack.rows,
      stackSpecies: manifest.stack.species,
      stackTopology: manifest.stack.topology,
      values: {
        Cs: Float32Array.from([0.1, 0.2, 0.3]),
        snp_density: Float32Array.from([0, 0.1, 0]),
        status: Uint8Array.from([1, 0, 1]),
        stack: Float32Array.from(
          manifest.stack.rows.flatMap((_row, row) => [0, 50 + row, 75 + row]),
        ),
      },
    };
    const summary = renderHeatmap(container, result);
    const [svg, tooltip] = container.children;
    assert.equal(summary.cells.length, 21);
    assert.equal(svg.name, 'svg');
    assert.equal(svg.getAttribute('role'), 'img');
    assert.equal(
      svg.getAttribute('aria-labelledby'),
      'agamcs-live-heatmap-title agamcs-live-heatmap-description',
    );
    assert.equal(svg.children.some((child) => child.name === 'title'), true);
    assert.equal(svg.children.some((child) => child.name === 'desc'), true);
    assert.equal(tooltip.name, 'div');
    assert.ok(svg.listeners.has('pointermove'));
    assert.ok(svg.listeners.has('pointerleave'));
    svg.listeners.get('pointermove')({ clientX: 500, clientY: 100 });
    assert.equal(tooltip.hidden, false);
    assert.match(tooltip.innerHTML, /mean identity|No detected CNEr interval/);
    svg.listeners.get('pointerleave')();
    assert.equal(tooltip.hidden, true);
    assert.equal(result.values.stack.length, manifest.stack.rows.length * width);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('manual-coordinate heatmaps can render indexed overlapping gene models', () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElementNS: (_namespace, name) => new FakeElement(name),
    createElement: (name) => new FakeElement(name),
  };
  try {
    const container = new FakeElement('container');
    const result = {
      chromosome: '2L', start: 10, end: 12,
      stackRows: manifest.stack.rows,
      stackSpecies: manifest.stack.species,
      stackTopology: manifest.stack.topology,
      values: {
        Cs: Float32Array.from([0.1, 0.2, 0.3]),
        snp_density: Float32Array.from([0, 0.1, 0]),
        status: Uint8Array.from([1, 1, 1]),
        stack: Float32Array.from(
          manifest.stack.rows.flatMap(() => [0, 50, 75]),
        ),
      },
    };
    const annotations = [{
      id: 'AGAPREGION', chromosome: '2L', start: 9, end: 13, strand: -1,
      transcript_id: 'AGAPREGION-RA', exons: [{ start: 9, end: 13 }],
      cds_start: 10, cds_end: 12,
    }];
    renderHeatmap(container, result, null, annotations);
    const svg = container.children[0];
    assert.ok(Number(svg.getAttribute('viewBox').split(' ')[3]) > 653);
    assert.equal(
      svg.children.some((child) => (
        child.getAttribute?.('class')?.includes('transcript-model-row')
      )),
      true,
    );
    const links = descendants(svg).filter((child) => child.name === 'a');
    assert.equal(links.length, 1);
    assert.equal(
      links[0].getAttribute('href'),
      'https://vectorbase.org/vectorbase/app/record/gene/AGAPREGION',
    );
    assert.equal(links[0].getAttribute('target'), '_blank');
    assert.equal(links[0].getAttribute('rel'), 'noopener noreferrer');
    assert.match(
      links[0].getAttribute('aria-label'),
      /gene AGAPREGION for transcript AGAPREGION-RA.*new tab/,
    );
    const linkedText = descendants(links[0]).find((child) => child.name === 'text');
    assert.equal(linkedText.textContent, 'AGAPREGION-RA −');
    assert.equal(linkedText.getAttribute('text-decoration'), 'underline');
  } finally {
    globalThis.document = previousDocument;
  }
});

test('single-transcript figure annotation labels link to the VectorBase gene', () => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElementNS: (_namespace, name) => new FakeElement(name),
    createElement: (name) => new FakeElement(name),
  };
  try {
    const container = new FakeElement('container');
    const result = {
      chromosome: '2L', start: 10, end: 12,
      stackRows: manifest.stack.rows,
      stackSpecies: manifest.stack.species,
      stackTopology: manifest.stack.topology,
      values: {
        Cs: Float32Array.from([0.1, 0.2, 0.3]),
        snp_density: Float32Array.from([0, 0.1, 0]),
        status: Uint8Array.from([1, 1, 1]),
        stack: Float32Array.from(manifest.stack.rows.flatMap(() => [0, 50, 75])),
      },
    };
    const annotation = {
      id: 'AGAPQUERY', chromosome: '2L', start: 10, end: 12, strand: 1,
      transcript_id: 'AGAPQUERY-RA', exons: [{ start: 10, end: 12 }],
      cds_start: 10, cds_end: 12,
    };
    renderHeatmap(container, result, annotation, [annotation]);
    const links = descendants(container.children[0]).filter((child) => child.name === 'a');
    assert.equal(links.length, 1);
    assert.equal(
      links[0].getAttribute('href'),
      'https://vectorbase.org/vectorbase/app/record/gene/AGAPQUERY',
    );
    const linkedText = descendants(links[0]).find((child) => child.name === 'text');
    assert.equal(linkedText.textContent, 'AGAPQUERY-RA (+ strand; shown 5′→3′)');
  } finally {
    globalThis.document = previousDocument;
  }
});

test('standalone SVG download path remains present after plot-model extraction', () => {
  const source = fs.readFileSync(path.join(__dirname, '../docs/assets/site.js'), 'utf8');
  assert.match(source, /function configureFigureDownload/);
  assert.match(source, /cloneNode\(true\)/);
  assert.match(source, /new XMLSerializer\(\)\.serializeToString/);
  assert.match(source, /type: 'image\/svg\+xml;charset=utf-8'/);
});

test('resolution controls are contract-derived and rerender retained data without a query', () => {
  const source = fs.readFileSync(path.join(__dirname, '../docs/assets/site.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
  assert.match(source, /contract\.binning\.explicit_choices/);
  assert.match(source, /retainedPlotState/);
  assert.match(source, /signalResolution\.addEventListener\('change', rerenderRetainedPlots\)/);
  assert.match(source, /heatmapResolution\.addEventListener\('change', rerenderRetainedPlots\)/);
  const rerenderStart = source.indexOf('function rerenderRetainedPlots');
  const rerenderEnd = source.indexOf("signalResolution.addEventListener('change'", rerenderStart);
  const rerender = source.slice(rerenderStart, rerenderEnd);
  assert.match(rerender, /renderLivePlots/);
  assert.doesNotMatch(rerender, /workerQuery|fetch\(/);
  assert.match(source, /configureFigureDownload[\s\S]*figureStem/);
  assert.match(html, /<option value="adaptive">Adaptive<\/option>/);
  assert.match(html, /exact TSV retains every queried base and species row/);
});

test('range zoom keeps nested history and rerenders retained data without a query', () => {
  const source = fs.readFileSync(path.join(__dirname, '../docs/assets/site.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
  for (const id of [
    'plot-range-select', 'plot-range-back', 'plot-range-reset',
    'plot-range-start', 'plot-range-end', 'plot-range-apply', 'plot-range-status',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(source, /let plotZoomHistory = \[\]/);
  assert.match(source, /plotZoomHistory\.push\(\{ \.\.\.previous\.displayRange \}\)/);
  assert.match(source, /const target = plotZoomHistory\.pop\(\)/);
  assert.match(source, /function resetPlotRange/);
  assert.match(source, /_view_\$\{activeRange\.start\}-\$\{activeRange\.end\}/);
  const zoomStart = source.indexOf('function zoomToPlotRange');
  const zoomEnd = source.indexOf('function zoomOutPlotRange', zoomStart);
  const zoom = source.slice(zoomStart, zoomEnd);
  assert.match(zoom, /renderLivePlots/);
  assert.doesNotMatch(zoom, /workerQuery|fetch\(/);
  assert.doesNotMatch(zoom, /benchmarkDownload|renderQuerySummary|buildTsv/);
  assert.match(html, /expand outward to the displayed bin boundaries/i);
  assert.match(html, /exact TSV remains the full query/i);
});

test('overlapping annotations are optional for both query modes and rerender locally', () => {
  const source = fs.readFileSync(path.join(__dirname, '../docs/assets/site.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
  assert.match(html, /id="show-overlapping-annotations"/);
  assert.match(html, /Show overlapping gene annotations/);
  assert.match(source, /function annotationsForDisplayedRegion/);
  assert.match(source, /AgamCsAccessions\.overlappingGenes/);
  assert.match(
    source,
    /showOverlappingAnnotations\.addEventListener\('change', rerenderRetainedPlots\)/,
  );
  const helperStart = source.indexOf('function annotationsForDisplayedRegion');
  const helperEnd = source.indexOf('function renderResolvedAccession', helperStart);
  assert.doesNotMatch(source.slice(helperStart, helperEnd), /workerQuery|fetch\(/);
});

test('focus-first layout keeps the primary query visible and secondary controls progressive', () => {
  const source = fs.readFileSync(path.join(__dirname, '../docs/assets/site.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
  assert.match(html, /<h1 id="explorer-title">Find a gene or genomic region\.<\/h1>/);
  assert.match(html, /class="query-primary-row"/);
  assert.match(html, /<details class="query-options" id="query-options">/);
  assert.match(html, /id="featured-example-actions"/);
  assert.match(html, /id="live-accession"[^>]+value="AGAP008212"/);
  assert.match(html, /id="benchmark-start"[^>]+value="6928858"/);
  assert.match(html, /id="benchmark-end"[^>]+value="6930547"/);
  assert.match(html, /<details class="query-details">/);
  assert.match(html, /<details class="supplementary-results" id="supplementary-results">/);
  assert.match(html, /<summary>Show additional query details<\/summary>/);
  assert.doesNotMatch(html, /<details class="supplementary-results" id="supplementary-results" open>/);
  const supplementaryDetails = html.slice(
    html.indexOf('id="supplementary-results"'), html.indexOf('id="benchmark-download"'),
  );
  for (const heading of [
    'Plot resolution',
    'Representative-transcript gene rankings',
    'Exact query and selected-transcript summaries',
    'Species and encoded-clade context',
    'Notable 100-base windows',
  ]) assert.match(supplementaryDetails, new RegExp(heading));
  assert.match(html, /class="ranking-grid"/);
  assert.match(html, /Representative-transcript gene rankings/);
  assert.match(html, /agamcs-query-summary-v1/);
  assert.match(source, /\.filter\(\(example\) => Number\.isSafeInteger\(example\.quick_rank\)\)/);
  assert.match(source, /function selectFeaturedExample\(accession, \{ focusSubmit = true \} = \{\}\)/);
  assert.match(source, /selectFeaturedExample\(quickExamples\[0\]\.accession, \{ focusSubmit: false \}\)/);
  assert.match(source, /name\.textContent = example\.symbol \|\| example\.accession/);
  assert.match(source, /accession\.className = 'featured-example-accession'/);
  assert.match(source, /return name \? `\$\{name\} \(\$\{resolution\.accession\}\)` : resolution\.accession/);
  assert.match(source, /accessionQueryOptions\.hidden = !byAccession/);
  assert.match(source, /featuredExampleStrip\.hidden = !byAccession/);
});

test('figure-first results expose both plots before rankings and supporting details', () => {
  const source = fs.readFileSync(path.join(__dirname, '../docs/assets/site.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
  const summaryIndex = html.indexOf('id="resolved-accession"');
  const figuresIndex = html.indexOf('id="live-visuals"');
  const rankingsIndex = html.indexOf('class="ranking-grid"');
  const detailsIndex = html.indexOf('id="supplementary-results"');
  assert.ok(summaryIndex >= 0 && figuresIndex > summaryIndex && detailsIndex > figuresIndex && rankingsIndex > detailsIndex);
  assert.match(html, /<h4 id="live-signals-heading">Conservation and SNP density<\/h4>/);
  assert.match(html, /<h4 id="live-heatmap-heading">Species identity heatmap<\/h4>/);
  assert.doesNotMatch(html, /aria-label="Query figures"/);
  assert.doesNotMatch(html, /id="live-heatmap-panel"[^>]*hidden/);
  assert.match(source, /function formatResolutionLabel\(resolution\)/);
  assert.match(source, /setPortalState\(resolution \? formatResolutionLabel\(resolution\)/);
});

for (const width of [50_000, 150_000, 200_000]) test(`exact ${width.toLocaleString()}-base TSV retains every position and all 21 stack values`, () => {
  const { buildTsv } = siteExportHelpers();
  const stackRows = Array.from({ length: 21 }, (_value, row) => `row${row}`);
  const stack = new Float32Array(stackRows.length * width);
  stackRows.forEach((_code, row) => stack.fill(row, row * width, (row + 1) * width));
  const tsv = buildTsv({
    chromosome: '2L',
    start: 1_000_001,
    stackRows,
    statusFields: ['is_accessible'],
    values: {
      Cs: new Float32Array(width),
      snp_density: new Float32Array(width),
      status: new Uint8Array(width).fill(1),
      stack,
    },
  });
  const lines = tsv.trimEnd().split('\n');
  assert.equal(lines.length, width + 1);
  assert.equal(lines[0].split('\t').length, 7 + stackRows.length);
  const expectedStack = stackRows.map((_code, row) => String(row)).join('\t');
  for (let index = 0; index < width; index += 1) {
    const columns = lines[index + 1].split('\t');
    assert.equal(columns.length, 7 + stackRows.length);
    assert.equal(Number(columns[1]), 1_000_001 + index);
    assert.equal(columns.slice(7).join('\t'), expectedStack);
  }
});

test('exact window TSV is a bounded subset while the primary TSV remains complete', () => {
  const { buildTsv } = siteExportHelpers();
  const data = {
    chromosome: '3R', start: 100, stackRows: ['one'], statusFields: ['is_accessible'],
    values: {
      Cs: Float32Array.from([0.1, 0.2, 0.3, 0.4, 0.5]),
      snp_density: Float32Array.from([1, 2, 3, 4, 5]),
      status: Uint8Array.from([1, 0, 1, 1, 1]),
      stack: Float32Array.from([10, 20, 30, 40, 50]),
    },
  };
  const complete = buildTsv(data).trim().split('\n');
  const window = buildTsv(data, { start: 101, end: 103 }).trim().split('\n');
  assert.equal(complete.length, 6);
  assert.equal(window.length, 4);
  assert.deepEqual(window.slice(1).map((line) => Number(line.split('\t')[1])), [101, 102, 103]);
  assert.match(fs.readFileSync(path.join(__dirname, '../docs/assets/site.js'), 'utf8'), /primary TSV remains the complete query/);
});

test('notable windows are exact-query analysis with native zoom and TSV actions', () => {
  const source = fs.readFileSync(path.join(__dirname, '../docs/assets/site.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
  const start = source.indexOf('function renderNotableWindows');
  const end = source.indexOf('function findPinnedAnnotation', start);
  const renderer = source.slice(start, end);
  assert.match(renderer, /AgamCsNotableWindows\.analyzeNotableWindows/);
  assert.match(renderer, /zoomToPlotRange\(window, 'notable-window'\)/);
  assert.match(renderer, /configureNotableWindowDownload/);
  assert.doesNotMatch(renderer, /workerQuery|selectedPlotResolution|displayRange/);
  assert.match(html, /Five highest mean-Cs windows/);
  assert.match(html, /Five lowest mean-SNP-density windows/);
  assert.match(renderer, /Zoom to window/);
  assert.match(renderer, /Exact window TSV/);
  const plotStart = source.indexOf('function renderLivePlots');
  const plotEnd = source.indexOf('function valuesMatch', plotStart);
  assert.doesNotMatch(source.slice(plotStart, plotEnd), /clearNotableWindowDownloads/);
});

test('species display controls rerender only the heatmap view and preserve full exports', () => {
  const source = fs.readFileSync(path.join(__dirname, '../docs/assets/site.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
  for (const id of [
    'species-display-controls', 'species-display-order', 'species-select-all',
    'species-clear-all', 'species-checkbox-grid', 'clade-collapse-grid',
    'species-display-status', 'species-context', 'species-context-body',
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /change only Figure 2 and its SVG/i);
  assert.match(html, /exact TSV and species\/clade summary retain all comparison species/i);
  assert.match(source, /AgamCsSpeciesContext\.displayRows/);
  assert.match(source, /AgamCsSpeciesContext\.analyzeSpeciesContext/);
  const controlsStart = source.indexOf('function readSpeciesDisplayControls');
  const controlsEnd = source.indexOf('function renderSpeciesContext', controlsStart);
  assert.match(source.slice(controlsStart, controlsEnd), /rerenderRetainedPlots/);
  assert.doesNotMatch(source.slice(controlsStart, controlsEnd), /workerQuery|buildTsv|benchmarkDownload/);
});

test('rejected and failed replacement queries preserve previous figures and downloads', () => {
  const source = fs.readFileSync(path.join(__dirname, '../docs/assets/site.js'), 'utf8');
  const submitStart = source.indexOf('async function runLiveQuery');
  const submit = source.slice(submitStart);
  const arrayFailure = submit.indexOf('Local validation failed');
  const plotFailure = submit.indexOf('Plot validation failed');
  const replacementClear = submit.indexOf('clearFigureDownloads();');
  const workerRequest = submit.indexOf('workerQuery(chromosome, start, end)');
  assert.ok(arrayFailure >= 0 && plotFailure > arrayFailure);
  assert.ok(replacementClear > plotFailure && replacementClear > workerRequest);
  assert.doesNotMatch(submit.slice(0, replacementClear), /benchmarkDownloadUrl\) URL\.revokeObjectURL/);
  assert.doesNotMatch(submit.slice(submit.lastIndexOf('} catch (error) {')), /clearFigureDownloads|benchmarkDownload\.hidden|liveVisuals\.hidden|querySummary\.hidden/);
  const modeStart = source.indexOf('function setLiveQueryMode');
  const modeEnd = source.indexOf("document.querySelectorAll('input[name=\"live-query-mode\"]')");
  const modeChange = source.slice(modeStart, modeEnd);
  assert.doesNotMatch(
    modeChange,
    /clearFigureDownloads|benchmarkDownload\.hidden|liveVisuals\.hidden|querySummary\.hidden|resolvedAccession\.hidden/,
  );
});
