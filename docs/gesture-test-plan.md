# Gesture Control Test Plan

This plan defines the minimum verification required before gesture navigation is
released.

## Unit Tests

- Map stable horizontal landmark movement to globe rotation.
- Map stable vertical movement to camera tilt.
- Map pinch-distance changes to bounded zoom values.
- Ignore motion inside the configured dead zone.
- Ignore frames below the confidence threshold.
- Clamp rotation, tilt, and zoom outputs to safe ranges.
- Reset transient tracking state after a hand disappears.

## Integration Tests

- Enabling the feature requests camera permission once.
- Permission denial preserves mouse and keyboard controls.
- Pausing stops camera updates without resetting the globe.
- Disabling stops every media track.
- Component unmount stops every media track.
- Re-enabling creates a new clean tracking session.

## Manual Browser Checks

Validate current Chrome, Safari, and Firefox releases on desktop. Confirm that
the feature fails safely on insecure origins, unavailable cameras, and cameras
already used by another application.

## Release Gate

The feature is ready only when automated tests pass, production builds succeed,
the browser console remains free of uncaught errors, and network inspection
confirms that camera-derived data never leaves the browser.
