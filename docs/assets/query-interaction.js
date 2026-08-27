(function initialiseQueryInteraction(root, factory) {
  const api = factory();
  root.AgamCsQueryInteraction = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(globalThis, () => {
  function installQuerySubmissionGuard({
    form,
    button,
    run,
    onUnexpectedError,
    busyText = 'Running query…',
  }) {
    const idleText = button.textContent;
    let queryInFlight = false;
    let activePromise = Promise.resolve();

    function handleSubmit(event) {
      event.preventDefault();
      if (queryInFlight) return false;
      queryInFlight = true;
      button.disabled = true;
      button.textContent = busyText;
      button.setAttribute('aria-busy', 'true');
      form.setAttribute('aria-busy', 'true');

      activePromise = (async () => {
        try {
          await run();
        } catch (error) {
          onUnexpectedError(error);
        } finally {
          queryInFlight = false;
          button.disabled = false;
          button.textContent = idleText;
          button.removeAttribute('aria-busy');
          form.removeAttribute('aria-busy');
        }
      })();
      return true;
    }

    form.addEventListener('submit', handleSubmit);
    return {
      isQueryInFlight: () => queryInFlight,
      whenIdle: () => activePromise,
    };
  }

  return { installQuerySubmissionGuard };
}));
