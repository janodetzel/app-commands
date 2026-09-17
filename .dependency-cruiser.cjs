/**
 * Keeps app-commands' core free of everything.
 *
 * - `app-commands/src/core` imports nothing. Not zod, not a UI library, not the
 *   feature layer. That is what lets it run against an app built on Redux,
 *   XState, MobX, or plain service classes. That is principle 10.
 * - `app-commands/src/command`, the `command()` builder, imports core and
 *   nothing else. It reads any Standard Schema through a copied interface, so
 *   it names no validation library either.
 * - `app-commands/src/adapters/<lib>` may use only its own library and core.
 *
 * The example app's own boundaries are mostly app-commands' ESLint rules, because
 * they are about file names rather than package edges. The one exception is the
 * sibling-feature rule, which app-commands ships for dependency-cruiser as well:
 * a deep relative import between features is a package edge, and belongs here.
 */
// Rules match the resolved path of a dependency, which for an npm package is the
// file inside node_modules. Matching on the path rather than on dependency-cruiser's
// dependency types is deliberate: an import of a package the importer does not
// declare has no type to match, and that is exactly the import worth catching.
const appCommands = require("@janodetzel/app-commands/depcruise");

const inNodeModules = (...packages) => packages.map((p) => `(^|/)node_modules/${p}/`);

// The built-in adapters' shared schema language. They declare their arguments in
// zod and build their commands with command(), which reads zod as a Standard
// Schema. This is the one dependency all of them may have.
const SHARED = inNodeModules("zod");

const ADAPTER_LIBRARIES = {
	"react-navigation": inNodeModules("@react-navigation/[^/]+"),
	apollo: inNodeModules("@apollo/client"),
	zustand: inNodeModules("zustand"),
	// Named after a shape rather than a library, and copies the two methods it
	// needs instead of importing them. An empty allowlist is what says so.
	"key-value": [],
};

/** One rule per adapter: its own library, plus zod, and nothing else. */
const adapterRules = Object.entries(ADAPTER_LIBRARIES).map(([adapter, allowed]) => ({
	name: "adapters-import-only-their-own-library",
	comment:
		"An adapter binds one library to core. Importing another adapter's library would make every app that uses this one pay for it.",
	severity: "error",
	from: { path: `^packages/app-commands/src/adapters/${adapter}` },
	to: { path: "(^|/)node_modules/", pathNot: [...SHARED, ...allowed] },
}));

module.exports = {
	forbidden: [
		...appCommands.rules(),
		{
			name: "screens-do-not-import-the-registry",
			comment:
				"A screen calls a feature, the same function a command calls. Reaching for the registry would make the UI a client of the bridge instead of a peer of it.",
			severity: "error",
			from: { path: "^apps/[^/]+/src/screens/" },
			to: { path: "^apps/[^/]+/src/app/commands" },
		},
		{
			name: "core-imports-nothing",
			comment:
				"packages/app-commands/src/core must not import anything from node_modules - no validation library, no UI library, no feature layer. It knows four things per command and nothing about where they came from, and that is the property that makes it reusable (principle 10). Put the dependency in an adapter.",
			severity: "error",
			from: { path: "^packages/app-commands/src/core" },
			to: { path: "(^|/)node_modules/" },
		},
		{
			name: "core-does-not-import-transport-or-adapters",
			severity: "error",
			from: { path: "^packages/app-commands/src/core" },
			to: { path: "^packages/app-commands/src/(expo|adapters)" },
		},
		{
			name: "command-imports-only-core",
			comment:
				"packages/app-commands/src/command is what every feature file imports, so it ships in every app. It reads schemas through the Standard Schema interface it copies, and imports core and nothing else - no validation library, no transport, no adapter. An app on Valibot must not install zod to define a command.",
			severity: "error",
			from: { path: "^packages/app-commands/src/command" },
			to: {
				path: ["(^|/)node_modules/", "^packages/app-commands/src/(expo|adapters|conformance)"],
			},
		},
		...adapterRules,
		{
			name: "no-unresolvable",
			comment:
				"An import that does not resolve slips past every layer rule, because the rules match the resolved path.",
			severity: "error",
			from: { path: "^(packages|apps)/[^/]+/(src|cli|mcp|test)" },
			to: { couldNotResolve: true },
		},
		{
			name: "no-circular",
			severity: "error",
			from: {},
			to: { circular: true },
		},
	],
	options: {
		doNotFollow: { path: "node_modules" },
		// node_modules stays in the graph on purpose: the layer rules are about which
		// libraries a layer may import. `doNotFollow` keeps the graph from exploding.
		exclude: { path: "(/build/|/dist/|/webui/)" },
		tsPreCompilationDeps: true,
		tsConfig: { fileName: "tsconfig.base.json" },
		enhancedResolveOptions: {
			exportsFields: ["exports"],
			// "module" first, so a package that ships both maps to its ESM files and the
			// rules can match a readable path instead of a CJS interop directory.
			conditionNames: ["module", "import", "require", "node", "default", "types"],
			mainFields: ["main", "types"],
		},
	},
};
