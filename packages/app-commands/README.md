# @janodetzel/app-commands

The command contract, the request handler, the protocol, and the CLI. A command
calls the same store action or operation function a tap in the UI calls, on the
same instances, so what an agent verifies is what the user gets.

```
$ pnpm app-commands nav.navigate --screen Settings
{"name":"Settings","params":null}
```

This package is `Command`, `Registry`, `handleRequest`, the wire format, the
transports that carry them, and `command()`, which builds commands from any
Standard Schema. It names no UI framework, no state
library, and no validation library — see principle 10 in
[`docs/principles.md`](../../docs/principles.md), which is the source of truth for
why this package is shaped the way it is. The lint and dependency-cruiser rules that keep an app's
features reachable ship here too, behind `/eslint` and `/depcruise`.

| Entry point                            | What it is                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `@janodetzel/app-commands`             | `command()`, `featureCommands()`, and the core: `Command`, `Registry`, `buildRegistry`, `handleRequest`, the protocol constants          |
| `@janodetzel/app-commands/expo`        | The Expo dev tools transport and the `useAppCommands` hook. A no-op in production                                                        |
| `@janodetzel/app-commands/conformance` | `checkRegistry`, the suite an app runs against its own registry                                                                          |
| `@janodetzel/app-commands/protocol`    | The wire types, for another client                                                                                                       |
| `@janodetzel/app-commands/adapters/*`  | The adapters: `apollo`, `react-navigation`, `zustand`. One library each, so an optional peer you did not install is one you never import |
| `@janodetzel/app-commands/eslint`      | The five architecture rules, as a flat-config ESLint plugin                                                                              |
| `@janodetzel/app-commands/depcruise`   | `rules()`, the sibling-feature boundary for dependency-cruiser                                                                           |

The binaries are `app-commands` and `app-commands-mcp`. From the repo root, run the CLI
as `pnpm app-commands`.

## Installing from GitHub Packages

The package is published to GitHub Packages, not npmjs.org. Point the scope at it in
the consuming project's `.npmrc`:

```
@janodetzel:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

GitHub Packages asks for a token even for a public package: `GITHUB_TOKEN` must be a
token with the `read:packages` scope (`gh auth refresh -s read:packages`, then
`export GITHUB_TOKEN=$(gh auth token)`).

## Installing it in the workspace

```jsonc
// apps/example-app/package.json
"dependencies": { "@janodetzel/app-commands": "workspace:*" }
```

Add it to the root `package.json` as well, so `pnpm app-commands` works from the repo
root: pnpm links a binary into the `node_modules/.bin` of the package that
depends on it.

`expo` and `react` are peer dependencies. Everything else is an optional peer -
`zod` and the three UI libraries - because each is needed only by the adapters.
`command()` needs none of them: bring whichever Standard Schema library the app
already uses. With zod, use 4.2 or later, the release that added the JSON Schema the
CLI and the MCP server read. An older one validates, but lists no arguments.

## What the bridge knows about a command

Four things, and nothing about where they came from.

```ts
type Command = {
	description: string;
	/** JSON Schema of the arguments, for the CLI flags and the web UI form. */
	jsonSchema: object;
	/** Returns parsed args or issues. app-commands never validates itself. */
	parse: (input: unknown) => ParseResult | Promise<ParseResult>;
	run: (args: unknown) => Promise<unknown>;
};

type ParseResult = { ok: true; value: unknown } | { ok: false; issues: unknown[] };

type Registry = Record<string, Command>; // keys are `<namespace>.<name>`, or deeper when nested
```

`src/core` imports nothing at all - no validation library, no UI library, no
feature framework - so the bridge works against an app built on Redux, XState,
MobX, or plain service classes. `parse` is a function rather than a schema object
for the same reason: a Valibot or ArkType app is not forced to install zod. It may
return a promise, because a Standard Schema may validate asynchronously.

`handleRequest` calls `parse`, then `run`, then serializes. It has no notion of a
feature, a namespace, or a schema library.

## Defining commands

`command()` builds one in the style of a [tRPC procedure](https://trpc.io/docs/server/procedures):
the schema, the description, and the handler in one expression. The result is a
`Command` with the four fields above that is also a function, so the UI calls it
and the registry holds it as it is.

```ts
import { command } from "@janodetzel/app-commands";
import { z } from "zod";

export const createSettingsFeature = (deps: SettingsDeps) => ({
	get: command()
		.description("Returns units and notifications. Does not load from storage.")
		.run(async () => pick(deps.store.getState())),

	setNotifications: command()
		.input({ notifications: z.boolean() })
		.description("Turns notifications on or off and saves. Fails when the save fails.")
		.run(async ({ notifications }) => {
			await deps.store.getState().setNotifications(notifications);
			return deps.store.getState().notifications;
		}),
});
```

- `.input()` takes a [Standard Schema](https://standardschema.dev) (zod, Valibot,
  ArkType), an object of them as above, or a function that returns the parsed value
  and throws to reject it. The handler receives the schema's output type, and a
  caller passes its input type, so a `.default()` is optional for the caller and
  present in the handler. Leave it out for a command without arguments.
- The JSON Schema comes from the schema's `~standard.jsonSchema`, when the library
  provides one. A function, or a library without it, lists as `{}`: the command still
  runs, and the CLI takes its arguments through `--args '<json>'`.
- `.description()` is required before `.run()`, in the types and at runtime.
- Calling it validates and then runs, and rejects with an `InputError` carrying
  `issues`. `run` on its own skips validation, for a caller that has already parsed,
  as `handleRequest` has. The UI always calls the command itself.

## Producing a registry

`featureCommands` collects the commands in a tree of plain objects, named by their
path. A command written by hand, as an object literal with the four fields, is
collected the same way. An adapter turns one library into a slice of the registry. `buildRegistry`
merges the slices and throws on a duplicate key, naming it.

```ts
import { buildRegistry, featureCommands } from "@janodetzel/app-commands";
import { apolloCacheSource, apolloCommands } from "@janodetzel/app-commands/adapters/apollo";
import { inspect } from "@janodetzel/app-commands/adapters/inspect";
import { navigationCommands } from "@janodetzel/app-commands/adapters/react-navigation";
import { zustandSource } from "@janodetzel/app-commands/adapters/zustand";

export const commandRegistry = buildRegistry(
	featureCommands({ todos: todosFeature, settings: settingsFeature }),
	navigationCommands(navigationRef, { routes: RouteName }),
	inspect({
		stores: zustandSource({ settings: settingsStore }),
		cache: apolloCacheSource(apolloClient),
	}),
);
```

Features compose the way tRPC routers do. Nesting adds a segment,
`{ profile: { settings: settingsFeature } }` gives `profile.settings.setUnits`, and
a spread, `{ ...a, ...b }`, merges two features into one namespace. Only plain
objects are walked, so a store hung on a feature is skipped. Every command needs a
namespace, and each segment matches `/^[a-z][a-zA-Z0-9]*$/`.

An app that uses neither can write the four fields itself. That is all the bridge
needs, and `test/core.test.ts` does exactly that - if it ever needs zod or
`command()` to express itself, the layering has leaked.

## Registering it

Hand the registry to the hook, once, in the root component. There is no Metro
config and no special import path:

```tsx
import { useAppCommands } from "@janodetzel/app-commands/expo";

import { commandRegistry } from "./commands";

export default function App() {
	useAppCommands(commandRegistry);
	return; /* … */
}
```

Build the registry at module scope. One built inside a component is a new object on
every render, which would re-subscribe the listener each frame.

A second argument takes options: `defaultTimeoutMs` bounds a command that never
settles, for a caller that sent no timeout of its own, and defaults to 10 seconds.

## Using the CLI

```
app-commands list
app-commands <namespace>.<name> [--<arg> <value> …]
app-commands <namespace>.<name> --args '<json>'
```

Global options: `--host` (default `localhost`), `--port` (default `8081`),
`--timeout <ms>`, `--pretty`, `--help`.

The CLI hard-codes no command. On every call it asks the app for the command list
and builds the flags from the JSON Schema it gets back, so a new command works
after a Metro reload with no CLI rebuild.

Flags follow the schema: a string takes the value as typed, `number` and `integer`
are parsed, a boolean is `--flag` or `--no-flag`, and an enum is checked against
its values before the call goes out. An object or array argument has no flag
syntax; pass the whole argument object with `--args '<json>'`, which cannot be
combined with individual flags.

Output:

- stdout holds exactly one JSON document per call: the result on success, or
  `{ "error", "code", "issues" }` on failure. `--pretty` indents it. The one
  exception is `--help`, which prints usage.
- stderr holds diagnostics for a human: the duration, the error code, a usage
  message.

| Exit code | Meaning                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| 0         | The command ran and returned a result                                                                              |
| 1         | The command failed, or the call was wrong (`COMMAND_FAILED`, `INVALID_ARGS`, `UNKNOWN_COMMAND`, `USAGE`)           |
| 2         | The app could not be reached, or the two sides disagree on the protocol (`CONNECTION_FAILED`, `PROTOCOL_MISMATCH`) |

Exit code 2 with `CONNECTION_FAILED` usually means Metro is not running, the app
is not connected, or the app does not call `useAppCommands`.

On the Android emulator, run `adb reverse tcp:8081 tcp:8081` once before the first
call. The iOS simulator reaches `localhost` without it.

## The MCP server

`app-commands-mcp` speaks MCP over stdio and exposes the same commands as tools, so
an agent calls them with typed arguments instead of shelling out. Register it by
pointing a client at the binary:

```json
{
	"mcpServers": {
		"app-commands": { "command": "node_modules/.bin/app-commands-mcp", "args": [] }
	}
}
```

It takes the same `--host`, `--port` and `--timeout` options as the CLI, or reads
`APP_COMMANDS_HOST`, `APP_COMMANDS_PORT` and `APP_COMMANDS_TIMEOUT`.

Each command becomes one tool, named with `_` in place of the dot - `todos.add`
becomes `todos_add` - carrying the app's own argument schema. Two tools are always
present: `list` returns the live list and republishes the tool list if it
changed, and `run` calls a command by its `<namespace>.<name>` when the tool list has
gone stale. A failing call comes back with `isError` and the same
`{ error, code, issues }` the CLI prints.

The tool list is a snapshot taken when a client asks for it. After reloading the app,
call `list` to pick up anything new. The server counts against the one client at
a time rule, so it and a terminal running `app-commands` drop each other.

Do not launch it through a package-manager script: pnpm writes its banner to stdout,
where only MCP traffic belongs.

## The web console

`pnpm --filter @janodetzel/app-commands web:dev` serves the console, and the Metro Shift+M menu
opens it against a running app. It lists the commands by namespace, builds a form
from each command's JSON Schema, and shows the response with its duration, or the
error code and the Zod issues.

## Adapters

Each adapter turns one library into a slice of the registry, already namespaced.
They are separate entry points, so an app pays only for what it imports.

```ts
import { buildRegistry, featureCommands } from "@janodetzel/app-commands";
import { navigationCommands } from "@janodetzel/app-commands/adapters/react-navigation";
import { apolloCommands } from "@janodetzel/app-commands/adapters/apollo";
import { keyValueCommands } from "@janodetzel/app-commands/adapters/key-value";
import { zustandCommands } from "@janodetzel/app-commands/adapters/zustand";

buildRegistry(
	featureCommands({ todos, settings }), //                     todos.add, settings.setUnits, …
	navigationCommands(navigationRef, { routes: RouteName }), // nav.navigate, nav.back, nav.inspect
	apolloCommands(apolloClient), //                             apollo.refetch, apollo.inspect
	zustandCommands({ settings: settingsStore }), //             store.inspect
	keyValueCommands(AsyncStorage), //                           storage.inspect
);
```

Each takes a `namespace` option for an app that already uses the default name.

`nav.navigate` waits until the route is focused and fails when it is not, because
React Navigation logs a warning for an unknown route rather than throwing. Types do
not exist at runtime, so pass the route names as a `z.enum` and keep it honest with
a type test against the navigator's param list.

`inspect` is the one read command, across every place an app keeps state. A source
is a description, the keys it holds, and a way to read one, so a store, a cache and
AsyncStorage answer the same `state.get` — and a feature ships only the commands
its UI calls, with the result of one checked by reading the state it wrote. Call
`state.sources` first: cache keys change as the app runs, and a key that is absent
fails and names the keys that exist rather than returning an empty result.

It is read-only on purpose. A command that called `setState` would put the app in a
state no tap can produce. Expose the store action as a named entry point instead.

That leaves each adapter holding only what a user does: `nav.navigate` and
`nav.back`, `apollo.refetch`. Where the app ended up and what came back are read
with `state.get`, from the same source every other piece of state answers.

## The lint rules

A command is only as honest as the code behind it, and most of what keeps that code
reachable from outside React is a constraint on how it is written. A constraint
nobody checks is a comment, so the checks ship with the package:

```js
// eslint.config.mjs
import appCommands from "@janodetzel/app-commands/eslint";

export default [...appCommands.configs.recommended];
```

| Rule                                   | What it catches                                                                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `app-commands/no-ui-in-logic`          | react, react-native, expo-\*, @react-navigation/\* imported into a logic file, which would make it uncallable from outside React |
| `app-commands/no-cross-feature-import` | one feature importing another, instead of being wired together where the instances are created                                   |
| `app-commands/no-set-outside-store`    | `set(…)` or `.setState(…)` outside a `store.ts`, which is a state change with no named entry point                               |
| `app-commands/no-ambient-io`           | `Date.now` and `Math.random` in a logic file, so a caller and a test see the same values                                         |
| `app-commands/require-rethrow`         | a `catch` in a store action that rolls back but does not rethrow, so the action resolves as if the write worked                  |

Each rule picks its own files from the path, so the recommended config needs no glob
that mirrors your layout. A _logic file_ is every file under `src/features/`, at any
depth, except tests: screens live outside the features, so nothing inside them needs
React. Both parts are options, and `logicFiles` narrows the check to those names for
an app that still keeps its screens next to the logic:

```js
"app-commands/no-ui-in-logic": ["error", {
	featuresDir: "app/modules",
	logicFiles: ["api", "store", "index", "feature"],
}],
```

The rule that carries the most correctness is not in the plugin: keep
`@typescript-eslint/no-floating-promises` an error. Every entry point returns a
promise that resolves only when its work is finished, and one fire-and-forget call
makes a command report success before the save runs.

The dependency-cruiser half is about direction:

| Rule                             | What it catches                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `no-sibling-feature-import`      | one feature importing another, as a package edge, so a deep relative import cannot slip past lint     |
| `no-deep-feature-import`         | code outside a feature importing a file inside it rather than its `index.ts` barrel                   |
| `features-do-not-import-the-app` | a feature importing `src/app/`, `src/screens/` or `src/navigation/`, which only the app may depend on |

`rules()` takes `featuresRoot` and `appLayers` as regular expressions for another
layout.

```js
// .dependency-cruiser.cjs
const appCommands = require("@janodetzel/app-commands/depcruise");

module.exports = { forbidden: [...appCommands.rules(), ...ownRules] };
```

## Keeping the bridge out of release builds

The bridge accepts any valid command from anything that can reach Metro, so nothing
in a release build may be able to answer one. `@janodetzel/app-commands/expo` exports a no-op in
production behind a lazy `require`, and the bundler drops the branch - taking the
hook, and with it the only thing that opens a connection to Metro.

`test/production-bundle.test.ts` checks that with esbuild, and
`pnpm --filter example-app check:release-bundle` checks the whole app for both platforms.
Keep the strings that check greps for out of user-facing copy, or it turns into
noise people learn to ignore.

Other parts of the bridge do reach a release bundle: the argument schemas, the
descriptions, and `handleRequest`, which comes along when the app imports
`buildRegistry`. None of it is reachable without the transport, so it is a question
of bundle size rather than of exposure - but do not write a secret into a command
description.

Also keep Metro bound to localhost on a shared network, and do not point a dev build
carrying the bridge at production data.

## Known limits

- **One browser-side client at a time.** The app keeps a single client per plugin
  and drops the previous one when another connects, so the CLI and the web console
  cannot both be attached. The CLI reports it and exits 2.
- **Every connected app answers.** With a simulator and an emulator on the same
  Metro, a command runs on both and the CLI takes the first answer. Keep one device
  connected while an agent works.
- **Screen readiness is not solved.** `nav.navigate` waits for focus, not for the
  screen's queries. If agents start failing on that, add a dev-only
  `useAgentReady(route, !loading)` hook for `navigate` to wait on — not before.

## Maintenance

`cli/wire/` is copied from internal Expo code. After every Expo SDK upgrade, re-read
the files listed in `cli/wire/SOURCE.md`, recopy them if they changed, and rerun the
simulator smoke test. Pin the `expo` peer range to the tested SDK.
