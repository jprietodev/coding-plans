(() => {
  let attempts = 0;
  const maxAttempts = 200;

  function syncDerivedColumnToggles() {
    if (typeof compareState === 'undefined' || typeof compareEls === 'undefined') return;
    for (const key of ['efficiency_score', 'benchmark_coverage']) {
      const input = compareEls.columnOptions?.querySelector(`input[value="${key}"]`);
      if (input) input.checked = !compareState.hiddenColumns.has(key);
    }
  }

  function finishBootstrap() {
    attempts += 1;
    if (typeof state === 'undefined' || !state.rows?.length) {
      if (attempts < maxAttempts) setTimeout(finishBootstrap, 25);
      return;
    }

    syncDerivedColumnToggles();
    if (typeof render === 'function') render();
    if (typeof renderCompareTray === 'function') renderCompareTray();
    if (typeof renderComparison === 'function' && state.view === 'compare') renderComparison();
    window.__codingPlansReady = true;
  }

  finishBootstrap();
})();