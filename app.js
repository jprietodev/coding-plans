const state = { data: null, rows: [] };

const els = {
  rows: document.querySelector('#rows'),
  search: document.querySelector('#search'),
  provider: document.querySelector('#provider'),
  sort: document.querySelector('#sort'),
  summary: document.querySelector('#summary'),
  error: document.querySelector('#error'),
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

function render() {
  const search = els.search.value.trim().toLowerCase();
  const provider = els.provider.value;
  const sort = els.sort.value;

  let rows = state.rows.filter((row) => {
    const searchMatch = !search || row.model.toLowerCase().includes(search);
    const providerMatch = !provider || row.provider === provider;
    return searchMatch && providerMatch;
  });

  rows.sort((a, b) => {
    if (sort === 'model') return a.model.localeCompare(b.model);
    const av = a[sort];
    const bv = b[sort];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    return sort === 'value_multiplier' || sort === 'monthly_allowance_usd' ? bv - av : av - bv;
  });

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
els.sort.addEventListener('change', render);
load();
