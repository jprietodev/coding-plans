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
  summary: document.querySelector('#summary'),
  error: document.querySelector('#error'),
  benchmarkMeta: document.querySelector('#benchmark-meta'),
  sortHeaders: [...document.querySelectorAll('th[data-sort]')],
};

const descendingPreferred = new Set([
  'livebench_overall',
  'livebench_coding',
  'livebench_agentic_coding',
  'monthly_allowance_usd',
  'value_multiplier',
]);

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

function benchmarkCell(value, rank, total) {
  if (value === null || value === undefined) return '<span class="missing">—</span>';
  const rankText = rank && total ? `#${rank}/${total}` : 'unranked';
  return `<strong class="benchmark-score">${Number(value).toFixed(1)}</strong><small>${rankText}</small>`;
}

function compareRows(a, b, key, direction) {
  const av = a[key];
  const bv = b[key];
  const aMissing = av === null || av === undefined;
  const bMissing = bv === null || bv === undefined;

  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  let comparison;
  if (typeof av === 'string' || typeof bv === 'string') {
    comparison = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
  } else {
    comparison = Number(av) - Number(bv);
  }

  return direction === 'asc' ? comparison : -comparison;
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

function setSort(key) {
  if (state.sortKey === key) {
    state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortKey = key;
    state.sortDirection = descendingPreferred.has(key) ? 'desc' : 'asc';
  }

  render();
}

function render() {
  const search = els.search.value.trim().toLowerCase();
  const provider = els.provider.value;
  const rankTotal = state.data?.benchmarks?.livebench?.rank_total ?? null;

  let rows = state.rows.filter((row) => {
    const searchMatch = !search || row.model.toLowerCase().includes(search);
    const providerMatch = !provider || row.provider === provider;
    return searchMatch && providerMatch;
  });

  rows.sort((a, b) => compareRows(a, b, state.sortKey, state.sortDirection));
  updateSortHeaders();

  els.rows.innerHTML = rows.map((row) => `
    <tr>
      <td><span class="provider">${escapeHtml(row.provider)}</span><small>${escapeHtml(row.plan)}</small></td>
      <td class="model">${escapeHtml(row.model)}${row.livebench_model ? `<small title="LiveBench model id">${escapeHtml(row.livebench_model)}</small>` : ''}</td>
      <td class="benchmark">${benchmarkCell(row.livebench_overall, row.livebench_overall_rank, rankTotal)}</td>
      <td class="benchmark coding">${benchmarkCell(row.livebench_coding, row.livebench_coding_rank, rankTotal)}</td>
      <td class="benchmark">${benchmarkCell(row.livebench_agentic_coding, row.livebench_agentic_coding_rank, rankTotal)}</td>
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

    const livebench = state.data.benchmarks?.livebench;
    if (livebench && els.benchmarkMeta) {
      els.benchmarkMeta.textContent = `Release ${livebench.release}; ${livebench.matched_unique_models} unique plan models matched.`;
    }

    render();
  } catch (error) {
    els.error.hidden = false;
    els.error.textContent = `Pricing data is not available yet: ${error.message}`;
  }
}

els.search.addEventListener('input', render);
els.provider.addEventListener('change', render);

for (const th of els.sortHeaders) {
  const button = th.querySelector('.sort-button');
  button?.addEventListener('click', () => setSort(th.dataset.sort));
}

load();
