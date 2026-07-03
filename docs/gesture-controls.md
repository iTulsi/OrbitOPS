# Hand Gesture Globe Controls

OrbitOPS will provide optional webcam-based controls for the 3D orbital
visualization. Gesture input supplements existing mouse, keyboard, and touch
controls; it does not replace them.

## Initial Gesture Set

| Gesture | Result |
|---|---|
| Open palm moving horizontally | Rotate the Earth |
| Open palm moving vertically | Adjust the viewing angle |
| Pinch distance changing | Zoom the camera |
| Closed fist | Pause gesture input |

## Product Requirements

- Users must explicitly enable camera access.
- The interface must always show whether gesture input is off, active, paused,
  unavailable, or awaiting permission.
- Losing hand tracking must not reset or move the camera.
- Users must be able to disable gesture input without refreshing the page.
- Disabling the feature must stop every active camera track.
- Existing navigation controls must remain available.

## Acceptance Criteria

- Horizontal hand movement rotates the globe smoothly.
- Small involuntary movements are filtered with a dead zone.
- Movement is ignored below the configured confidence threshold.
- Permission denial displays recovery instructions instead of a generic error.
- A closed fist pauses movement until an open palm is detected again.
