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

GitHub Actions runs the scraper daily, commits changed data back to the repository, and publishes the latest comparison to GitHub Pages.
