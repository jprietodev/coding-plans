# Coding Plans Comparator

Daily comparison of effective LLM token prices for coding subscription plans.

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

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scraper/main.py
```

Outputs:

- `data/current.json` — latest normalized data
- `data/history/YYYY-MM-DD.json` — daily snapshot
- `index.html` — static comparison UI

GitHub Actions runs the scraper daily, commits changed data back to the repository, and publishes the latest comparison to GitHub Pages.
