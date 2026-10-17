const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../docs/assets/guide-design.js');
const catalogue = require('../docs/assets/data/guide-catalogue.json');
require('../docs/assets/query-summary.js');
const region = catalogue.regions[0];
const result = { chromosome: region.chromosome, start: region.start, end: region.end,
  values: { Cs: Array(1000).fill(0.3), snp_density: Array(1000).fill(0.1), status: Array(1000).fill(1) } };

test('catalogue preserves native order, full geometry and explicit bounded coverage', () => {
  assert.equal(api.validateCatalogue(catalogue), catalogue);
  assert.equal(catalogue.regions.reduce((n, r) => n + r.guides.length, 0), 515);
  for (const r of catalogue.regions) {
    assert.deepEqual(r.guides.map((g) => g.tool_rank), r.guides.map((g, i) => i + 1));
    const scores = r.guides.map((g) => g.mit_specificity).filter((v) => v !== null);
    assert.deepEqual(scores, [...scores].sort((a,b) => b-a));
    for (const g of r.guides) assert.equal(g.off_target_count, g.mismatch_counts.reduce((a,b) => a+b,0));
    for (const g of r.guides) {
      const offset = g.start - g.sequence_context_start;
      const target = g.sequence_context.slice(offset, offset + 23);
      const reverse = (value) => value.replace(/[ACGT]/g, (base) => ({ A:'T', C:'G', G:'C', T:'A' })[base]).split('').reverse().join('');
      assert.equal(g.strand === '+' ? target : reverse(target), g.spacer + g.pam);
      assert.ok(offset >= 0 && offset + 23 <= g.sequence_context.length);
    }
  }
});
test('no catalogue coverage is distinct from a covered interval with no guides', () => {
  assert.equal(api.guidesForQuery(catalogue, { ...result, chromosome: 'X' }).available, false);
  assert.equal(api.guidesForQuery(catalogue, { ...result, start: region.start-1 }).available, false);
  const empty = api.guidesForQuery(catalogue, { ...result, end: region.start+10 });
  assert.equal(empty.available, true); assert.equal(empty.guides.length, 0);
});
test('both spacer and PAM must fit in query, preserving tool order in subsets', () => {
  const g = region.guides[0];
  assert.deepEqual(api.guidesForQuery(catalogue, { ...result, start:g.start, end:g.end }).guides.map((x) => x.id), [g.id]);
  assert.equal(api.guidesForQuery(catalogue, { ...result, start:g.start, end:g.end-1 }).guides.length,0);
});
test('guide context agrees with existing exact interval summaries including missing data', () => {
  const altered = structuredClone(result); const guide = region.guides[0]; const i = guide.spacer_start-result.start;
  altered.values.Cs[i] = null; altered.values.Cs[i+1] = NaN;
  altered.values.status[i] = 0; altered.values.snp_density[i] = 999;
  altered.values.snp_density[i+1] = null;
  const [g] = api.contextualize([guide], altered);
  const scope = globalThis.AgamCsQuerySummary.summarizeInterval(altered, guide.spacer_start, guide.spacer_end).scope;
  assert.equal(g.spacer_context.finite_cs_bases,18); assert.equal(g.spacer_context.finite_accessible_snp_bases,18);
  assert.equal(g.spacer_context.mean_cs,scope.mean_cs);
  assert.equal(g.spacer_context.mean_snp_density,scope.mean_accessible_snp_density);
  assert.equal(g.pam_context.bases,3); assert.equal(g.pam_context.finite_cs_bases,3);
});
test('QC failed and absent SNP data stay unknown, while real zero stays zero', () => {
  const altered = structuredClone(result); altered.values.status.fill(0);
  assert.equal(api.contextualize([region.guides[0]],altered)[0].spacer_context.mean_snp_density,null);
  altered.values.status.fill(1); altered.values.snp_density.fill(0);
  assert.equal(api.contextualize([region.guides[0]],altered)[0].spacer_context.mean_snp_density,0);
  assert.throws(() => api.contextualize(region.guides,{...result,values:{}}),/Exact query/);
});
test('reverse guide geometry puts PAM before spacer in genomic coordinates', () => {
  const g = region.guides.find((g) => g.strand === '-');
  assert.equal(g.pam_start,g.start); assert.equal(g.pam_end+1,g.spacer_start);
  const context = api.contextualize([g],result)[0]; assert.equal(context.spacer_context.bases,20);
});
test('repeated matches stay visible with a warning without changing score/order', () => {
  const guides = api.contextualize(api.guidesForQuery(catalogue,result).guides,result);
  const repeats = guides.filter((g) => g.exact_matches > 1);
  assert.ok(repeats.length > 0); assert.ok(repeats.every((g) => g.warnings.some((w) => w.includes('exact reference matches'))));
  assert.deepEqual(guides.map((g) => g.tool_rank),region.guides.map((g) => g.tool_rank));
});
test('users can sort all exposed metrics while ties retain native CRISPOR order', () => {
  const guides = api.contextualize(region.guides.slice(0, 4), result).map((g, i) => ({
    ...g,
    mit_specificity: [75, 90, 90, null][i],
    spacer_context: { ...g.spacer_context, mean_cs: [0.2, 0.8, 0.5, null][i], mean_snp_density: [0.1, 0.3, 0.05, null][i] },
  }));
  assert.deepEqual(api.sortGuides(guides, 'tool_rank').map((g) => g.tool_rank), [1, 2, 3, 4]);
  assert.deepEqual(api.sortGuides(guides, 'spacer_mean_cs').map((g) => g.tool_rank), [2, 3, 1, 4]);
  assert.deepEqual(api.sortGuides(guides, 'spacer_mean_snp_density').map((g) => g.tool_rank), [3, 1, 2, 4]);
  assert.deepEqual(api.sortGuides(guides, 'mit_specificity').map((g) => g.tool_rank), [2, 3, 1, 4]);
  assert.deepEqual(api.sortGuides(guides, 'spacer_mean_cs', 'asc').map((g) => g.tool_rank), [1, 3, 2, 4]);
  assert.throws(() => api.sortGuides(guides, 'not-a-column'));
});
test('numeric and text filters are inclusive and unavailable values remain excluded', () => {
  const guides = api.contextualize(region.guides.slice(0, 4), result).map((g, i) => ({
    ...g, mit_specificity: [75, 90, 90, null][i], exact_matches: [1, 2, 3, 4][i],
    spacer_context: { ...g.spacer_context, mean_cs: [0.2, 0.8, 0.5, null][i] },
    warnings: i === 1 ? ['Repeated exact reference matches'] : g.warnings,
  }));
  assert.deepEqual(api.filterGuides(guides, { spacer_mean_cs: { min: 0.2, max: 0.5 } }).map((g) => g.tool_rank), [1, 3]);
  assert.deepEqual(api.filterGuides(guides, { mit_specificity: { min: 80, max: null } }).map((g) => g.tool_rank), [2, 3]);
  assert.deepEqual(api.filterGuides(guides, { text: 'exact reference matches' }).map((g) => g.tool_rank), [2]);
  assert.deepEqual(api.filterGuides(guides, { exact_matches: { min: 2, max: 3 } }).map((g) => g.tool_rank), [2, 3]);
  assert.throws(() => api.filterGuides(guides, { spacer_mean_cs: { min: 0.7, max: 0.3 } }), /Minimum exceeds maximum/);
});
test('TSV distinguishes missing from zero and includes denominators and search provenance', () => {
  const altered=structuredClone(result); altered.values.status.fill(0);
  const tsv=api.asTsv(api.contextualize([region.guides[0]],altered),catalogue);
  assert.match(tsv,/spacer_finite_accessible_snp_bases/); assert.match(tsv,/pam_mean_cs/); assert.match(tsv,/reference_sha256/);
  const [keys,values]=tsv.trim().split('\n').map((line) => line.split('\t'));
  assert.equal(values[keys.indexOf('spacer_mean_snp_density')],'NA');
  assert.equal(values[keys.indexOf('spacer_finite_accessible_snp_bases')],'0');
});
test('overlay clipping handles reverse axes and guides outside the viewport', () => {
  const range={start:100,end:200}; const scale=(x) => x; const reverse=(p) => 300-p;
  assert.deepEqual(api.clippedSegment(150,169,range,scale,reverse,0,300),{x:130.5,width:20});
  assert.equal(api.clippedSegment(201,223,range,scale,reverse,0,300),null);
  assert.deepEqual(api.clippedSegment(90,110,range,scale,(p)=>p,100,200),{x:100,width:10.5});
});
test('invalid PAM scope and shifted geometry fail closed', () => {
  const changed=structuredClone(catalogue); changed.off_target_pams.push('NAG'); assert.throws(()=>api.validateCatalogue(changed));
  changed.off_target_pams=['NGG']; changed.regions[0].guides[0].pam_start+=1; assert.throws(()=>api.validateCatalogue(changed));
});
