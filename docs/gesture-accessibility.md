# Gesture Control Accessibility

Gesture navigation is an optional enhancement. Every action available through a
gesture must remain available through conventional input methods.

## Requirements

- Mouse, keyboard, and touch navigation remain enabled.
- Gesture controls are disabled by default.
- Status is communicated through text and not colour alone.
- Controls use accessible names and visible focus indicators.
- Keyboard users can enable, pause, resume, and disable the feature.
- Reduced-motion preferences are respected by lowering animation intensity.
- Sensitivity can be adjusted without requiring a gesture.
- Instructions avoid assuming a specific dominant hand.

## Recovery and Safety

- Tracking loss freezes the last stable camera state.
- Sudden landmark jumps are ignored.
- A persistent disable control remains reachable while tracking is active.
- Permission errors do not trap focus or repeatedly reopen browser prompts.

## Manual Review

Test the feature with keyboard-only navigation, browser zoom at 200%, reduced
motion enabled, permission denied, no camera attached, and a screen reader
announcing each status transition.
