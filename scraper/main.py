from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
HISTORY_DIR = DATA_DIR / "history"
USER_AGENT = "coding-plans-comparator/0.1 (+https://github.com/jprietodev/coding-plans)"
TIMEZONE = ZoneInfo("Europe/Madrid")


@dataclass(frozen=True)
class ProviderConfig:
    provider: str
    plan: str
    subscription_usd: float
    url: str
    allowance_headers: tuple[str, ...]


PROVIDERS = (
    ProviderConfig(
        provider="OpenCode",
        plan="Go",
        subscription_usd=10.0,
        url="https://opencode.ai/docs/go/",
        allowance_headers=("usage",),
    ),
    ProviderConfig(
        provider="Command Code",
        plan="GOAT",
        subscription_usd=10.0,
        url="https://commandcode.ai/docs/plans/goat",
        allowance_headers=("monthly credits",),
    ),
)


def normalize_header(value: str) -> str:
    value = value.strip().lower().replace("cached", "cache")
    return re.sub(r"\s+", " ", value)


def parse_money(value: str) -> float | None:
    value = value.replace(",", "").strip()
    if value in {"", "-", "—", "–", "n/a", "N/A"}:
        return None
    match = re.search(r"\$?\s*([0-9]+(?:\.[0-9]+)?)", value)
    return float(match.group(1)) if match else None


def effective_price(api_price: float | None, subscription: float, allowance: float) -> float | None:
    if api_price is None:
        return None
    if allowance <= 0:
        raise ValueError("Allowance must be positive")
    return round(api_price * subscription / allowance, 6)


def extract_limits(text: str) -> dict[str, float | None]:
    compact = re.sub(r"\s+", " ", text)

    def find(pattern: str) -> float | None:
        match = re.search(pattern, compact, flags=re.IGNORECASE)
        return float(match.group(1)) if match else None

    return {
        "five_hour_usd": find(r"5[- ]hour(?:\s+(?:limit|cap))?\s*[—–:\-]*\s*\$([0-9]+(?:\.[0-9]+)?)"),
        "weekly_usd": find(r"weekly(?:\s+(?:limit|cap))?\s*[—–:\-]*\s*\$([0-9]+(?:\.[0-9]+)?)"),
        "monthly_usd": find(r"monthly(?:\s+(?:limit|cap))?\s*[—–:\-]*\s*\$([0-9]+(?:\.[0-9]+)?)"),
    }


def fetch_html(url: str) -> str:
    response = requests.get(
        url,
        timeout=30,
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    response.raise_for_status()
    return response.text


def table_headers(table: Any) -> list[str]:
    first_row = table.find("tr")
    if not first_row:
        return []
    return [normalize_header(cell.get_text(" ", strip=True)) for cell in first_row.find_all(["th", "td"])]


def parse_provider(config: ProviderConfig) -> dict[str, Any]:
    html = fetch_html(config.url)
    soup = BeautifulSoup(html, "html.parser")
    models: dict[str, dict[str, Any]] = {}

    for table in soup.find_all("table"):
        headers = table_headers(table)
        if not headers:
            continue

        header_index = {header: index for index, header in enumerate(headers)}
        allowance_header = next((h for h in config.allowance_headers if h in header_index), None)
        required = {"model", "input", "output"}
        if allowance_header is None or not required.issubset(header_index):
            continue

        cache_read_header = next((h for h in ("cache read",) if h in header_index), None)
        cache_write_header = next((h for h in ("cache write",) if h in header_index), None)

        for row in table.find_all("tr")[1:]:
            cells = row.find_all(["td", "th"])
            if len(cells) < len(headers):
                continue
            values = [cell.get_text(" ", strip=True) for cell in cells]

            model = values[header_index["model"]].strip()
            allowance = parse_money(values[header_index[allowance_header]])
            if not model or allowance is None or allowance <= 0:
                continue

            input_price = parse_money(values[header_index["input"]])
            output_price = parse_money(values[header_index["output"]])
            cache_read = parse_money(values[header_index[cache_read_header]]) if cache_read_header else None
            cache_write = parse_money(values[header_index[cache_write_header]]) if cache_write_header else None

            multiplier = allowance / config.subscription_usd
            row_data = {
                "provider": config.provider,
                "plan": config.plan,
                "subscription_usd": config.subscription_usd,
                "model": model,
                "monthly_allowance_usd": allowance,
                "value_multiplier": round(multiplier, 4),
                "discount_vs_api_pct": round((1 - config.subscription_usd / allowance) * 100, 3),
                "api_input_per_mt": input_price,
                "effective_input_per_mt": effective_price(input_price, config.subscription_usd, allowance),
                "api_output_per_mt": output_price,
                "effective_output_per_mt": effective_price(output_price, config.subscription_usd, allowance),
                "api_cache_read_per_mt": cache_read,
                "effective_cache_read_per_mt": effective_price(cache_read, config.subscription_usd, allowance),
                "api_cache_write_per_mt": cache_write,
                "effective_cache_write_per_mt": effective_price(cache_write, config.subscription_usd, allowance),
                "source_url": config.url,
            }
            models[model.casefold()] = row_data

    if len(models) < 3:
        raise RuntimeError(
            f"Parsed only {len(models)} pricing rows from {config.provider} {config.plan}; refusing to publish possibly broken data"
        )

    return {
        "provider": config.provider,
        "plan": config.plan,
        "subscription_usd": config.subscription_usd,
        "source_url": config.url,
        "limits": extract_limits(soup.get_text(" ", strip=True)),
        "models": sorted(models.values(), key=lambda item: item["model"].casefold()),
    }


def build_snapshot() -> dict[str, Any]:
    now = datetime.now(TIMEZONE)
    providers = [parse_provider(config) for config in PROVIDERS]
    rows = [model for provider in providers for model in provider["models"]]
    rows.sort(key=lambda item: (item["model"].casefold(), item["provider"].casefold()))

    return {
        "generated_at": now.isoformat(timespec="seconds"),
        "timezone": "Europe/Madrid",
        "methodology": {
            "effective_price_formula": "api_price * subscription_usd / monthly_allowance_usd",
            "value_multiplier_formula": "monthly_allowance_usd / subscription_usd",
            "assumption": "Effective prices assume the full monthly model allowance is consumed.",
        },
        "providers": providers,
        "rows": rows,
    }


def write_snapshot(snapshot: dict[str, Any]) -> tuple[Path, Path]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)

    today = datetime.now(TIMEZONE).date().isoformat()
    current_path = DATA_DIR / "current.json"
    history_path = HISTORY_DIR / f"{today}.json"
    payload = json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n"

    current_path.write_text(payload, encoding="utf-8")
    history_path.write_text(payload, encoding="utf-8")
    return current_path, history_path


def main() -> None:
    snapshot = build_snapshot()
    current, history = write_snapshot(snapshot)
    print(f"Wrote {len(snapshot['rows'])} normalized model rows")
    print(f"Current: {current.relative_to(ROOT)}")
    print(f"History: {history.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
