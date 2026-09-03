# Coding Plans Comparator

Daily comparison of effective LLM token prices and coding benchmark scores for coding subscription plans.

## Live

- Comparator: https://jprietodev.github.io/coding-plans/
- Current normalized data (JSON): https://jprietodev.github.io/coding-plans/data/current.json
- Source repository: https://github.com/jprietodev/coding-plans

The project currently compares:

- OpenCode Go
- Command Code GOAT

It normalizes each model's advertised API rates against the monthly usage allowance included in a $10 subscription.

## Effective price

For an API rate `P`, subscription price `S`, and model allowance `A`:

```text
effective_price = P * S / A
value_multiplier = A / S
discount_vs_api = 1 - S / A
```

Example: a model priced at $1 / 1M tokens with a $15 allowance on a $10 plan has an effective price of about $0.667 / 1M tokens when the monthly allowance is fully used.

## Benchmarks

Benchmark data comes from the public [LiveBench](https://livebench.ai/) leaderboard data in [`LiveBench/new-livebench`](https://github.com/LiveBench/new-livebench).

The scraper automatically detects the latest release declared by LiveBench and calculates:

- **LiveBench Overall** — equal-weighted mean of the published category scores.
- **LiveBench Coding** — mean of LiveBench `code_generation` and `code_completion`.
- **LiveBench Agentic Coding** — mean of `javascript`, `typescript`, and `python` agentic tasks.

Each score is accompanied by a rank calculated only among unique LiveBench-matched models that are currently available in the plans compared by this project. The rank is therefore a plan-selection rank, not the global LiveBench rank.

Model matching is normalized from the provider model name to LiveBench's model identifiers. The matched `livebench_model` id is included in `data/current.json` for auditability. Models that are not present in the current LiveBench release keep an empty benchmark score rather than receiving an inferred value.

## Quadrant view

The comparator includes a configurable capability/economics scatter plot. Each bubble represents one model + plan combination.

Default axes:

```text
Coding intelligence = 50% LiveBench Coding + 50% LiveBench Agentic Coding
Coding cost = 40% effective input + 50% effective output + 10% effective cache read
```

Both composite metrics are configurable. Capability weights can mix Overall, Coding and Agentic Coding; cost weights can mix effective input, output, cache-read and cache-write prices. Presets cover coding-agent, code-generation, agentic, balanced, input-heavy, output-heavy and cached-agent scenarios. Weights are normalized automatically to 100%.

The complete analysis configuration is persisted locally and encoded in the URL so a specific weighting setup can be shared.

Quadrant thresholds are configurable between median and mean. The highlighted sweet spot contains combinations on the high-capability side and the economically better side of the selected threshold. Bubble size can represent monthly allowance, value multiplier, or be fixed. Global model/provider filters also apply to the quadrant and its thresholds.

The quadrant can additionally show:

- **Pareto frontier** — non-dominated model + plan combinations for the selected capability/economics axes.
- **Same-model links** — lines connecting the same benchmark-matched model across different providers/plans, making pure economic differences visible.

## Efficiency score and Best Value

The table includes a configurable **Efficiency** score and benchmark **Coverage** column.

Efficiency is calculated from percentiles within the available plan combinations rather than by directly dividing benchmark points by dollars:

```text
efficiency = capability_weight * capability_percentile
           + cost_weight * inverse_cost_percentile
```

The default weighting is 70% capability / 30% cost and can be changed in the **Best Value** view. This view also surfaces the strongest coding model, strongest agentic model, lowest configured coding cost, largest allowance and a complete efficiency ranking.

Benchmark coverage reports how many of the three LiveBench metrics are available (`0/3` through `3/3`) and labels the resulting coverage as No data, Low, Medium or High.

## Side-by-side comparison

Any model + plan row can be added with the **+ Compare** control in the model column. The selection supports an arbitrary number of combinations and can be opened from the persistent comparison tray or the **Compare** tab.

The side-by-side matrix includes benchmark scores and ranks, coding intelligence, efficiency, benchmark coverage, allowance/value, nominal API rates, effective token prices, cache prices and the configured coding-cost metric. For numeric metrics, the best value among the selected combinations is highlighted automatically.

Comparison selections are stored locally in the browser so they survive page reloads. Models can be reordered by drag-and-drop or with left/right controls, removed individually, or the complete comparison can be cleared at once.

## Column visibility

The **Columns** menu controls which data columns are shown in the main table. Model remains visible because it contains the comparison action; all other data columns can be hidden or restored. Column preferences are persisted in browser local storage.

## Changes and history

Every committed daily snapshot in `data/history/` is published with the static site. The Pages workflow also generates a `data/history/index.json` manifest.

The **Changes** view compares the current snapshot with the most recent earlier daily snapshot and reports model additions/removals plus changes in allowance, value multiplier, effective input/output prices and coding benchmarks.

A history explorer plots up to the latest 30 published daily snapshots for any current model + plan combination. Available series include allowance, value multiplier, effective input/output and LiveBench coding/agentic scores.

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scraper/main.py
```

Outputs:

- `data/current.json` — latest normalized pricing and benchmark data
- `data/history/YYYY-MM-DD.json` — daily snapshot
- `index.html` — static comparison UI
- `app.js` / `style.css` — base table and quadrant UI
- `compare.js` / `compare.css` — multi-model comparison and column controls
- `insights.js` / `insights.css` — weighting, efficiency, Pareto, Best Value and history UI

GitHub Actions runs the scraper daily, commits changed data back to the repository, and publishes the latest comparison to GitHub Pages. The Pages workflow validates all frontend JavaScript files with Node before deployment.
