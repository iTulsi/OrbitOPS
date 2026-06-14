import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from risk_engine import (  # noqa: E402
    analyze_collision_pairs,
    classify_risk,
    estimate_collision_risk,
    haversine_distance_km,
    normalize_collision_object,
    safe_float,
)


class RiskEngineTests(unittest.TestCase):import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from risk_engine import (  # noqa: E402
    analyze_collision_pairs,
    classify_risk,
    estimate_collision_risk,
    haversine_distance_km,
    normalize_collision_object,
    safe_float,
)


class RiskEngineTests(unittest.TestCase):
    def test_safe_float_uses_default_for_invalid_values(self):
        self.assertEqual(safe_float("7.5"), 7.5)
        self.assertEqual(safe_float(None, 3.0), 3.0)
        self.assertEqual(safe_float("invalid", 2.0), 2.0)

    def test_risk_classification_boundaries(self):
        cases = [
            (0, "LOW"),
            (34.99, "LOW"),
            (35, "MEDIUM"),
            (60, "HIGH"),
            (75, "CRITICAL"),
            (100, "CRITICAL"),
        ]

        for score, expected_level in cases:
            with self.subTest(score=score):
                self.assertEqual(classify_risk(score), expected_level)

    def test_haversine_distance_is_zero_for_same_position(self):
        distance = haversine_distance_km(
            28.6139,
            77.2090,
            28.6139,
            77.2090,
        )

        self.assertAlmostEqual(distance, 0.0, places=6)

    def test_normalization_supports_alternate_field_names(self):
        normalized = normalize_collision_object(
            {
                "norad_id": "25544",
                "satellite_name": "ISS",
                "classification": "satellite",
                "latitude": "10.5",
                "longitude": "20.5",
                "alt_km": "408",
                "speed_km_s": "7.66",
            }
        )

        self.assertEqual(normalized["id"], "25544")
        self.assertEqual(normalized["name"], "ISS")
        self.assertEqual(normalized["type"], "SATELLITE")
        self.assertEqual(normalized["lat"], 10.5)
        self.assertEqual(normalized["lon"], 20.5)
        self.assertEqual(normalized["altitude_km"], 408.0)
        self.assertEqual(normalized["velocity_km_s"], 7.66)

    def test_collision_result_is_bounded_and_complete(self):
        result = estimate_collision_risk(
            {
                "name": "Satellite A",
                "type": "SATELLITE",
                "lat": 0,
                "lon": 0,
                "altitude_km": 400,
                "velocity_km_s": 7.5,
            },
            {
                "name": "Debris B",
                "type": "DEBRIS",
                "lat": 0,
                "lon": 0,
                "altitude_km": 400,
                "velocity_km_s": 7.5,
            },
        )

        self.assertGreaterEqual(result["risk_score"], 0)
        self.assertLessEqual(result["risk_score"], 100)
        self.assertEqual(result["risk_level"], "CRITICAL")
        self.assertEqual(result["object_a"], "Satellite A")
        self.assertEqual(result["object_b"], "Debris B")

    def test_pair_analysis_is_sorted_and_honors_limit(self):
        objects = [
            {
                "name": "Satellite A",
                "type": "SATELLITE",
                "lat": 0,
                "lon": 0,
                "altitude_km": 400,
                "velocity_km_s": 7.5,
            },
            {
                "name": "Debris B",
                "type": "DEBRIS",
                "lat": 0,
                "lon": 0,
                "altitude_km": 400,
                "velocity_km_s": 7.5,
            },
            {
                "name": "Satellite C",
                "type": "SATELLITE",
                "lat": 25,
                "lon": 25,
                "altitude_km": 900,
                "velocity_km_s": 1.0,
            },
        ]

        results = analyze_collision_pairs(objects, limit=2)

        self.assertEqual(len(results), 2)
        self.assertGreaterEqual(
            results[0]["risk_score"],
            results[1]["risk_score"],
        )
        self.assertEqual(
            {results[0]["object_a"], results[0]["object_b"]},
            {"Satellite A", "Debris B"},
        )


if __name__ == "__main__":
    unittest.main()
    def test_safe_float_uses_default_for_invalid_values(self):
        self.assertEqual(safe_float("7.5"), 7.5)
        self.assertEqual(safe_float(None, 3.0), 3.0)
        self.assertEqual(safe_float("invalid", 2.0), 2.0)

    def test_risk_classification_boundaries(self):
        cases = [
            (0, "LOW"),
            (34.99, "LOW"),
            (35, "MEDIUM"),
            (60, "HIGH"),
            (75, "CRITICAL"),
            (100, "CRITICAL"),
        ]

        for score, expected_level in cases:
            with self.subTest(score=score):
                self.assertEqual(
                    classify_risk(score),
                    expected_level,
                )

    def test_haversine_distance_is_zero_for_same_position(self):
        distance = haversine_distance_km(
            28.6139,
            77.2090,
            28.6139,
            77.2090,
        )

        self.assertAlmostEqual(distance, 0.0, places=6)

    def test_normalization_supports_alternate_field_names(self):
        normalized = normalize_collision_object(
            {
                "norad_id": "25544",
                "satellite_name": "ISS",
                "classification": "satellite",
                "latitude": "10.5",
                "longitude": "20.5",
                "alt_km": "408",
                "speed_km_s": "7.66",
            }
        )

        self.assertEqual(normalized["id"], "25544")
        self.assertEqual(normalized["name"], "ISS")
        self.assertEqual(normalized["type"], "SATELLITE")
        self.assertEqual(normalized["lat"], 10.5)
        self.assertEqual(normalized["lon"], 20.5)
        self.assertEqual(normalized["altitude_km"], 408.0)
        self.assertEqual(normalized["velocity_km_s"], 7.66)

    def test_collision_result_is_bounded_and_complete(self):
        result = estimate_collision_risk(
            {
                "name": "Satellite A",
                "type": "SATELLITE",
                "lat": 0,
                "lon": 0,
                "altitude_km": 400,
                "velocity_km_s": 7.5,
            },
            {
                "name": "Debris B",
                "type": "DEBRIS",
                "lat": 0,
                "lon": 0,
                "altitude_km": 400,
                "velocity_km_s": 7.5,
            },
        )

        self.assertGreaterEqual(result["risk_score"], 0)
        self.assertLessEqual(result["risk_score"], 100)
        self.assertEqual(result["risk_level"], "CRITICAL")
        self.assertEqual(result["object_a"], "Satellite A")
        self.assertEqual(result["object_b"], "Debris B")

    def test_pair_analysis_is_sorted_and_honors_limit(self):
        objects = [
            {
                "name": "Satellite A",
                "type": "SATELLITE",
                "lat": 0,
                "lon": 0,
                "altitude_km": 400,
                "velocity_km_s": 7.5,
            },
            {
                "name": "Debris B",
                "type": "DEBRIS",
                "lat": 0,
                "lon": 0,
                "altitude_km": 400,
                "velocity_km_s": 7.5,
            },
            {
                "name": "Satellite C",
                "type": "SATELLITE",
                "lat": 25,
                "lon": 25,
                "altitude_km": 900,
                "velocity_km_s": 1.0,
            },
        ]

        results = analyze_collision_pairs(objects, limit=2)

        self.assertEqual(len(results), 2)
        self.assertGreaterEqual(
            results[0]["risk_score"],
            results[1]["risk_score"],
        )
        self.assertEqual(
            {results[0]["object_a"], results[0]["object_b"]},
            {"Satellite A", "Debris B"},
        )


if __name__ == "__main__":
    unittest.main()
