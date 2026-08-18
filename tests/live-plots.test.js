const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const manifest = require('../docs/assets/data/query-manifest.json');
const plotContract = require('../docs/assets/data/plot-contract.json');

require('../docs/assets/plot-model.js');
require('../docs/assets/live-plots.js');
globalThis.AgamCsPlots.configurePlotContract(plotContract);

const {
  annotationMatches,
  cdsSegments,
  summarizeQuery,
  transcriptModelGeometry,
  transcriptAnnotationsForDisplay,
  abbreviatedSpeciesName,
  renderHeatmap,
  topologyTipCodes,
  validateSpeciesTopology,
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

test('query summaries distinguish the full span from the union of exons', () => {
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
    chromosome: '2L',
    start: 100,
    end: 105,
    exons: [{ start: 100, end: 102 }, { start: 102, end: 104 }],
  };
  assert.deepEqual(summarizeQuery(result, annotation), {
    queryBasePairs: 6,
    queryMeanCs: 3.5,
    queryMeanSnp: 32.5,
    exonBasePairs: 5,
    exonMeanCs: 3,
    exonMeanSnp: 32.5,
  });
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
    chromosome: '2L',
    start: 100,
    end: 105,
    exons: [{ start: 101, end: 102 }, { start: 104, end: 104 }],
  };
  assert.deepEqual(summarizeQuery(result, annotation), {
    queryBasePairs: 8,
    queryMeanCs: 3.5,
    queryMeanSnp: 35,
    exonBasePairs: 3,
    exonMeanCs: 10 / 3,
    exonMeanSnp: 100 / 3,
  });
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
  assert.equal(summary.queryBasePairs, 2);
  assert.equal(summary.queryMeanCs, 0.5);
  assert.equal(summary.queryMeanSnp, 0.2);
  assert.equal(summary.exonBasePairs, null);
  assert.ok(Number.isNaN(summary.exonMeanCs));
  assert.ok(Number.isNaN(summary.exonMeanSnp));
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
    svg.listeners.get('pointermove')({ clientX: 500, clientY: 90 });
    assert.equal(tooltip.hidden, false);
    assert.match(tooltip.innerHTML, /mean identity|No detected CNEr interval/);
    svg.listeners.get('pointerleave')();
    assert.equal(tooltip.hidden, true);
    assert.equal(result.values.stack.length, manifest.stack.rows.length * width);
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

test('exact 50,000-base TSV retains every position and all 21 stack values', () => {
  const { buildTsv } = siteExportHelpers();
  const width = 50_000;
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

test('replacement validation failures preserve previous figures and downloads', () => {
  const source = fs.readFileSync(path.join(__dirname, '../docs/assets/site.js'), 'utf8');
  const submitStart = source.indexOf("benchmarkForm.addEventListener('submit'");
  const submit = source.slice(submitStart);
  const arrayFailure = submit.indexOf('Local validation failed');
  const plotFailure = submit.indexOf('Plot validation failed');
  const replacementClear = submit.indexOf('clearFigureDownloads();');
  assert.ok(arrayFailure >= 0 && plotFailure > arrayFailure);
  assert.ok(replacementClear > plotFailure);
  assert.doesNotMatch(submit.slice(submit.lastIndexOf('} catch (error) {')), /clearFigureDownloads|benchmarkDownload\.hidden|liveVisuals\.hidden|querySummary\.hidden/);
});
