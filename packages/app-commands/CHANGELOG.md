# @janodetzel/app-commands

## 0.5.0

### Minor Changes

- f4402af: Three new checks from moving an Expo Router app onto app-commands:

  - `no-ui-in-logic` now counts `react-native-*` packages as UI imports by default. A feature importing `react-native-share` or `react-native-mmkv` passed lint and still could not load outside React Native.
  - New rule `app-commands/no-store-action-in-ui`, on in the recommended config. It reports a UI file that calls a store action (`store.getState().add()`), destructures `getState()`, or takes a whole store with `useStore(store)`, all of which change state without going through the command. It applies under `src/screens/`, `src/components/`, `src/hooks/`, and `src/navigation/`, and leaves `src/app/` alone, where the app starts; pass `uiDirs` for another layout. An app with such a call gets a new lint error.
  - New `checkUiCallers` in `/conformance`. It takes the UI's source text and names every feature command no screen calls, the half of principle 1 a tool can check.

### Patch Changes

- 26cb7bd: Document how to set up an app around the package. A new `setting-up-an-app` skill covers the folder layout, the composition root and registry, ports and adapters, keeping features headless, the guardrail config, the headless test setup, and the pitfalls found moving an Expo Router app onto app-commands. The README now covers the `+not-found` screen an Expo Router app needs to keep the command bridge up, and how to install the skills. `building-a-feature` names commands after the control that triggers them and treats `api.ts` as a port for any platform call.
- 94086e9: Publish to npmjs.org. Install with `npm install @janodetzel/app-commands`: no `.npmrc` scope entry and no token, locally, in CI, or on a build service. Releases are published through npm trusted publishing and carry a provenance attestation. Earlier releases stay on GitHub Packages; an app moving over drops the `@janodetzel` registry lines from its `.npmrc` and any token it passed to installs for them.

## 0.4.1

### Patch Changes

- 1a120c4: Fix the Expo Router adapter's `nav.navigate` and `nav.back` answering before their navigation had committed. The container commits a navigation after `router.navigate` / `router.back` return, and `getRootState()` rebuilds the state on every call, so no two reads are the same object:

  - `nav.navigate` from `+not-found` reported `no route matches` for an href that did exist, although the app went there: its first check saw the unmatched page the app started on. `+not-found` now counts only once the state has changed.
  - `nav.back` compared state objects by identity, which always differ, so it could answer before going back and return the screen it started on. It now compares the state's contents.

  The test fake now commits on a later tick and rebuilds its state on every read, as the container does, which is what the old tests could not see.

## 0.4.0

### Minor Changes

- c83bb71: The web console shows a command's result as a tree whose branches open and close. Pick a level to open every branch down to that depth, or click a branch to toggle it. A long result opens at its top level; "raw" shows the plain JSON for copying.
- 152b642: Add an Expo Router adapter at `@janodetzel/app-commands/adapters/expo-router`.
  `expoRouterCommands({ router, navigationRef: useNavigationContainerRef })` gives
  `nav.navigate`, `nav.back` and `nav.inspect` for an app whose navigation is Expo
  Router's. `navigate` takes an href, waits for the app to arrive there, and fails
  on `+not-found` or a redirect.

## 0.3.0

### Minor Changes

- 799e4af: Every adapter that owns state now names its read `inspect`, so a feature ships
  only the commands its UI calls.

  A read command written by a feature for the agent is a second implementation of
  what a screen already renders, and it drifts the moment the two are edited apart.
  The adapters already sit next to the state, so the read belongs to them:

  ```ts
  buildRegistry(
  	featureCommands({ news: newsFeature }), //                   news.dismissButtonTapped
  	navigationCommands(navigationRef, { routes: RouteName }), // nav.navigate, nav.back, nav.inspect
  	apolloCommands(apolloClient), //                             apollo.refetch, apollo.inspect
  	zustandCommands({ settings: settingsStore }), //             store.inspect
  	keyValueCommands(AsyncStorage), //                           storage.inspect
  );
  ```

  Each `inspect` declares the keys it has where they are known, so an agent reads
  them off the tool definition rather than discovering them: `store.inspect` takes a
  `z.enum` of the store names, `nav.inspect` of `current` and `state`. Where keys are
  discovered at runtime, `apollo.inspect` and `storage.inspect` list them when called
  with no argument.

  They are read-only on purpose. A command that wrote state directly would put the
  app in a state no tap can produce.

  **New:**

  - `keyValueCommands(storage)` reads AsyncStorage, MMKV, or anything with
    `getItem` and `getAllKeys` - the two methods are copied, not imported, so the
    package depends on none of them. Reading both this and the store that owns a
    value is how an agent tells a save that happened from one that only looked
    like it did.
  - A key that matches nothing now fails and names the keys that exist.
    `apollo.cache` used to return `{}`, which an agent cannot tell apart from
    "no data".

  **Breaking:**

  - `zustandInspect` is renamed `zustandCommands`, and `store.get --store x`
    becomes `store.inspect --store x`.
  - `apollo.cache --prefix x` becomes `apollo.inspect --prefix x`. Called with no
    prefix it lists the prefixes present instead of requiring one.
  - `nav.current` and `nav.state` become `nav.inspect --key current|state`, with
    `current` the default.

  Also fixes the built CLI and MCP entry points losing their executable bit, which
  made `app-commands` and the MCP server fail with `EACCES` after a build.

## 0.2.0

### Minor Changes

- e35984a: Define commands in the style of tRPC procedures: `command().input(schema).description("...").run(handler)`.

  - New `command()` builder, exported from the package root. `.input()` takes any Standard Schema (zod, Valibot, ArkType), an object of them, or a validator function. The handler's argument type comes from the schema. The result is a core `Command` that is also a function the UI calls: a direct call validates, rejecting with `InputError`, while `run` skips validation for a caller that has already parsed.
  - New `featureCommands(tree)`, exported from the package root, collects the commands built with `command()` and replaces `featureCommands(...features)` from `/adapters/feature-kit`. Its keys are the namespaces. Nested plain objects add a segment (`profile.settings.setUnits`), and a spread merges two features into one namespace.
  - `Command.parse` may return a promise. `handleRequest` and `checkRegistry` await it. The wire protocol is unchanged.
  - `checkRegistry` accepts names with more than two segments.
  - Breaking: removed the `/adapters/feature-kit` entry point and the `@janodetzel/feature-kit` peer dependency.
  - Breaking: removed the `/adapters/zod` entry point (`zodCommands`, `fromZod`). Use `command()` with a zod schema. The apollo, react-navigation and zustand adapters are built on `command()` now, and `navigationCommands`' `routes` option takes any Standard Schema of a string.
  - The optional `zod` peer dependency is `^4.2.0`, the first release with the `~standard.jsonSchema` extension that command listings read.
  - `@janodetzel/feature-kit` is merged into this package. Its ESLint plugin is `@janodetzel/app-commands/eslint`, with rules renamed from `feature-kit/*` to `app-commands/*`, and its dependency-cruiser rule is `@janodetzel/app-commands/depcruise`. `defineFeature`, `META` and `Spec` are gone; define entry points with `command()`. `no-ui-in-logic` and `no-ambient-io` now treat every non-test file under `src/features/`, at any depth, as a logic file; pass `logicFiles` to narrow it back to names for a layout that keeps screens inside feature folders. The depcruise `rules()` add `no-deep-feature-import` and `features-do-not-import-the-app`.

## 0.1.1

### Patch Changes

- 9ed6d69: Setup package release workflow
