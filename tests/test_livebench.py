import unittest

from scraper.livebench import canonical_name, dense_ranks, latest_release, mean_score, parse_model_display_names


class LiveBenchTests(unittest.TestCase):
    def test_latest_release_uses_last_declared_date(self):
        source = 'export const RELEASES = ["2026-01-08", "2026-06-25"];'
        self.assertEqual(latest_release(source), "2026-06-25")

    def test_category_mean(self):
        row = {"code_generation": "80", "code_completion": "70"}
        self.assertEqual(mean_score(row, ["code_generation", "code_completion"]), 75.0)

    def test_canonical_name_strips_plan_and_benchmark_variants(self):
        self.assertEqual(canonical_name("GPT 5.6 Luna (≤ 272K tokens)"), "gpt56luna")
        self.assertEqual(canonical_name("GPT-5.6 Luna Max Effort"), "gpt56luna")
        self.assertEqual(canonical_name("DeepSeek V4 Flash (Off-Peak)"), "deepseekv4flash")

    def test_dense_ranks(self):
        ranks = dense_ranks({"a": 90.0, "b": 80.0, "c": 80.0, "d": None})
        self.assertEqual(ranks, {"a": 1, "b": 2, "c": 2})

    def test_parse_model_display_names(self):
        source = '"glm-5.3": { url: "x", displayName: "GLM-5.3", reasoner: true },'
        self.assertEqual(parse_model_display_names(source)["glm-5.3"], "GLM-5.3")


if __name__ == "__main__":
    unittest.main()
