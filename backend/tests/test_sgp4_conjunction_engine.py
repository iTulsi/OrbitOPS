import sys
from pathlib import Path

import numpy as np


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from sgp4_conjunction_engine import (  # noqa: E402
    _catalog_id,
    _collect_linear_candidates,
    _load_omm_catalog,
)


def test_catalog_id_normalises_numeric_values():
    assert _catalog_id(25544) == "25544"
    assert _catalog_id("25544") == "25544"
    assert _catalog_id("25544.0") == "25544"
    assert _catalog_id(None) == ""


def test_load_omm_catalog_reads_only_requested_records(tmp_path):
    cache = tmp_path / "celestrak_omm"
    cache.mkdir()

    (cache / "active.json").write_text(
        """[
          {"NORAD_CAT_ID": 25544, "OBJECT_NAME": "ISS"},
          {"NORAD_CAT_ID": 900, "OBJECT_NAME": "CALSPHERE 1"}
        ]""",
        encoding="utf-8",
    )
    (cache / "metadata.json").write_text(
        '{"source": "test"}',
        encoding="utf-8",
    )

    catalog = _load_omm_catalog({"25544"}, cache)

    assert list(catalog) == ["25544"]
    assert catalog["25544"]["OBJECT_NAME"] == "ISS"


def test_segment_candidate_generation_finds_future_close_approach():
    positions = np.asarray(
        [
            [7000.0, 0.0, 0.0],
            [7001.0, 10.0, 0.0],
            [9000.0, 0.0, 0.0],
        ],
        dtype=float,
    )
    velocities = np.asarray(
        [
            [0.0, 0.0, 0.0],
            [0.0, -1.0, 0.0],
            [0.0, 0.0, 0.0],
        ],
        dtype=float,
    )
    valid = np.asarray([True, True, True], dtype=bool)

    candidates, pairs_evaluated = _collect_linear_candidates(
        positions,
        velocities,
        valid,
        anchor_offset_seconds=3600.0,
        segment_seconds=60.0,
        candidate_distance_km=2.0,
        block_size=2,
    )

    assert pairs_evaluated == 3
    assert set(candidates) == {(0, 1)}
    assert candidates[(0, 1)]["linear_miss_distance_km"] == 1.0
    assert candidates[(0, 1)]["predicted_tca_seconds"] == 3610.0


def test_segment_candidate_generation_ignores_invalid_states():
    positions = np.asarray(
        [
            [7000.0, 0.0, 0.0],
            [7000.5, 0.0, 0.0],
        ],
        dtype=float,
    )
    velocities = np.zeros((2, 3), dtype=float)
    valid = np.asarray([True, False], dtype=bool)

    candidates, pairs_evaluated = _collect_linear_candidates(
        positions,
        velocities,
        valid,
        anchor_offset_seconds=0.0,
        segment_seconds=60.0,
        candidate_distance_km=2.0,
    )

    assert candidates == {}
    assert pairs_evaluated == 0
