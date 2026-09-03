const insightStorageKey = 'coding-plans:insight-config';

const insightState = {
  intelligenceWeights: { overall: 0, coding: 50, agentic: 50 },
  costWeights: { input: 40, output: 50, cacheRead: 10, cacheWrite: 0 },
  efficiencyCapabilityWeight: 70,
  showPareto: true,
  connectSameModel: true,
  historyIndex: null,
  historySnapshots: new Map(),
  historyLoading: false,
};

function insightStoredConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(insightStorageKey) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function insightParseWeights(value, keys, fallback) {
  if (!value) return { ...fallback };
  const parts = String(value).split(',').map(Number);
  if (parts.length !== keys.length || parts.some((item) => !Number.isFinite(item) || item < 0)) return { ...fallback };
  return Object.fromEntries(keys.map((key, index) => [key, parts[index]]));
}

function loadInsightConfig() {
  const stored = insightStoredConfig();
  const params = new URLSearchParams(location.search);

  insightState.intelligenceWeights = insightParseWeights(
    params.get('iw') || (stored.intelligenceWeights ? Object.values(stored.intelligenceWeights).join(',') : ''),
    ['overall', 'coding', 'agentic'],
    insightState.intelligenceWeights,
  );
  insightState.costWeights = insightParseWeights(
    params.get('cw') || (stored.costWeights ? Object.values(stored.costWeights).join(',') : ''),
    ['input', 'output', 'cacheRead', 'cacheWrite'],
    insightState.costWeights,
  );

  const efficiency = Number(params.get('eff') ?? stored.efficiencyCapabilityWeight);
  if (Number.isFinite(efficiency) && efficiency >= 0 && efficiency <= 100) insightState.efficiencyCapabilityWeight = efficiency;

  const pareto = params.get('pareto');
  const connect = params.get('connect');
  if (pareto !== null) insightState.showPareto = pareto !== '0';
  else if (typeof stored.showPareto === 'boolean') insightState.showPareto = stored.showPareto;
  if (connect !== null) insightState.connectSameModel = connect !== '0';
  else if (typeof stored.connectSameModel === 'boolean') insightState.connectSameModel = stored.connectSameModel;
}

function persistInsightConfig() {
  try {
    localStorage.setItem(insightStorageKey, JSON.stringify({
      intelligenceWeights: insightState.intelligenceWeights,
      costWeights: insightState.costWeights,
      efficiencyCapabilityWeight: insightState.efficiencyCapabilityWeight,
      showPareto: insightState.showPareto,
      connectSameModel: insightState.connectSameModel,
    }));
  } catch {
    // Persistence is optional.
  }

  const params = new URLSearchParams(location.search);
  params.set('iw', Object.values(insightState.intelligenceWeights).join(','));
  params.set('cw', Object.values(insightState.costWeights).join(','));
  params.set('eff', String(insightState.efficiencyCapabilityWeight));
  params.set('pareto', insightState.showPareto ? '1' : '0');
  params.set('connect', insightState.connectSameModel ? '1' : '0');
  history.replaceState(null, '', `${location.pathname}?${params.toString()}${location.hash}`);
}

loadInsightConfig();

function normalizedWeights(weights) {
  const entries = Object.entries(weights).map(([key, value]) => [key, Math.max(0, Number(value) || 0)]);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (!total) return Object.fromEntries(entries.map(([key]) => [key, 0]));
  return Object.fromEntries(entries.map(([key, value]) => [key, value / total]));
}

function weightedMetric(row, definitions, weights, requireWeightedValues = true) {
  const normalized = normalizedWeights(weights);
  let result = 0;
  let usedWeight = 0;

  for (const [key, getter] of Object.entries(definitions)) {
    const weight = normalized[key] || 0;
    if (!weight) continue;
    const value = getter(row);
    if (!finite(value)) {
      if (requireWeightedValues) return null;
      continue;
    }
    result += Number(value) * weight;
    usedWeight += weight;
  }

  return usedWeight ? result / usedWeight : null;
}

function configuredIntelligence(row) {
  return weightedMetric(row, {
    overall: (item) => item.livebench_overall,
    coding: (item) => item.livebench_coding,
    agentic: (item) => item.livebench_agentic_coding,
  }, insightState.intelligenceWeights, true);
}

function configuredCost(row) {
  return weightedMetric(row, {
    input: (item) => item.effective_input_per_mt,
    output: (item) => item.effective_output_per_mt,
    cacheRead: (item) => item.effective_cache_read_per_mt,
    cacheWrite: (item) => item.effective_cache_write_per_mt,
  }, insightState.costWeights, true);
}

metrics.coding_intelligence.value = configuredIntelligence;
metrics.coding_intelligence.detail = 'Configurable weighted LiveBench capability score';
metrics.coding_cost.value = configuredCost;
metrics.coding_cost.detail = 'Configurable weighted effective token cost';

function benchmarkCoverage(row) {
  return [row.livebench_overall, row.livebench_coding, row.livebench_agentic_coding].filter(finite).length;
}

function coverageLabel(count) {
  if (count >= 3) return 'High';
  if (count === 2) return 'Medium';
  if (count === 1) return 'Low';
  return 'No data';
}

function percentile(value, values, better) {
  if (!finite(value)) return null;
  const usable = values.filter(finite).map(Number);
  if (!usable.length) return null;
  if (usable.length === 1) return 100;
  const current = Number(value);
  const worse = usable.filter((item) => better === 'high' ? item < current : item > current).length;
  const equal = usable.filter((item) => item === current).length;
  return ((worse + Math.max(0, equal - 1) / 2) / (usable.length - 1)) * 100;
}

function efficiencyScore(row, universe = state.rows) {
  const candidates = universe.map((item) => ({
    row: item,
    capability: configuredIntelligence(item),
    cost: configuredCost(item),
  })).filter((item) => finite(item.capability) && finite(item.cost));

  const targetCapability = configuredIntelligence(row);
  const targetCost = configuredCost(row);
  if (!finite(targetCapability) || !finite(targetCost) || !candidates.length) return null;

  const capabilityPct = percentile(targetCapability, candidates.map((item) => item.capability), 'high');
  const costPct = percentile(targetCost, candidates.map((item) => item.cost), 'low');
  const capabilityWeight = insightState.efficiencyCapabilityWeight / 100;
  return capabilityPct * capabilityWeight + costPct * (1 - capabilityWeight);
}

function updateDerivedRows() {
  if (!state.rows?.length) return;
  for (const row of state.rows) {
    row.coding_intelligence = configuredIntelligence(row);
    row.coding_cost = configuredCost(row);
    row.benchmark_coverage = benchmarkCoverage(row);
  }
  for (const row of state.rows) row.efficiency_score = efficiencyScore(row, state.rows);
}

const insightTabs = document.querySelector('.view-tabs');
const compareViewNode = document.querySelector('#compare-view');

insightTabs.insertAdjacentHTML('beforeend', `
  <button id="best-value-tab" class="view-tab" type="button" role="tab" aria-selected="false" aria-controls="best-value-view">Best Value</button>
  <button id="changes-tab" class="view-tab" type="button" role="tab" aria-selected="false" aria-controls="changes-view">Changes</button>`);

compareViewNode.insertAdjacentHTML('afterend', `
  <section id="best-value-view" class="insight-view" role="tabpanel" aria-labelledby="best-value-tab" hidden>
    <div class="insight-heading">
      <div>
        <p class="eyebrow">Decision support</p>
        <h2>Best value</h2>
        <p>Efficiency combines capability percentile and inverse cost percentile. The formula is transparent and configurable.</p>
      </div>
      <div class="efficiency-control">
        <label>Capability weight <strong id="efficiency-capability-label"></strong>
          <input id="efficiency-capability" type="range" min="0" max="100" step="5">
        </label>
        <small>Cost receives the remaining weight.</small>
      </div>
    </div>
    <div id="best-value-cards" class="best-value-cards"></div>
    <div class="ranking-card">
      <div class="ranking-head"><strong>Efficiency ranking</strong><span id="efficiency-formula"></span></div>
      <div id="efficiency-ranking" class="efficiency-ranking"></div>
    </div>
  </section>

  <section id="changes-view" class="insight-view" role="tabpanel" aria-labelledby="changes-tab" hidden>
    <div class="insight-heading">
      <div>
        <p class="eyebrow">History</p>
        <h2>Changes</h2>
        <p id="changes-description">Loading historical snapshots…</p>
      </div>
    </div>
    <div id="changes-list" class="changes-list"></div>
    <section class="history-explorer">
      <div class="history-controls">
        <label>Model + plan<select id="history-model"></select></label>
        <label>Metric<select id="history-metric">
          <option value="monthly_allowance_usd">Monthly allowance</option>
          <option value="value_multiplier">Value multiplier</option>
          <option value="effective_output_per_mt">Effective output</option>
          <option value="effective_input_per_mt">Effective input</option>
          <option value="livebench_coding">LiveBench Coding</option>
          <option value="livebench_agentic_coding">LiveBench Agentic</option>
        </select></label>
      </div>
      <div id="history-chart" class="history-chart"></div>
    </section>
  </section>`);

const quadrantControlsNode = document.querySelector('.quadrant-controls');
quadrantControlsNode.insertAdjacentHTML('afterend', `
  <details class="weight-panel" open>
    <summary>Weights & analysis</summary>
    <div class="weight-panel-body">
      <section>
        <div class="weight-head"><strong>Capability weights</strong><span id="intelligence-weight-total"></span></div>
        <div class="preset-row" data-preset-group="intelligence">
          <button type="button" data-intel-preset="coding-agent">Coding agent</button>
          <button type="button" data-intel-preset="code-generation">Code generation</button>
          <button type="button" data-intel-preset="agentic">Agentic</button>
          <button type="button" data-intel-preset="balanced">Balanced</button>
        </div>
        <div id="intelligence-weight-controls" class="weight-controls"></div>
      </section>
      <section>
        <div class="weight-head"><strong>Cost weights</strong><span id="cost-weight-total"></span></div>
        <div class="preset-row" data-preset-group="cost">
          <button type="button" data-cost-preset="coding-agent">Coding agent</button>
          <button type="button" data-cost-preset="input-heavy">Input heavy</button>
          <button type="button" data-cost-preset="output-heavy">Output heavy</button>
          <button type="button" data-cost-preset="cached-agent">Cached agent</button>
        </div>
        <div id="cost-weight-controls" class="weight-controls"></div>
      </section>
      <section class="analysis-toggles">
        <label><input id="show-pareto" type="checkbox"> Show Pareto frontier</label>
        <label><input id="connect-same-model" type="checkbox"> Connect the same model across plans</label>
        <button id="copy-config-url" class="secondary-button" type="button">Copy configuration URL</button>
        <small id="copy-config-status"></small>
      </section>
    </div>
  </details>`);

const insightEls = {
  bestTab: document.querySelector('#best-value-tab'),
  changesTab: document.querySelector('#changes-tab'),
  bestView: document.querySelector('#best-value-view'),
  changesView: document.querySelector('#changes-view'),
  efficiencyRange: document.querySelector('#efficiency-capability'),
  efficiencyLabel: document.querySelector('#efficiency-capability-label'),
  efficiencyFormula: document.querySelector('#efficiency-formula'),
  bestCards: document.querySelector('#best-value-cards'),
  efficiencyRanking: document.querySelector('#efficiency-ranking'),
  intelligenceControls: document.querySelector('#intelligence-weight-controls'),
  costControls: document.querySelector('#cost-weight-controls'),
  intelligenceTotal: document.querySelector('#intelligence-weight-total'),
  costTotal: document.querySelector('#cost-weight-total'),
  pareto: document.querySelector('#show-pareto'),
  connect: document.querySelector('#connect-same-model'),
  copyUrl: document.querySelector('#copy-config-url'),
  copyStatus: document.querySelector('#copy-config-status'),
  changesDescription: document.querySelector('#changes-description'),
  changesList: document.querySelector('#changes-list'),
  historyModel: document.querySelector('#history-model'),
  historyMetric: document.querySelector('#history-metric'),
  historyChart: document.querySelector('#history-chart'),
};

const intelligenceLabels = { overall: 'Overall', coding: 'Coding', agentic: 'Agentic' };
const costLabels = { input: 'Input', output: 'Output', cacheRead: 'Cache read', cacheWrite: 'Cache write' };

function weightControlMarkup(weights, labels, prefix) {
  return Object.keys(weights).map((key) => `
    <label class="weight-control">
      <span>${labels[key]} <strong id="${prefix}-${key}-label"></strong></span>
      <input id="${prefix}-${key}" data-weight-key="${key}" type="range" min="0" max="100" step="5">
    </label>`).join('');
}

insightEls.intelligenceControls.innerHTML = weightControlMarkup(insightState.intelligenceWeights, intelligenceLabels, 'intel');
insightEls.costControls.innerHTML = weightControlMarkup(insightState.costWeights, costLabels, 'cost');

const intelligencePresets = {
  'coding-agent': { overall: 0, coding: 50, agentic: 50 },
  'code-generation': { overall: 0, coding: 80, agentic: 20 },
  agentic: { overall: 0, coding: 20, agentic: 80 },
  balanced: { overall: 34, coding: 33, agentic: 33 },
};
const costPresets = {
  'coding-agent': { input: 40, output: 50, cacheRead: 10, cacheWrite: 0 },
  'input-heavy': { input: 60, output: 30, cacheRead: 10, cacheWrite: 0 },
  'output-heavy': { input: 25, output: 65, cacheRead: 10, cacheWrite: 0 },
  'cached-agent': { input: 30, output: 40, cacheRead: 25, cacheWrite: 5 },
};

function updateWeightControls() {
  const normalizedIntel = normalizedWeights(insightState.intelligenceWeights);
  const normalizedCost = normalizedWeights(insightState.costWeights);

  for (const [key, value] of Object.entries(insightState.intelligenceWeights)) {
    const input = document.querySelector(`#intel-${key}`);
    const label = document.querySelector(`#intel-${key}-label`);
    if (input) input.value = value;
    if (label) label.textContent = `${Math.round((normalizedIntel[key] || 0) * 100)}%`;
  }
  for (const [key, value] of Object.entries(insightState.costWeights)) {
    const input = document.querySelector(`#cost-${key}`);
    const label = document.querySelector(`#cost-${key}-label`);
    if (input) input.value = value;
    if (label) label.textContent = `${Math.round((normalizedCost[key] || 0) * 100)}%`;
  }

  insightEls.intelligenceTotal.textContent = 'normalized to 100%';
  insightEls.costTotal.textContent = 'normalized to 100%';
  insightEls.efficiencyRange.value = insightState.efficiencyCapabilityWeight;
  insightEls.efficiencyLabel.textContent = `${insightState.efficiencyCapabilityWeight}%`;
  insightEls.pareto.checked = insightState.showPareto;
  insightEls.connect.checked = insightState.connectSameModel;
}

function insightConfigChanged() {
  persistInsightConfig();
  updateWeightControls();
  updateDerivedRows();
  renderTable();
  if (state.view === 'quadrant') renderQuadrant();
  if (state.view === 'best-value') renderBestValue();
  if (state.view === 'compare') renderComparison();
}

for (const input of insightEls.intelligenceControls.querySelectorAll('input')) {
  input.addEventListener('input', () => {
    insightState.intelligenceWeights[input.dataset.weightKey] = Number(input.value);
    insightConfigChanged();
  });
}
for (const input of insightEls.costControls.querySelectorAll('input')) {
  input.addEventListener('input', () => {
    insightState.costWeights[input.dataset.weightKey] = Number(input.value);
    insightConfigChanged();
  });
}
for (const button of document.querySelectorAll('[data-intel-preset]')) {
  button.addEventListener('click', () => {
    insightState.intelligenceWeights = { ...intelligencePresets[button.dataset.intelPreset] };
    insightConfigChanged();
  });
}
for (const button of document.querySelectorAll('[data-cost-preset]')) {
  button.addEventListener('click', () => {
    insightState.costWeights = { ...costPresets[button.dataset.costPreset] };
    insightConfigChanged();
  });
}

insightEls.efficiencyRange.addEventListener('input', () => {
  insightState.efficiencyCapabilityWeight = Number(insightEls.efficiencyRange.value);
  insightConfigChanged();
});
insightEls.pareto.addEventListener('change', () => {
  insightState.showPareto = insightEls.pareto.checked;
  insightConfigChanged();
});
insightEls.connect.addEventListener('change', () => {
  insightState.connectSameModel = insightEls.connect.checked;
  insightConfigChanged();
});
insightEls.copyUrl.addEventListener('click', async () => {
  persistInsightConfig();
  try {
    await navigator.clipboard.writeText(location.href);
    insightEls.copyStatus.textContent = 'Copied';
  } catch {
    insightEls.copyStatus.textContent = 'URL updated in the address bar';
  }
  setTimeout(() => { insightEls.copyStatus.textContent = ''; }, 1800);
});

function addDerivedTableColumns() {
  const headerRow = document.querySelector('#table-view thead tr');
  if (!headerRow || headerRow.querySelector('[data-sort="efficiency_score"]')) return;
  const allowanceHeader = headerRow.querySelector('[data-sort="monthly_allowance_usd"]');
  const efficiencyTh = document.createElement('th');
  efficiencyTh.dataset.sort = 'efficiency_score';
  efficiencyTh.setAttribute('aria-sort', 'none');
  efficiencyTh.innerHTML = '<button class="sort-button" type="button" title="Capability/cost percentile score">Efficiency <span class="sort-indicator" aria-hidden="true"></span></button>';
  const coverageTh = document.createElement('th');
  coverageTh.dataset.sort = 'benchmark_coverage';
  coverageTh.setAttribute('aria-sort', 'none');
  coverageTh.innerHTML = '<button class="sort-button" type="button" title="Available LiveBench metrics">Coverage <span class="sort-indicator" aria-hidden="true"></span></button>';
  headerRow.insertBefore(efficiencyTh, allowanceHeader);
  headerRow.insertBefore(coverageTh, allowanceHeader);
  els.sortHeaders.push(efficiencyTh, coverageTh);
  descendingPreferred.add('efficiency_score');
  descendingPreferred.add('benchmark_coverage');
  for (const th of [efficiencyTh, coverageTh]) th.querySelector('button')?.addEventListener('click', () => setSort(th.dataset.sort));

  if (typeof compareEls !== 'undefined') {
    compareEls.columnOptions.insertAdjacentHTML('beforeend', `
      <label class="column-option"><input type="checkbox" value="efficiency_score" checked><span>Efficiency</span></label>
      <label class="column-option"><input type="checkbox" value="benchmark_coverage" checked><span>Coverage</span></label>`);
  }
}

addDerivedTableColumns();

const insightOriginalRenderTable = renderTable;
renderTable = function renderTableWithInsights() {
  updateDerivedRows();
  insightOriginalRenderTable();

  const headerCells = [...document.querySelectorAll('#table-view thead th[data-sort]')];
  const efficiencyIndex = headerCells.findIndex((th) => th.dataset.sort === 'efficiency_score');
  const coverageIndex = headerCells.findIndex((th) => th.dataset.sort === 'benchmark_coverage');
  const visibleRows = getFilteredRows();
  visibleRows.sort((a, b) => compareRows(a, b, state.sortKey, state.sortDirection));

  [...els.rows.querySelectorAll('tr')].forEach((tr, index) => {
    const row = visibleRows[index];
    if (!row) return;
    if (efficiencyIndex >= 0 && !tr.querySelector('[data-derived-cell="efficiency"]')) {
      const cell = document.createElement('td');
      cell.dataset.derivedCell = 'efficiency';
      cell.className = 'efficiency-cell';
      cell.innerHTML = finite(row.efficiency_score) ? `<strong>${Number(row.efficiency_score).toFixed(1)}</strong><small>/100</small>` : '<span class="missing">—</span>';
      tr.insertBefore(cell, tr.children[efficiencyIndex] || null);
    }
    if (coverageIndex >= 0 && !tr.querySelector('[data-derived-cell="coverage"]')) {
      const cell = document.createElement('td');
      cell.dataset.derivedCell = 'coverage';
      cell.innerHTML = `<strong>${row.benchmark_coverage}/3</strong><small>${coverageLabel(row.benchmark_coverage)}</small>`;
      tr.insertBefore(cell, tr.children[coverageIndex] || null);
    }
  });

  if (typeof applyColumnVisibility === 'function') applyColumnVisibility();
};

if (typeof comparisonMetrics !== 'undefined') {
  comparisonMetrics.splice(5, 0,
    { label: 'Efficiency', value: (row) => efficiencyScore(row, state.rows), better: 'high', format: (value) => finite(value) ? `${Number(value).toFixed(1)}/100` : '—' },
    { label: 'Benchmark coverage', value: (row) => benchmarkCoverage(row), better: 'high', format: (value) => `${value}/3 · ${coverageLabel(value)}` },
  );
}

function bestRow(rows, getter, better = 'high') {
  const candidates = rows.map((row) => ({ row, value: getter(row) })).filter((item) => finite(item.value));
  if (!candidates.length) return null;
  candidates.sort((a, b) => better === 'high' ? b.value - a.value : a.value - b.value);
  return candidates[0];
}

function bestCard(title, item, formatter, detail) {
  if (!item) return `<article class="best-card"><span>${escapeHtml(title)}</span><strong>—</strong><small>No comparable data</small></article>`;
  return `<article class="best-card">
    <span>${escapeHtml(title)}</span>
    <strong>${escapeHtml(item.row.model)}</strong>
    <small>${escapeHtml(item.row.provider)} · ${escapeHtml(item.row.plan)}</small>
    <div class="best-card-value">${escapeHtml(formatter(item.value))}</div>
    <small>${escapeHtml(detail)}</small>
  </article>`;
}

function renderBestValue() {
  if (!state.data) return;
  updateDerivedRows();
  const rows = getFilteredRows();
  const comparable = rows.filter((row) => finite(row.efficiency_score));
  const capabilityWeight = insightState.efficiencyCapabilityWeight;
  insightEls.efficiencyLabel.textContent = `${capabilityWeight}%`;
  insightEls.efficiencyFormula.textContent = `${capabilityWeight}% capability percentile + ${100 - capabilityWeight}% inverse cost percentile`;

  insightEls.bestCards.innerHTML = [
    bestCard('Best efficiency', bestRow(comparable, (row) => row.efficiency_score), (v) => `${v.toFixed(1)}/100`, 'Configured efficiency score'),
    bestCard('Strongest coding', bestRow(rows, (row) => row.coding_intelligence), (v) => v.toFixed(1), 'Configured capability score'),
    bestCard('Best agentic', bestRow(rows, (row) => row.livebench_agentic_coding), (v) => v.toFixed(1), 'LiveBench Agentic Coding'),
    bestCard('Lowest coding cost', bestRow(rows, (row) => row.coding_cost, 'low'), (v) => money(v), 'Configured effective cost'),
    bestCard('Largest allowance', bestRow(rows, (row) => row.monthly_allowance_usd), (v) => money(v, 2), 'Monthly nominal API allowance'),
  ].join('');

  comparable.sort((a, b) => b.efficiency_score - a.efficiency_score);
  insightEls.efficiencyRanking.innerHTML = comparable.length ? comparable.map((row, index) => `
    <div class="efficiency-row">
      <span class="sweet-rank">${index + 1}</span>
      <div><strong>${escapeHtml(row.model)}</strong><small>${escapeHtml(row.provider)} · ${escapeHtml(row.plan)}</small></div>
      <div><strong>${Number(row.coding_intelligence).toFixed(1)}</strong><small>capability</small></div>
      <div><strong>${money(row.coding_cost)}</strong><small>coding cost</small></div>
      <div class="efficiency-score"><strong>${Number(row.efficiency_score).toFixed(1)}</strong><small>/100</small></div>
    </div>`).join('') : '<div class="chart-empty">No rows have enough benchmark and price data for an efficiency score.</div>';
}

function insightPointData() {
  const yMetric = metrics[els.quadrantY.value];
  const xMetric = metrics[els.quadrantX.value];
  return getFilteredRows().map((row) => ({ row, x: xMetric.value(row), y: yMetric.value(row) })).filter((point) => finite(point.x) && finite(point.y));
}

function sameModelKey(row) {
  if (row.livebench_model) return `lb:${row.livebench_model}`;
  return row.model.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, '');
}

function isDominated(point, other, xBetter) {
  const xNoWorse = xBetter === 'low' ? other.x <= point.x : other.x >= point.x;
  const yNoWorse = other.y >= point.y;
  const strictlyBetter = (xBetter === 'low' ? other.x < point.x : other.x > point.x) || other.y > point.y;
  return xNoWorse && yNoWorse && strictlyBetter;
}

function decorateQuadrant() {
  const svg = els.quadrantChart.querySelector('svg.scatter');
  if (!svg) return;
  svg.querySelectorAll('.same-model-link, .pareto-line').forEach((node) => node.remove());
  svg.querySelectorAll('.chart-point').forEach((node) => node.classList.remove('pareto-point'));

  const points = insightPointData();
  const circles = [...svg.querySelectorAll('.chart-point')];
  if (circles.length !== points.length) return;
  const xMetric = metrics[els.quadrantX.value];
  const ns = 'http://www.w3.org/2000/svg';
  const firstPoint = circles[0];

  if (insightState.connectSameModel) {
    const groups = new Map();
    points.forEach((point, index) => {
      const key = sameModelKey(point.row);
      const values = groups.get(key) || [];
      values.push({ point, circle: circles[index] });
      groups.set(key, values);
    });

    for (const group of groups.values()) {
      const providers = new Set(group.map((item) => item.point.row.provider));
      if (group.length < 2 || providers.size < 2) continue;
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          if (group[i].point.row.provider === group[j].point.row.provider) continue;
          const line = document.createElementNS(ns, 'line');
          line.setAttribute('class', 'same-model-link');
          line.setAttribute('x1', group[i].circle.getAttribute('cx'));
          line.setAttribute('y1', group[i].circle.getAttribute('cy'));
          line.setAttribute('x2', group[j].circle.getAttribute('cx'));
          line.setAttribute('y2', group[j].circle.getAttribute('cy'));
          svg.insertBefore(line, firstPoint);
        }
      }
    }
  }

  if (insightState.showPareto) {
    const frontier = points.map((point, index) => ({ point, circle: circles[index] })).filter(({ point }) =>
      !points.some((other) => other !== point && isDominated(point, other, xMetric.better)),
    );
    frontier.forEach(({ circle }) => circle.classList.add('pareto-point'));
    frontier.sort((a, b) => Number(a.circle.getAttribute('cx')) - Number(b.circle.getAttribute('cx')));
    if (frontier.length > 1) {
      const polyline = document.createElementNS(ns, 'polyline');
      polyline.setAttribute('class', 'pareto-line');
      polyline.setAttribute('points', frontier.map(({ circle }) => `${circle.getAttribute('cx')},${circle.getAttribute('cy')}`).join(' '));
      svg.insertBefore(polyline, firstPoint);
    }
  }
}

const insightOriginalRenderQuadrant = renderQuadrant;
renderQuadrant = function renderQuadrantWithAnalysis() {
  updateDerivedRows();
  insightOriginalRenderQuadrant();
  decorateQuadrant();
};

function snapshotRowMap(snapshot) {
  return new Map((snapshot?.rows || []).map((row) => [rowKey(row), row]));
}

function changePercent(previous, current) {
  if (!finite(previous) || !finite(current) || Number(previous) === 0) return null;
  return ((Number(current) - Number(previous)) / Math.abs(Number(previous))) * 100;
}

function renderChanges(previous) {
  if (!previous) {
    insightEls.changesDescription.textContent = 'No earlier daily snapshot is available yet. This view will populate automatically as history accumulates.';
    insightEls.changesList.innerHTML = '<div class="chart-empty">The first comparable historical snapshot has not been recorded yet.</div>';
    return;
  }

  const currentMap = snapshotRowMap(state.data);
  const previousMap = snapshotRowMap(previous);
  const changes = [];

  for (const [key, current] of currentMap) {
    const old = previousMap.get(key);
    if (!old) {
      changes.push({ type: 'added', row: current, label: 'Added to plan', detail: `${current.provider} · ${current.plan}` });
      continue;
    }
    const fields = [
      ['monthly_allowance_usd', 'Allowance', 'money'],
      ['value_multiplier', 'Value multiplier', 'multiplier'],
      ['effective_input_per_mt', 'Effective input', 'money'],
      ['effective_output_per_mt', 'Effective output', 'money'],
      ['livebench_coding', 'LB Coding', 'score'],
      ['livebench_agentic_coding', 'LB Agentic', 'score'],
    ];
    for (const [field, label, kind] of fields) {
      if (old[field] === current[field] || (!finite(old[field]) && !finite(current[field]))) continue;
      const format = (value) => kind === 'money' ? money(value) : kind === 'multiplier' ? `${Number(value).toFixed(2)}×` : finite(value) ? Number(value).toFixed(1) : '—';
      const pct = changePercent(old[field], current[field]);
      changes.push({
        type: 'changed', row: current, label,
        detail: `${format(old[field])} → ${format(current[field])}${pct === null ? '' : ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`}`,
      });
    }
  }
  for (const [key, old] of previousMap) {
    if (!currentMap.has(key)) changes.push({ type: 'removed', row: old, label: 'Removed from plan', detail: `${old.provider} · ${old.plan}` });
  }

  const previousDate = previous.generated_at ? new Date(previous.generated_at).toLocaleDateString() : 'previous snapshot';
  insightEls.changesDescription.textContent = `${changes.length} detected changes versus ${previousDate}.`;
  insightEls.changesList.innerHTML = changes.length ? changes.map((change) => `
    <article class="change-item ${change.type}">
      <span class="change-type">${escapeHtml(change.type)}</span>
      <div><strong>${escapeHtml(change.row.model)}</strong><small>${escapeHtml(change.row.provider)} · ${escapeHtml(change.row.plan)}</small></div>
      <div><strong>${escapeHtml(change.label)}</strong><small>${escapeHtml(change.detail)}</small></div>
    </article>`).join('') : '<div class="chart-empty">No pricing, allowance or benchmark changes were detected.</div>';
}

async function fetchHistorySnapshot(filename) {
  if (insightState.historySnapshots.has(filename)) return insightState.historySnapshots.get(filename);
  const response = await fetch(`data/history/${filename}`, { cache: 'no-store' });
  if (!response.ok) return null;
  const snapshot = await response.json();
  insightState.historySnapshots.set(filename, snapshot);
  return snapshot;
}

async function loadHistory() {
  if (insightState.historyLoading || insightState.historyIndex) return;
  insightState.historyLoading = true;
  try {
    const response = await fetch('data/history/index.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const index = await response.json();
    insightState.historyIndex = Array.isArray(index) ? index : [];
    const currentDate = String(state.data.generated_at || '').slice(0, 10);
    const previousName = [...insightState.historyIndex].reverse().find((name) => !name.startsWith(currentDate));
    const previous = previousName ? await fetchHistorySnapshot(previousName) : null;
    renderChanges(previous);
    populateHistoryExplorer();
  } catch (error) {
    insightEls.changesDescription.textContent = `History is not available: ${error.message}`;
  } finally {
    insightState.historyLoading = false;
  }
}

function populateHistoryExplorer() {
  const rows = [...state.rows].sort((a, b) => `${a.model} ${a.provider}`.localeCompare(`${b.model} ${b.provider}`, undefined, { numeric: true }));
  const selected = insightEls.historyModel.value;
  insightEls.historyModel.innerHTML = rows.map((row) => `<option value="${encodeURIComponent(rowKey(row))}">${escapeHtml(row.model)} · ${escapeHtml(row.provider)}</option>`).join('');
  if (selected && [...insightEls.historyModel.options].some((option) => option.value === selected)) insightEls.historyModel.value = selected;
  renderHistoryChart();
}

function historyMetricFormat(value, key) {
  if (!finite(value)) return '—';
  if (key.includes('effective') || key.includes('allowance')) return money(value, key.includes('allowance') ? 2 : 4);
  if (key === 'value_multiplier') return `${Number(value).toFixed(2)}×`;
  return Number(value).toFixed(1);
}

async function renderHistoryChart() {
  if (!insightState.historyIndex?.length || !insightEls.historyModel.value) {
    insightEls.historyChart.innerHTML = '<div class="chart-empty">Historical series will appear as daily snapshots accumulate.</div>';
    return;
  }
  const key = decodeURIComponent(insightEls.historyModel.value);
  const metric = insightEls.historyMetric.value;
  const names = insightState.historyIndex.slice(-30);
  const snapshots = await Promise.all(names.map(fetchHistorySnapshot));
  const series = snapshots.map((snapshot, index) => {
    if (!snapshot) return null;
    const row = snapshotRowMap(snapshot).get(key);
    const value = row?.[metric];
    if (!finite(value)) return null;
    return { date: names[index].replace('.json', ''), value: Number(value) };
  }).filter(Boolean);

  if (!series.length) {
    insightEls.historyChart.innerHTML = '<div class="chart-empty">No historical values exist for this model and metric yet.</div>';
    return;
  }

  const width = 1000;
  const height = 300;
  const margin = { top: 24, right: 28, bottom: 48, left: 78 };
  const values = series.map((item) => item.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= Math.abs(min || 1) * .08; max += Math.abs(max || 1) * .08; }
  const sx = (index) => margin.left + index / Math.max(1, series.length - 1) * (width - margin.left - margin.right);
  const sy = (value) => margin.top + (max - value) / (max - min) * (height - margin.top - margin.bottom);
  const path = series.map((item, index) => `${index ? 'L' : 'M'} ${sx(index)} ${sy(item.value)}`).join(' ');
  const points = series.map((item, index) => `<circle cx="${sx(index)}" cy="${sy(item.value)}" r="4"><title>${escapeHtml(`${item.date}: ${historyMetricFormat(item.value, metric)}`)}</title></circle>`).join('');
  const first = series[0];
  const last = series[series.length - 1];

  insightEls.historyChart.innerHTML = `
    <div class="history-summary"><strong>${escapeHtml(historyMetricFormat(last.value, metric))}</strong><span>${escapeHtml(first.date)} → ${escapeHtml(last.date)} · ${series.length} snapshots</span></div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Historical ${escapeHtml(metric)} series">
      <line class="history-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}" />
      <line class="history-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}" />
      <text class="history-tick" x="${margin.left - 10}" y="${sy(max) + 4}" text-anchor="end">${escapeHtml(historyMetricFormat(max, metric))}</text>
      <text class="history-tick" x="${margin.left - 10}" y="${sy(min) + 4}" text-anchor="end">${escapeHtml(historyMetricFormat(min, metric))}</text>
      <text class="history-tick" x="${margin.left}" y="${height - 18}">${escapeHtml(first.date)}</text>
      <text class="history-tick" x="${width - margin.right}" y="${height - 18}" text-anchor="end">${escapeHtml(last.date)}</text>
      <path class="history-line" d="${path}" />${points}
    </svg>`;
}

insightEls.historyModel.addEventListener('change', renderHistoryChart);
insightEls.historyMetric.addEventListener('change', renderHistoryChart);

function enableCompareReordering() {
  if (typeof compareEls === 'undefined') return;
  const headers = [...compareEls.table.querySelectorAll('th.comparison-model')];
  headers.forEach((header, index) => {
    const remove = header.querySelector('.comparison-remove');
    if (!remove) return;
    const key = decodeURIComponent(remove.dataset.compareKey);
    header.draggable = true;
    header.dataset.dragKey = encodeURIComponent(key);
    header.classList.add('draggable-comparison');

    if (!header.querySelector('.comparison-order-actions')) {
      const actions = document.createElement('div');
      actions.className = 'comparison-order-actions';
      actions.innerHTML = `<button type="button" data-direction="-1" ${index === 0 ? 'disabled' : ''} aria-label="Move left">←</button><button type="button" data-direction="1" ${index === headers.length - 1 ? 'disabled' : ''} aria-label="Move right">→</button>`;
      header.querySelector('.comparison-model-head')?.append(actions);
      for (const button of actions.querySelectorAll('button')) button.addEventListener('click', () => moveComparisonKey(key, Number(button.dataset.direction)));
    }

    header.addEventListener('dragstart', (event) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', key);
      header.classList.add('dragging');
    });
    header.addEventListener('dragend', () => header.classList.remove('dragging'));
    header.addEventListener('dragover', (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; });
    header.addEventListener('drop', (event) => {
      event.preventDefault();
      const source = event.dataTransfer.getData('text/plain');
      reorderComparison(source, key);
    });
  });
}

function reorderComparison(source, target) {
  if (!source || source === target) return;
  const keys = [...compareState.selected];
  const sourceIndex = keys.indexOf(source);
  const targetIndex = keys.indexOf(target);
  if (sourceIndex < 0 || targetIndex < 0) return;
  keys.splice(sourceIndex, 1);
  keys.splice(targetIndex, 0, source);
  compareState.selected = new Set(keys);
  persistCompareState();
  renderCompareTray();
  renderComparison();
}

function moveComparisonKey(key, direction) {
  const keys = [...compareState.selected];
  const index = keys.indexOf(key);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= keys.length) return;
  [keys[index], keys[next]] = [keys[next], keys[index]];
  compareState.selected = new Set(keys);
  persistCompareState();
  renderCompareTray();
  renderComparison();
}

const insightOriginalRenderComparison = renderComparison;
renderComparison = function renderComparisonWithOrdering() {
  updateDerivedRows();
  insightOriginalRenderComparison();
  enableCompareReordering();
};

const insightOriginalSetView = setView;
setView = function setViewWithInsights(view) {
  const insightView = view === 'best-value' || view === 'changes';
  insightEls.bestView.hidden = view !== 'best-value';
  insightEls.changesView.hidden = view !== 'changes';
  insightEls.bestTab.classList.toggle('active', view === 'best-value');
  insightEls.changesTab.classList.toggle('active', view === 'changes');
  insightEls.bestTab.setAttribute('aria-selected', String(view === 'best-value'));
  insightEls.changesTab.setAttribute('aria-selected', String(view === 'changes'));

  if (insightView) {
    state.view = view;
    els.tableView.hidden = true;
    els.quadrantView.hidden = true;
    compareEls.view.hidden = true;
    els.tableTab.classList.remove('active');
    els.quadrantTab.classList.remove('active');
    compareEls.tab.classList.remove('active');
    els.tableTab.setAttribute('aria-selected', 'false');
    els.quadrantTab.setAttribute('aria-selected', 'false');
    compareEls.tab.setAttribute('aria-selected', 'false');
    if (view === 'best-value') renderBestValue();
    else loadHistory();
    return;
  }

  insightEls.bestTab.classList.remove('active');
  insightEls.changesTab.classList.remove('active');
  insightOriginalSetView(view);
};

insightEls.bestTab.addEventListener('click', () => setView('best-value'));
insightEls.changesTab.addEventListener('click', () => setView('changes'));

const insightOriginalRender = render;
render = function renderWithInsights() {
  updateDerivedRows();
  insightOriginalRender();
  if (state.view === 'best-value') renderBestValue();
  if (state.data && !insightState.historyIndex && !insightState.historyLoading) queueMicrotask(loadHistory);
};

updateWeightControls();