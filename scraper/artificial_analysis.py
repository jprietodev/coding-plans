from __future__ import annotations

import os
from typing import Any

import requests

API_URL = "https://artificialanalysis.ai/api/v2/language/models/free"


def fetch_free_catalog(api_key: str) -> dict[str, Any]:
    response = requests.get(
        API_URL,
        params={"page": 1},
        headers={"x-api-key": api_key},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def get_api_tier() -> str | None:
    api_key = os.getenv("ARTIFICIALANALYSIS_APIKEY")
    if not api_key:
        return None
    payload = fetch_free_catalog(api_key)
    tier = payload.get("tier")
    return str(tier).lower() if tier else None


def main() -> None:
    tier = get_api_tier()
    if tier is None:
        print("Artificial Analysis API key is not configured")
        return
    print(f"Artificial Analysis API tier: {tier}")


if __name__ == "__main__":
    main()
