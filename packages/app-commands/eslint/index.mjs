/**
 * The principles, as rules.
 *
 * A feature defines its entry points with app-commands' `command()`. Everything
 * else that makes a feature reachable from outside React is a constraint on how
 * the code is written, and a constraint nobody checks is a comment. These are
 * the checks.
 *
 * Each rule decides for itself which files it applies to - by the file's name
 * and its place in the tree - so the recommended config can target every source
 * file without a glob that has to be kept in sync with the app's layout.
 */
import noAmbientIo from "./rules/no-ambient-io.mjs";
import noCrossFeatureImport from "./rules/no-cross-feature-import.mjs";
import noSetOutsideStore from "./rules/no-set-outside-store.mjs";
import noStoreActionInUi from "./rules/no-store-action-in-ui.mjs";
import noUiInLogic from "./rules/no-ui-in-logic.mjs";
import requireRethrow from "./rules/require-rethrow.mjs";

const rules = {
	"no-ambient-io": noAmbientIo,
	"no-cross-feature-import": noCrossFeatureImport,
	"no-set-outside-store": noSetOutsideStore,
	"no-store-action-in-ui": noStoreActionInUi,
	"no-ui-in-logic": noUiInLogic,
	"require-rethrow": requireRethrow,
};

const plugin = { meta: { name: "app-commands" }, rules };

/**
 * Flat config. Spread it:
 *
 * ```js
 * import appCommands from "@janodetzel/app-commands/eslint";
 * export default [...appCommands.configs.recommended];
 * ```
 *
 * Pass `featuresDir` or `logicFiles` per rule if the app does not keep its
 * features in `src/features/<name>/`.
 */
const recommended = [
	{
		files: ["**/*.ts", "**/*.tsx"],
		plugins: { "app-commands": plugin },
		rules: {
			"app-commands/no-ambient-io": "error",
			"app-commands/no-cross-feature-import": "error",
			"app-commands/no-set-outside-store": "error",
			"app-commands/no-store-action-in-ui": "error",
			"app-commands/no-ui-in-logic": "error",
			"app-commands/require-rethrow": "error",
		},
	},
];

plugin.configs = { recommended };

export default plugin;
