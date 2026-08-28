const test = require('node:test');
const assert = require('node:assert/strict');

const contract = require('../docs/assets/data/plot-contract.json');
const model = require('../docs/assets/plot-model.js');

test('versioned contract pins binning, aggregation semantics, and accessibility', () => {
  assert.equal(model.validateContract(contract), contract);
  assert.equal(contract.contract_id, 'agamcs-plot-contract-v2');
  assert.equal(contract.generated_browser_copy, 'docs/assets/data/plot-contract.json');
  assert.equal(contract.binning.signal.adaptive_bases_per_bin, 20);
  assert.equal(contract.binning.signal.adaptive_maximum_bins, 240);
  assert.equal(contract.binning.heatmap.adaptive_bases_per_bin, 30);
  assert.equal(contract.binning.heatmap.adaptive_maximum_bins, 500);
  assert.deepEqual(contract.binning.explicit_choices, [60, 120, 240, 500, 1000]);
  assert.equal(contract.binning.safety_maximum_bins, 1000);
  assert.match(contract.aggregation.heatmap.zero, /no detected CNEr interval/i);
  assert.match(contract.aggregation.signal.qc_failed, /unknown/i);
  assert.equal(contract.accessibility.svg_role, 'img');
});

test('adaptive and explicit bin counts use inclusive length and bounded clamping', () => {
  assert.equal(model.resolveBinCount(1, 'signal', 'adaptive', contract), 1);
  assert.equal(model.resolveBinCount(7, 'signal', 'adaptive', contract), 1);
  assert.equal(model.resolveBinCount(23, 'signal', 'adaptive', contract), 1);
  assert.equal(model.resolveBinCount(23, 'heatmap', 'adaptive', contract), 1);
  assert.equal(model.resolveBinCount(1685, 'signal', 'adaptive', contract), 84);
  assert.equal(model.resolveBinCount(1685, 'heatmap', 'adaptive', contract), 56);
  assert.equal(model.resolveBinCount(17947, 'signal', 'adaptive', contract), 240);
  assert.equal(model.resolveBinCount(17947, 'heatmap', 'adaptive', contract), 500);
  assert.equal(model.resolveBinCount(25, 'heatmap', 1000, contract), 25);
  for (const value of [0, -1, 1.5, '1.5', 'many', 1001, true]) {
    assert.throws(() => model.validatePlotResolution(value, contract), /plot resolution/i);
  }
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
