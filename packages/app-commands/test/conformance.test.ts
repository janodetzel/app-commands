import { describe, expect, it } from "vitest";

import { checkRegistry, checkUiCallers } from "../src/conformance";
import type { Command, Registry } from "../src/core/command";

/**
 * The suite an app runs against its own registry, tested the only way it can be:
 * by handing it registries that are wrong on purpose.
 *
 * Each case asserts the problem is found *and* that a conforming registry stays
 * silent, because a checker that reports everything is as useless as one that
 * reports nothing.
 */

const ok = (over: Partial<Command> = {}): Command => ({
	description: "Returns the arguments it was given, and never writes anything.",
	jsonSchema: { type: "object", properties: { value: { type: "string" } } },
	parse: (input) =>
		typeof input === "object" && input !== null
			? { ok: true, value: input }
			: { ok: false, issues: [{ message: "expected an object" }] },
	run: async (args) => args,
	...over,
});

const problems = (registry: Registry, samples?: Record<string, unknown>) =>
	checkRegistry(registry, samples ? { samples } : {});

describe("checkRegistry", () => {
	it("stays silent on a conforming registry", async () => {
		expect(await problems({ "todos.add": ok() })).toEqual([]);
	});

	it("catches a missing description", async () => {
		const found = await problems({ "todos.add": ok({ description: "  " }) });
		expect(found).toHaveLength(1);
		expect(found[0]!.problem).toContain("no description");
	});

	it("catches a description no longer than the command name", async () => {
		const found = await problems({ "todos.add": ok({ description: "Add todo" }) });
		expect(found[0]!.problem).toContain("generated from the name");
	});

	it("catches a schema that is not an argument object", async () => {
		const found = await problems({ "todos.add": ok({ jsonSchema: { type: "string" } }) });
		expect(found[0]!.problem).toContain("rather than an object");
	});

	it("catches a parse that accepts anything", async () => {
		const found = await problems({
			"todos.add": ok({ parse: (value) => ({ ok: true, value }) }),
		});
		expect(found[0]!.problem).toContain("accepts a deliberately wrong input");
	});

	it("catches a rejection that explains nothing", async () => {
		const found = await problems({
			"todos.add": ok({ parse: () => ({ ok: false, issues: [] }) }),
		});
		expect(found[0]!.problem).toContain("reports no issues");
	});

	it("catches a namespace no feature could have declared", async () => {
		// `featureCommands` enforces /^[a-z][a-zA-Z0-9]*$/ per segment. A registry
		// slice built by hand has no such guard, so the two paths could otherwise
		// disagree about what a namespace is.
		const found = await problems({ "example-command.inout": ok() });
		expect(found).toHaveLength(1);
		expect(found[0]!.problem).toContain("<namespace>.<name>");
	});

	it("accepts a nested feature's name, and still wants a namespace", async () => {
		expect(await problems({ "profile.settings.setUnits": ok() })).toEqual([]);
		const found = await problems({ setUnits: ok() });
		expect(found[0]!.problem).toContain("<namespace>.<name>");
	});

	it("awaits a parse that returns a promise", async () => {
		const found = await problems({
			"todos.add": ok({ parse: async (input) => ({ ok: true, value: input }) }),
		});
		expect(found[0]!.problem).toContain("accepts a deliberately wrong input");
	});

	it("catches a result the wire cannot carry", async () => {
		const found = await problems(
			{ "todos.list": ok({ run: async () => ({ when: new Map() }) }) },
			{ "todos.list": {} },
		);
		expect(found[0]!.problem).toContain("JSON cannot carry");
	});

	it("catches a command that fails on its own sample", async () => {
		const found = await problems(
			{
				"todos.list": ok({
					run: async () => {
						throw new Error("no network");
					},
				}),
			},
			{ "todos.list": {} },
		);
		expect(found[0]!.problem).toContain("failed on its conformance sample: no network");
	});

	it("catches a sample naming a command that does not exist", async () => {
		const found = await problems({ "todos.add": ok() }, { "todos.remove": {} });
		expect(found[0]!.problem).toContain("not in the registry");
	});

	it("passes a result that round-trips, including a Date", async () => {
		const found = await problems(
			{ "todos.list": ok({ run: async () => ({ at: new Date(0), items: [1, 2] }) }) },
			{ "todos.list": {} },
		);
		expect(found).toEqual([]);
	});
});

describe("checkUiCallers", () => {
	const registry: Registry = {
		"todos.checkboxTapped": ok(),
		"todos.deleteButtonTapped": ok(),
		"profile.settings.unitButtonTapped": ok(),
		"store.inspect": ok(),
		"nav.navigate": ok(),
	};

	it("names each feature command no screen calls, and nothing else", () => {
		const sources = [
			"onPress={() => todosFeature.checkboxTapped({ id, done: !done })}",
			"profileFeature.settings.unitButtonTapped({ units: 'km' })",
		];

		expect(checkUiCallers(registry, { sources })).toEqual([
			expect.objectContaining({ command: "todos.deleteButtonTapped" }),
		]);
	});

	it("matches the path below the namespace, so a nested command needs its sub-feature in the call", () => {
		// `settingsFeature.unitButtonTapped(` is a different path from the one registered.
		const problems = checkUiCallers(registry, {
			sources: [
				"todosFeature.checkboxTapped(); todosFeature.deleteButtonTapped(); settingsFeature.unitButtonTapped()",
			],
		});
		expect(problems.map((p) => p.command)).toEqual(["profile.settings.unitButtonTapped"]);
	});

	it("leaves the adapters' namespaces alone, and takes more to exempt", () => {
		const onlyAdapters: Registry = {
			"store.inspect": ok(),
			"nav.back": ok(),
			"screens.navigate": ok(),
		};

		expect(checkUiCallers(onlyAdapters, { sources: [] }).map((p) => p.command)).toEqual([
			"screens.navigate",
		]);
		expect(
			checkUiCallers(onlyAdapters, { sources: [], exempt: ["store", "nav", "screens"] }),
		).toEqual([]);
	});

	it("takes the sources as a glob result, keyed by path", () => {
		const sources = {
			"./TodosScreen.tsx": "todosFeature.checkboxTapped(); todosFeature.deleteButtonTapped();",
			"./SettingsScreen.tsx": "profileFeature.settings.unitButtonTapped();",
		};
		expect(checkUiCallers(registry, { sources })).toEqual([]);
	});
});
