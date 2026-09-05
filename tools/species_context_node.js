#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const speciesContext = require(path.join(__dirname, '../docs/assets/species-context.js'));

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(`${JSON.stringify(speciesContext.analyzeSpeciesContext(input.result, input.topology))}\n`);
