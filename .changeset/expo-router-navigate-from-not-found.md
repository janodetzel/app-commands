---
"@janodetzel/app-commands": patch
---

Fix the Expo Router adapter's `nav.navigate` and `nav.back` answering before their navigation had committed. The container commits a navigation after `router.navigate` / `router.back` return, and `getRootState()` rebuilds the state on every call, so no two reads are the same object:

- `nav.navigate` from `+not-found` reported `no route matches` for an href that did exist, although the app went there: its first check saw the unmatched page the app started on. `+not-found` now counts only once the state has changed.
- `nav.back` compared state objects by identity, which always differ, so it could answer before going back and return the screen it started on. It now compares the state's contents.

The test fake now commits on a later tick and rebuilds its state on every read, as the container does, which is what the old tests could not see.
