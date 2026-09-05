#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const notableWindows = require(path.join(__dirname, '../docs/assets/notable-windows.js'));

const input = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(`${JSON.stringify(notableWindows.analyzeNotableWindows(
  input.result,
  input.annotation || null,
  { windowSize: input.window_size, topWindows: input.top_windows },
))}\n`);
