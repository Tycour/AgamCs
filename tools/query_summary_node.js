#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const querySummary = require(path.join(__dirname, '../docs/assets/query-summary.js'));

const fixturePath = process.argv[2];
if (!fixturePath) throw new Error('Provide a query-summary fixture path.');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const summaries = fixture.cases.map((item) => ({
  name: item.name,
  summary: querySummary.summarizeQuery(item.result, item.annotation),
}));
process.stdout.write(`${JSON.stringify(summaries)}\n`);
