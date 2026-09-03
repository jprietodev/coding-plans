const state = {
  data: null,
  rows: [],
  sortKey: 'model',
  sortDirection: 'asc',
};

const els = {
  rows: document.querySelector('#rows'),
  search: document.querySelector('#search'),
  provider: document.querySelector('#provider'),
  sort: document.querySelector('#sort'),
  summary: document.querySelector('#summary'),
  error: document.querySelector('#error'),
  sortHeaders: [...document.querySelectorAll('th[data-sort]')],
};

const money = (value, digits = 4) => {
  if (value === null || value === undefined) return '—';
  return `$${Number(value).toFixed(digits).replace(/0+$/, '').replace(/\.$/, '')}`;
};

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

function compareValues(a, b, key) {
  const av = a[key];
  const bv = b[key];

  if (av === null || av === undefined) return 1;
  if (bv === null || bv === undefined) return -1;

  if (typeof av === 'string' || typeof bv === 'string') {
    return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
  }

  return Number(av) - Number(bv);
}

function updateSortHeaders() {
  for (const th of els.sortHeaders) {
    const key = th.dataset.sort;
    const active = key === state.sortKey;
    th.setAttribute('aria-sort', active ? (state.sortDirection === 'asc' ? 'ascending' : 'descending') : 'none');

    const indicator = th.querySelector('.sort-indicator');
    if (indicator) indicator.textContent = active ? (state.sortDirection === 'asc' ? '▲' : '▼') : '';
  }
}

function setSort(key, direction = null) {
  if (state.sortKey === key && direction === null) {
    state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortKey = key;
    state.sortDirection = direction ?? 'asc';
  }

  if ([...els.sort.options].some((option) => option.value === key)) {
    els.sort.value = key;
  }

  render();
}

function render() {
  const search = els.search.value.trim().toLowerCase();
  const provider = els.provider.value;

  let rows = state.rows.filter((row) => {
    const searchMatch = !search || row.model.toLowerCase().includes(search);
    const providerMatch = !provider || row.provider === provider;
    return searchMatch && providerMatch;
  });

  rows.sort((a, b) => {
    const comparison = compareValues(a, b, state.sortKey);
    return state.sortDirection === 'asc' ? comparison : -comparison;
  });

  updateSortHeaders();

  els.rows.innerHTML = rows.map((row) => `
    <tr>
      <td><span class="provider">${escapeHtml(row.provider)}</span><small>${escapeHtml(row.plan)}</small></td>
      <td class="model">${escapeHtml(row.model)}</td>
      <td>${money(row.monthly_allowance_usd, 2)}</td>
      <td><strong>${Number(row.value_multiplier).toFixed(2)}×</strong><small>${Number(row.discount_vs_api_pct).toFixed(1)}% vs API</small></td>
      <td>${money(row.api_input_per_mt)}</td>
      <td class="effective">${money(row.effective_input_per_mt)}</td>
      <td>${money(row.api_output_per_mt)}</td>
      <td class="effective">${money(row.effective_output_per_mt)}</td>
      <td class="effective">${money(row.effective_cache_read_per_mt)}</td>
    </tr>
  `).join('');
}

async function load() {
  try {
    const response = await fetch('data/current.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    state.rows = state.data.rows ?? [];

    const providers = [...new Set(state.rows.map((row) => row.provider))].sort();
    for (const name of providers) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      els.provider.append(option);
    }

    const generated = new Date(state.data.generated_at);
    els.summary.textContent = `${state.rows.length} model rows · updated ${generated.toLocaleString()}`;
    render();
  } catch (error) {
    els.error.hidden = false;
    els.error.textContent = `Pricing data is not available yet: ${error.message}`;
  }
}

els.search.addEventListener('input', render);
els.provider.addEventListener('change', render);
els.sort.addEventListener('change', () => {
  const key = els.sort.value;
  const defaultDirection = key === 'model' ? 'asc' : 'asc';
  setSort(key, defaultDirection);
});

for (const th of els.sortHeaders) {
  const button = th.querySelector('.sort-button');
  button?.addEventListener('click', () => setSort(th.dataset.sort));
}

load();
