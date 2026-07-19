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
    score_conjunction_event,
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


    def test_conjunction_score_uses_validated_event_factors(self):
        baseline = score_conjunction_event(
            miss_distance_km=8,
            relative_velocity_km_s=1,
            time_to_closest_approach_hours=20,
            object_a_type="SATELLITE",
            object_b_type="SATELLITE",
        )
        urgent_uncontrolled = score_conjunction_event(
            miss_distance_km=8,
            relative_velocity_km_s=12,
            time_to_closest_approach_hours=2,
            object_a_type="SATELLITE",
            object_b_type="DEBRIS",
        )

        self.assertGreater(urgent_uncontrolled["score"], baseline["score"])
        self.assertGreater(
            urgent_uncontrolled["components"]["relative_velocity"],
            baseline["components"]["relative_velocity"],
        )
        self.assertGreater(
            urgent_uncontrolled["components"]["tca_urgency"],
            baseline["components"]["tca_urgency"],
        )
        self.assertEqual(urgent_uncontrolled["components"]["object_control"], 5.0)

    def test_controlled_pair_does_not_inflate_to_critical(self):
        result = score_conjunction_event(
            miss_distance_km=2.3,
            relative_velocity_km_s=7,
            time_to_closest_approach_hours=2,
            object_a_type="SATELLITE",
            object_b_type="SATELLITE",
        )

        self.assertGreaterEqual(result["score"], 90)
        self.assertEqual(result["level"], "HIGH")

    def test_limited_state_is_capped_and_explained(self):
        result = score_conjunction_event(
            miss_distance_km=0.5,
            relative_velocity_km_s=None,
            time_to_closest_approach_hours=0,
            object_a_type="SATELLITE",
            object_b_type="DEBRIS",
            has_full_state=False,
        )

        self.assertEqual(result["score"], 55.0)
        self.assertEqual(result["level"], "MEDIUM")
        self.assertEqual(result["components"]["confidence_cap"], 55.0)
        self.assertEqual(result["model_basis"], "current-frame-proximity")

    def test_conjunction_score_rejects_invalid_inputs(self):
        with self.assertRaisesRegex(ValueError, "miss_distance_km"):
            score_conjunction_event(miss_distance_km=-1)
        with self.assertRaisesRegex(ValueError, "relative_velocity_km_s"):
            score_conjunction_event(
                miss_distance_km=5,
                relative_velocity_km_s=float("nan"),
            )


if __name__ == "__main__":
    unittest.main()
