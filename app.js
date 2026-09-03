const state = {
  data: null,
  rows: [],
  sortKey: 'model',
  sortDirection: 'asc',
  view: 'table',
};

const els = {
  rows: document.querySelector('#rows'),
  search: document.querySelector('#search'),
  provider: document.querySelector('#provider'),
  summary: document.querySelector('#summary'),
  error: document.querySelector('#error'),
  benchmarkMeta: document.querySelector('#benchmark-meta'),
  sortHeaders: [...document.querySelectorAll('th[data-sort]')],
  tableTab: document.querySelector('#table-tab'),
  quadrantTab: document.querySelector('#quadrant-tab'),
  tableView: document.querySelector('#table-view'),
  quadrantView: document.querySelector('#quadrant-view'),
  quadrantY: document.querySelector('#quadrant-y'),
  quadrantX: document.querySelector('#quadrant-x'),
  quadrantSplit: document.querySelector('#quadrant-split'),
  quadrantSize: document.querySelector('#quadrant-size'),
  quadrantTitle: document.querySelector('#quadrant-title'),
  quadrantDescription: document.querySelector('#quadrant-description'),
  quadrantChart: document.querySelector('#quadrant-chart'),
  quadrantTooltip: document.querySelector('#quadrant-tooltip'),
  quadrantLegend: document.querySelector('#quadrant-legend'),
  quadrantMeta: document.querySelector('#quadrant-meta'),
  sweetSpotDescription: document.querySelector('#sweet-spot-description'),
  sweetSpotList: document.querySelector('#sweet-spot-list'),
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

const finite = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));

function mean(values, requireAll = false) {
  if (requireAll && values.some((value) => !finite(value))) return null;
  const usable = values.filter(finite).map(Number);
  if (!usable.length) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function median(values) {
  const usable = values.filter(finite).map(Number).sort((a, b) => a - b);
  if (!usable.length) return null;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[middle] : (usable[middle - 1] + usable[middle]) / 2;
}

function benchmarkCell(value, rank, total) {
  if (value === null || value === undefined) return '<span class="missing">—</span>';
  const rankText = rank && total ? `#${rank}/${total}` : 'unranked';
  return `<strong class="benchmark-score">${Number(value).toFixed(1)}</strong><small>${rankText}</small>`;
}

const metrics = {
  coding_intelligence: {
    label: 'Coding intelligence',
    better: 'high',
    kind: 'score',
    value: (row) => mean([row.livebench_coding, row.livebench_agentic_coding], true),
    detail: '50% LiveBench Coding + 50% LiveBench Agentic Coding',
  },
  benchmark_mean: {
    label: 'Benchmark mean',
    better: 'high',
    kind: 'score',
    value: (row) => mean([row.livebench_overall, row.livebench_coding, row.livebench_agentic_coding], true),
    detail: 'Simple mean of LiveBench Overall, Coding and Agentic Coding',
  },
  livebench_coding: {
    label: 'LiveBench Coding',
    better: 'high',
    kind: 'score',
    value: (row) => finite(row.livebench_coding) ? Number(row.livebench_coding) : null,
    detail: 'LiveBench Coding category score',
  },
  livebench_agentic_coding: {
    label: 'LiveBench Agentic Coding',
    better: 'high',
    kind: 'score',
    value: (row) => finite(row.livebench_agentic_coding) ? Number(row.livebench_agentic_coding) : null,
    detail: 'LiveBench Agentic Coding category score',
  },
  livebench_overall: {
    label: 'LiveBench Overall',
    better: 'high',
    kind: 'score',
    value: (row) => finite(row.livebench_overall) ? Number(row.livebench_overall) : null,
    detail: 'Equal-weighted LiveBench category average',
  },
  coding_cost: {
    label: 'Coding cost',
    better: 'low',
    kind: 'money',
    value: (row) => {
      if (![row.effective_input_per_mt, row.effective_output_per_mt, row.effective_cache_read_per_mt].every(finite)) return null;
      return Number(row.effective_input_per_mt) * 0.4
        + Number(row.effective_output_per_mt) * 0.5
        + Number(row.effective_cache_read_per_mt) * 0.1;
    },
    detail: '40% effective input + 50% effective output + 10% effective cache read',
  },
  effective_price_mean: {
    label: 'Effective price mean',
    better: 'low',
    kind: 'money',
    value: (row) => mean([
      row.effective_input_per_mt,
      row.effective_output_per_mt,
      row.effective_cache_read_per_mt,
      row.effective_cache_write_per_mt,
    ]),
    detail: 'Simple mean of the available effective input, output, cache read and cache write prices',
  },
  effective_input_per_mt: {
    label: 'Effective input price',
    better: 'low',
    kind: 'money',
    value: (row) => finite(row.effective_input_per_mt) ? Number(row.effective_input_per_mt) : null,
    detail: 'Effective input price per million tokens',
  },
  effective_output_per_mt: {
    label: 'Effective output price',
    better: 'low',
    kind: 'money',
    value: (row) => finite(row.effective_output_per_mt) ? Number(row.effective_output_per_mt) : null,
    detail: 'Effective output price per million tokens',
  },
  effective_cache_read_per_mt: {
    label: 'Effective cache read price',
    better: 'low',
    kind: 'money',
    value: (row) => finite(row.effective_cache_read_per_mt) ? Number(row.effective_cache_read_per_mt) : null,
    detail: 'Effective cache-read price per million tokens',
  },
  value_multiplier: {
    label: 'Value multiplier',
    better: 'high',
    kind: 'multiplier',
    value: (row) => finite(row.value_multiplier) ? Number(row.value_multiplier) : null,
    detail: 'Monthly model allowance divided by subscription price',
  },
  monthly_allowance_usd: {
    label: 'Monthly allowance',
    better: 'high',
    kind: 'allowance',
    value: (row) => finite(row.monthly_allowance_usd) ? Number(row.monthly_allowance_usd) : null,
    detail: 'Monthly model allowance in nominal API dollars',
  },
};

function formatMetric(value, metric) {
  if (!finite(value)) return '—';
  if (metric.kind === 'money') return money(value, 4);
  if (metric.kind === 'multiplier') return `${Number(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}×`;
  if (metric.kind === 'allowance') return money(value, 2);
  return Number(value).toFixed(1);
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

function getFilteredRows() {
  const search = els.search.value.trim().toLowerCase();
  const provider = els.provider.value;

  return state.rows.filter((row) => {
    const searchMatch = !search || row.model.toLowerCase().includes(search);
    const providerMatch = !provider || row.provider === provider;
    return searchMatch && providerMatch;
  });
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

  renderTable();
}

function renderTable() {
  const rankTotal = state.data?.benchmarks?.livebench?.rank_total ?? null;
  const rows = getFilteredRows();
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

function statistic(values, mode) {
  return mode === 'mean' ? mean(values) : median(values);
}

function paddedDomain(values) {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    const pad = Math.abs(min || 1) * 0.1;
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.08;
  min -= pad;
  max += pad;
  return [min, max];
}

function ticks(min, max, count = 5) {
  return Array.from({ length: count }, (_, index) => min + (max - min) * index / (count - 1));
}

function bubbleRadius(point, points, sizeKey) {
  if (sizeKey === 'equal') return 8;
  const values = points.map((item) => Number(item.row[sizeKey])).filter(Number.isFinite);
  if (!values.length) return 8;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return 10;
  const value = Number(point.row[sizeKey]);
  if (!Number.isFinite(value)) return 7;
  const normalized = (value - min) / (max - min);
  return 6 + Math.sqrt(Math.max(0, normalized)) * 11;
}

function setView(view) {
  state.view = view;
  const tableActive = view === 'table';
  els.tableView.hidden = !tableActive;
  els.quadrantView.hidden = tableActive;
  els.tableTab.classList.toggle('active', tableActive);
  els.quadrantTab.classList.toggle('active', !tableActive);
  els.tableTab.setAttribute('aria-selected', String(tableActive));
  els.quadrantTab.setAttribute('aria-selected', String(!tableActive));
  if (!tableActive) renderQuadrant();
}

function renderQuadrant() {
  if (!state.data) return;

  const yMetric = metrics[els.quadrantY.value];
  const xMetric = metrics[els.quadrantX.value];
  const splitMode = els.quadrantSplit.value;
  const sizeKey = els.quadrantSize.value;
  const filteredRows = getFilteredRows();

  const points = filteredRows.map((row) => ({
    row,
    x: xMetric.value(row),
    y: yMetric.value(row),
  })).filter((point) => finite(point.x) && finite(point.y));

  els.quadrantTitle.textContent = `${yMetric.label} vs ${xMetric.label}`;
  const horizontalGood = xMetric.better === 'low' ? 'left' : 'right';
  els.quadrantDescription.textContent = `The sweet spot is top-${horizontalGood}: higher ${yMetric.label.toLowerCase()} and ${xMetric.better === 'low' ? 'lower' : 'higher'} ${xMetric.label.toLowerCase()}. Split lines use the visible ${splitMode}.`;

  if (!points.length) {
    els.quadrantChart.innerHTML = '<div class="chart-empty">No rows have both selected metrics. Try another axis or remove filters.</div>';
    els.quadrantLegend.innerHTML = '';
    els.quadrantMeta.textContent = `${filteredRows.length} visible rows · 0 plottable`;
    els.sweetSpotDescription.textContent = 'No models can be classified with the current configuration.';
    els.sweetSpotList.innerHTML = '';
    return;
  }

  const splitX = statistic(points.map((point) => point.x), splitMode);
  const splitY = statistic(points.map((point) => point.y), splitMode);
  const [xMin, xMax] = paddedDomain(points.map((point) => Number(point.x)));
  const [yMin, yMax] = paddedDomain(points.map((point) => Number(point.y)));

  const width = 1100;
  const height = 650;
  const margin = { top: 34, right: 30, bottom: 78, left: 90 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const sx = (value) => margin.left + (Number(value) - xMin) / (xMax - xMin) * plotWidth;
  const sy = (value) => margin.top + plotHeight - (Number(value) - yMin) / (yMax - yMin) * plotHeight;
  const splitXPx = sx(splitX);
  const splitYPx = sy(splitY);
  const sweetX = xMetric.better === 'low' ? margin.left : splitXPx;
  const sweetWidth = xMetric.better === 'low' ? splitXPx - margin.left : margin.left + plotWidth - splitXPx;

  const providers = [...new Set(points.map((point) => point.row.provider))].sort();
  const providerClass = new Map(providers.map((provider, index) => [provider, `provider-${index % 4}`]));

  const xGrid = ticks(xMin, xMax).map((tick) => {
    const x = sx(tick);
    return `<line class="chart-grid" x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + plotHeight}" />
      <text class="chart-tick" x="${x}" y="${margin.top + plotHeight + 27}" text-anchor="middle">${escapeHtml(formatMetric(tick, xMetric))}</text>`;
  }).join('');

  const yGrid = ticks(yMin, yMax).map((tick) => {
    const y = sy(tick);
    return `<line class="chart-grid" x1="${margin.left}" y1="${y}" x2="${margin.left + plotWidth}" y2="${y}" />
      <text class="chart-tick" x="${margin.left - 14}" y="${y + 4}" text-anchor="end">${escapeHtml(formatMetric(tick, yMetric))}</text>`;
  }).join('');

  const circles = points.map((point, index) => {
    const radius = bubbleRadius(point, points, sizeKey);
    const className = providerClass.get(point.row.provider);
    return `<circle class="chart-point ${className}" data-point-index="${index}" cx="${sx(point.x)}" cy="${sy(point.y)}" r="${radius}" tabindex="0" aria-label="${escapeHtml(`${point.row.model}, ${point.row.provider}, ${yMetric.label} ${formatMetric(point.y, yMetric)}, ${xMetric.label} ${formatMetric(point.x, xMetric)}`)}"><title>${escapeHtml(`${point.row.model} · ${point.row.provider}`)}</title></circle>`;
  }).join('');

  const splitName = splitMode === 'mean' ? 'Mean' : 'Median';
  els.quadrantChart.innerHTML = `
    <svg class="scatter" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(`${yMetric.label} versus ${xMetric.label} quadrant chart`)}">
      <rect class="sweet-zone" x="${sweetX}" y="${margin.top}" width="${sweetWidth}" height="${Math.max(0, splitYPx - margin.top)}" />
      ${xGrid}
      ${yGrid}
      <line class="chart-axis" x1="${margin.left}" y1="${margin.top + plotHeight}" x2="${margin.left + plotWidth}" y2="${margin.top + plotHeight}" />
      <line class="chart-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotHeight}" />
      <line class="split-line" x1="${splitXPx}" y1="${margin.top}" x2="${splitXPx}" y2="${margin.top + plotHeight}" />
      <line class="split-line" x1="${margin.left}" y1="${splitYPx}" x2="${margin.left + plotWidth}" y2="${splitYPx}" />
      <text class="split-label" x="${Math.min(splitXPx + 8, margin.left + plotWidth - 120)}" y="${margin.top + 18}">${splitName}: ${escapeHtml(formatMetric(splitX, xMetric))}</text>
      <text class="split-label" x="${margin.left + 8}" y="${Math.max(splitYPx - 9, margin.top + 18)}">${splitName}: ${escapeHtml(formatMetric(splitY, yMetric))}</text>
      <text class="quadrant-label" x="${xMetric.better === 'low' ? margin.left + 14 : splitXPx + 14}" y="${margin.top + 42}">SWEET SPOT</text>
      ${circles}
      <text class="axis-title" x="${margin.left + plotWidth / 2}" y="${height - 18}" text-anchor="middle">${escapeHtml(xMetric.label)}</text>
      <text class="axis-title" transform="translate(24 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">${escapeHtml(yMetric.label)}</text>
    </svg>`;

  const showTooltip = (event, point) => {
    const sizeText = sizeKey === 'equal'
      ? ''
      : `<div><span>${sizeKey === 'monthly_allowance_usd' ? 'Allowance' : 'Value'}</span><strong>${sizeKey === 'monthly_allowance_usd' ? money(point.row.monthly_allowance_usd, 2) : `${Number(point.row.value_multiplier).toFixed(2)}×`}</strong></div>`;
    els.quadrantTooltip.innerHTML = `
      <strong class="tooltip-model">${escapeHtml(point.row.model)}</strong>
      <small>${escapeHtml(point.row.provider)} · ${escapeHtml(point.row.plan)}</small>
      <div class="tooltip-grid">
        <div><span>${escapeHtml(yMetric.label)}</span><strong>${escapeHtml(formatMetric(point.y, yMetric))}</strong></div>
        <div><span>${escapeHtml(xMetric.label)}</span><strong>${escapeHtml(formatMetric(point.x, xMetric))}</strong></div>
        ${sizeText}
      </div>`;
    els.quadrantTooltip.hidden = false;

    const card = els.quadrantChart.closest('.chart-card');
    const rect = card.getBoundingClientRect();
    const left = Math.min(event.clientX - rect.left + 14, rect.width - 270);
    const top = Math.max(8, event.clientY - rect.top + 14);
    els.quadrantTooltip.style.left = `${Math.max(8, left)}px`;
    els.quadrantTooltip.style.top = `${top}px`;
  };

  for (const circle of els.quadrantChart.querySelectorAll('.chart-point')) {
    const point = points[Number(circle.dataset.pointIndex)];
    circle.addEventListener('pointerenter', (event) => showTooltip(event, point));
    circle.addEventListener('pointermove', (event) => showTooltip(event, point));
    circle.addEventListener('pointerleave', () => { els.quadrantTooltip.hidden = true; });
    circle.addEventListener('focus', () => {
      const rect = circle.getBoundingClientRect();
      showTooltip({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }, point);
    });
    circle.addEventListener('blur', () => { els.quadrantTooltip.hidden = true; });
  }

  els.quadrantLegend.innerHTML = providers.map((provider) => `<span><i class="legend-dot ${providerClass.get(provider)}"></i>${escapeHtml(provider)}</span>`).join('');
  const excluded = filteredRows.length - points.length;
  els.quadrantMeta.textContent = `${points.length} plotted · ${excluded} excluded because a selected metric is missing · bubble: ${els.quadrantSize.options[els.quadrantSize.selectedIndex].text}`;

  const sweet = points.filter((point) => {
    const yGood = point.y >= splitY;
    const xGood = xMetric.better === 'low' ? point.x <= splitX : point.x >= splitX;
    return yGood && xGood;
  }).sort((a, b) => {
    const capability = b.y - a.y;
    if (capability !== 0) return capability;
    return xMetric.better === 'low' ? a.x - b.x : b.x - a.x;
  });

  els.sweetSpotDescription.textContent = `${sweet.length} combinations are above the ${splitMode} for capability and on the better side of the ${splitMode} for economics.`;
  els.sweetSpotList.innerHTML = sweet.length
    ? sweet.slice(0, 10).map((point, index) => `
        <div class="sweet-row">
          <span class="sweet-rank">${index + 1}</span>
          <div><strong>${escapeHtml(point.row.model)}</strong><small>${escapeHtml(point.row.provider)} · ${escapeHtml(point.row.plan)}</small></div>
          <div class="sweet-metrics"><strong>${escapeHtml(formatMetric(point.y, yMetric))}</strong><small>${escapeHtml(yMetric.label)}</small></div>
          <div class="sweet-metrics"><strong>${escapeHtml(formatMetric(point.x, xMetric))}</strong><small>${escapeHtml(xMetric.label)}</small></div>
        </div>`).join('')
    : '<div class="chart-empty">No model falls in the sweet-spot quadrant with the current filters.</div>';
}

function render() {
  renderTable();
  if (state.view === 'quadrant') renderQuadrant();
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
els.tableTab.addEventListener('click', () => setView('table'));
els.quadrantTab.addEventListener('click', () => setView('quadrant'));
els.quadrantY.addEventListener('change', renderQuadrant);
els.quadrantX.addEventListener('change', renderQuadrant);
els.quadrantSplit.addEventListener('change', renderQuadrant);
els.quadrantSize.addEventListener('change', renderQuadrant);

for (const th of els.sortHeaders) {
  const button = th.querySelector('.sort-button');
  button?.addEventListener('click', () => setSort(th.dataset.sort));
}

load();
