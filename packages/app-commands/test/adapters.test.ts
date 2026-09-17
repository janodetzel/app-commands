import { ApolloClient, ApolloLink, InMemoryCache, gql } from "@apollo/client";
import { createNavigationContainerRef } from "@react-navigation/native";
import { describe, expect, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { z } from "zod";

import { apolloCommands } from "../src/adapters/apollo";
import { keyValueCommands } from "../src/adapters/key-value";
import { navigationCommands, type NavigationRef } from "../src/adapters/react-navigation";
import { zustandCommands } from "../src/adapters/zustand";
import { buildRegistry, type Registry } from "../src/core/command";
import { handleRequest } from "../src/core/handle";
import { PROTOCOL_VERSION, type Response } from "../src/core/protocol";

const call = (registry: Registry, command: string, args?: unknown) =>
	handleRequest(registry, {
		id: "1",
		clientId: "test",
		protocolVersion: PROTOCOL_VERSION,
		cmd: "run",
		command,
		args,
	});

const failed = (res: Response) => {
	if (res.ok) throw new Error(`expected a failure, got ${JSON.stringify(res.result)}`);
	return res;
};

describe("navigationCommands", () => {
	const routes = z.enum(["Home", "Settings"]);

	it("fails when the container is not ready", async () => {
		const ref = createNavigationContainerRef<{ Home: undefined; Settings: undefined }>();
		const registry = navigationCommands(ref as NavigationRef, { routes });

		expect(failed(await call(registry, "nav.navigate", { screen: "Home" })).error).toMatch(
			/navigation is not ready/,
		);
	});

	it("reports the route it is on, and null before the container mounts", async () => {
		const ref = createNavigationContainerRef<{ Home: undefined; Settings: undefined }>();
		const registry = navigationCommands(ref as NavigationRef, { routes });

		expect(await call(registry, "nav.inspect")).toMatchObject({ ok: true, result: null });
		expect(await call(registry, "nav.inspect", { key: "state" })).toMatchObject({
			ok: true,
			result: null,
		});
	});

	it("names the two things it can report, and rejects anything else", async () => {
		const ref = createNavigationContainerRef<{ Home: undefined }>();
		const registry = navigationCommands(ref as NavigationRef, { routes });

		expect(failed(await call(registry, "nav.inspect", { key: "history" })).code).toBe(
			"INVALID_ARGS",
		);
	});

	it("times out when the route never becomes focused, which is what an unknown route does", async () => {
		// React Navigation does not throw for an unknown route, so the adapter is
		// driven here with a ref that reports a route that never changes.
		const ref = {
			isReady: () => true,
			navigate: () => {},
			goBack: () => {},
			canGoBack: () => true,
			getCurrentRoute: () => ({ name: "Home", params: undefined }),
		} as unknown as NavigationRef;

		const registry = navigationCommands(ref, { routes, focusTimeoutMs: 100 });
		const res = failed(await call(registry, "nav.navigate", { screen: "Settings" }));

		expect(res.code).toBe("COMMAND_FAILED");
		expect(res.error).toMatch(/did not become the focused route within 100 ms/);
	});

	it("rejects a route that is not in the enum before it reaches the app", async () => {
		const ref = createNavigationContainerRef<{ Home: undefined; Settings: undefined }>();
		const registry = navigationCommands(ref as NavigationRef, { routes });

		expect(failed(await call(registry, "nav.navigate", { screen: "DoesNotExist" })).code).toBe(
			"INVALID_ARGS",
		);
	});

	it("fails to go back when there is no history", async () => {
		const ref = { canGoBack: () => false } as unknown as NavigationRef;
		const registry = navigationCommands(ref, { routes });

		expect(failed(await call(registry, "nav.back")).error).toMatch(/cannot go back/);
	});

	it("takes a namespace, for an app that already has a nav", () => {
		const ref = createNavigationContainerRef<{ Home: undefined; Settings: undefined }>();
		const registry = navigationCommands(ref as NavigationRef, { routes, namespace: "screens" });

		expect(Object.keys(registry).sort()).toEqual([
			"screens.back",
			"screens.inspect",
			"screens.navigate",
		]);
	});
});

describe("apolloCommands", () => {
	const withCache = () => {
		const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });
		client.cache.writeQuery({
			query: gql`
				query Articles {
					articles {
						id
						title
					}
				}
			`,
			data: { articles: [{ __typename: "Article", id: "a1", title: "One" }] },
		});
		return apolloCommands(client);
	};

	it("lists the prefixes present when called with none", async () => {
		expect(await call(withCache(), "apollo.inspect")).toMatchObject({
			ok: true,
			result: ["Article:", "ROOT_QUERY"],
		});
	});

	it("returns only the entries with the prefix", async () => {
		const res = await call(withCache(), "apollo.inspect", { prefix: "Article:" });
		if (!res.ok) throw new Error(res.error);

		expect(Object.keys(res.result as object)).toEqual(["Article:a1"]);
	});

	it("fails and names the prefixes it has, rather than returning empty", async () => {
		const res = failed(await call(withCache(), "apollo.inspect", { prefix: "Nope:" }));

		expect(res.error).toMatch(/nothing in the cache starts with "Nope:".*"Article:"/);
	});

	it("says so when the cache is empty", async () => {
		const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });
		const res = failed(
			await call(apolloCommands(client), "apollo.inspect", { prefix: "Article:" }),
		);

		expect(res.error).toMatch(/the cache is empty/);
	});

	it("returns an empty list when no named query is active", async () => {
		expect(await call(withCache(), "apollo.refetch", { operations: ["Articles"] })).toMatchObject({
			ok: true,
			result: [],
		});
	});

	it("requires at least one operation", async () => {
		expect(failed(await call(withCache(), "apollo.refetch", { operations: [] })).code).toBe(
			"INVALID_ARGS",
		);
	});
});

describe("zustandCommands", () => {
	const build = () => {
		const store = createStore<{ dismissedIds: string[]; dismiss(id: string): void }>()((set) => ({
			dismissedIds: [],
			dismiss: (id) => set((s) => ({ dismissedIds: [...s.dismissedIds, id] })),
		}));
		return { store, registry: zustandCommands({ dismissedNews: store }) };
	};

	it("returns state without the actions", async () => {
		const res = await call(build().registry, "store.inspect", { store: "dismissedNews" });

		expect(res).toMatchObject({ ok: true, result: { dismissedIds: [] } });
		expect(Object.keys((res as { result: object }).result)).toEqual(["dismissedIds"]);
	});

	it("sees a write the UI made, which is what verifying a command means", async () => {
		const { store, registry } = build();
		store.getState().dismiss("a1");

		expect(await call(registry, "store.inspect", { store: "dismissedNews" })).toMatchObject({
			ok: true,
			result: { dismissedIds: ["a1"] },
		});
	});

	it("puts the store names in the schema, so a wrong one never reaches the app", async () => {
		const { registry } = build();

		expect(failed(await call(registry, "store.inspect", { store: "nope" })).code).toBe(
			"INVALID_ARGS",
		);
	});

	it("exposes no way to write", () => {
		expect(Object.keys(build().registry)).toEqual(["store.inspect"]);
	});

	it("refuses to register with no store at all", () => {
		expect(() => zustandCommands({})).toThrow(/at least one store/);
	});
});

describe("keyValueCommands", () => {
	const build = (entries: [string, string][] = [["news.dismissedIds", JSON.stringify(["a9"])]]) => {
		const saved = new Map(entries);
		return keyValueCommands({
			getItem: async (key: string) => saved.get(key) ?? null,
			getAllKeys: async () => [...saved.keys()],
		});
	};

	it("lists the keys present when called with none", async () => {
		expect(await call(build(), "storage.inspect")).toMatchObject({
			ok: true,
			result: ["news.dismissedIds"],
		});
	});

	it("parses a JSON value, so the object comes back rather than a string", async () => {
		expect(await call(build(), "storage.inspect", { key: "news.dismissedIds" })).toMatchObject({
			ok: true,
			result: ["a9"],
		});
	});

	it("returns a value that is not JSON as it is", async () => {
		expect(
			await call(build([["token", "abc"]]), "storage.inspect", { key: "token" }),
		).toMatchObject({ ok: true, result: "abc" });
	});

	it("fails and names the keys it has, rather than returning empty", async () => {
		const res = failed(await call(build(), "storage.inspect", { key: "nope" }));

		expect(res.error).toMatch(/nothing is saved under "nope".*"news.dismissedIds"/);
	});

	it("says so when storage is empty", async () => {
		const res = failed(await call(build([]), "storage.inspect", { key: "nope" }));

		expect(res.error).toMatch(/storage is empty/);
	});
});

describe("the slices together", () => {
	it("merge into one registry, and a clash between two adapters is named", () => {
		const ref = createNavigationContainerRef<{ Home: undefined }>();
		const routes = z.enum(["Home"]);
		const client = new ApolloClient({ cache: new InMemoryCache(), link: ApolloLink.empty() });
		const store = createStore<{ units: string }>()(() => ({ units: "km" }));

		const registry = buildRegistry(
			navigationCommands(ref as NavigationRef, { routes }),
			apolloCommands(client),
			zustandCommands({ settings: store }),
		);

		// Every adapter reads under its own namespace, and each names that read
		// `inspect`, so one convention covers all of them.
		expect(Object.keys(registry).sort()).toEqual([
			"apollo.inspect",
			"apollo.refetch",
			"nav.back",
			"nav.inspect",
			"nav.navigate",
			"store.inspect",
		]);

		// Two adapters asked for the same namespace: better to fail at startup than
		// to have one of them silently win.
		expect(() =>
			buildRegistry(apolloCommands(client), apolloCommands(client, { namespace: "apollo" })),
		).toThrow('duplicate command "apollo.inspect"');
	});
});
