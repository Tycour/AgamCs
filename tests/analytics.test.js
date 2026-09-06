const test = require('node:test');
const assert = require('node:assert/strict');

const analytics = require('../docs/assets/analytics.js');

const MEASUREMENT_ID = 'G-A1B2C3D4E5';

function storageWith(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); },
  };
}

function commandValues(dataLayer) {
  return dataLayer.map((entry) => Array.from(entry));
}

function controllerFixture(overrides = {}) {
  const dataLayer = [];
  const loaded = [];
  const windowObject = {};
  const storage = storageWith();
  const cookieWrites = [];
  const document = {
    get cookie() { return '_ga=client; _ga_A1B2C3D4E5=session; unrelated=keep'; },
    set cookie(value) { cookieWrites.push(value); },
  };
  const controller = analytics.createController({
    measurementId: MEASUREMENT_ID,
    document,
    location: {
      origin: 'https://tycour.github.io',
      pathname: '/AgamCs/',
      search: '?accession=AGAP006241',
      hash: '#explorer',
      hostname: 'tycour.github.io',
    },
    storage,
    windowObject,
    dataLayer,
    loadScript(source) { loaded.push(source); },
    now: () => new Date('2026-08-26T00:00:00Z'),
    ...overrides,
  });
  return { controller, dataLayer, loaded, windowObject, storage, cookieWrites };
}

test('no choice defaults to no Google request or analytics command', () => {
  const fixture = controllerFixture();
  assert.equal(fixture.controller.initialise(), null);
  assert.deepEqual(fixture.loaded, []);
  assert.deepEqual(fixture.dataLayer, []);
  assert.equal(fixture.controller.track('query_success', {
    query_mode: 'accession', query_kind: 'gene',
  }), false);
});

test('acceptance persists consent and configures one sanitized page view', () => {
  const fixture = controllerFixture();
  assert.equal(fixture.controller.setConsent(analytics.CONSENT_GRANTED), true);
  assert.equal(fixture.storage.getItem(analytics.STORAGE_KEY), analytics.CONSENT_GRANTED);
  assert.deepEqual(fixture.loaded, [
    `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`,
  ]);
  const commands = commandValues(fixture.dataLayer);
  assert.equal(commands[0][0], 'js');
  assert.deepEqual(commands[1], [
    'config', MEASUREMENT_ID, {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      page_location: 'https://tycour.github.io/AgamCs/',
      page_referrer: '',
    },
  ]);
  assert.equal(fixture.windowObject[`ga-disable-${MEASUREMENT_ID}`], false);
});

test('persisted acceptance configures analytics on the next page load', () => {
  const fixture = controllerFixture({
    storage: storageWith({ [analytics.STORAGE_KEY]: analytics.CONSENT_GRANTED }),
  });
  assert.equal(fixture.controller.initialise(), analytics.CONSENT_GRANTED);
  assert.equal(fixture.loaded.length, 1);
});

test('rejection persists without contacting Google', () => {
  const fixture = controllerFixture();
  fixture.controller.setConsent(analytics.CONSENT_DENIED);
  assert.equal(fixture.storage.getItem(analytics.STORAGE_KEY), analytics.CONSENT_DENIED);
  assert.deepEqual(fixture.loaded, []);
  assert.deepEqual(fixture.dataLayer, []);
});

test('withdrawing consent disables events and removes only GA cookies', () => {
  const fixture = controllerFixture();
  fixture.controller.setConsent(analytics.CONSENT_GRANTED);
  assert.equal(fixture.controller.track('query_success', {
    query_mode: 'coordinates', query_kind: 'coordinates',
  }), true);
  fixture.controller.setConsent(analytics.CONSENT_DENIED);
  assert.equal(fixture.windowObject[`ga-disable-${MEASUREMENT_ID}`], true);
  assert.equal(fixture.controller.track('file_download', { artifact_type: 'tsv' }), false);
  assert.ok(fixture.cookieWrites.some((value) => value.startsWith('_ga=')));
  assert.ok(fixture.cookieWrites.some((value) => value.startsWith('_ga_A1B2C3D4E5=')));
  assert.ok(fixture.cookieWrites.every((value) => !value.startsWith('unrelated=')));
});

test('repeated acceptance never loads or configures the tag twice', () => {
  const fixture = controllerFixture();
  fixture.controller.setConsent(analytics.CONSENT_GRANTED);
  fixture.controller.setConsent(analytics.CONSENT_GRANTED);
  assert.equal(fixture.loaded.length, 1);
  assert.equal(commandValues(fixture.dataLayer).filter(([name]) => name === 'config').length, 1);
});

test('a blocked tag loader cannot break consent or local site behavior', () => {
  const fixture = controllerFixture({
    loadScript() { throw new Error('blocked'); },
  });
  assert.doesNotThrow(() => fixture.controller.setConsent(analytics.CONSENT_GRANTED));
  assert.equal(fixture.controller.track('file_download', { artifact_type: 'signal_svg' }), true);
});

test('event allowlist drops raw query fields and rejects unknown categories', () => {
  const fixture = controllerFixture();
  fixture.controller.setConsent(analytics.CONSENT_GRANTED);
  assert.equal(fixture.controller.track('query_success', {
    query_mode: 'accession',
    query_kind: 'transcript',
    accession: 'AGAP006241-RA',
    coordinates: '2L:1-100',
    result: [1, 2, 3],
  }), true);
  assert.equal(fixture.controller.track('query_success', {
    query_mode: 'accession', query_kind: 'unknown',
  }), false);
  assert.equal(fixture.controller.track('query_error', { error: 'secret' }), false);
  const event = commandValues(fixture.dataLayer).find(([name]) => name === 'event');
  assert.deepEqual(event, [
    'event', 'query_success', { query_mode: 'accession', query_kind: 'transcript' },
  ]);
  assert.doesNotMatch(JSON.stringify(commandValues(fixture.dataLayer)), /AGAP|2L:|result|secret/);
});

test('report downloads admit only their coarse artifact type', () => {
  const fixture = controllerFixture();
  fixture.controller.setConsent(analytics.CONSENT_GRANTED);
  assert.equal(fixture.controller.track('file_download', {
    artifact_type: 'report_json', filename: 'AgamCs_AGAP006241_report.json', caption: 'private',
  }), true);
  const event = commandValues(fixture.dataLayer).find(([name]) => name === 'event');
  assert.deepEqual(event, ['event', 'file_download', { artifact_type: 'report_json' }]);
  assert.doesNotMatch(JSON.stringify(event), /AGAP|caption|filename/);
});

test('placeholder IDs are disabled and page locations omit query strings and fragments', () => {
  assert.equal(analytics.isMeasurementId('G-XXXXXXXXXX'), false);
  assert.equal(analytics.isMeasurementId('G-LOCALTEST1'), false);
  assert.equal(analytics.isMeasurementId(MEASUREMENT_ID), true);
  assert.equal(analytics.safePageLocation({
    origin: 'https://example.test', pathname: '/AgamCs/', search: '?secret=1', hash: '#query',
  }), 'https://example.test/AgamCs/');
  assert.equal(
    analytics.safePageReferrer('https://example.test/source?accession=AGAP006241#details'),
    'https://example.test/source',
  );
});
