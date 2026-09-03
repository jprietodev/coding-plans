const compareStorageKeys = {
  selected: 'coding-plans:selected-comparisons',
  hiddenColumns: 'coding-plans:hidden-columns',
};

const compareState = {
  selected: new Set(),
  hiddenColumns: new Set(),
};

function readStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function persistCompareState() {
  try {
    localStorage.setItem(compareStorageKeys.selected, JSON.stringify([...compareState.selected]));
    localStorage.setItem(compareStorageKeys.hiddenColumns, JSON.stringify([...compareState.hiddenColumns]));
  } catch {
    // Local storage is an enhancement; the comparator still works without it.
  }
}

compareState.selected = new Set(readStoredArray(compareStorageKeys.selected));
compareState.hiddenColumns = new Set(readStoredArray(compareStorageKeys.hiddenColumns));
compareState.hiddenColumns.delete('model');

const rowKey = (row) => [row.provider, row.plan, row.model].join('\u001f');
const encodedRowKey = (row) => encodeURIComponent(rowKey(row));

const viewTabs = document.querySelector('.view-tabs');
const quadrantView = document.querySelector('#quadrant-view');

viewTabs.insertAdjacentHTML('beforeend', `
  <button id="compare-tab" class="view-tab" type="button" role="tab" aria-selected="false" aria-controls="compare-view">
    Compare <span id="compare-tab-count" class="tab-count" hidden>0</span>
  </button>`);

quadrantView.insertAdjacentHTML('afterend', `
  <section id="compare-view" class="compare-view" role="tabpanel" aria-labelledby="compare-tab" hidden>
    <div class="compare-heading">
      <div>
        <p class="eyebrow">Side-by-side</p>
        <h2>Model comparison</h2>
        <p class="compare-description">Add any number of model + plan combinations from the table. Best numeric values are highlighted for each metric.</p>
      </div>
      <button id="compare-clear" class="secondary-button" type="button">Clear comparison</button>
    </div>
    <div id="compare-empty" class="compare-empty">
      Add models from the table using <strong>+ Compare</strong> to build a side-by-side comparison.
    </div>
    <div id="compare-wrap" class="compare-wrap" hidden>
      <table id="compare-table" class="compare-table"></table>
    </div>
  </section>`);

const toolbar = document.createElement('div');
toolbar.className = 'view-toolbar';
viewTabs.parentNode.insertBefore(toolbar, viewTabs);
toolbar.append(viewTabs);
toolbar.insertAdjacentHTML('beforeend', `
  <details id="column-picker" class="column-picker">
    <summary>Columns</summary>
    <div class="column-menu">
      <div class="column-menu-head">
        <strong>Visible columns</strong>
        <button id="columns-show-all" type="button">Show all</button>
      </div>
      <div id="column-options" class="column-options"></div>
    </div>
  </details>`);

document.body.insertAdjacentHTML('beforeend', `
  <aside id="compare-tray" class="compare-tray" hidden aria-live="polite">
    <div class="compare-tray-inner">
      <div>
        <strong><span id="compare-tray-count">0</span> selected</strong>
        <div id="compare-tray-models" class="compare-tray-models"></div>
      </div>
      <div class="compare-tray-actions">
        <button id="compare-tray-clear" class="secondary-button" type="button">Clear</button>
        <button id="compare-tray-open" class="primary-button" type="button">Compare side by side</button>
      </div>
    </div>
  </aside>`);

els.compareTab = document.querySelector('#compare-tab');
els.compareView = document.querySelector('#compare-view');

const compareEls = {
  tab: els.compareTab,
  tabCount: document.querySelector('#compare-tab-count'),
  view: els.compareView,
  clear: document.querySelector('#compare-clear'),
  empty: document.querySelector('#compare-empty'),
  wrap: document.querySelector('#compare-wrap'),
  table: document.querySelector('#compare-table'),
  tray: document.querySelector('#compare-tray'),
  trayCount: document.querySelector('#compare-tray-count'),
  trayModels: document.querySelector('#compare-tray-models'),
  trayClear: document.querySelector('#compare-tray-clear'),
  trayOpen: document.querySelector('#compare-tray-open'),
  columnPicker: document.querySelector('#column-picker'),
  columnOptions: document.querySelector('#column-options'),
  columnsShowAll: document.querySelector('#columns-show-all'),
};

const columnDefinitions = els.sortHeaders.map((th) => {
  const button = th.querySelector('.sort-button');
  const indicator = button?.querySelector('.sort-indicator');
  const label = [...(button?.childNodes ?? [])]
    .filter((node) => node !== indicator)
    .map((node) => node.textContent)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { key: th.dataset.sort, label, th };
});

compareEls.columnOptions.innerHTML = columnDefinitions.map(({ key, label }) => {
  const locked = key === 'model';
  const checked = locked || !compareState.hiddenColumns.has(key);
  return `
    <label class="column-option">
      <input type="checkbox" value="${escapeHtml(key)}" ${checked ? 'checked' : ''} ${locked ? 'disabled' : ''}>
      <span>${escapeHtml(label)}${locked ? ' <small>required</small>' : ''}</span>
    </label>`;
}).join('');

function applyColumnVisibility() {
  const headers = [...document.querySelectorAll('th[data-sort]')];
  headers.forEach((th, index) => {
    const hidden = th.dataset.sort !== 'model' && compareState.hiddenColumns.has(th.dataset.sort);
    th.hidden = hidden;
    for (const tr of els.rows.querySelectorAll('tr')) {
      const cell = tr.children[index];
      if (cell) cell.hidden = hidden;
    }
  });
}

function comparisonRows() {
  if (!state.rows.length) return [];
  const byKey = new Map(state.rows.map((row) => [rowKey(row), row]));
  const rows = [];
  let changed = false;

  for (const key of compareState.selected) {
    const row = byKey.get(key);
    if (row) rows.push(row);
    else {
      compareState.selected.delete(key);
      changed = true;
    }
  }

  if (changed) persistCompareState();
  return rows;
}

function benchmarkFormat(row, valueKey, rankKey) {
  const value = row[valueKey];
  if (!finite(value)) return '—';
  const total = state.data?.benchmarks?.livebench?.rank_total;
  const rank = row[rankKey];
  const rankText = rank && total ? `<small>#${rank}/${total}</small>` : '';
  return `<strong>${Number(value).toFixed(1)}</strong>${rankText}`;
}

const comparisonMetrics = [
  { label: 'Plan', value: (row) => `${row.provider} · ${row.plan}`, format: (value) => escapeHtml(value) },
  { label: 'LB Overall', value: (row) => row.livebench_overall, better: 'high', formatRow: (row) => benchmarkFormat(row, 'livebench_overall', 'livebench_overall_rank') },
  { label: 'LB Coding', value: (row) => row.livebench_coding, better: 'high', formatRow: (row) => benchmarkFormat(row, 'livebench_coding', 'livebench_coding_rank') },
  { label: 'LB Agentic', value: (row) => row.livebench_agentic_coding, better: 'high', formatRow: (row) => benchmarkFormat(row, 'livebench_agentic_coding', 'livebench_agentic_coding_rank') },
  { label: 'Coding intelligence', value: (row) => metrics.coding_intelligence.value(row), better: 'high', format: (value) => finite(value) ? Number(value).toFixed(1) : '—' },
  { label: 'Monthly allowance', value: (row) => row.monthly_allowance_usd, better: 'high', format: (value) => money(value, 2) },
  { label: 'Value multiplier', value: (row) => row.value_multiplier, better: 'high', format: (value) => finite(value) ? `${Number(value).toFixed(2)}×` : '—' },
  { label: 'Discount vs API', value: (row) => row.discount_vs_api_pct, better: 'high', format: (value) => finite(value) ? `${Number(value).toFixed(1)}%` : '—' },
  { label: 'Input API', value: (row) => row.api_input_per_mt, better: 'low', format: (value) => money(value) },
  { label: 'Input effective', value: (row) => row.effective_input_per_mt, better: 'low', format: (value) => money(value) },
  { label: 'Output API', value: (row) => row.api_output_per_mt, better: 'low', format: (value) => money(value) },
  { label: 'Output effective', value: (row) => row.effective_output_per_mt, better: 'low', format: (value) => money(value) },
  { label: 'Cache read effective', value: (row) => row.effective_cache_read_per_mt, better: 'low', format: (value) => money(value) },
  { label: 'Cache write effective', value: (row) => row.effective_cache_write_per_mt, better: 'low', format: (value) => money(value) },
  { label: 'Coding cost', value: (row) => metrics.coding_cost.value(row), better: 'low', format: (value) => money(value) },
];

function bestValue(metric, rows) {
  if (!metric.better) return null;
  const values = rows.map(metric.value).filter(finite).map(Number);
  if (!values.length) return null;
  return metric.better === 'high' ? Math.max(...values) : Math.min(...values);
}

function renderComparison() {
  const rows = comparisonRows();
  compareEls.empty.hidden = rows.length > 0;
  compareEls.wrap.hidden = rows.length === 0;
  compareEls.clear.disabled = rows.length === 0;

  if (!rows.length) {
    compareEls.table.innerHTML = '';
    return;
  }

  const header = `
    <thead>
      <tr>
        <th class="comparison-metric">Metric</th>
        ${rows.map((row) => `
          <th class="comparison-model">
            <div class="comparison-model-head">
              <strong>${escapeHtml(row.model)}</strong>
              <small>${escapeHtml(row.provider)} · ${escapeHtml(row.plan)}</small>
              <button type="button" class="comparison-remove" data-compare-key="${encodedRowKey(row)}" aria-label="Remove ${escapeHtml(row.model)} from comparison">Remove</button>
            </div>
          </th>`).join('')}
      </tr>
    </thead>`;

  const body = comparisonMetrics.map((metric) => {
    const best = bestValue(metric, rows);
    return `
      <tr>
        <th class="comparison-metric" scope="row">${escapeHtml(metric.label)}</th>
        ${rows.map((row) => {
          const value = metric.value(row);
          const isBest = best !== null && finite(value) && Number(value) === best;
          const formatted = metric.formatRow ? metric.formatRow(row) : metric.format(value);
          return `<td class="comparison-value${isBest ? ' best' : ''}">${formatted}${isBest ? '<small class="best-label">best</small>' : ''}</td>`;
        }).join('')}
      </tr>`;
  }).join('');

  compareEls.table.innerHTML = `${header}<tbody>${body}</tbody>`;

  for (const button of compareEls.table.querySelectorAll('.comparison-remove')) {
    button.addEventListener('click', () => removeComparison(decodeURIComponent(button.dataset.compareKey)));
  }
}

function renderCompareTray() {
  const rows = comparisonRows();
  const count = rows.length;

  compareEls.tray.hidden = count === 0;
  compareEls.trayCount.textContent = count;
  compareEls.tabCount.hidden = count === 0;
  compareEls.tabCount.textContent = count;

  const visible = rows.slice(0, 4);
  const overflow = Math.max(0, count - visible.length);
  compareEls.trayModels.innerHTML = visible.map((row) => `
    <button type="button" class="compare-chip" data-compare-key="${encodedRowKey(row)}" title="Remove from comparison">
      ${escapeHtml(row.model)} <span>${escapeHtml(row.provider)}</span> ×
    </button>`).join('') + (overflow ? `<span class="compare-overflow">+${overflow} more</span>` : '');

  for (const chip of compareEls.trayModels.querySelectorAll('.compare-chip')) {
    chip.addEventListener('click', () => removeComparison(decodeURIComponent(chip.dataset.compareKey)));
  }
}

function refreshCompareUI() {
  renderTable();
}

function addComparison(row) {
  compareState.selected.add(rowKey(row));
  persistCompareState();
  refreshCompareUI();
}

function removeComparison(key) {
  compareState.selected.delete(key);
  persistCompareState();
  refreshCompareUI();
}

function toggleComparison(row) {
  const key = rowKey(row);
  if (compareState.selected.has(key)) removeComparison(key);
  else addComparison(row);
}

function clearComparison() {
  compareState.selected.clear();
  persistCompareState();
  refreshCompareUI();
}

function enhanceTableRows() {
  const visibleRows = getFilteredRows();
  visibleRows.sort((a, b) => compareRows(a, b, state.sortKey, state.sortDirection));
  const trs = [...els.rows.querySelectorAll('tr')];

  trs.forEach((tr, index) => {
    const row = visibleRows[index];
    if (!row) return;
    const modelCell = tr.children[1];
    if (!modelCell) return;

    const selected = compareState.selected.has(rowKey(row));
    tr.classList.toggle('is-selected-for-compare', selected);

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `compare-add${selected ? ' active' : ''}`;
    button.textContent = selected ? '✓ Added' : '+ Compare';
    button.setAttribute('aria-pressed', String(selected));
    button.addEventListener('click', () => toggleComparison(row));
    actions.append(button);
    modelCell.append(actions);
  });

  applyColumnVisibility();
}

const originalRenderTable = renderTable;
renderTable = function renderTableWithCompareControls() {
  originalRenderTable();
  enhanceTableRows();
  renderCompareTray();
  if (state.view === 'compare') renderComparison();
};

const originalSetView = setView;
setView = function setViewWithCompare(view) {
  if (view === 'compare') {
    state.view = 'compare';
    els.tableView.hidden = true;
    els.quadrantView.hidden = true;
    compareEls.view.hidden = false;
    els.tableTab.classList.remove('active');
    els.quadrantTab.classList.remove('active');
    compareEls.tab.classList.add('active');
    els.tableTab.setAttribute('aria-selected', 'false');
    els.quadrantTab.setAttribute('aria-selected', 'false');
    compareEls.tab.setAttribute('aria-selected', 'true');
    renderComparison();
    return;
  }

  compareEls.view.hidden = true;
  compareEls.tab.classList.remove('active');
  compareEls.tab.setAttribute('aria-selected', 'false');
  originalSetView(view);
};

compareEls.tab.addEventListener('click', () => setView('compare'));
compareEls.clear.addEventListener('click', clearComparison);
compareEls.trayClear.addEventListener('click', clearComparison);
compareEls.trayOpen.addEventListener('click', () => {
  setView('compare');
  document.querySelector('.view-toolbar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

compareEls.columnOptions.addEventListener('change', (event) => {
  const input = event.target.closest('input[type="checkbox"]');
  if (!input || input.value === 'model') return;
  if (input.checked) compareState.hiddenColumns.delete(input.value);
  else compareState.hiddenColumns.add(input.value);
  persistCompareState();
  applyColumnVisibility();
});

compareEls.columnsShowAll.addEventListener('click', () => {
  compareState.hiddenColumns.clear();
  persistCompareState();
  for (const input of compareEls.columnOptions.querySelectorAll('input[type="checkbox"]')) input.checked = true;
  applyColumnVisibility();
});

document.addEventListener('click', (event) => {
  if (compareEls.columnPicker.open && !compareEls.columnPicker.contains(event.target)) {
    compareEls.columnPicker.removeAttribute('open');
  }
});
