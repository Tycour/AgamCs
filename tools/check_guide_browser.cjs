/* Optional real-browser smoke test. Requires Playwright, an installed browser,
   the local Pages server, and the normal public genomic data source. */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const catalogue = require('../docs/assets/data/guide-catalogue.json');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(process.env.GUIDE_PREVIEW_URL || 'http://127.0.0.1:8877/', { waitUntil: 'networkidle' });
    if (await page.locator('#analytics-reject').isVisible()) await page.locator('#analytics-reject').click();
    async function waitForQuery() {
      await page.waitForFunction(() => document.querySelector('#result-status').textContent === 'Complete' || document.querySelector('#result-status').textContent === 'Failed', {}, { timeout: 45000 });
      assert.equal(await page.locator('#result-status').textContent(), 'Complete', await page.locator('#benchmark-status').textContent());
    }
    async function example(name, count) {
      await page.locator('#guide-examples button').filter({ hasText: name }).click();
      await waitForQuery();
      await page.waitForFunction((n) => document.querySelector('#guide-body').children.length === n, count);
      assert.equal(await page.locator('input[name="live-query-mode"][value="coordinates"]').isChecked(), true);
    }
    await example('AGAP006241', 197);
    await page.locator('#guide-sort').selectOption('spacer_mean_cs');
    assert.equal(await page.locator('#guide-sort-direction').inputValue(),'desc');
    const sortedCs = await page.locator('#guide-body tr').evaluateAll((rows) => rows.map((row) => Number(row.children[4].textContent)));
    assert.deepEqual(sortedCs,[...sortedCs].sort((a,b)=>b-a));
    await page.locator('#guide-filter-spacer_mean_cs-min').fill('0.2');
    await page.locator('#guide-filter-spacer_mean_cs-max').fill('0.3');
    const filteredCs = await page.locator('#guide-body tr').evaluateAll((rows) => rows.map((row) => Number(row.children[4].textContent)));
    assert.ok(filteredCs.length>0 && filteredCs.every((value)=>value>=0.2 && value<=0.3));
    await page.locator('#guide-filter-spacer_mean_cs-min').fill('');
    await page.locator('#guide-filter-spacer_mean_cs-max').fill('');
    await page.locator('#guide-filter-text').fill('exact reference matches');
    const filteredWarnings = await page.locator('#guide-body tr').allTextContents();
    assert.ok(filteredWarnings.length>0 && filteredWarnings.every((row)=>row.toLowerCase().includes('exact reference matches')));
    await page.locator('#guide-filter-text').fill('');
    await page.locator('#guide-filter-spacer_mean_cs-min').fill('');
    await page.locator('#guide-filter-spacer_mean_cs-max').fill('');
    await page.locator('#guide-sort').selectOption('tool_rank');
    await page.locator('#guide-overlay').check();
    await page.waitForFunction(() => document.querySelectorAll('.guide-overlay').length === 2);
    const chosen = catalogue.regions.find((r) => r.id === 'AGAP006241').guides.find((g) => g.strand === '+');
    await page.locator(`[data-guide-id="${chosen.id}"]`).click();
    assert.match(await page.locator('#guide-details').textContent(), new RegExp(chosen.spacer));
    const report = await page.evaluate(async () => (await fetch(document.querySelector('#guide-json-download').href)).json());
    assert.equal(report.selected_guide, chosen.id); assert.equal(report.guides.length,197);
    assert.equal(report.display.sort_by,'tool_rank'); assert.equal(report.display.sort_direction,'asc');
    assert.equal(report.guides[0].spacer_context.bases,20); assert.equal(report.guides[0].pam_context.bases,3);
    const svg = await page.evaluate(async () => (await fetch(document.querySelector('#live-signal-download').href)).text());
    assert.ok(svg.includes(chosen.spacer)); assert.ok(svg.includes('guide-overlay'));
    const tsv = await page.evaluate(async () => (await fetch(document.querySelector('#guide-download').href)).text());
    assert.equal(tsv.trim().split('\n').length,198); assert.ok(tsv.includes('pam_mean_snp_density')); assert.ok(tsv.includes('display_order'));
    await page.locator('#guide-details button').click();
    await page.waitForFunction(() => Number(document.querySelector('#plot-range-end').value) - Number(document.querySelector('#plot-range-start').value) <= 62);
    assert.equal(await page.locator('#guide-body tr').count(),197);
    await page.locator('#plot-range-reset').click();
    if (process.env.GUIDE_SCREENSHOTS) {
      await page.locator('#guide-panel').screenshot({path:process.env.GUIDE_SCREENSHOTS+'/guide-panel.png'});
      await page.locator('#live-signals-panel').screenshot({path:process.env.GUIDE_SCREENSHOTS+'/guide-plot.png'});
    }
    await example('AGAP010449',249);
    assert.equal(await page.locator('.guide-overlay').count(),2);
    assert.match(await page.locator('#live-signal-plot').textContent(), /AGAP010449/);
    await example('Benchmark locus',60);
    const repeated = catalogue.regions[0].guides.find((g) => g.exact_matches > 1);
    await page.locator(`[data-guide-id="${repeated.id}"]`).click();
    assert.match(await page.locator('#guide-details').textContent(),/exact reference matches/);
    await example('AGAP009678',9);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.locator('#guide-enable').isVisible(),true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    await page.locator('#guide-overlay').uncheck();
    await page.waitForFunction(() => document.querySelectorAll('.guide-overlay').length === 0);
    // Covered interval too short for a complete guide: a genuine empty result.
    await page.locator('#benchmark-start').fill('38377342'); await page.locator('#benchmark-end').fill('38377352');
    await page.locator('#benchmark-submit').click(); await waitForQuery();
    await page.waitForFunction(() => document.querySelector('#guide-status').textContent.includes('No complete'));
    assert.equal(await page.locator('#guide-body tr').count(),0);
    // Extending outside catalogue coverage must not return an incomplete shortlist.
    await page.locator('#benchmark-start').fill('38377341'); await page.locator('#benchmark-end').fill('38377436');
    await page.locator('#benchmark-submit').click(); await waitForQuery();
    await page.waitForFunction(() => document.querySelector('#guide-status').textContent.includes('not yet available'));
    assert.equal(await page.locator('#guide-download').isVisible(),false);
    assert.equal(await page.locator('.guide-overlay').count(),0);
    assert.deepEqual(errors,[]);
    console.log('PASS: 4 real intervals, native selection, context, TSV/JSON/SVG, zoom, repeat warnings, reverse gene, mobile, empty and unavailable states; no page errors.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode=1; });
