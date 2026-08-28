#!/usr/bin/env node
/* Emit the DOM-free Pages plot model for Python cross-language parity tests. */

const fs = require('node:fs');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const contract = require(path.join(repositoryRoot, 'docs/assets/data/plot-contract.json'));
const plotModel = require(path.join(repositoryRoot, 'docs/assets/plot-model.js'));

const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
if (payload.palette_samples) {
  const samples = payload.palette_samples.map(([identity, detectedFraction]) => (
    plotModel.blendedIdentityColor(identity, detectedFraction, contract)
      .match(/\d+/g).map(Number)
  ));
  process.stdout.write(`${JSON.stringify(samples)}\n`);
  process.exit(0);
}
const model = plotModel.buildPlotModel(
  payload.result,
  payload.annotation || null,
  payload.transcriptAnnotations || null,
  contract,
  payload.signalBins ?? 'adaptive',
  payload.heatmapBins ?? 'adaptive',
);
process.stdout.write(`${JSON.stringify(model)}\n`);
