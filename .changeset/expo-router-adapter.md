---
"@janodetzel/app-commands": minor
---

Add an Expo Router adapter at `@janodetzel/app-commands/adapters/expo-router`.
`expoRouterCommands({ router, navigationRef: useNavigationContainerRef })` gives
`nav.navigate`, `nav.back` and `nav.inspect` for an app whose navigation is Expo
Router's. `navigate` takes an href, waits for the app to arrive there, and fails
on `+not-found` or a redirect.
