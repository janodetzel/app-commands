# @janodetzel/app-commands

Give an AI agent the same controls your users have. Every action in your React Native
or Expo app becomes a named command with typed arguments that an agent, a script or
you can call against the running app — through the same function the button calls,
on the same state.

```
$ npx app-commands todos.newTodoSubmitted --title "Buy milk"
{"id":"1","title":"Buy milk","done":false}

$ npx app-commands store.inspect --store todos
{"todos":[{"id":"1","title":"Buy milk","done":false}]}

$ npx app-commands nav.navigate --href /todos/[id] --params '{"id":"1"}'
{"pathname":"/todos/1","segments":["todos","[id]"],"params":{"id":"1"}}
```

An agent that can only tap and read screenshots is slow, and it guesses. With commands
it sets up state, runs a behavior, and reads the result in one call each — and because
the screen and the command are one function, what it verifies is what a user gets.

- **One implementation.** The button calls `todos.newTodoSubmitted({ title })`, and so
  does the agent. There is no test-only path to drift from the real one.
- **Typed and self-describing.** Arguments come from any
  [Standard Schema](https://standardschema.dev) — zod, Valibot, ArkType. The CLI builds
  its flags from the schema, and the MCP server turns every command into a tool.
- **Three clients.** A CLI, an [MCP](https://modelcontextprotocol.io) server for agents,
  and a web console in the Expo dev tools.
- **Guardrails.** ESLint and dependency-cruiser rules, plus conformance checks, fail
  the build when a feature stops being reachable from outside the UI.
- **Development only.** In a release build the bridge is a no-op, and the bundler
  drops it.
- **No lock-in.** The core knows no UI framework, state library or validation library.

## Install

```
npm install @janodetzel/app-commands
```

`react` is a peer dependency. `expo` is the peer of the Expo transport (`/expo`), so a web
app on [Vite](#web-apps-vite) does not need it. Everything else is optional: `zod` 4.2 or
later for the adapters and for commands written with it, `vite` 5.4 or later for the web
transport (`/vite`), and the library behind each adapter you import. `command()` works with any Standard Schema library the app already
uses. With zod older than 4.2, commands still validate but list no arguments.

## Quick start

These steps add one command to an Expo app and call it from the terminal.

1. **Write the command** in the feature that owns the behavior. The description is
   all an agent knows about it, so say what it does and what it does not do.

   ```ts
   // src/features/todos/feature.ts
   import { command } from "@janodetzel/app-commands";
   import { z } from "zod";
   import type { TodosStore } from "./store";

   export const createTodos = (deps: { store: TodosStore }) => ({
   	newTodoSubmitted: command()
   		.input({ title: z.string().min(1) })
   		.description(
   			"Does what submitting the new-todo form does: adds a todo and returns it. Does not check for duplicates.",
   		)
   		.run(async ({ title }) => deps.store.getState().add(title)),
   });
   ```

2. **Create the instances once**, outside React, so the screen and the command share
   them:

   ```ts
   // src/instances.ts
   export const todosStore = createTodosStore();
   export const todos = createTodos({ store: todosStore });
   ```

3. **Build the registry** at module scope. Adapters add read commands, such as
   `store.inspect`:

   ```ts
   // src/commands.ts
   import { buildRegistry, featureCommands } from "@janodetzel/app-commands";
   import { zustandCommands } from "@janodetzel/app-commands/adapters/zustand";
   import { todos, todosStore } from "./instances";

   export const commandRegistry = buildRegistry(
   	featureCommands({ todos }),
   	zustandCommands({ todos: todosStore }),
   );
   ```

4. **Register it** once, in the root component or root layout:

   ```tsx
   import { useAppCommands } from "@janodetzel/app-commands/expo";
   import { commandRegistry } from "../commands";

   export default function RootLayout() {
   	useAppCommands(commandRegistry);
   	// …
   }
   ```

5. **Call the command from the screen**, so the button and the agent run the same code:

   ```tsx
   <Button title="Add" onPress={() => todos.newTodoSubmitted({ title })} />
   ```

6. **Run it.** Start Metro, open the app on a simulator, then:

   ```
   npx app-commands list
   npx app-commands todos.newTodoSubmitted --title "Buy milk"
   ```

   On the Android emulator, run `adb reverse tcp:8081 tcp:8081` once first.

7. **Connect an agent** through the MCP server, for example in `.mcp.json`:

   ```json
   {
   	"mcpServers": {
   		"app-commands": { "command": "node_modules/.bin/app-commands-mcp", "args": [] }
   	}
   }
   ```

## Structuring an app around it

Commands stay honest when the logic they call lives outside React: features in
`src/features/<feature>/` that take their dependencies, one composition root that
creates every instance, screens that call commands and read state through selectors,
and platform code behind ports. [The principles](https://github.com/janodetzel/app-commands/blob/main/docs/principles.md)
explain why, and the [example app](https://github.com/janodetzel/app-commands/tree/main/apps/example-app)
shows it.

The package ships instructions for the agent working in your app, as skills. Install
them with the GitHub CLI:

```sh
gh skill install janodetzel/app-commands setting-up-an-app --agent claude-code
```

| Skill                 | Use it when                                                       |
| --------------------- | ----------------------------------------------------------------- |
| `setting-up-an-app`   | Starting an app on app-commands, or deciding where a file belongs |
| `building-a-feature`  | Adding a screen, a store, a mutation, or an entry point           |
| `driving-the-app`     | Verifying behavior at runtime with the CLI                        |
| `writing-agent-tests` | Writing a plain-English test an agent runs on a device            |
| `running-agent-tests` | Running agent tests from a fresh install and reporting the result |
| `exploring-the-app`   | Hunting for bugs no test covers, and reporting them               |

## Entry points

| Entry point                            | What it is                                                                                                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@janodetzel/app-commands`             | `command()`, `featureCommands()`, and the core: `Command`, `Registry`, `buildRegistry`, `handleRequest`, the protocol constants                                                                     |
| `@janodetzel/app-commands/expo`        | The Expo dev tools transport and the `useAppCommands` hook. A no-op in production                                                                                                                   |
| `@janodetzel/app-commands/web`         | The web transport for the page: `attachWebCommands`, called from the guarded client entry                                                                                                           |
| `@janodetzel/app-commands/vite`        | The Vite dev server plugin, `appCommands()`, that the CLI and the MCP server connect to                                                                                                             |
| `@janodetzel/app-commands/conformance` | `checkRegistry` and `checkUiCallers`, the suites an app runs against its own registry                                                                                                               |
| `@janodetzel/app-commands/protocol`    | The wire types, for another client                                                                                                                                                                  |
| `@janodetzel/app-commands/adapters/*`  | The adapters: `apollo`, `expo-router`, `key-value`, `react-navigation`, `tanstack-router`, `tinybase`, `zustand`. One library each, so an optional peer you did not install is one you never import |
| `@janodetzel/app-commands/eslint`      | The six architecture rules, as a flat-config ESLint plugin                                                                                                                                          |
| `@janodetzel/app-commands/depcruise`   | `rules()`, the feature boundaries for dependency-cruiser                                                                                                                                            |

The binaries are `app-commands` (the CLI) and `app-commands-mcp` (the MCP server).

## Reference

### The command contract

The bridge knows four things about a command, and nothing about where they came from:

```ts
type Command = {
	description: string;
	/** JSON Schema of the arguments, for the CLI flags and the web console form. */
	jsonSchema: object;
	/** Returns parsed args or issues. app-commands never validates itself. */
	parse: (input: unknown) => ParseResult | Promise<ParseResult>;
	run: (args: unknown) => Promise<unknown>;
};

type ParseResult = { ok: true; value: unknown } | { ok: false; issues: unknown[] };

type Registry = Record<string, Command>; // keys are `<namespace>.<name>`, or deeper when nested
```

The core imports no validation library, no UI library, and no state library, so the
bridge works against an app built on Redux, XState, MobX, or plain service classes.
`parse` is a function rather than a schema object for the same reason: a Valibot or
ArkType app does not have to install zod. It may return a promise, because a Standard
Schema may validate asynchronously. `handleRequest` calls `parse`, then `run`, then
serializes the result.

### `command()`

`command()` builds a command in the style of a
[tRPC procedure](https://trpc.io/docs/server/procedures): the schema, the description,
and the handler in one expression. The result has the four fields above and is also a
function, so the UI calls it and the registry holds it as it is.

- `.input()` takes a Standard Schema, an object of them, or a function that returns the
  parsed value and throws to reject it. The handler receives the schema's output type
  and a caller passes its input type, so a `.default()` is optional for the caller and
  present in the handler. Leave `.input()` out for a command without arguments.
- The JSON Schema comes from the schema's `~standard.jsonSchema`, when the library
  provides one. A function, or a library without it, lists as `{}`: the command still
  runs, and the CLI takes its arguments through `--args '<json>'`.
- `.description()` is required before `.run()`, in the types and at runtime.
- Calling the command validates and then runs. It rejects with an `InputError` carrying
  `issues` when the input does not parse. `run` on its own skips validation, for a
  caller that has already parsed, as `handleRequest` has.
- Every handler returns a promise that resolves when its work is done and rejects when
  it fails. Return picked, JSON-safe fields: a `Map`, a `Set`, `NaN`, a function or a
  cycle fails the command.

### The registry

`featureCommands` collects the commands in a tree of plain objects and names each by
its path. Nesting adds a segment: `{ profile: { settings: settingsFeature } }` gives
`profile.settings.setUnits`. A spread, `{ ...a, ...b }`, merges two features into one
namespace. Only plain objects are walked, so a store hung on a feature is skipped.
Every command needs a namespace, and each segment matches `/^[a-z][a-zA-Z0-9]*$/`.

`buildRegistry` merges the slices — your features and any adapters — and throws on a
duplicate name, naming it:

```ts
import { buildRegistry, featureCommands } from "@janodetzel/app-commands";
import { apolloCommands } from "@janodetzel/app-commands/adapters/apollo";
import { keyValueCommands } from "@janodetzel/app-commands/adapters/key-value";
import { navigationCommands } from "@janodetzel/app-commands/adapters/react-navigation";
import { zustandCommands } from "@janodetzel/app-commands/adapters/zustand";

export const commandRegistry = buildRegistry(
	featureCommands({ todos: todosFeature, settings: settingsFeature }),
	navigationCommands(navigationRef, { routes: RouteName }), // nav.navigate, nav.back, nav.inspect
	apolloCommands(apolloClient), //                             apollo.refetch, apollo.inspect
	zustandCommands({ settings: settingsStore }), //             store.inspect
	keyValueCommands(AsyncStorage), //                           storage.inspect
);
```

Build the registry at module scope. One built inside a component is a new object on
every render, which re-subscribes the listener each frame. `useAppCommands` takes an
optional second argument: `defaultTimeoutMs` bounds a command that never settles, for
a caller that sent no timeout of its own. It defaults to 10 seconds.

### The CLI

```
app-commands list
app-commands <namespace>.<name> [--<arg> <value> …]
app-commands <namespace>.<name> --args '<json>'
```

Global options: `--host` (default `localhost`), `--port` (default `8081`),
`--url <url>` (a web app's Vite dev server instead of Metro, see
[Web apps](#web-apps-vite)), `--timeout <ms>`, `--pretty`, `--help`.

The CLI hard-codes no command. On every call it asks the app for its commands and
builds the flags from their JSON Schemas, so a new command works after a Metro reload
with no CLI rebuild.

Flags follow the schema: a string takes the value as typed, `number` and `integer` are
parsed, a boolean is `--flag` or `--no-flag`, and an enum is checked against its values
before the call goes out. An object or array argument has no flag. Pass the whole
argument object with `--args '<json>'`, which cannot be combined with other flags.

stdout holds exactly one JSON document per call: the result, or
`{ "error", "code", "issues" }` on failure. `--pretty` indents it. stderr holds
diagnostics for a human: the duration, the error code, a usage message.

| Exit code | Meaning                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| 0         | The command ran and returned a result                                                                              |
| 1         | The command failed, or the call was wrong (`COMMAND_FAILED`, `INVALID_ARGS`, `UNKNOWN_COMMAND`, `USAGE`)           |
| 2         | The app could not be reached, or the two sides disagree on the protocol (`CONNECTION_FAILED`, `PROTOCOL_MISMATCH`) |

Exit code 2 with `CONNECTION_FAILED` usually means Metro is not running, the app is not
connected, or the app does not call `useAppCommands`. With `--url` it means the dev
server is not running or has no plugin, no page is open, or the page does not call
`attachWebCommands`; the message says which.

### The MCP server

`app-commands-mcp` speaks MCP over stdio and exposes the same commands as tools, so an
agent calls them with typed arguments instead of shelling out. It takes the CLI's
`--host`, `--port`, `--url` and `--timeout` options, or reads `APP_COMMANDS_HOST`,
`APP_COMMANDS_PORT`, `APP_COMMANDS_URL` and `APP_COMMANDS_TIMEOUT`.

Each command becomes one tool, named with `_` in place of the dot — `todos.add` becomes
`todos_add` — with the app's own argument schema. Two tools are always there: `list`
returns the live list and republishes the tool list when it changed, and `run` calls a
command by its `<namespace>.<name>` when the tool list has gone stale. A failing call
comes back with `isError` and the same `{ error, code, issues }` the CLI prints.

The tool list is a snapshot taken when a client asks for it. After reloading the app,
call `list` to pick up new commands. Point the client at the binary itself, not at a
package-manager script: pnpm writes its banner to stdout, where only MCP traffic
belongs.

### Web apps (Vite)

A web app on Vite, including TanStack Start, answers the same commands from the same CLI
and MCP server. The transport is a dev server plugin and one call in the client entry; the
commands, the registry and the adapters are the ones an Expo app uses.

1. **Add the plugin** to `vite.config.ts`. It only runs on the dev server (`apply: "serve"`),
   so `vite build` never contains it.

   ```ts
   import { appCommands } from "@janodetzel/app-commands/vite";
   import { defineConfig } from "vite";

   export default defineConfig({ plugins: [appCommands()] });
   ```

2. **Attach the registry** once, in the browser, from the client entry, inside this exact
   guard:

   ```ts
   if (import.meta.hot) {
   	const [{ attachWebCommands }, { commandRegistry }] = await Promise.all([
   		import("@janodetzel/app-commands/web"),
   		import("./app/commands"),
   	]);
   	attachWebCommands(import.meta.hot, commandRegistry);
   }
   ```

   In `vite build` Vite replaces `import.meta.hot` with `undefined`, so the block and both
   dynamic imports are dead code and neither chunk is emitted: the transport and the
   registry, with every command name and description, stay out of a release build. A
   static import, or a guard that is not `import.meta.hot`, does not have that property.
   The snippet uses top-level `await`, which needs a `build.target` of `es2022` or later,
   as Vite's default is; with an older target, wrap the block in an `async` function.
   In TanStack Start, put it where only the browser runs, such as the client entry or an
   effect in the root route, and keep the browser's router instance in a module variable
   for [`tanstackRouterCommands`](#tanstack-router).

3. **Drive it** with the dev server's URL, with the page open in a browser:

   ```
   pnpm app-commands --url http://localhost:5173 list
   pnpm app-commands --url http://localhost:5173 todos.newTodoSubmitted --title "Buy milk"
   ```

   The MCP server takes `--url` too, or `APP_COMMANDS_URL`.

`apps/web-example` is a small Vite and React app set up this way, with the check
`pnpm --filter web-example check:release-bundle` that builds it and fails if the
transport or the registry shows up in the output.

How it works: the plugin adds `POST /__app-commands` to the dev server. A request goes to
the page over Vite's own HMR channel, `attachWebCommands` runs it with the same handler the
Expo transport uses, and the response comes back as the POST's answer. There is no second
socket and nothing to configure. The endpoint runs commands, so it is for the CLI and the
MCP server and never for a page: it refuses a request that carries an `Origin` or
`Sec-Fetch-Site` header, which a browser adds and a script cannot remove, and it wants
`application/json`. Vite's host check covers DNS rebinding. Do not expose a dev server to a
network you do not trust.

Unlike Metro there is no single connection: any number of CLIs and MCP servers can call at
once. With several tabs of the app open, a command runs in the most recently connected one.
It answers 503 (`CONNECTION_FAILED`, exit code 2) when no page is connected, and 504 when
a page is open but never answers.

### The web console

Open it from the Metro terminal's Shift+M menu while the app runs. It lists the
commands by namespace, builds a form from each command's JSON Schema, and
shows the result with its duration, or the error code and the validation issues.

### Adapters

Each adapter turns one library into a slice of the registry, already namespaced, and
takes a `namespace` option for an app that already uses the default name. They are
separate entry points, so an app pays only for what it imports.

Each adapter that holds state has one read command, `inspect`: `store.inspect`,
`apollo.inspect`, `storage.inspect`, `tinybase.inspect`, `nav.inspect`. Where the keys are known up front
they are in the schema, so `store.inspect` takes a store name from an enum the tool
definition lists. Where they change as the app runs, a call with no key lists them —
the cache prefixes, the storage keys — and a key that matches nothing fails and names
the ones that exist. It is read-only on purpose: a
command that set state directly would put the app in a state no tap can produce.
Expose the store action as a feature command instead. That leaves each adapter holding
only what a user does, such as `nav.navigate`, `nav.back` and `apollo.refetch`, and a
feature shipping only the commands its UI calls.

`nav.navigate` from `react-navigation` waits until the route is focused and fails when
it is not, because React Navigation logs a warning for an unknown route rather than
throwing. Types do not exist at runtime, so pass the route names as a `z.enum` and
keep it honest with a type test against the navigator's param list.

#### Expo Router

An Expo Router app has no `navigationRef` of its own to hand over: Expo Router creates
the container when the root layout mounts, and ships its own copy of React Navigation.
Use the `expo-router` adapter. It gives the same three commands under the same `nav`
namespace.

```ts
import { router, useNavigationContainerRef } from "expo-router";
import { expoRouterCommands } from "@janodetzel/app-commands/adapters/expo-router";

export const commandRegistry = buildRegistry(
	featureCommands({ todos: todosFeature }),
	// Pass the function uncalled; the adapter asks for the ref on every command.
	expoRouterCommands({ router, navigationRef: useNavigationContainerRef }),
);
```

`useNavigationContainerRef` reads Expo Router's module store and calls no React hook,
which is why it works outside a component. Before the root layout mounts, it returns a
ref that is not ready, and every command answers accordingly.

- `nav.navigate --href /todos/[id] --params '{"id":"7"}'` goes through `router.navigate`,
  the same call a `<Link>` makes. It waits until the app is on that pathname, and fails
  when the app lands on `+not-found` or somewhere else, which is what a redirect or a
  protected route does. The href is a path rather than an enum, because the routes are
  files.
- `nav.back` goes through `router.back` and fails when there is nothing to go back to.
- `nav.inspect` returns `{ pathname, segments, params }`, the values `usePathname`,
  `useSegments` and `useGlobalSearchParams` give a component. `--key state` returns
  the navigation tree.

Give the app its own `app/+not-found.tsx`. Without one, Expo Router shows its built-in
unmatched-route page, which replaces the tree the root layout lives in. The layout
unmounts, `useAppCommands` unmounts with it, and every command after a bad `href`
answers "the app did not answer" until someone taps back. An app-owned `+not-found`
screen renders inside the root layout, so the bridge stays up and `nav.back` recovers.

Every file under `app/` is a route, so keep the composition root and the registry
outside it, for example in `src/instances/index.ts` and `src/commands.ts`.

#### TanStack Router

A web app on TanStack Router (including TanStack Start) uses the `tanstack-router`
adapter. It gives the same three commands under the same `nav` namespace, so use its
`namespace` option if you also register another navigation adapter.
`@tanstack/react-router` is an optional peer dependency; the adapter imports nothing
from it and types only the parts it calls.

```ts
import { tanstackRouterCommands } from "@janodetzel/app-commands/adapters/tanstack-router";

export const commandRegistry = buildRegistry(
	featureCommands({ todos: todosFeature }),
	// The router, or a function that returns it once it exists.
	tanstackRouterCommands({ router: () => router }),
);
```

TanStack Start builds the router in a `getRouter()` factory that the framework calls,
and on the server it builds one per request. Keep the browser's instance in a module
variable and pass a function: the adapter asks for it on every command, and answers
`null` (or "the router has not been created yet") until it exists.

- `nav.navigate --to /posts/$postId --params '{"postId":"7"}'` goes through
  `router.navigate`, the call a `<Link>` makes, with optional `--search` and `--hash`.
  `to` is a route path, and `nav.inspect --key routes` lists them. It fails **before**
  navigating when `to` is not a route or a path param is missing, because TanStack Router
  would otherwise land on its not-found page or on `/posts/undefined`. After navigating
  it waits for the router to settle and fails when a loader throws `notFound` or an
  error, or when the app ends up on another route, which is what a redirect does.
- `nav.back` goes through `router.history.back` and fails when there is nothing to go back to.
- `nav.inspect` returns `{ pathname, search, hash, params, routeId }`, what `useLocation`,
  `useSearch` and `useParams` give a component. `--key state` returns every active match
  with its status, and `--key routes` the paths `navigate` accepts.

#### TinyBase

An app whose state lives in TinyBase stores reads them with the `tinybase` adapter.
`tinybase` 6 or later is an optional peer dependency; the adapter imports nothing from it
and reads a store through the few getters it needs.

```ts
import { tinybaseCommands } from "@janodetzel/app-commands/adapters/tinybase";

export const commandRegistry = buildRegistry(
	featureCommands({ sheets: sheetsFeature }),
	// A Store or a MergeableStore, schema-typed or not, by the name an agent passes to `store`.
	tinybaseCommands({ spreadsheet: spreadsheetStore, settings: settingsStore }),
);
```

`tinybase.inspect` is read-only, like the other `inspect` commands, and never dumps a
store:

- `--store spreadsheet` returns an outline, `{ tables: { tableId: rowCount }, values: [valueId] }`.
- `--store spreadsheet --table sheets` returns `{ total, rows }`, at most `--limit` rows
  (100 unless `defaultLimit` says otherwise). `--row <id>` returns that one row, and
  `--prefix sheet:` keeps the rows whose id starts with it.
- `--store settings --part values` returns the store's values, `--value <id>` one of
  them, and `--prefix` filters value ids. In the outline `--prefix` filters table and
  value ids.

A table, row, value or prefix that is not there fails and names what the store does
have. A `MergeableStore` reads as its merged content, without the CRDT bookkeeping.
Without `--store`, `tinybase.inspect` returns `{ stores: [id] }`.

A record fixes the stores when the registry is built, which is at module scope. When
the app creates stores while it runs, one per signed-in user or per open document,
pass `list` and `get` instead. The adapter calls them on every read, so a store
created later can be inspected, and an id that is gone fails and names the ones
that exist:

```ts
tinybaseCommands({
	list: () => storeManager.ids(),
	get: (id) => storeManager.get(id),
});
```

### Lint rules

A command is only as honest as the code behind it, and most of what keeps that code
reachable from outside React is a constraint on how it is written. The checks ship with
the package:

```js
// eslint.config.mjs
import appCommands from "@janodetzel/app-commands/eslint";

export default [...appCommands.configs.recommended];
```

| Rule                                   | What it catches                                                                                                                                                                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app-commands/no-ui-in-logic`          | react, react-native, react-native-\*, expo-\*, @react-navigation/\* imported into a logic file, which would make it uncallable from outside React                                      |
| `app-commands/no-cross-feature-import` | one feature importing another, instead of being wired together where the instances are created                                                                                         |
| `app-commands/no-set-outside-store`    | `set(…)` or `.setState(…)` outside a `store.ts`, which is a state change with no named entry point                                                                                     |
| `app-commands/no-store-action-in-ui`   | a UI file calling a store action (`store.getState().add()`), destructuring `getState()`, or taking a whole store with `useStore(store)`, all of which change state without the command |
| `app-commands/no-ambient-io`           | `Date.now` and `Math.random` in a logic file, so a caller and a test see the same values                                                                                               |
| `app-commands/require-rethrow`         | a `catch` in a store action that rolls back but does not rethrow, so the action resolves as if the write worked                                                                        |

Each rule picks its own files from the path, so the recommended config needs no glob
that mirrors your layout. A _logic file_ is every file under `src/features/`, at any
depth, except tests. Both parts are options, and `logicFiles` narrows the check to those
file names for an app that still keeps its screens next to the logic:

```js
"app-commands/no-ui-in-logic": ["error", {
	featuresDir: "app/modules",
	logicFiles: ["api", "store", "index", "feature"],
}],
```

`no-store-action-in-ui` applies to the UI instead: every file under `src/screens/`,
`src/components/`, `src/hooks/` or `src/navigation/`, except tests. It leaves
`src/app/` alone, because the app starts there and loading the stores at startup
belongs there. Pass `uiDirs` for another layout. `no-ui-in-logic` takes `modules` to
add a native SDK's scope to what counts as a UI import; the option replaces the
default list, so repeat it.

The rule that carries the most correctness is not in the plugin: keep
`@typescript-eslint/no-floating-promises` an error. One fire-and-forget call makes a
command report success before the save runs.

The dependency-cruiser half is about direction:

```js
// .dependency-cruiser.cjs
const appCommands = require("@janodetzel/app-commands/depcruise");

module.exports = { forbidden: [...appCommands.rules(), ...ownRules] };
```

| Rule                             | What it catches                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `no-sibling-feature-import`      | one feature importing another, as a package edge, so a deep relative import cannot slip past lint     |
| `no-deep-feature-import`         | code outside a feature importing a file inside it rather than its `index.ts` barrel                   |
| `features-do-not-import-the-app` | a feature importing `src/app/`, `src/screens/` or `src/navigation/`, which only the app may depend on |

`rules()` takes `featuresRoot` and `appLayers` as regular expressions for another
layout.

### Conformance checks

`checkRegistry` from `/conformance` checks the properties an agent relies on: a
well-formed and unique name, a description longer than the name, an object schema, a
`parse` that rejects something, and — for the read-only commands you list in
`samples` — a result that survives JSON. Run it in a test against the registry built
the way your app builds it:

```ts
expect(await checkRegistry(registry, { samples: { "store.inspect": { store: "todos" } } })).toEqual(
	[],
);
```

`checkUiCallers` names every feature command no screen calls. A command named after a
control needs that control, or it is dead or reachable only by an agent. Read the
sources as text in a test, so no screen renders:

```ts
const screens = import.meta.glob<string>("../src/screens/**/*.{ts,tsx}", {
	query: "?raw",
	import: "default",
	eager: true,
});
expect(checkUiCallers(registry, { sources: screens })).toEqual([]);
```

It finds a call by its text, `.<path below the namespace>(`, so call a command through
its feature instance: `profileFeature.settings.unitButtonTapped(` for
`profile.settings.unitButtonTapped`. The built-in adapters' namespaces (`apollo`, `nav`,
`storage`, `store`, `tinybase`) are exempt. `exempt` replaces that list, so to add a
namespace you gave an adapter, extend `defaultExempt`:
`checkUiCallers(registry, { sources, exempt: [...defaultExempt, "settings"] })`.

### Release builds

A web app keeps the transport out of a release build with the `import.meta.hot` guard
described under [Web apps](#web-apps-vite); the plugin is dev-server only.

The bridge accepts any valid command from anything that can reach Metro, so nothing in
a release build may be able to answer one. `@janodetzel/app-commands/expo` exports a
no-op in production behind a lazy `require`, and the bundler drops that branch — taking
the hook with it, and with the hook the only thing that opens a connection to Metro.

Other parts do reach a release bundle: the argument schemas, the descriptions, and
`handleRequest`, which comes along when the app imports `buildRegistry`. None of it is
reachable without the transport, so it costs bundle size, not exposure — but do not
write a secret into a command description. Keep Metro bound to localhost on a shared
network, and do not point a development build that carries the bridge at production
data.

### Known limits

- **One client at a time on Metro.** The app keeps a single client and drops the previous
  one when another connects, so the CLI, the MCP server and the web console cannot all be
  attached at once. The CLI reports being dropped and exits with code 2. The web transport
  has no such limit.
- **The web console is Metro only.** It speaks the Expo dev tools protocol, so a web app is
  driven with the CLI or the MCP server.
- **Every connected app answers.** With a simulator and an emulator on the same Metro,
  a command runs on both and the CLI takes the first answer. Keep one device connected
  while an agent works.
- **Screen readiness is not solved.** `nav.navigate` waits for the route, not for the
  screen's data.

## License

MIT. Source, issues and the changelog are on
[GitHub](https://github.com/janodetzel/app-commands).
