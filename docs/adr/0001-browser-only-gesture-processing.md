# ADR 0001: Process Gesture Input Only in the Browser

- Status: Accepted
- Date: 2026-07-03

## Context

OrbitOPS needs responsive hand-gesture navigation for its 3D globe. Sending
camera frames to a backend would add latency, bandwidth cost, operational
complexity, and unnecessary privacy risk.

## Decision

Camera frames and hand landmarks will be processed entirely in the browser.
Only normalized control deltas may be passed to the existing visualization
state. OrbitOPS will not add a server endpoint for webcam frames or gesture
landmarks.

## Consequences

### Positive

- Lower interaction latency.
- No webcam-data storage or transport.
- Reduced backend load and attack surface.
- Gesture navigation remains isolated from mission-data services.

### Negative

- Performance depends on the user's device and browser.
- Browser compatibility requires explicit testing.
- The client must manage camera lifecycle and resource cleanup correctly.

## Guardrails

The implementation must stop media tracks on disable and unmount, keep the
feature opt-in, preserve non-camera controls, and document any third-party
client library before adoption.
