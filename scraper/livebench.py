from __future__ import annotations

import csv
import io
import json
import re
from typing import Any

import requests

RAW_BASE = "https://raw.githubusercontent.com/LiveBench/new-livebench/main"
CONSTANTS_URL = f"{RAW_BASE}/src/lib/constants.js"
MODEL_LINKS_URL = f"{RAW_BASE}/src/Table/modelLinks.js"
SOURCE_REPO_URL = "https://github.com/LiveBench/new-livebench"


def fetch_text(url: str) -> str:
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    response.encoding = "utf-8"
    return response.text


def latest_release(constants_text: str) -> str:
    releases = re.findall(r'"(\d{4}-\d{2}-\d{2})"', constants_text)
    if not releases:
        raise RuntimeError("Could not determine latest LiveBench release")
    return releases[-1]


def mean_score(row: dict[str, str], tasks: list[str]) -> float | None:
    values: list[float] = []
    for task in tasks:
        raw = row.get(task, "").strip()
        if not raw:
            continue
        values.append(float(raw))
    if not values:
        return None
    return round(sum(values) / len(values), 3)


def canonical_name(value: str) -> str:
    value = value.casefold()
    value = re.sub(
        r"\((?:off[- ]peak|peak|latest|[^)]*tokens?|exp|experimental)\)",
        " ",
        value,
        flags=re.IGNORECASE,
    )
    value = re.sub(
        r"\b(?:latest|max effort|max|xhigh effort|xhigh|high effort|medium effort|thinking auto|thinking|highspeed|contributor)\b",
        " ",
        value,
    )
    return re.sub(r"[^a-z0-9]+", "", value)


def parse_model_display_names(source: str) -> dict[str, str]:
    pairs = re.findall(
        r'"([^"]+)"\s*:\s*\{[^{}]*?displayName:\s*"([^"]+)"',
        source,
        flags=re.DOTALL,
    )
    return dict(pairs)


def load_livebench() -> dict[str, Any]:
    release = latest_release(fetch_text(CONSTANTS_URL))
    categories_url = f"{RAW_BASE}/public/categories_{release.replace('-', '_')}.json"
    table_url = f"{RAW_BASE}/public/table_{release.replace('-', '_')}.csv"

    categories = json.loads(fetch_text(categories_url))
    display_names = parse_model_display_names(fetch_text(MODEL_LINKS_URL))
    table = csv.DictReader(io.StringIO(fetch_text(table_url)))

    category_names = list(categories)
    models: dict[str, dict[str, Any]] = {}
    lookup: dict[str, str] = {}

    for row in table:
        model_id = row["model"].strip()
        category_scores = {
            category: mean_score(row, tasks)
            for category, tasks in categories.items()
        }
        available_categories = [score for score in category_scores.values() if score is not None]
        overall = round(sum(available_categories) / len(available_categories), 3) if available_categories else None

        models[model_id] = {
            "model": model_id,
            "display_name": display_names.get(model_id, model_id),
            "overall": overall,
            "coding": category_scores.get("Coding"),
            "agentic_coding": category_scores.get("Agentic Coding"),
        }

        for candidate in (model_id, display_names.get(model_id, "")):
            key = canonical_name(candidate)
            if key and key not in lookup:
                lookup[key] = model_id

    return {
        "release": release,
        "source_url": SOURCE_REPO_URL,
        "table_url": table_url,
        "categories_url": categories_url,
        "category_names": category_names,
        "models": models,
        "lookup": lookup,
    }


def match_model(model_name: str, livebench: dict[str, Any]) -> str | None:
    key = canonical_name(model_name)
    return livebench["lookup"].get(key)


def dense_ranks(items: dict[str, float | None]) -> dict[str, int]:
    ranked_scores = sorted({score for score in items.values() if score is not None}, reverse=True)
    rank_by_score = {score: index + 1 for index, score in enumerate(ranked_scores)}
    return {
        model_id: rank_by_score[score]
        for model_id, score in items.items()
        if score is not None
    }


def enrich_rows(rows: list[dict[str, Any]], livebench: dict[str, Any]) -> dict[str, Any]:
    matched_ids: set[str] = set()
    unmatched_names: set[str] = set()

    for row in rows:
        model_id = match_model(row["model"], livebench)
        row["livebench_model"] = model_id
        row["livebench_overall"] = None
        row["livebench_coding"] = None
        row["livebench_agentic_coding"] = None
        row["livebench_overall_rank"] = None
        row["livebench_coding_rank"] = None
        row["livebench_agentic_coding_rank"] = None

        if model_id is None:
            unmatched_names.add(row["model"])
            continue

        matched_ids.add(model_id)
        score = livebench["models"][model_id]
        row["livebench_overall"] = score["overall"]
        row["livebench_coding"] = score["coding"]
        row["livebench_agentic_coding"] = score["agentic_coding"]

    overall_ranks = dense_ranks({model_id: livebench["models"][model_id]["overall"] for model_id in matched_ids})
    coding_ranks = dense_ranks({model_id: livebench["models"][model_id]["coding"] for model_id in matched_ids})
    agentic_ranks = dense_ranks({model_id: livebench["models"][model_id]["agentic_coding"] for model_id in matched_ids})

    for row in rows:
        model_id = row["livebench_model"]
        if model_id is None:
            continue
        row["livebench_overall_rank"] = overall_ranks.get(model_id)
        row["livebench_coding_rank"] = coding_ranks.get(model_id)
        row["livebench_agentic_coding_rank"] = agentic_ranks.get(model_id)

    return {
        "release": livebench["release"],
        "source_url": livebench["source_url"],
        "table_url": livebench["table_url"],
        "matched_unique_models": len(matched_ids),
        "rank_total": len(matched_ids),
        "unmatched_models": sorted(unmatched_names, key=str.casefold),
    }
