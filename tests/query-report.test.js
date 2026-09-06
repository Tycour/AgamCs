const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

require('../docs/assets/query-summary.js');
require('../docs/assets/notable-windows.js');
require('../docs/assets/species-context.js');
const report = require('../docs/assets/query-report.js');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/query-report-v1-cases.json'), 'utf8'));

test('report v1 preserves selected isoform, unknown QC, and explicit unavailable rankings', () => {
  const item = fixture.cases[0];
  const document = report.buildReport(item.result, {
    annotation: item.annotation, transcriptAnnotations: item.transcript_annotations,
    ranking: item.ranking, queryState: item.query_state,
    provenance: item.provenance, display: item.display,
    contractVersion: 1,
  });
  assert.equal(document.report_version, fixture.report_version);
  assert.equal(document.selected_annotation.transcript_id, 'AGAPTEST-RB');
  assert.equal(document.accessibility_audit.scopes[0].accessible_bases, 2);
  assert.equal(document.rankings.availability, 'unavailable');
  assert.match(document.figure_caption, /2\/4 accessible bases/);
  assert.equal(report.validateReport(document), true);
});

test('report UI only downloads a coarse report artifact and exposes deterministic copy actions', () => {
  const source = fs.readFileSync(path.join(__dirname, '../docs/assets/site.js'), 'utf8');
  assert.match(source, /artifact_type: 'report_json'/);
  assert.match(source, /copyReportText\('methods_text', 'Methods'\)/);
  assert.match(source, /copyReportText\('figure_caption', 'Figure caption'\)/);
  assert.doesNotMatch(source, /trackUsage\([^\n]*(accession|coordinates|caption|methods|error)/i);
});
