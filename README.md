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

The public comparator includes a configurable capability/economics scatter plot. Each bubble represents one model + plan combination.

Default axes:

```text
Coding intelligence = 50% LiveBench Coding + 50% LiveBench Agentic Coding
Coding cost = 40% effective input + 50% effective output + 10% effective cache read
```

The Y axis can also use the simple mean of Overall, Coding and Agentic Coding or any individual LiveBench metric. The X axis can use the simple mean of available effective token prices, individual effective price components, value multiplier, or monthly allowance.

Quadrant thresholds are configurable between median and mean. The highlighted sweet spot contains combinations on the high-capability side and the economically better side of the selected threshold. Bubble size can represent monthly allowance, value multiplier, or be fixed. Global model/provider filters also apply to the quadrant and its thresholds.

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

GitHub Actions runs the scraper daily, commits changed data back to the repository, and publishes the latest comparison to GitHub Pages. The Pages workflow also validates `app.js` syntax with Node before deployment.
