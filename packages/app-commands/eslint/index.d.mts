import type { ESLint, Linter, Rule } from "eslint";

export type FeatureKitRuleName =
	| "no-ambient-io"
	| "no-cross-feature-import"
	| "no-set-outside-store"
	| "no-store-action-in-ui"
	| "no-ui-in-logic"
	| "require-rethrow";

/**
 * Options the path-sensitive rules take. A rule given neither applies to every
 * file it is enabled on.
 *
 * - `featuresDir`: where feature folders live, default `src/features`.
 * - `logicFiles`: narrows the check to these file names, at any depth. By
 *   default every file in a feature folder is logic, except tests.
 * - `modules`: `no-ui-in-logic` only - what counts as a UI import. A trailing
 *   `*` matches a prefix.
 * - `uiDirs`: `no-store-action-in-ui` only - the folders that hold the UI,
 *   default `src/screens`, `src/components`, `src/hooks` and `src/navigation`.
 *   `src/app` is left out: the app starts there.
 */
export type FeatureKitRuleOptions = {
	featuresDir?: string;
	logicFiles?: string[];
	modules?: string[];
	uiDirs?: string[];
};

declare const plugin: ESLint.Plugin & {
	meta: { name: "app-commands" };
	rules: Record<FeatureKitRuleName, Rule.RuleModule>;
	configs: { recommended: Linter.Config[] };
};

export default plugin;
