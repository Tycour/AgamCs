#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

require(path.join(__dirname, '../docs/assets/query-summary.js'));
require(path.join(__dirname, '../docs/assets/notable-windows.js'));
require(path.join(__dirname, '../docs/assets/species-context.js'));
const report = require(path.join(__dirname, '../docs/assets/query-report.js'));

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const output = input.cases.map((item) => ({
  name: item.name,
  report: report.buildReport(item.result, {
    annotation: item.annotation,
    transcriptAnnotations: item.transcript_annotations,
    ranking: item.ranking,
    queryState: item.query_state,
    provenance: item.provenance,
    display: item.display,
  }),
}));
process.stdout.write(`${JSON.stringify(output)}\n`);
