# Gesture Control Privacy Model

Gesture controls require camera access, so the feature must use a privacy-first
design that is understandable before the permission prompt appears.

## Data Handling Rules

- Video frames are processed only inside the user's browser.
- Frames, landmarks, and gesture events are not uploaded to OrbitOPS services.
- Camera frames are never persisted in local storage, logs, analytics, or crash
  reports.
- The backend does not expose an endpoint for receiving webcam data.
- Disabling the feature stops all tracks returned by `getUserMedia`.
- Navigating away from the visualization must release the camera.

## Permission Experience

Before requesting access, OrbitOPS must explain:

1. why the camera is needed;
2. that processing remains on the device;
3. that the feature is optional; and
4. how the camera can be disabled.

## Failure Behaviour

Permission denial, unavailable hardware, insecure browser contexts, and camera
contention must produce distinct user-facing states. None of these failures may
block standard globe navigation.

## Verification

Browser network inspection should show no frame or landmark uploads while the
feature is active. Automated tests should verify camera-track cleanup during
disable and component unmount flows.
