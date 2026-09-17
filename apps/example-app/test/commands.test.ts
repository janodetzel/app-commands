import { ApolloClient, InMemoryCache } from "@apollo/client";
import {
	buildRegistry,
	featureCommands,
	handleRequest,
	PROTOCOL_VERSION,
	type Registry,
} from "@janodetzel/app-commands";
import { beforeEach, describe, expect, it } from "vitest";

import { apiLink } from "../src/server/server";
import { createDismissedNewsStore, createNewsFeature } from "../src/features/news";
import { createSettingsFeature, createSettingsStore } from "../src/features/profile/settings";
import { createTodosFeature } from "../src/features/todos";

/**
 * The layer between the wire and the features, and the only thing a feature test
 * cannot reach from a method call: each feature's own behaviour is tested through
 * its methods, next to the feature, in `src/features/<feature>/<feature>.test.ts`.
 *
 * What is left here is what the registry adds. The feature methods take their
 * arguments as typed; it is this layer that parses what arrived over the wire,
 * refuses it before a handler runs, and turns a rejection into a response.
 *
 * The registry is rebuilt rather than imported from `src/app/commands.ts`, which
 * reaches instances.ts and with it AsyncStorage and the navigation ref. What is
 * asserted is the shape every slice must have, so a hand-registered command
 * cannot skip a description.
 */

/** Nothing here asserts on what was saved, so the storage only has to resolve. */
const nullStorage = <T>() => ({ get: async () => null as T | null, set: async () => {} });

describe("the registry the app builds", () => {
	let registry: Registry;

	beforeEach(() => {
		const client = new ApolloClient({ link: apiLink, cache: new InMemoryCache() });
		registry = buildRegistry(
			featureCommands({
				todos: createTodosFeature({ apollo: client }),
				news: createNewsFeature({
					apollo: client,
					store: createDismissedNewsStore({ storage: nullStorage<string[]>() }),
				}),
				settings: createSettingsFeature({ store: createSettingsStore({ storage: nullStorage() }) }),
			}),
		);
	});

	const call = (command: string, args?: unknown) =>
		handleRequest(registry, {
			id: "1",
			clientId: "test",
			protocolVersion: PROTOCOL_VERSION,
			cmd: "run",
			command,
			args,
		});

	it("holds every feature's commands under a namespace of its own", () => {
		const namespaces = new Set(Object.keys(registry).map((key) => key.split(".")[0]));
		expect([...namespaces].sort()).toEqual(["news", "settings", "todos"]);

		// Every command carries a description written for the agent, not a name
		// turned into a sentence, and a schema the CLI can build flags from.
		for (const [name, cmd] of Object.entries(registry)) {
			expect(cmd.description.length, name).toBeGreaterThan(20);
			expect(cmd.jsonSchema, name).toMatchObject({ type: "object" });
		}
	});

	it("rejects an empty todo title before it reaches the API", async () => {
		expect(await call("todos.newTodoSubmitted", { title: "" })).toMatchObject({
			ok: false,
			code: "INVALID_ARGS",
		});
	});

	it("rejects an empty article id before it reaches the store", async () => {
		expect(await call("news.dismissButtonTapped", { id: "" })).toMatchObject({
			ok: false,
			code: "INVALID_ARGS",
		});
	});

	it("turns a rejected handler into a failed response", async () => {
		expect(await call("todos.checkboxTapped", { id: "nope", done: true })).toMatchObject({
			ok: false,
			code: "COMMAND_FAILED",
		});
	});
});
