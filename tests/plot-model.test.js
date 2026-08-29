const test = require('node:test');
const assert = require('node:assert/strict');

const contract = require('../docs/assets/data/plot-contract.json');
const model = require('../docs/assets/plot-model.js');

test('versioned contract pins binning, aggregation semantics, and accessibility', () => {
  assert.equal(model.validateContract(contract), contract);
  assert.equal(contract.contract_id, 'agamcs-plot-contract-v2');
  assert.equal(contract.generated_browser_copy, 'docs/assets/data/plot-contract.json');
  assert.equal(contract.binning.signal.adaptive_rule, 'min(inclusive_length, safety_maximum_bins)');
  assert.equal(contract.binning.heatmap.adaptive_rule, 'min(inclusive_length, safety_maximum_bins)');
  assert.deepEqual(contract.binning.explicit_choices, [240, 360, 500, 750, 1000]);
  assert.equal(contract.binning.safety_maximum_bins, 1000);
  assert.match(contract.aggregation.heatmap.zero, /no detected CNEr interval/i);
  assert.match(contract.aggregation.signal.qc_failed, /unknown/i);
  assert.equal(contract.accessibility.svg_role, 'img');
});

test('adaptive and explicit bin counts use inclusive length and bounded clamping', () => {
  assert.equal(model.resolveBinCount(1, 'signal', 'adaptive', contract), 1);
  assert.equal(model.resolveBinCount(7, 'signal', 'adaptive', contract), 7);
  assert.equal(model.resolveBinCount(23, 'signal', 'adaptive', contract), 23);
  assert.equal(model.resolveBinCount(23, 'heatmap', 'adaptive', contract), 23);
  assert.equal(model.resolveBinCount(131, 'signal', 'adaptive', contract), 131);
  assert.equal(model.resolveBinCount(131, 'heatmap', 'adaptive', contract), 131);
  assert.equal(model.resolveBinCount(1685, 'signal', 'adaptive', contract), 1000);
  assert.equal(model.resolveBinCount(1685, 'heatmap', 'adaptive', contract), 1000);
  assert.equal(model.resolveBinCount(17947, 'signal', 'adaptive', contract), 1000);
  assert.equal(model.resolveBinCount(17947, 'heatmap', 'adaptive', contract), 1000);
  assert.equal(model.resolveBinCount(25, 'heatmap', 1000, contract), 25);
  for (const value of [0, -1, 1.5, '1.5', 'many', 1001, true]) {
    assert.throws(() => model.validatePlotResolution(value, contract), /plot resolution/i);
  }
});

test('display ranges round outward and retain original row-major stack indices', () => {
  const result = {
    chromosome: '2L', start: 100, end: 105,
    stackRows: ['row-a', 'row-b'],
    values: {
      Cs: Float32Array.from([0, 1, 2, 3, 4, 5]),
      snp_density: Float32Array.from([0, 1, 2, 3, 4, 5]),
      status: Uint8Array.from([1, 1, 1, 1, 1, 1]),
      stack: Float32Array.from([
        10, 11, 12, 13, 14, 15,
        20, 21, 22, 23, 24, 25,
      ]),
    },
  };
  assert.deepEqual(
    model.normalizeDisplayRange(result, { start: 101.2, end: 103.1 }),
    { start: 101, end: 104 },
  );
  const summary = model.summarizeHeatmap(
    result, null, contract, 'adaptive', { start: 101.2, end: 103.1 },
  );
  assert.deepEqual(summary.bins.map((bin) => bin.map((record) => record.index)), [
    [1], [2], [3], [4],
  ]);
  assert.deepEqual(summary.cells[0].map((cell) => cell.identity), [11, 12, 13, 14]);
  assert.deepEqual(summary.cells[1].map((cell) => cell.identity), [21, 22, 23, 24]);
  assert.throws(
    () => model.normalizeDisplayRange(result, { start: 1, end: 2 }),
    /does not overlap/i,
  );
});

test('minus-strand display ranges keep 5-prime orientation with original indices', () => {
  const result = {
    chromosome: '3R', start: 100, end: 105,
    stackRows: ['row-a'],
    values: {
      Cs: Float32Array.from([0, 1, 2, 3, 4, 5]),
      snp_density: Float32Array.from([0, 1, 2, 3, 4, 5]),
      status: Uint8Array.from([1, 1, 1, 1, 1, 1]),
      stack: Float32Array.from([10, 11, 12, 13, 14, 15]),
    },
  };
  const annotation = {
    chromosome: '3R', start: 100, end: 105, strand: -1,
    transcript_id: 'AGAPTEST-RA', exons: [{ start: 100, end: 105 }],
  };
  const summary = model.summarizeHeatmap(
    result, annotation, contract, 'adaptive', { start: 101, end: 104 },
  );
  assert.deepEqual(summary.records.map((record) => record.position), [104, 103, 102, 101]);
  assert.deepEqual(summary.bins.map((bin) => bin[0].index), [4, 3, 2, 1]);
  assert.deepEqual(summary.cells[0].map((cell) => cell.identity), [14, 13, 12, 11]);
});

test('contract palette has stable bounded RGB samples', () => {
  const expected = [
    [47, 47, 47],
    [58, 23, 66],
    [55, 71, 109],
    [35, 129, 125],
    [94, 201, 98],
    [253, 231, 37],
  ];
  const actual = contract.parity.palette_samples.map(([identity, fraction]) => (
    model.blendedIdentityColor(identity, fraction, contract)
      .match(/\d+/g).map(Number)
  ));
  actual.forEach((rgb, index) => rgb.forEach((channel, channelIndex) => {
    assert.ok(
      Math.abs(channel - expected[index][channelIndex])
        <= contract.palette.maximum_channel_delta,
    );
  }));
});

test('heatmap geometry matches the Pages viewBox coordinate contract', () => {
  assert.deepEqual(model.heatmapGeometry(21, 500, contract), {
    width: 1000,
    height: 653,
    plotLeft: 210,
    plotRight: 930,
    plotWidth: 720,
    plotHeight: 483,
    rowTop: 78,
    rowHeight: 23,
    cellWidth: 1.44,
  });
  assert.equal(model.heatmapGeometry(21, 500, contract, 2).height, 851);
});

test('multi-isoform filtering is stable and matches the displayed gene frame', () => {
  const display = {
    chromosome: '3R', start: 100, end: 500, strand: -1,
    transcript_id: 'AGAPTEST-RA', exons: [{ start: 100, end: 200 }],
  };
  const annotations = [
    { ...display, transcript_id: 'AGAPTEST-RB', start: 120, end: 470 },
    display,
    { ...display, transcript_id: 'AGAPTEST-RB', start: 120, end: 470 },
    { ...display, transcript_id: 'AGAPTEST-RC', chromosome: '2L' },
  ];
  assert.deepEqual(
    model.transcriptAnnotationsForDisplay(display, annotations)
      .map((annotation) => annotation.transcript_id),
    ['AGAPTEST-RA', 'AGAPTEST-RB'],
  );
});
