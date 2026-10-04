/// <reference types="vite/client" />
import { buildRegistry, featureCommands } from "@janodetzel/app-commands";
import { zustandCommands } from "@janodetzel/app-commands/adapters/zustand";
import { checkRegistry, checkUiCallers } from "@janodetzel/app-commands/conformance";
import { describe, expect, it } from "vitest";

import { createTodosFeature, createTodosStore } from "../src/features/todos";

/**
 * The conformance suite the package ships, run against this app's own registry.
 * The registry is rebuilt here rather than imported from `src/app/commands.ts`,
 * so the test owns its store.
 */
function buildAppRegistry() {
	const store = createTodosStore();
	return buildRegistry(
		featureCommands({ todos: createTodosFeature({ store }) }),
		zustandCommands({ todos: store }),
	);
}

describe("the registry this app builds", () => {
	it("conforms to what an agent needs from every command", async () => {
		const problems = await checkRegistry(buildAppRegistry(), {
			samples: { "todos.newTodoSubmitted": { title: "sample" } },
		});

		expect(problems).toEqual([]);
	});

	it("has a screen that calls every feature command", () => {
		const screens = import.meta.glob<string>("../src/screens/**/*.{ts,tsx}", {
			query: "?raw",
			import: "default",
			eager: true,
		});

		expect(checkUiCallers(buildAppRegistry(), { sources: screens })).toEqual([]);
	});
});
