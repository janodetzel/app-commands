import { ApolloClient, ApolloLink, InMemoryCache, gql } from "@apollo/client";
import { createNavigationContainerRef } from "@react-navigation/native";
import type { router as expoRouter, useNavigationContainerRef } from "expo-router";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	notFound,
	redirect,
} from "@tanstack/react-router";
import { createMergeableStore, createStore as createTinybaseStore } from "tinybase";
import { afterAll, beforeAll, describe, expect, expectTypeOf, it, vi } from "vitest";
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
import { tanstackRouterCommands, type TanStackRouterLike } from "../src/adapters/tanstack-router";
import { tinybaseCommands } from "../src/adapters/tinybase";
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
 *
 * Like the container, it commits a navigation after `navigate` returns, on a
 * later tick: a command reading the state right after the call still sees the
 * screen the app was on. And like the container, `getRootState` rebuilds the
 * state from its navigators on every call, so two reads of an unchanged state
 * are equal but never the same object.
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
		getRootState: () => structuredClone(rootState),
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
			setTimeout(commit, 0);
		},
		back() {
			stack = stack.slice(0, -1);
			setTimeout(commit, 0);
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

	it("leaves +not-found for a route that exists", async () => {
		// Right after `navigate` the app still shows +not-found; that is where it
		// started, not where it landed.
		const { registry } = build({ "/settings": "settings" });
		await call(registry, "nav.navigate", { href: "/nowhere" });

		expect(await call(registry, "nav.navigate", { href: "/settings" })).toMatchObject({
			ok: true,
			result: { pathname: "/settings", segments: ["settings"] },
		});
	});

	it("still fails on a second href that matches nothing", async () => {
		const { registry } = build();
		await call(registry, "nav.navigate", { href: "/nowhere" });

		expect(failed(await call(registry, "nav.navigate", { href: "/elsewhere" })).error).toMatch(
			/no route matches \/elsewhere; the app is showing \+not-found/,
		);
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

describe("tanstackRouterCommands", () => {
	// With `isServer: false` TanStack Router reads `window.origin`, which Node lacks.
	beforeAll(() => vi.stubGlobal("window", { origin: "http://localhost" }));
	afterAll(() => vi.unstubAllGlobals());

	// A real router on an in-memory history, wired the way <RouterProvider> wires
	// it: a history change reloads the router.
	const build = () => {
		const root = createRootRoute();
		const home = createRoute({ getParentRoute: () => root, path: "/" });
		const post = createRoute({
			getParentRoute: () => root,
			path: "/posts/$postId",
			validateSearch: (search: Record<string, unknown>) => ({
				tab: typeof search.tab === "string" ? search.tab : undefined,
			}),
			loader: ({ params }) => {
				if (params.postId === "missing") throw notFound();
				if (params.postId === "boom") throw new Error("the post failed to load");
				return { id: params.postId };
			},
		});
		const settings = createRoute({ getParentRoute: () => root, path: "/settings" });
		const old = createRoute({
			getParentRoute: () => root,
			path: "/old",
			beforeLoad: () => {
				throw redirect({ to: "/settings" });
			},
		});
		const slow = createRoute({
			getParentRoute: () => root,
			path: "/slow",
			loader: () => new Promise((resolve) => setTimeout(() => resolve("done"), 120)),
		});

		const router = createRouter({
			isServer: false,
			routeTree: root.addChildren([home, post, settings, old, slow]),
			history: createMemoryHistory({ initialEntries: ["/"] }),
		});
		router.history.subscribe(() => void router.load());
		return router;
	};
	const ready = async () => {
		const router = build();
		await router.load();
		return { router, registry: tanstackRouterCommands({ router }) };
	};
	const read = async (registry: Registry, command: string, args?: unknown) => {
		const res = await call(registry, command, args);
		if (!res.ok) throw new Error(res.error);
		return res.result;
	};

	it("takes TanStack Router's own router", async () => {
		const { router } = await ready();
		const like: TanStackRouterLike = router;

		expect(like.routesByPath).toBeDefined();
	});

	it("reports the pathname, search, hash, params and the deepest route", async () => {
		const { registry } = await ready();

		expect(await read(registry, "nav.inspect")).toEqual({
			pathname: "/",
			search: {},
			hash: "",
			params: {},
			routeId: "/",
		});
	});

	it("lists the routes navigate accepts", async () => {
		const { registry } = await ready();

		expect(await read(registry, "nav.inspect", { key: "routes" })).toEqual([
			"/",
			"/old",
			"/posts/$postId",
			"/settings",
			"/slow",
		]);
	});

	it("returns every active match with its status under state", async () => {
		const { registry } = await ready();
		const state = (await read(registry, "nav.inspect", { key: "state" })) as {
			status: string;
			matches: { routeId: string; status: string }[];
		};

		expect(state.status).toBe("idle");
		expect(state.matches.map((m) => m.routeId)).toEqual(["__root__", "/"]);
	});

	it("names the three things it can report, and rejects anything else", async () => {
		const { registry } = await ready();

		expect(failed(await call(registry, "nav.inspect", { key: "history" })).code).toBe(
			"INVALID_ARGS",
		);
	});

	it("navigates with params, search and hash, and returns where it landed", async () => {
		const { registry } = await ready();
		const location = await read(registry, "nav.navigate", {
			to: "/posts/$postId",
			params: { postId: "7" },
			search: { tab: "comments" },
			hash: "latest",
		});

		expect(location).toEqual({
			pathname: "/posts/7",
			search: { tab: "comments" },
			hash: "latest",
			params: { postId: "7" },
			routeId: "/posts/$postId",
		});
		expect(await read(registry, "nav.inspect")).toEqual(location);
	});

	it("fails before navigating when the route does not exist, and names the ones that do", async () => {
		const { router, registry } = await ready();
		const res = failed(await call(registry, "nav.navigate", { to: "/nope" }));

		expect(res.error).toMatch(
			/no route "\/nope"; the routes are "\/", "\/old", "\/posts\/\$postId", "\/settings", "\/slow"/,
		);
		expect(router.state.location.pathname).toBe("/");
	});

	it("fails before navigating when a path param is missing, instead of landing on /posts/undefined", async () => {
		const { router, registry } = await ready();
		const res = failed(await call(registry, "nav.navigate", { to: "/posts/$postId" }));

		expect(res.error).toMatch(/route "\/posts\/\$postId" needs the params postId/);
		expect(router.state.location.pathname).toBe("/");
	});

	it("fails when the loader throws notFound", async () => {
		const { registry } = await ready();
		const res = failed(
			await call(registry, "nav.navigate", { to: "/posts/$postId", params: { postId: "missing" } }),
		);

		expect(res.error).toMatch(/rendered not found/);
	});

	it("fails with the loader's error", async () => {
		const { registry } = await ready();
		const res = failed(
			await call(registry, "nav.navigate", { to: "/posts/$postId", params: { postId: "boom" } }),
		);

		expect(res.error).toMatch(/failed to load: the post failed to load/);
	});

	it("fails and says where the app is when a redirect sends it elsewhere", async () => {
		const { registry } = await ready();
		const res = failed(await call(registry, "nav.navigate", { to: "/old" }));

		expect(res.error).toMatch(/expected to be on \/old, but the app is on \/settings/);
	});

	it("waits for a slow loader before it answers", async () => {
		const { registry } = await ready();
		const location = await read(registry, "nav.navigate", { to: "/slow" });

		expect(location).toMatchObject({ pathname: "/slow", routeId: "/slow" });
	});

	it("times out when the router never settles", async () => {
		// Current TanStack Router waits for the loaders inside `navigate`; older
		// versions answered while they still ran. A router that stays pending
		// stands in for them.
		const pending: TanStackRouterLike = {
			state: {
				status: "pending",
				location: { pathname: "/", search: {}, hash: "" },
				matches: [{ routeId: "__root__", params: {} }],
			},
			routesByPath: { "/slow": { id: "/slow" } },
			navigate: async () => {},
			history: { back: () => {}, canGoBack: () => true },
		};
		const registry = tanstackRouterCommands({ router: pending, focusTimeoutMs: 40 });
		const res = failed(await call(registry, "nav.navigate", { to: "/slow" }));

		expect(res.error).toMatch(/within 40 ms, but the router is still loading \//);
		expect(failed(await call(registry, "nav.back")).error).toMatch(/changed nothing within 40 ms/);
	});

	it("rejects a route that is not an absolute path before it reaches the router", async () => {
		const { registry } = await ready();

		expect(failed(await call(registry, "nav.navigate", { to: "settings" })).code).toBe(
			"INVALID_ARGS",
		);
	});

	it("goes back and returns where it landed, and fails when there is nothing to go back to", async () => {
		const { registry } = await ready();
		expect(failed(await call(registry, "nav.back")).error).toMatch(/cannot go back/);

		await read(registry, "nav.navigate", { to: "/settings" });
		expect(await read(registry, "nav.back")).toMatchObject({ pathname: "/", routeId: "/" });
	});

	it("reads the router on every call, because TanStack Start creates it after a module-scope registry", async () => {
		const app: { router?: ReturnType<typeof build> } = {};
		const registry = tanstackRouterCommands({ router: () => app.router });

		expect(await read(registry, "nav.inspect")).toBeNull();
		expect(failed(await call(registry, "nav.navigate", { to: "/settings" })).error).toMatch(
			/the router has not been created yet/,
		);

		app.router = build();
		await app.router.load();
		expect(await read(registry, "nav.inspect")).toMatchObject({ pathname: "/" });
		expect(await read(registry, "nav.navigate", { to: "/settings" })).toMatchObject({
			pathname: "/settings",
		});
	});

	it("takes a namespace, and uses nav by default like the other navigation adapters", async () => {
		const { router } = await ready();

		expect(Object.keys(tanstackRouterCommands({ router })).sort()).toEqual([
			"nav.back",
			"nav.inspect",
			"nav.navigate",
		]);
		expect(Object.keys(tanstackRouterCommands({ router, namespace: "web" })).sort()).toEqual([
			"web.back",
			"web.inspect",
			"web.navigate",
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

describe("tinybaseCommands", () => {
	// A hand-built store, the way an app's spreadsheet store looks after a few edits.
	const populate = <S extends ReturnType<typeof createTinybaseStore>>(store: S) => {
		store
			.setTable("sheets", {
				"sheet:1": { title: "Budget", rows: 12 },
				"sheet:2": { title: "Trip", rows: 3 },
				"draft:1": { title: "Untitled", rows: 0 },
			})
			.setTable("users", { u1: { name: "Ada", active: true } })
			.setValues({ "settings.theme": "dark", "settings.units": "km", launched: 2 });
		return store;
	};
	const build = () => {
		const store = populate(createTinybaseStore());
		return { store, registry: tinybaseCommands({ sheets: store }) };
	};
	const read = async (registry: Registry, args: Record<string, unknown>) => {
		const res = await call(registry, "tinybase.inspect", { store: "sheets", ...args });
		if (!res.ok) throw new Error(res.error);
		return res.result;
	};
	const failure = async (registry: Registry, args: Record<string, unknown>) =>
		failed(await call(registry, "tinybase.inspect", { store: "sheets", ...args }));

	it("returns an outline when called with only a store, never a dump", async () => {
		expect(await read(build().registry, {})).toEqual({
			tables: { sheets: 3, users: 1 },
			values: ["settings.theme", "settings.units", "launched"],
		});
	});

	it("filters the outline by id prefix", async () => {
		expect(await read(build().registry, { prefix: "settings" })).toEqual({
			tables: {},
			values: ["settings.theme", "settings.units"],
		});
	});

	it("returns the rows of a table with their total", async () => {
		expect(await read(build().registry, { table: "users" })).toEqual({
			total: 1,
			rows: { u1: { name: "Ada", active: true } },
		});
	});

	it("returns one row, as the row itself", async () => {
		expect(await read(build().registry, { table: "sheets", row: "sheet:2" })).toEqual({
			title: "Trip",
			rows: 3,
		});
	});

	it("keeps only the rows whose id starts with the prefix", async () => {
		const res = (await read(build().registry, { table: "sheets", prefix: "sheet:" })) as {
			total: number;
			rows: Record<string, unknown>;
		};

		expect(res.total).toBe(2);
		expect(Object.keys(res.rows)).toEqual(["sheet:1", "sheet:2"]);
	});

	it("caps the rows it returns and still reports how many there are", async () => {
		const res = (await read(build().registry, { table: "sheets", limit: 1 })) as {
			total: number;
			rows: Record<string, unknown>;
		};

		expect(res.total).toBe(3);
		expect(Object.keys(res.rows)).toEqual(["sheet:1"]);
	});

	it("takes the default row cap from the options", async () => {
		const store = populate(createTinybaseStore());
		const registry = tinybaseCommands({ sheets: store }, { defaultLimit: 2 });

		expect(
			Object.keys(((await read(registry, { table: "sheets" })) as { rows: object }).rows),
		).toHaveLength(2);
	});

	it("returns all values, filtered by prefix, or one by id", async () => {
		const { registry } = build();

		expect(await read(registry, { part: "values" })).toEqual({
			"settings.theme": "dark",
			"settings.units": "km",
			launched: 2,
		});
		expect(await read(registry, { part: "values", prefix: "settings." })).toEqual({
			"settings.theme": "dark",
			"settings.units": "km",
		});
		expect(await read(registry, { value: "launched" })).toBe(2);
	});

	it("fails and names the tables it has when a table is not there", async () => {
		expect((await failure(build().registry, { table: "nope" })).error).toMatch(
			/no table "nope"; it has "sheets", "users"/,
		);
	});

	it("fails and names the rows it has when a row is not there", async () => {
		expect((await failure(build().registry, { table: "sheets", row: "nope" })).error).toMatch(
			/table "sheets" has no row "nope"; it has 3 rows: "sheet:1", "sheet:2", "draft:1"/,
		);
	});

	it("fails and names what it has when a prefix matches nothing, rather than returning empty", async () => {
		const { registry } = build();

		expect((await failure(registry, { table: "sheets", prefix: "zzz" })).error).toMatch(
			/no row in table "sheets" starts with "zzz"; it has 3 rows/,
		);
		expect((await failure(registry, { part: "values", prefix: "zzz" })).error).toMatch(
			/no value in store "sheets" starts with "zzz"; it has "settings.theme"/,
		);
		expect((await failure(registry, { prefix: "zzz" })).error).toMatch(
			/no table or value in store "sheets" starts with "zzz"; tables: "sheets", "users"; values: "settings.theme"/,
		);
	});

	it("fails and names the values it has when a value is not there", async () => {
		expect((await failure(build().registry, { value: "nope" })).error).toMatch(
			/no value "nope"; it has "settings.theme", "settings.units", "launched"/,
		);
	});

	it("says so when the store is empty", async () => {
		const registry = tinybaseCommands({ sheets: createTinybaseStore() });

		expect(await read(registry, {})).toEqual({ tables: {}, values: [] });
		expect((await failure(registry, { table: "sheets" })).error).toMatch(/has no tables/);
		expect((await failure(registry, { value: "x" })).error).toMatch(/has no values/);
		expect((await failure(registry, { prefix: "x" })).error).toMatch(/is empty/);
	});

	it("names the ids of a long table, and says how many more there are", async () => {
		const store = createTinybaseStore();
		for (let i = 0; i < 25; i++) store.setRow("big", `r${i}`, { n: i });
		const registry = tinybaseCommands({ sheets: store });

		expect((await failure(registry, { table: "big", row: "nope" })).error).toMatch(
			/it has 25 rows: "r0".*"r19" and 5 more/,
		);
	});

	it("rejects arguments that contradict each other", async () => {
		const { registry } = build();

		expect((await failure(registry, { row: "sheet:1" })).error).toMatch(/needs the 'table'/);
		expect((await failure(registry, { table: "sheets", part: "values" })).error).toMatch(
			/give one of them/,
		);
		expect((await failure(registry, { value: "launched", part: "tables" })).error).toMatch(
			/cannot be combined with part 'tables'/,
		);
		expect(
			(await failure(registry, { table: "sheets", row: "sheet:1", prefix: "s" })).error,
		).toMatch(/either 'row'.*or 'prefix'/);
		expect((await failure(registry, { value: "launched", prefix: "l" })).error).toMatch(
			/either 'value'.*or 'prefix'/,
		);
	});

	it("sees a write the UI made, which is what verifying a command means", async () => {
		const { store, registry } = build();
		store.setCell("users", "u1", "name", "Grace");

		expect(await read(registry, { table: "users", row: "u1" })).toMatchObject({ name: "Grace" });
	});

	it("reads a MergeableStore the same way", async () => {
		const store = populate(createMergeableStore("test"));
		const registry = tinybaseCommands({ shared: store });

		const res = await call(registry, "tinybase.inspect", { store: "shared", table: "users" });
		expect(res).toMatchObject({ ok: true, result: { total: 1 } });
	});

	it("reads several stores by name, and puts the names in the schema", async () => {
		const settings = createTinybaseStore().setValues({ units: "km" });
		const registry = tinybaseCommands({ spreadsheet: populate(createTinybaseStore()), settings });

		expect(
			await call(registry, "tinybase.inspect", { store: "settings", value: "units" }),
		).toMatchObject({
			ok: true,
			result: "km",
		});
		expect(failed(await call(registry, "tinybase.inspect", { store: "nope" })).code).toBe(
			"INVALID_ARGS",
		);
	});

	it("exposes no way to write, and refuses to register with no store", () => {
		expect(Object.keys(build().registry)).toEqual(["tinybase.inspect"]);
		expect(() => tinybaseCommands({})).toThrow(/at least one store/);
	});

	it("takes a namespace", () => {
		const registry = tinybaseCommands({ s: createTinybaseStore() }, { namespace: "sheets" });

		expect(Object.keys(registry)).toEqual(["sheets.inspect"]);
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
