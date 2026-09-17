import { ApolloClient, InMemoryCache } from "@apollo/client";
import { beforeEach, describe, expect, it } from "vitest";

import { apiLink } from "../../server/server";
import { createTodosFeature, getTodos } from ".";

/**
 * The feature is tested through its own methods, which is the call the screens
 * make and the call a command makes: `todos.add({ title })` either way. No
 * simulator, no React, and no registry in between, so a failure here points at
 * the feature rather than at the plumbing.
 *
 * Reads go through `getTodos` rather than a `list` entry point, because there is
 * no longer one: the screens read the cache with `useQuery` and the agent reads
 * it with `apollo.inspect`. A list command would be a third implementation of
 * the same read, kept honest by nobody.
 *
 * Argument validation is deliberately not tested here. A feature does not
 * validate; the zod parse happens in the adapter, so it is tested against the
 * registry in `test/commands.test.ts`.
 */

describe("the todos feature", () => {
	let apollo: ApolloClient;
	let todos: ReturnType<typeof createTodosFeature>;

	/** What the screen renders: the cache, or what the server has right now. */
	const read = (source: "cache" | "network") => getTodos(apollo, source);

	beforeEach(() => {
		// A fresh client, so each test starts with an empty cache.
		apollo = new ApolloClient({ link: apiLink, cache: new InMemoryCache() });
		todos = createTodosFeature({ apollo });
	});

	it("exposes only what a reader does on the screens", () => {
		expect(Object.keys(todos).sort()).toEqual(["add", "remove", "setDone"]);
	});

	it("adds a todo and shows it in the cache the screen reads", async () => {
		await read("network");
		const rows = await todos.add({ title: "Write the brief" });

		expect(rows.map((t) => t.title)).toContain("Write the brief");
	});

	it("leaves the cache and the server agreeing after a mutation", async () => {
		await read("network");
		await todos.add({ title: "Check the cache update" });

		// Cache first: a network read writes to the cache and would hide the bug.
		const cached = await read("cache");
		const served = await read("network");

		expect(cached.map((t) => t.id)).toEqual(served.map((t) => t.id));
	});

	it("removes a todo from both the cache and the server", async () => {
		const before = await read("network");
		const target = before[0]!.id;

		await todos.remove({ id: target });

		const cached = await read("cache");
		const served = await read("network");

		expect(cached.map((t) => t.id)).not.toContain(target);
		expect(served.map((t) => t.id)).not.toContain(target);
	});

	it("fails when the id does not exist", async () => {
		// The rejection is what the adapter turns into COMMAND_FAILED.
		await expect(todos.setDone({ id: "nope", done: true })).rejects.toThrow();
	});

	it("keeps a description on the todo, and stores an empty one when it is left out", async () => {
		await read("network");
		await todos.add({ title: "Write the brief", description: "Two pages, no more." });
		const cached = await todos.add({ title: "Send it" });

		expect(cached).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ title: "Write the brief", description: "Two pages, no more." }),
				expect.objectContaining({ title: "Send it", description: "" }),
			]),
		);
	});
});
