from __future__ import annotations

import threading
from typing import Any, Callable

from conjunction_realtime import build_realtime_payloads


Emitter = Callable[[str, dict[str, Any]], Any]


class ConjunctionSocketPublisher:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._last_updated: str | None = None

    def reset(self) -> None:
        with self._lock:
            self._last_updated = None

    def publish(
        self,
        snapshot: dict[str, Any],
        *,
        emitter: Emitter,
        initialize_only: bool = False,
    ) -> dict[str, Any]:
        last_updated = snapshot.get("last_updated")
        if not last_updated:
            return {
                "initialized": False,
                "published": False,
                "reason": "missing-last-updated",
            }

        last_updated = str(last_updated)

        with self._lock:
            if self._last_updated == last_updated:
                return {
                    "initialized": True,
                    "published": False,
                    "reason": "duplicate-snapshot",
                    "last_updated": last_updated,
                }

            if self._last_updated is None and initialize_only:
                self._last_updated = last_updated
                return {
                    "initialized": True,
                    "published": False,
                    "reason": "baseline-initialized",
                    "last_updated": last_updated,
                }

            self._last_updated = last_updated

        alerts, batch_payload, completion_payload = (
            build_realtime_payloads(snapshot)
        )

        emitter(
            "conjunction_screening_complete",
            completion_payload,
        )
        emitter(
            "conjunction_batch_update",
            batch_payload,
        )

        for alert in alerts:
            emitter("conjunction_alert", alert)

        return {
            "initialized": True,
            "published": True,
            "last_updated": last_updated,
            "alerts_emitted": len(alerts),
        }


conjunction_socket_publisher = ConjunctionSocketPublisher()


def run_conjunction_socket_worker(
    *,
    socketio: Any,
    snapshot_provider: Callable[..., tuple[dict[str, Any], int]],
    orbital_provider: Callable[..., dict[str, Any]],
    logger: Any,
    poll_seconds: int,
) -> None:
    logger.info("OrbitOPS conjunction socket worker started")
    baseline_pending = True

    while True:
        try:
            payload, status_code = snapshot_provider(
                orbital_provider,
                force=False,
                limit=500,
            )

            if (
                status_code == 200
                and isinstance(payload, dict)
                and payload.get("last_updated")
            ):
                conjunction_socket_publisher.publish(
                    payload,
                    emitter=socketio.emit,
                    initialize_only=baseline_pending,
                )
                baseline_pending = False

        except Exception:
            logger.exception(
                "OrbitOPS conjunction socket polling failed"
            )

        socketio.sleep(poll_seconds)
