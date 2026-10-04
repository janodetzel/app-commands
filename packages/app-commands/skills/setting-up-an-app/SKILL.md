---
name: setting-up-an-app
description: Set up the architecture of a React Native or Expo app around @janodetzel/app-commands, or move an existing app onto it. Covers the folder layout, the composition root, the command registry, ports and adapters, the headless test setup, the guardrail config, and CI. Use when starting a project with app-commands, adopting it in an existing app, restructuring folders around it, or deciding where a file belongs.
---

# Setting up an app

`building-a-feature` covers one feature. This skill covers the app around the features. It says where every kind of file lives, what may import what, and which checks keep it that way. Every app on app-commands should end up with this shape, so an agent that knows one of them knows them all.

Build it in the order under [Build it in this order](#build-it-in-this-order). Each step leaves an app that runs.

## The layout

```
src/
	app/             routes only (Expo Router): one-line re-exports, _layout, +not-found
	screens/<area>/  a screen, beside the components and hooks only it uses
	components/      components several screens share
	hooks/           read hooks several screens share
	features/<f>/    feature.ts, store.ts, api.ts, schema.ts, errors.ts, index.ts
	domain/          pure logic: models, calculations, formatting
	adapters/        everything that reaches the platform: native modules, device APIs, SDKs
	lib/             small shared infrastructure
	instances/       the composition root
	commands.ts      the command registry
test/
	adapters.ts      in-memory adapters, wired like src/instances
	registry.ts      the registry, built like src/commands.ts
```

Dependencies point one way:

| Folder                                       | Holds                                          | May import                               |
| -------------------------------------------- | ---------------------------------------------- | ---------------------------------------- |
| `src/app`                                    | the router's files                             | `src/screens`                            |
| `src/screens`, `src/components`, `src/hooks` | the UI                                         | everything below them                    |
| `src/instances`                              | stores, features, and adapters, wired together | features, adapters, domain, lib          |
| `src/features`                               | commands, stores, ports                        | domain, lib, and the _types_ of adapters |
| `src/domain`                                 | logic with no platform in it                   | lib                                      |
| `src/adapters`                               | platform calls                                 | domain, lib, feature types               |
| `src/lib`                                    | helpers any layer may use                      | nothing app-specific                     |

In an Expo Router app, every file in `src/app` is a route. The composition root and the registry therefore live outside it, in `src/instances/index.ts` and `src/commands.ts`. The example app keeps them in `src/app/` because it uses React Navigation, where `src/app` is an ordinary folder.

A screen's route file is a re-export, so `src/app` stays a list of the URLs that `nav.navigate` addresses:

```ts
// src/app/editor/[id].tsx
export { default } from "@/screens/editor/editor-screen";
```

## Build it in this order

1. **Install the package.** `npm install @janodetzel/app-commands`. It is on npmjs.org, so CI and a build service install it with no token or `.npmrc` entry.
2. **Create the composition root.** `src/instances/index.ts` creates every store, adapter, and feature, and passes each feature its dependencies. Screens and the registry import from it. Nothing else creates an instance.
3. **Build the registry.** `src/commands.ts` combines three slices at module scope:

   ```ts
   export const commands = buildRegistry(
   	featureCommands({ routes, settings }),
   	zustandCommands({ routesStore, settingsStore }),
   	expoRouterCommands({ router, navigationRef: useNavigationContainerRef }),
   );
   ```

   `featureCommands` holds every user action. `zustandCommands` gives `store.inspect`, the only read. No feature ships a list or a get command. An app on TinyBase adds `tinybaseCommands({ spreadsheet: store })`, which gives `tinybase.inspect` for its tables, rows and values. `expoRouterCommands` (or `navigationCommands` for React Navigation) gives `nav.navigate`, `nav.back`, and `nav.inspect`. Call `useAppCommands(commands)` in the root layout.

4. **Add `src/app/+not-found.tsx`.** Expo Router's built-in unmatched-route page replaces the tree the root layout lives in. The layout unmounts, `useAppCommands` unmounts with it, and every command after a bad `href` fails until someone taps back. An app-owned `+not-found` screen renders inside the layout.
5. **Turn on the guardrails.** See [Guardrails](#guardrails).
6. **Set up the headless tests.** See [Test without a device](#test-without-a-device).
7. **Add the first feature** with the `building-a-feature` skill.

## Keep features headless

A feature must load in plain Node, with no Metro and no React Native. That is what lets a test build it with in-memory dependencies, and it is the precondition for running commands without a device. `no-ui-in-logic` checks the imports it knows about. It cannot see the rest:

- No `react-native-*` package and no native SDK in a feature or in `src/domain`. The rule's defaults cover `react-native-*`, but not a native SDK's own scope such as `@maplibre/*`, so add it (see [Guardrails](#guardrails)).
- No bare `__DEV__`. Metro defines it, and Node throws a `ReferenceError` on it. Read it once in `src/lib`: `export const isDev = typeof __DEV__ !== "undefined" && __DEV__;`.
- No platform extension files (`.ios.ts`, `.android.ts`) in a feature. Metro picks them, and Node does not. Put the platform split in `src/adapters` and pass the adapter in.
- No platform decisions inside the domain. Pass the platform in as an argument, for example `resolveDesign(design, Platform.OS)`, from the screen.
- Import JSON. A `require("@/assets/…")` skips the test runner's path alias and fails in Node.

A test that imports every feature proves all of this at once. `npm test` in CI keeps it proven.

## Ports and adapters

A feature talks to the platform through ports it declares. `api.ts` holds the port type and the logic over it. The operation takes the adapter as its first argument, the way `addTodo(client, …)` takes the Apollo client in the example app:

```ts
// src/features/routes/api.ts
export type PhotoFiles = {
	copyPhotoFile(photo: RoutePhoto): Promise<RoutePhoto>;
	deletePhotoFile(photo: RoutePhoto): void;
};

/** Drops the file a photo used, unless the route still points at it. */
export function discardPhoto(files: PhotoFiles, photo: RoutePhoto | null, keptUri?: string) {
	if (photo && photo.uri !== keptUri) files.deletePhotoFile(photo);
}
```

The implementation lives in `src/adapters`, and `src/instances` passes it in. A test passes an in-memory one. The same shape fits a device API (HealthKit, the photo library, a share sheet), a mail composer, or a server client.

Some work only a mounted screen can do, such as capturing a view to an image. Give that work a port too. A registry in `src/lib` holds the capability, and the screen attaches it while it is ready and detaches it after. A command that needs it rejects with the steps to make it available: "open the share sheet with `nav.navigate` to `/editor/[id]` with `{ sheet: "share" }`, then retry".

## What an agent can reach

An agent reads through `store.inspect`, moves through `nav.*`, and acts through feature commands. Four rules keep that complete:

- **Every id a command takes is readable through `store.inspect`.** If a screen fetches a list into component state and a command takes ids from it, the agent has no way to learn the ids. Move the list into a store, filled by a command named after opening the screen (`healthImportOpened`).
- **Commands never navigate.** The screen navigates after the command resolves. Give that navigation one hook (`useOpenEditor()`) rather than a hand-built `router.push` at every call site.
- **State an agent needs to see is in the URL.** Which sheet or modal is open belongs in a search param (`/editor/<id>?sheet=share`), so `nav.navigate` can show it. Present a native modal only while its screen is focused, because it covers the whole window. `router.setParams` writes to the focused route, so clear the param only on a dismiss made on that screen. `router.navigate` merges params into a route already on the stack. To close a sheet, pass `"sheet": ""`, because leaving the param out keeps it.
- **In-progress selection stays in the component.** A multi-select or a set of checkboxes is input to one command, such as `combineRoutesTapped({ ids })`.

## Guardrails

Start from the recommended configs, then add the checks for this layout:

```js
// eslint.config.js
const appCommands = require("@janodetzel/app-commands/eslint").default;

const PLATFORM_MODULES = [
	"react",
	"react-native",
	"react-native/*",
	"react-dom",
	"expo",
	"expo-*",
	"@react-navigation/*",
	"react-native-*",
	// `modules` replaces the defaults above, so keep them, and add the scope
	// of every native SDK the app uses.
];

module.exports = [
	...appCommands.configs.recommended,
	{
		// no-floating-promises needs type information.
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: __dirname } },
		rules: { "@typescript-eslint/no-floating-promises": "error" },
	},
	{
		files: ["src/features/**/*.{ts,tsx}"],
		rules: { "app-commands/no-ui-in-logic": ["error", { modules: PLATFORM_MODULES }] },
	},
	{
		// With featuresDir "src", every file under src/domain counts as logic.
		files: ["src/domain/**/*.{ts,tsx}"],
		rules: {
			"app-commands/no-ui-in-logic": ["error", { featuresDir: "src", modules: PLATFORM_MODULES }],
		},
	},
];
```

`rules()` from `/depcruise` defaults to a monorepo (`apps/<app>/src/…`). In a single-app repository, pass all four patterns, and count `src/instances` as an app layer:

```js
// .dependency-cruiser.cjs
const appCommands = require("@janodetzel/app-commands/depcruise");

module.exports = {
	forbidden: [
		...appCommands.rules({
			features: "^src/features/([^/]+)/",
			sameFeature: "^src/features/$1/",
			featuresRoot: "^src/features/",
			appLayers: "^src/(?:app|screens|navigation|instances)/",
		}),
		{
			name: "logic-does-not-import-adapters",
			severity: "error",
			from: { path: "^src/(?:features|domain)/" },
			to: { path: "^src/adapters/", dependencyTypesNot: ["type-only"] },
		},
		{
			name: "adapters-do-not-import-ui",
			severity: "error",
			from: { path: "^src/adapters/" },
			to: {
				path: "^src/(?:app|screens|components|hooks|features)/",
				dependencyTypesNot: ["type-only"],
			},
		},
	],
	options: {
		// Needed to tell a type-only import from a runtime one.
		tsPreCompilationDeps: true,
		tsConfig: { fileName: "tsconfig.json" },
	},
};
```

The recommended ESLint config also turns on `no-store-action-in-ui` for `src/screens`, `src/components`, `src/hooks`, and `src/navigation`. It leaves `src/app` alone, where the app starts. It stops a screen from changing state through a store action instead of a command.

Type-only imports stay allowed, so a port may name an adapter's types. After you add a rule, plant a violation and confirm it fails.

## Test without a device

Run vitest in plain Node, with no React Native preset and no mocks. A test that needs a mock has reached past a port.

- **`test/adapters.ts`** builds the app the way `src/instances` does, over in-memory adapters that record what they were asked to do. Tests assert on those records.
- **`test/registry.ts`** builds the registry the way `src/commands.ts` does. It does not import `src/commands.ts`, which reaches native modules. For the navigation slice, pass a stand-in that is not ready: `{ router: { navigate() {}, back() {}, canGoBack: () => false }, navigationRef: () => null }`.
- **Feature tests** sit next to each feature (`src/features/<f>/<f>.test.ts`) and call its commands.
- **`test/conformance.test.ts`** runs `checkRegistry` over the whole registry, with `samples` for every read command. It also runs `checkUiCallers` over the UI's source, read as text with `import.meta.glob("../src/{app,screens,components,hooks}/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true })`, so a feature command no screen calls fails the build.

Map the `@/` path alias in `vitest.config.mts`, narrowest alias first. To read files in a test, use `import.meta.glob` rather than `fs`, because a React Native project has no `@types/node`. Name the script `test`, so a CI step that runs `npm run test --if-present` picks it up.

A fake has to behave like the library it replaces, or it hides the bugs you need it to find. A router fake that commits a navigation synchronously, or returns the same state object on every read, passes tests that fail on a device.

## Pitfalls

- **The composition root inside `src/app`.** Expo Router treats it as a route. Keep it in `src/instances`.
- **No `+not-found.tsx`.** The first bad `href` unmounts the command bridge.
- **zustand `persist` answers before the save.** `set` returns the write's promise, but zustand types it as `void`, so a command resolves before the save lands. Await the returned value, and put the old state back when the write fails before you rethrow.
- **Hydration drops early writes.** `persist` merges stored state over memory when hydration finishes. With nothing stored yet, keep what is in memory, or a command that runs before hydration finishes is lost. Set a `hydrated` flag in `onRehydrateStorage`, on failure too, and have tests wait for it.
- **A renamed storage key loses data.** Every install keeps its data under the old key. Migrate it, or accept the loss on purpose.
- **A promise that settles on dismissal.** `WebBrowser.openBrowserAsync` resolves when the user closes the browser. A command that awaits it times out. Let the adapter present the page and return.
- **A private registry in CI and on the build service.** Both need their own token. See the package README.
