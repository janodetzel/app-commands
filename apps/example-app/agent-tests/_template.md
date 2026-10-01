---
name: kebab-case-name
description: One sentence — what a user does and what this test proves.
platforms: [ios, android]
---

## Goal

The user outcome this test protects.

## Setup

- State the app needs before step 1, on top of a fresh install, e.g. "Two todos, the
  second one done". Or: nothing beyond a fresh install.
- The screen to start on.

## Steps

1. An action a user takes, phrased as their intent.
   - Expected: what is on screen or in saved state afterwards, with the value.
2. **(UI)** An action that must go through the UI — only when the test checks the UI
   itself: a control's wiring, feedback only the screen shows.
   - Expected: …

## Expected result

- What must be true at the end, on screen and in saved state.

## Cleanup

- Only what a fresh install does not undo. Leave this section out when there is nothing.
