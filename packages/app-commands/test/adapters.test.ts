import { ApolloClient, ApolloLink, InMemoryCache, gql } from "@apollo/client";
import { createNavigationContainerRef } from "@react-navigation/native";
import type { router as expoRouter, useNavigationContainerRef } from "expo-router";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createStore } from "zustand/vanilla";
import { z } from "zod";

import { apolloCommands } from "../src/adapters/apollo";
import {
	expoRouterCommands,
	type ExpoRouterLike,
	type ExpoRouterNavigationRefLike,
} from "../src/adapters/expo-router";
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

/**
 * A root stack the way Expo Router shapes it: an `__root` slot whose routes are
 * named after files. Every change replaces the state object, as the container
 * does, and `navigate` resolves an href only against the routes it was given.
 */
function fakeExpoRouter(routes: Record<string, string>) {
	type Route = { key: string; name: string; params?: Record<string, unknown> };
	let stack: Route[] = [{ key: "0", name: "index" }];
	let rootState: unknown;
	const commit = () => {
		rootState = {
			index: 0,
			routes: [{ name: "__root", state: { index: stack.length - 1, routes: [...stack] } }],
		};
	};
	commit();

	let ready = true;
	const ref: ExpoRouterNavigationRefLike = {
		current: {},
		isReady: () => ready,
		getRootState: () => rootState,
	};

	const router: ExpoRouterLike = {
		navigate(href) {
			const { pathname, params } = typeof href === "string" ? { pathname: href, params: {} } : href;
			const name = routes[pathname.split("?")[0]!];
			const route: Route = name
				? { key: String(stack.length), name, params: params ?? {} }
				: {
						key: String(stack.length),
						name: "+not-found",
						params: { "not-found": pathname.slice(1).split("/") },
					};
			stack = [...stack, route];
			commit();
		},
		back() {
			stack = stack.slice(0, -1);
			commit();
		},
		canGoBack: () => stack.length > 1,
	};

	return {
		router,
		ref,
		unmount: () => {
			ready = false;
		},
	};
}

describe("expoRouterCommands", () => {
	const build = (routes: Record<string, string> = {}, focusTimeoutMs?: number) => {
		const app = fakeExpoRouter(routes);
		const registry = expoRouterCommands({
			router: app.router,
			navigationRef: () => app.ref,
			focusTimeoutMs,
		});
		return { ...app, registry };
	};

	it("takes Expo Router's own router and container ref", () => {
		// Typed routes narrow `navigate` to the app's hrefs; the adapter still takes it.
		expectTypeOf<typeof expoRouter>().toMatchTypeOf<ExpoRouterLike>();
		expectTypeOf<
			ReturnType<typeof useNavigationContainerRef>
		>().toMatchTypeOf<ExpoRouterNavigationRefLike>();
	});

	it("answers null before the root layout mounts, and refuses to navigate", async () => {
		const registry = expoRouterCommands({
			router: fakeExpoRouter({}).router,
			navigationRef: () => undefined,
		});

		expect(await call(registry, "nav.inspect")).toMatchObject({ ok: true, result: null });
		expect(failed(await call(registry, "nav.navigate", { href: "/settings" })).error).toMatch(
			/root layout has not mounted/,
		);
	});

	it("reports the pathname, the file segments and the params", async () => {
		const { registry } = build({ "/todos/[id]": "todos/[id]" });

		await call(registry, "nav.navigate", {
			href: "/todos/[id]",
			params: { id: "7", tab: "notes" },
		});

		expect(await call(registry, "nav.inspect")).toMatchObject({
			ok: true,
			result: {
				pathname: "/todos/7",
				segments: ["todos", "[id]"],
				params: { id: "7", tab: "notes" },
			},
		});
	});

	it("returns the whole tree under state", async () => {
		const { registry } = build();
		const res = await call(registry, "nav.inspect", { key: "state" });

		expect(res).toMatchObject({ ok: true, result: { state: { routes: [{ name: "__root" }] } } });
	});

	it("navigates and returns where it landed, groups dropped from the pathname", async () => {
		const { registry } = build({ "/(tabs)/settings": "(tabs)/settings" });

		expect(await call(registry, "nav.navigate", { href: "/(tabs)/settings" })).toMatchObject({
			ok: true,
			result: { pathname: "/settings", segments: ["(tabs)", "settings"] },
		});
	});

	it("uses the pathname Expo Router reports when the container registered its linking", async () => {
		const { registry, ref } = build({ "/about": "about" });
		const devtools = new WeakMap([
			[ref.current!, { linking: { config: {}, getPathFromState: () => "/about-us?ref=home" } }],
		]);
		(globalThis as { REACT_NAVIGATION_DEVTOOLS?: unknown }).REACT_NAVIGATION_DEVTOOLS = devtools;

		try {
			expect(await call(registry, "nav.inspect")).toMatchObject({
				result: { pathname: "/about-us" },
			});
		} finally {
			delete (globalThis as { REACT_NAVIGATION_DEVTOOLS?: unknown }).REACT_NAVIGATION_DEVTOOLS;
		}
	});

	it("fails when no route matches, which Expo Router shows as +not-found", async () => {
		const { registry } = build();
		const res = failed(await call(registry, "nav.navigate", { href: "/nowhere" }));

		expect(res.code).toBe("COMMAND_FAILED");
		expect(res.error).toMatch(/no route matches \/nowhere; the app is showing \+not-found/);
	});

	it("fails and says where the app is when a redirect sends it elsewhere", async () => {
		// A protected route or a <Redirect> in a layout lands the app on another screen.
		const { registry } = build({ "/account": "sign-in" }, 100);
		const res = failed(await call(registry, "nav.navigate", { href: "/account" }));

		expect(res.error).toMatch(
			/expected to be on \/account within 100 ms, but the app is on \/sign-in/,
		);
	});

	it("rejects a relative href before it reaches the app", async () => {
		const { registry } = build();

		expect(failed(await call(registry, "nav.navigate", { href: "settings" })).code).toBe(
			"INVALID_ARGS",
		);
	});

	it("goes back and returns where it landed, and fails when there is no history", async () => {
		const { registry } = build({ "/settings": "settings" });

		expect(failed(await call(registry, "nav.back")).error).toMatch(/cannot go back/);

		await call(registry, "nav.navigate", { href: "/settings" });
		expect(await call(registry, "nav.back")).toMatchObject({ ok: true, result: { pathname: "/" } });
	});

	it("reads the ref on every call, because Expo Router creates it when the root layout mounts", async () => {
		const { registry, unmount } = build();

		expect(await call(registry, "nav.inspect")).toMatchObject({ result: { pathname: "/" } });
		unmount();
		expect(await call(registry, "nav.inspect")).toMatchObject({ ok: true, result: null });
	});

	it("takes a namespace, and uses nav by default like the React Navigation adapter", () => {
		const app = fakeExpoRouter({});
		const registry = expoRouterCommands({
			router: app.router,
			navigationRef: () => app.ref,
			namespace: "router",
		});

		expect(Object.keys(registry).sort()).toEqual([
			"router.back",
			"router.inspect",
			"router.navigate",
		]);
		expect(Object.keys(build().registry).sort()).toEqual([
			"nav.back",
			"nav.inspect",
			"nav.navigate",
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
