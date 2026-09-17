# @janodetzel/app-commands

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
