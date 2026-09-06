(function initialiseAnalytics(root, factory) {
  const api = factory();
  root.AgamCsAnalytics = api;
  if (typeof module === 'object' && module.exports) module.exports = api;

  if (root.document) {
    const script = root.document.currentScript;
    const measurementId = script?.dataset?.measurementId || '';
    let storage;
    try {
      storage = root.localStorage;
    } catch (_error) {
      storage = null;
    }
    const start = () => api.attachToPage({
      measurementId,
      document: root.document,
      location: root.location,
      storage,
      windowObject: root,
    });
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }
  }
}(globalThis, () => {
  const STORAGE_KEY = 'agamcs.analytics-consent.v1';
  const CONSENT_GRANTED = 'granted';
  const CONSENT_DENIED = 'denied';
  const EVENT_RULES = Object.freeze({
    query_success: Object.freeze({
      query_mode: new Set(['accession', 'coordinates']),
      query_kind: new Set(['gene', 'transcript', 'coordinates']),
    }),
    file_download: Object.freeze({
      artifact_type: new Set(['tsv', 'signal_svg', 'heatmap_svg', 'report_json']),
    }),
  });
  let activeController = null;

  function isMeasurementId(value) {
    const normalized = String(value || '').trim().toUpperCase();
    const placeholder = /^G-(?:X+|TEST[A-Z0-9]*|LOCAL[A-Z0-9]*|PLACEHOLDER[A-Z0-9]*)$/;
    return /^G-[A-Z0-9]{6,}$/.test(normalized) && !placeholder.test(normalized);
  }

  function safePageLocation(location) {
    if (!location) return '';
    const origin = String(location.origin || '');
    const pathname = String(location.pathname || '/').replace(/[^\u0020-\u007e]/g, '');
    return `${origin}${pathname}`;
  }

  function safePageReferrer(value) {
    if (!value) return '';
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    } catch (_error) {
      return '';
    }
  }

  function sanitizeEvent(eventName, parameters) {
    const rules = EVENT_RULES[eventName];
    if (!rules || !parameters || typeof parameters !== 'object') return null;
    const sanitized = {};
    for (const [name, values] of Object.entries(rules)) {
      const value = parameters[name];
      if (!values.has(value)) return null;
      sanitized[name] = value;
    }
    return sanitized;
  }

  function readConsent(storage) {
    try {
      const value = storage?.getItem(STORAGE_KEY);
      return [CONSENT_GRANTED, CONSENT_DENIED].includes(value) ? value : null;
    } catch (_error) {
      return null;
    }
  }

  function writeConsent(storage, value) {
    try {
      storage?.setItem(STORAGE_KEY, value);
      return Boolean(storage);
    } catch (_error) {
      return false;
    }
  }

  function removeAnalyticsCookies(document, location) {
    if (!document || typeof document.cookie !== 'string') return;
    const cookieNames = document.cookie.split(';')
      .map((part) => part.trim().split('=')[0])
      .filter((name) => name === '_ga' || name.startsWith('_ga_'));
    const paths = ['/', '/AgamCs', '/AgamCs/'];
    const domain = String(location?.hostname || '');
    cookieNames.forEach((name) => {
      paths.forEach((path) => {
        document.cookie = `${name}=; Max-Age=0; path=${path}; SameSite=Lax`;
        if (domain) {
          document.cookie = `${name}=; Max-Age=0; path=${path}; domain=${domain}; SameSite=Lax`;
        }
      });
    });
  }

  function createController(options = {}) {
    const measurementId = String(options.measurementId || '').trim().toUpperCase();
    const document = options.document;
    const location = options.location;
    const storage = options.storage;
    const windowObject = options.windowObject || globalThis;
    const dataLayer = options.dataLayer || windowObject.dataLayer || [];
    const now = options.now || (() => new Date());
    const loadScript = options.loadScript || ((source) => {
      const script = document.createElement('script');
      script.async = true;
      script.src = source;
      script.dataset.agamcsAnalytics = 'true';
      script.addEventListener('error', () => {}, { once: true });
      document.head.append(script);
      return script;
    });
    windowObject.dataLayer = dataLayer;

    let consent = readConsent(storage);
    let scriptRequested = false;

    function command() {
      dataLayer.push(arguments);
    }

    function configureTag() {
      if (!isMeasurementId(measurementId) || consent !== CONSENT_GRANTED) return false;
      windowObject[`ga-disable-${measurementId}`] = false;
      if (!scriptRequested) {
        scriptRequested = true;
        try {
          loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`);
        } catch (_error) {
          // Ad blockers and network policy must not affect the explorer.
        }
        command('js', now());
      }
      command('config', measurementId, {
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        page_location: safePageLocation(location),
        page_referrer: safePageReferrer(document?.referrer),
      });
      return true;
    }

    function setConsent(value) {
      if (![CONSENT_GRANTED, CONSENT_DENIED].includes(value)) return false;
      const previous = consent;
      consent = value;
      writeConsent(storage, value);
      if (value === CONSENT_GRANTED) {
        if (previous !== CONSENT_GRANTED) configureTag();
      } else {
        windowObject[`ga-disable-${measurementId}`] = true;
        removeAnalyticsCookies(document, location);
      }
      return true;
    }

    function track(eventName, parameters) {
      if (consent !== CONSENT_GRANTED || !isMeasurementId(measurementId)) return false;
      const sanitized = sanitizeEvent(eventName, parameters);
      if (!sanitized) return false;
      command('event', eventName, sanitized);
      return true;
    }

    function initialise() {
      if (consent === CONSENT_GRANTED) configureTag();
      return consent;
    }

    return {
      configured: isMeasurementId(measurementId),
      get consent() { return consent; },
      initialise,
      setConsent,
      track,
    };
  }

  function attachToPage(options = {}) {
    const document = options.document;
    const controller = createController(options);
    activeController = controller;
    const panel = document?.querySelector('#analytics-consent');
    const settings = document?.querySelector('#analytics-settings');
    const accept = document?.querySelector('#analytics-accept');
    const reject = document?.querySelector('#analytics-reject');
    const status = document?.querySelector('#analytics-consent-status');

    if (!controller.configured || !panel || !settings || !accept || !reject || !status) {
      if (settings) settings.hidden = true;
      if (panel) panel.hidden = true;
      return controller;
    }

    settings.hidden = false;
    function describeConsent() {
      status.textContent = controller.consent === CONSENT_GRANTED
        ? 'Analytics are currently accepted. Choose Reject analytics to withdraw consent.'
        : controller.consent === CONSENT_DENIED
          ? 'Analytics are currently rejected. Choose Accept analytics to change this setting.'
          : 'No analytics choice has been saved.';
    }
    let openedFromSettings = false;
    function openPanel(fromSettings = false) {
      openedFromSettings = fromSettings;
      describeConsent();
      panel.hidden = false;
      if (fromSettings) panel.focus();
    }
    function closePanel() {
      panel.hidden = true;
      if (openedFromSettings) settings.focus();
      openedFromSettings = false;
    }

    settings.addEventListener('click', () => openPanel(true));
    accept.addEventListener('click', () => {
      controller.setConsent(CONSENT_GRANTED);
      closePanel();
    });
    reject.addEventListener('click', () => {
      controller.setConsent(CONSENT_DENIED);
      closePanel();
    });

    const storedConsent = controller.initialise();
    if (!storedConsent) openPanel();
    return controller;
  }

  function track(eventName, parameters) {
    return activeController?.track(eventName, parameters) || false;
  }

  return {
    STORAGE_KEY,
    CONSENT_GRANTED,
    CONSENT_DENIED,
    createController,
    attachToPage,
    isMeasurementId,
    safePageLocation,
    safePageReferrer,
    sanitizeEvent,
    track,
  };
}));
