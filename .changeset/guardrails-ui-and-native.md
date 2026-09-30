---
"@janodetzel/app-commands": minor
---

Three new checks from moving an Expo Router app onto app-commands:

- `no-ui-in-logic` now counts `react-native-*` packages as UI imports by default. A feature importing `react-native-share` or `react-native-mmkv` passed lint and still could not load outside React Native.
- New rule `app-commands/no-store-action-in-ui`, on in the recommended config. It reports a UI file that calls a store action (`store.getState().add()`), destructures `getState()`, or takes a whole store with `useStore(store)`, all of which change state without going through the command. It applies under `src/screens/`, `src/components/`, `src/hooks/`, and `src/navigation/`, and leaves `src/app/` alone, where the app starts; pass `uiDirs` for another layout. An app with such a call gets a new lint error.
- New `checkUiCallers` in `/conformance`. It takes the UI's source text and names every feature command no screen calls, the half of principle 1 a tool can check.
