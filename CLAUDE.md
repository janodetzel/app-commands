# app-commands

A pnpm workspace holding one package and a todo-list example app that uses it:

- `packages/app-commands` - published as `@janodetzel/app-commands`. The
  `command()` builder, transport, protocol, CLI, MCP server, web UI, the
  conformance suite, the adapters, and the ESLint and dependency-cruiser rules that
  enforce the principles in an app (`/eslint`, `/depcruise`). Its core knows four
  things per command and nothing about how the app is built. The Expo dev tools
  transport sits behind the `/expo` subpath. It used to share the workspace with
  `@janodetzel/feature-kit`, which merged into it.
- `apps/example-app` - the example, built on it.

`docs/principles.md` is the source of truth: eleven principles, each with a
mechanical check. Read it before changing a layer boundary or the protocol, and do
not restate it elsewhere - link to it.

The example app has three layers: logic in `src/features/<feature>/`, the UI in
`src/screens/`, and the composition root in `src/app/`. Dependencies point from
`app` and `screens` into `features`, never back. `src/app/instances.ts`
is the only file that creates instances and wires features to each other.

## Skills

`skills/` holds the longer instructions, one folder per task, reachable as Claude
Code skills through `.claude/skills`:

| Skill                      | Use it when                                                      |
| -------------------------- | ---------------------------------------------------------------- |
| `driving-the-app`          | Verifying behavior at runtime with `pnpm app-commands`           |
| `workspace-setup`          | Installing, building, running the app, debugging the environment |
| `building-a-feature`       | Adding a screen, a store, a mutation, or an entry point          |
| `state-architecture`       | Deciding how a feature holds state                               |
| `maintaining-app-commands` | Changing the plugin: protocol, CLI, adapters, wire format        |

## Checks

Run these before you call a change done:

```
pnpm typecheck && pnpm lint && pnpm test && pnpm depcruise
```

`pnpm --filter @janodetzel/app-commands build:all` builds the plugin and exports the
web UI.
`pnpm --filter example-app check:release-bundle` exports a production bundle and fails
if the bridge appears in it.

A change to a published package needs a changeset: run `pnpm changeset` and commit
the file. Never edit a package `version` or push a release tag by hand; see
"Releasing" in `README.md`.

## Rules the design depends on

1. **Commands use the same instances as the UI.** Create the Zustand stores, the
   `ApolloClient`, and the `navigationRef` as module singletons outside React. A
   client created inside a component with `useMemo` is unreachable for the bridge.
2. **Commands call the same functions as the UI.** A command is never a second
   implementation. The feature method _is_ the command: the screen calls
   `todos.newTodoSubmitted({ title })` and so does the bridge. Name it after the
   control the reader touches, so a command no screen can reach has nowhere to hide.
3. **Every entry point returns a promise that settles when the work is done.** A
   fire-and-forget call makes a command report success before the save runs.
   `@typescript-eslint/no-floating-promises` is an error across the workspace.

## Layer boundaries

This is the design's load-bearing wall. `pnpm depcruise` enforces it; when a rule
blocks you, move the code, do not widen the rule.

- `packages/app-commands/src/core` imports **nothing** - not zod, not a UI library.
  It knows `Command` and `Registry` and how to answer a request.
- `packages/app-commands/src/command` (`command()`, `featureCommands()`) imports only
  core. It reads any Standard Schema through an interface it copies, so every
  feature file can import it without pulling in a validation library.
- `packages/app-commands/src/adapters/<lib>` imports only `<lib>`, zod, core, and
  `src/command`. Every adapter builds its commands with `command()` and declares
  their arguments in zod; there is no second way to define a command.

In the app the boundaries are app-commands' ESLint rules (`app-commands/*`), matching on file names and
resolved paths: `no-ui-in-logic`, `no-cross-feature-import`, `no-set-outside-store`,
`no-ambient-io`, `require-rethrow`. A _logic file_ is every file under `src/features/`,
at any depth, except tests: screens live outside it, so nothing inside needs React.

depcruise adds the direction: a feature never imports `app/`, `screens/` or
`navigation/`, code outside a feature imports it through its `index.ts` barrel only
(`features/news`, `features/profile/settings`), and a screen never imports the
registry.

## Conventions

- A feature's entry points live in `index.ts`: a `createX(deps)` factory returning a
  plain object of commands, each
  `command().input({ ... }).description("...").run(async (input) => ...)`. The
  schema sits next to the handler, which infers its argument type from it. `.input`
  takes a Standard Schema, an object of them, or a validator function.
- Features compose by nesting and merging plain objects, like tRPC routers:
  `{ ...a, ...b }` merges, `{ settings: settingsFeature }` nests and adds a segment
  to the command name (`profile.settings.unitButtonTapped`). Do it in `instances.ts`.
- Descriptions are part of the API, not documentation. Say what the command does
  _not_ do. Never generate one from a method name.
- A feature is a folder: `feature.ts` (the `createXFeature` factory), `store.ts`,
  `api.ts`, `gql.ts` as needed, and an `index.ts` barrel (`export *` is fine) that
  is the only file anything outside the feature imports. A sub-feature is a nested
  folder with its own barrel. Nothing in a feature imports React.
- Screens read a store with `useStore(store, selectors.x)`: the selectors come from
  the feature's barrel, the store instance from `instances.ts`. A hook that binds a
  selector to an instance lives with the screens, not in the feature.
- Screens and the registry import their instances from `src/app/instances.ts`, which
  creates the stores and the features and wires them. A feature never imports another
  feature; pass a getter or a delegate there instead, never a snapshot.
- A store is a factory that takes its dependencies: `createSettingsStore({ storage })`.
  That is all that is left of dependency injection, and it is what lets a test pass
  in-memory storage.
- Only a `store.ts` file calls `set`. An optimistic update rolls back and rethrows
  on failure; the rethrow is what makes the command fail, and `require-rethrow`
  checks it.
- A mutation goes through the operation function in `api.ts`, which owns its cache
  update. `useMutation` with its own `update` puts that logic where a command cannot
  reach it. Reads stay with `useQuery`.
- A feature that writes timestamps takes a `clock` dependency instead of calling
  `Date.now`, so a command and a test see the same time.
- A command returns picked fields, not a whole store state: the state object carries
  its actions, and functions do not survive JSON.
- `src/app/commands.ts` builds the registry: `buildRegistry` merges the slices that
  `featureCommands({ todos: todosFeature, ... })`, `apolloCommands` and
  `navigationCommands` return. The keys of the `featureCommands` object are the
  namespaces. Build it at module scope.
- `App.tsx` calls `useAppCommands(commandRegistry)` from
  `@janodetzel/app-commands/expo`. No Metro config and no special import path. The
  `/expo` entry is a no-op in production, which drops the hook and
  with it the only thing that connects the app to Metro. The schemas, the
  descriptions and `handleRequest` do ship, unreachable, so it is bundle size rather
  than exposure. Do not write a secret into a command description.
- Keep the strings the release check greps for out of user-facing copy, or the check
  turns into noise people learn to ignore.
- New feature with business logic? Its entry points are `command()`s registered in
  `featureCommands`, so it is reachable by definition. If features
  ship plain methods instead, the agent loses its reach one feature at a time.
- A screen cannot be handed a different store in a test, because there is no
  provider. Mock `../app/instances` when you need that.

## Verifying behavior in the simulator

The running app exposes its business logic through `pnpm app-commands`.

1. Start Metro and the simulator first. Exit code 2 means the app is not connected.
2. Run `pnpm app-commands list` to see every command and its arguments.
3. After a code change, reload the app (press `r` in Metro) before you run commands.
4. Read state with the adapter that owns it, never with a command a feature wrote
   for you: `apollo.inspect --prefix "Todo:"` for server data, `store.inspect` for
   a store, `storage.inspect` for what survives a restart, `nav.inspect` for where
   the app is. Call one with no argument to list the keys it has.
5. After a mutation that touches server data, read `apollo.inspect` first, then
   `apollo.refetch`, then read it again. A difference means the cache update is
   wrong. In that order: a refetch writes its result to the cache and hides the bug
   from every later read.
6. Use `nav.navigate` to put the app on a screen for a UI check. Do not verify data
   with screenshots. Use the inspect commands. A query only runs where its screen is
   mounted, so navigate before expecting its data in the cache.
7. When you add a feature with business logic, define its entry points with
   `command()` in the feature's `index.ts`. One per control a reader touches, and no
   read commands.
8. Every store action and operation function must return a promise that resolves
   when the work is done. Never fire and forget.

`.mcp.json` registers an `app-commands` MCP server that exposes the same commands as
tools, named with `_` in place of the dot (`store.inspect` becomes `store_inspect`). Prefer
those tools when they are in your tool list; call the `list` tool after reloading
the app, because the tool list is a snapshot.

Two things to keep in mind while working:

- Only one CLI, web console, or MCP server can be attached at a time. The app drops
  the older one, which then exits with code 2.
- Every connected device answers. With a simulator and an emulator both on Metro, a
  command runs on both. Keep one connected.
- On the Android emulator, run `adb reverse tcp:8081 tcp:8081` once first.
