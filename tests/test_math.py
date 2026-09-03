import unittest

from scraper.main import effective_price, parse_money


class PricingMathTests(unittest.TestCase):
    def test_effective_price_for_fifteen_dollar_allowance(self):
        self.assertAlmostEqual(effective_price(1.0, 10.0, 15.0), 0.666667)

    def test_effective_price_for_sixty_dollar_allowance(self):
        self.assertAlmostEqual(effective_price(1.0, 10.0, 60.0), 0.166667)

    def test_missing_api_price_stays_missing(self):
        self.assertIsNone(effective_price(None, 10.0, 60.0))

    def test_parse_money(self):
        self.assertEqual(parse_money("$0.003625"), 0.003625)
        self.assertEqual(parse_money("$1,200.50"), 1200.50)
        self.assertIsNone(parse_money("—"))


if __name__ == "__main__":
    unittest.main()
