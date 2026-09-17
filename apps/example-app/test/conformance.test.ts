import { ApolloClient, InMemoryCache } from "@apollo/client";
import { apolloCommands } from "@janodetzel/app-commands/adapters/apollo";
import { buildRegistry, featureCommands } from "@janodetzel/app-commands";
import { checkRegistry } from "@janodetzel/app-commands/conformance";
import { describe, expect, it } from "vitest";

import { apiLink } from "../src/server/server";
import { createDismissedNewsStore, createNewsFeature } from "../src/features/news";
import { createSettingsFeature, createSettingsStore } from "../src/features/profile/settings";
import { createTodosFeature } from "../src/features/todos";

/**
 * The conformance suite the package ships, run against this app's own registry.
 *
 * It is deliberately not the same shape as `commands.test.ts`: that file asserts
 * what this app's commands do, this one asserts the properties every registry
 * must have for an agent to trust it - a real description, a schema the CLI can
 * read, a `parse` that refuses bad input, no shadowed name, a result that
 * survives the wire.
 *
 * The registry is rebuilt rather than imported from `src/app/commands.ts`, which
 * reaches `instances.ts` and with it AsyncStorage and the navigation ref.
 * `navigationCommands` and `inspect` are left out for the same reason.
 */

const nullStorage = <T>() => ({ get: async () => null as T | null, set: async () => {} });

function buildAppRegistry() {
	const client = new ApolloClient({ link: apiLink, cache: new InMemoryCache() });
	return buildRegistry(
		featureCommands({
			todos: createTodosFeature({ apollo: client }),
			news: createNewsFeature({
				apollo: client,
				store: createDismissedNewsStore({ storage: nullStorage<string[]>() }),
			}),
			settings: createSettingsFeature({ store: createSettingsStore({ storage: nullStorage() }) }),
		}),
		apolloCommands(client),
	);
}

describe("the registry this app builds", () => {
	it("conforms to what an agent needs from every command", async () => {
		// Only the command that writes to an in-memory store is sampled. The
		// round-trip check has to run a command, and what is left in a registry
		// once the read commands are gone is mutations - sampling `todos.deleteButtonTapped`
		// to assert a serialization property would be worse than not asserting it.
		const problems = await checkRegistry(buildAppRegistry(), {
			samples: { "settings.unitButtonTapped": { units: "km" } },
		});

		expect(problems).toEqual([]);
	});
});
