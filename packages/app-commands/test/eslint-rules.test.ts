import { RuleTester } from "eslint";
import { describe, it } from "vitest";

import plugin from "../eslint/index.mjs";

/**
 * The fixtures are plain JavaScript on purpose: every rule here works on ESTree
 * nodes a TypeScript file produces too, so the default parser is enough and the
 * tests do not depend on a TypeScript parser being wired up.
 *
 * Paths matter more than contents. Each rule decides which files it applies to
 * from the filename, so "does not apply here" is as much of a behaviour as
 * "reports".
 */
const tester = new RuleTester({
	languageOptions: { ecmaVersion: 2022, sourceType: "module" },
});

const APP = "/repo/apps/example-app/src";
const logic = (feature: string, file: string) => `${APP}/features/${feature}/${file}`;
const screen = (file: string) => `${APP}/screens/${file}`;

const run = (name: keyof typeof plugin.rules, tests: Parameters<RuleTester["run"]>[2]) =>
	it(name, () => tester.run(name, plugin.rules[name], tests));

describe("no-ui-in-logic", () => {
	run("no-ui-in-logic", {
		valid: [
			{ code: `import { z } from "zod";`, filename: logic("todos", "index.ts") },
			{ code: `import { gql } from "@apollo/client";`, filename: logic("todos", "api.ts") },
			// A screen is where React belongs, and screens live outside the features.
			{ code: `import { View } from "react-native";`, filename: screen("todos/TodosScreen.tsx") },
			// A test may render.
			{ code: `import { render } from "react";`, filename: logic("todos", "todos.test.ts") },
			// `logicFiles` narrows the check for an app that keeps screens next to the logic.
			{
				code: `import { View } from "react-native";`,
				filename: logic("todos", "TodosScreen.tsx"),
				options: [{ logicFiles: ["api", "store", "index"] }],
			},
			// Not inside a feature folder at all.
			{ code: `import { useEffect } from "react";`, filename: `${APP}/app/App.tsx` },
		],
		invalid: [
			{
				// A native module published as its own package needs the native runtime too.
				code: `import Share from "react-native-share";`,
				filename: logic("todos", "api.ts"),
				errors: [{ messageId: "uiInLogic" }],
			},
			{
				code: `import { useState } from "react";`,
				filename: logic("todos", "index.ts"),
				errors: [{ messageId: "uiInLogic" }],
			},
			// Any name counts, not only api, store and index.
			{
				code: `import { useStore } from "react";`,
				filename: logic("todos", "feature.ts"),
				errors: [{ messageId: "uiInLogic" }],
			},
			// And any depth: a nested sub-feature is logic too.
			{
				code: `import { View } from "react-native";`,
				filename: logic("profile", "settings/hooks.ts"),
				errors: [{ messageId: "uiInLogic" }],
			},
			{
				code: `import { Platform } from "react-native/Libraries/Utilities/Platform";`,
				filename: logic("todos", "api.ts"),
				errors: [{ messageId: "uiInLogic" }],
			},
			{
				code: `import AsyncStorage from "expo-secure-store";`,
				filename: logic("settings", "store.ts"),
				errors: [{ messageId: "uiInLogic" }],
			},
			{
				code: `import { useNavigation } from "@react-navigation/native";`,
				filename: logic("news", "index.ts"),
				errors: [{ messageId: "uiInLogic" }],
			},
			// A require bypasses a rule that only visits ImportDeclaration.
			{
				code: `const { View } = require("react-native");`,
				filename: logic("todos", "api.ts"),
				errors: [{ messageId: "uiInLogic" }],
			},
			{
				code: `const lazy = () => import("react-native");`,
				filename: logic("todos", "api.ts"),
				errors: [{ messageId: "uiInLogic" }],
			},
		],
	});
});

describe("no-cross-feature-import", () => {
	run("no-cross-feature-import", {
		valid: [
			{ code: `import { NEWS } from "./gql";`, filename: logic("news", "api.ts") },
			// Out of the features tree and back down is the wiring file, not a feature.
			{
				code: `import { news } from "../../app/instances";`,
				filename: logic("news", "NewsScreen.tsx"),
			},
			{
				code: `import { command } from "@janodetzel/app-commands";`,
				filename: logic("news", "index.ts"),
			},
			{ code: `import { todosFeature } from "../todos";`, filename: `${APP}/app/agent.ts` },
		],
		invalid: [
			{
				code: `import { todosFeature } from "../todos";`,
				filename: logic("news", "api.ts"),
				errors: [{ messageId: "crossFeature" }],
			},
			{
				code: `import { createTodos } from "../todos";`,
				filename: logic("settings", "index.ts"),
				errors: [{ messageId: "crossFeature" }],
			},
			{
				code: `export { Article } from "../news/gql";`,
				filename: logic("todos", "gql.ts"),
				errors: [{ messageId: "crossFeature" }],
			},
		],
	});
});

describe("no-set-outside-store", () => {
	run("no-set-outside-store", {
		valid: [
			{ code: `set({ units: "mi" });`, filename: logic("settings", "store.ts") },
			// Named setters from useState are a different function.
			{ code: `setTitle("hi"); setBusy(false);`, filename: logic("todos", "TodosScreen.tsx") },
			{ code: `const seen = new Set();`, filename: logic("todos", "api.ts") },
			{ code: `store.getState().setUnits("mi");`, filename: logic("settings", "index.ts") },
		],
		invalid: [
			{
				code: `set({ units: "mi" });`,
				filename: logic("settings", "index.ts"),
				errors: [{ messageId: "bareSet" }],
			},
			{
				code: `settingsStore.setState({ units: "mi" });`,
				filename: `${APP}/app/instances.ts`,
				errors: [{ messageId: "setState" }],
			},
		],
	});
});

describe("no-store-action-in-ui", () => {
	const hook = (file: string) => `${APP}/hooks/${file}`;
	const route = (file: string) => `${APP}/app/${file}`;

	run("no-store-action-in-ui", {
		valid: [
			// The screen calls the command, and reads through a selector.
			{
				code: `todosFeature.checkboxTapped({ id, done }); const ids = useStore(todosStore, todosStoreSelectors.ids);`,
				filename: screen("todos/TodosScreen.tsx"),
			},
			// A one-off read passes the state to a selector.
			{
				code: `const todo = todosStoreSelectors.byId(id)(todosStore.getState());`,
				filename: screen("todos/TodoScreen.tsx"),
			},
			// A feature is where the command calls the store's action.
			{
				code: `await deps.store.getState().add(itemId);`,
				filename: logic("favorites", "feature.ts"),
			},
			// A test may drive the store directly.
			{ code: `todosStore.getState().add("x");`, filename: screen("todos/TodosScreen.test.tsx") },
			// src/app is where the app starts, so its root may load the stores.
			{ code: `void settingsStore.getState().load();`, filename: route("App.tsx") },
			// uiDirs narrows the rule for another layout.
			{
				code: `todosStore.getState().add("x");`,
				filename: screen("todos/TodosScreen.tsx"),
				options: [{ uiDirs: ["app/views"] }],
			},
		],
		invalid: [
			{
				code: `todosStore.getState().add(title);`,
				filename: screen("todos/TodosScreen.tsx"),
				errors: [{ messageId: "action" }],
			},
			{
				code: `const { add, remove } = favoritesStore.getState();`,
				filename: hook("use-favorites.ts"),
				errors: [{ messageId: "destructured" }],
			},
			{
				code: `export const useSettings = () => useStore(settingsStore);`,
				filename: hook("use-settings.ts"),
				errors: [{ messageId: "wholeStore" }],
			},
		],
	});
});

describe("no-ambient-io", () => {
	run("no-ambient-io", {
		valid: [
			{ code: `const at = deps.clock();`, filename: logic("todos", "api.ts") },
			{ code: `const at = Date.now();`, filename: screen("todos/TodosScreen.tsx") },
			{ code: `const at = Date.now();`, filename: logic("todos", "todos.test.ts") },
			{ code: `const at = Date.now();`, filename: `${APP}/app/instances.ts` },
			{ code: `const d = new Date(iso);`, filename: logic("todos", "api.ts") },
		],
		invalid: [
			{
				code: `const at = Date.now();`,
				filename: logic("todos", "api.ts"),
				errors: [{ messageId: "ambient" }],
			},
			{
				code: `const id = String(Math.random());`,
				filename: logic("todos", "store.ts"),
				errors: [{ messageId: "ambient" }],
			},
			{
				code: `const at = Date.now();`,
				filename: logic("profile", "settings/feature.ts"),
				errors: [{ messageId: "ambient" }],
			},
		],
	});
});

describe("require-rethrow", () => {
	run("require-rethrow", {
		valid: [
			{
				code: `async function save() { try { await write(); } catch (e) { set(prev); throw e; } }`,
				filename: logic("settings", "store.ts"),
			},
			{
				code: `async function save() { try { await write(); } catch (e) { return Promise.reject(e); } }`,
				filename: logic("settings", "store.ts"),
			},
			// Not a store file: swallowing here is a presentation decision.
			{
				code: `async function submit() { try { await add(); } catch (e) { show(e); } }`,
				filename: logic("todos", "TodosScreen.tsx"),
			},
		],
		invalid: [
			{
				code: `async function save() { try { await write(); } catch (e) { set(prev); } }`,
				filename: logic("news", "store.ts"),
				errors: [{ messageId: "swallowed" }],
			},
			{
				// A throw inside a nested callback never leaves the action.
				code: `async function save() { try { await write(); } catch (e) { rows.forEach(() => { throw e; }); } }`,
				filename: logic("news", "store.ts"),
				errors: [{ messageId: "swallowed" }],
			},
		],
	});
});
