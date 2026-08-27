const test = require('node:test');
const assert = require('node:assert/strict');

const { installQuerySubmissionGuard } = require('../docs/assets/query-interaction.js');

class FakeElement {
  constructor(textContent = '') {
    this.textContent = textContent;
    this.disabled = false;
    this.attributes = new Map();
    this.listeners = new Map();
  }

  addEventListener(type, listener) { this.listeners.set(type, listener); }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }

  removeAttribute(name) { this.attributes.delete(name); }

  getAttribute(name) { return this.attributes.get(name); }

  submit(trigger = 'click') {
    const event = { defaultPrevented: false, trigger, preventDefault() { this.defaultPrevented = true; } };
    this.listeners.get('submit')(event);
    return event;
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('click, Enter, and requestSubmit produce one request and immediate accessible busy state', async () => {
  const form = new FakeElement();
  const button = new FakeElement('Run query');
  const worker = deferred();
  let workerRequests = 0;
  const controller = installQuerySubmissionGuard({
    form,
    button,
    async run() {
      workerRequests += 1;
      await worker.promise;
    },
    onUnexpectedError(error) { throw error; },
  });

  for (const trigger of ['click', 'Enter', 'requestSubmit']) {
    assert.equal(form.submit(trigger).defaultPrevented, true);
  }
  assert.equal(workerRequests, 1);
  assert.equal(controller.isQueryInFlight(), true);
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, 'Running query…');
  assert.equal(button.getAttribute('aria-busy'), 'true');
  assert.equal(form.getAttribute('aria-busy'), 'true');

  worker.resolve();
  await controller.whenIdle();
  assert.equal(controller.isQueryInFlight(), false);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, 'Run query');
  assert.equal(button.getAttribute('aria-busy'), undefined);
  assert.equal(form.getAttribute('aria-busy'), undefined);
});

test('busy state persists through accession, fetch, plot, SVG, and TSV phases', async () => {
  const form = new FakeElement();
  const button = new FakeElement('Run query');
  const phases = Array.from({ length: 5 }, deferred);
  const controller = installQuerySubmissionGuard({
    form,
    button,
    async run() {
      for (const phase of phases) await phase.promise;
    },
    onUnexpectedError(error) { throw error; },
  });

  form.submit();
  for (const phase of phases) {
    assert.equal(button.disabled, true);
    assert.equal(controller.isQueryInFlight(), true);
    phase.resolve();
    await Promise.resolve();
  }
  await controller.whenIdle();
  assert.equal(button.disabled, false);
});

for (const outcome of ['success', 'validation failure', 'worker failure', 'unexpected error']) {
  test(`button state is restored after ${outcome}`, async () => {
    const form = new FakeElement();
    const button = new FakeElement('Run query');
    let unexpectedErrors = 0;
    const controller = installQuerySubmissionGuard({
      form,
      button,
      async run() {
        if (outcome === 'unexpected error') throw new Error(outcome);
        if (outcome.endsWith('failure')) {
          try {
            throw new Error(outcome);
          } catch (_error) {
            // Expected validation and worker failures are rendered by site.js.
          }
        }
      },
      onUnexpectedError() { unexpectedErrors += 1; },
    });

    form.submit();
    await controller.whenIdle();
    assert.equal(button.disabled, false);
    assert.equal(button.textContent, 'Run query');
    assert.equal(controller.isQueryInFlight(), false);
    assert.equal(unexpectedErrors, outcome === 'unexpected error' ? 1 : 0);
  });
}
