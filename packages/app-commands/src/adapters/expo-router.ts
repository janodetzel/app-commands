import { z } from "zod";

import { command } from "../command/builder";
import { featureCommands } from "../command/tree";
import type { Registry } from "../core/command";
import { ADAPTER_NAMESPACES } from "./namespaces";

/**
 * The part of Expo Router's `router` the adapter calls. The `router` exported by
 * `expo-router` is assignable to it, typed routes or not.
 */
export type ExpoRouterLike = {
	navigate(href: string | { pathname: string; params?: Record<string, unknown> }): void;
	back(): void;
	canGoBack(): boolean;
};

type NavigationStateLike = {
	index?: number;
	routes: { name: string; params?: object; state?: NavigationStateLike }[];
};

/**
 * The part of the root navigation container ref the adapter reads. What
 * `useNavigationContainerRef()` from `expo-router` returns is assignable to it.
 */
export type ExpoRouterNavigationRefLike = {
	current: object | null;
	isReady(): boolean;
	getRootState(): unknown;
};

export type ExpoRouterCommandsOptions = {
	/** `router` from `expo-router`. */
	router: ExpoRouterLike;
	/**
	 * Returns the root navigation container ref. Pass `useNavigationContainerRef`
	 * from `expo-router` uncalled: Expo Router creates the container when the root
	 * layout mounts, after a module-scope registry is built, so the adapter asks
	 * for it on every call. That function reads Expo Router's module store and
	 * calls no React hook.
	 */
	navigationRef: () => ExpoRouterNavigationRefLike | null | undefined;
	namespace?: string;
	focusTimeoutMs?: number;
};

export type ExpoRouterLocation = {
	/** The URL path without its query, the way `usePathname()` reports it. */
	pathname: string;
	/** The file segments, groups and dynamic names included, as `useSegments()` does. */
	segments: string[];
	/** Path and search params together, as `useGlobalSearchParams()` does. */
	params: Record<string, unknown>;
};

const ROOT_ROUTE = "__root";
const NOT_FOUND_ROUTE = "+not-found";

const paramValue = z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]);

/**
 * Puts an Expo Router app on a screen so a UI check has something to look at,
 * and says where it is. It does not verify business logic; the data commands do
 * that.
 *
 * `navigate` and `back` go through the same `router` a `<Link>` and a back
 * button use, and each returns the location it waited for - the result of the
 * act, not a projection of state it did not change.
 */
export function expoRouterCommands(opts: ExpoRouterCommandsOptions): Registry {
	const { router } = opts;
	const focusTimeoutMs = opts.focusTimeoutMs ?? 2_000;

	const readyRef = () => {
		const ref = opts.navigationRef();
		if (!ref?.isReady()) throw new Error("the root layout has not mounted yet");
		return ref;
	};

	return featureCommands({
		[opts.namespace ?? ADAPTER_NAMESPACES.navigation]: {
			inspect: command()
				.input({ key: z.enum(["current", "state"]).default("current") })
				.description(
					"Returns where the app is. current is the pathname, the file segments and the params, as usePathname, useSegments and useGlobalSearchParams report them; state is the whole navigation tree, which says what else is on each stack. Both answer null before the root layout mounts, which is an answer rather than a failure.",
				)
				.run(async ({ key }) => {
					const ref = opts.navigationRef();
					if (!ref?.isReady()) return null;
					if (key === "state") return { state: ref.getRootState() };
					return locationOf(ref);
				}),

			navigate: command()
				.input({
					href: z
						.string()
						.regex(/^\//, "must be an absolute path, such as /settings or /todos/[id]"),
					params: z.record(z.string(), paramValue).optional(),
				})
				.description(
					"Navigates to an href like a tap on a <Link>: to an existing screen on the stack if there is one, otherwise it pushes. A dynamic href takes its values from params, as in { href: '/todos/[id]', params: { id: '1' } }; a group such as /(tabs) is optional. Fails when no route matches, which lands on +not-found, and when the app ends up elsewhere, which is what a redirect or a protected route does.",
				)
				.run(async ({ href, params }) => {
					const ref = readyRef();
					const before = stateOf(ref);
					router.navigate(params ? { pathname: href, params } : href);

					const expected = expectedPathname(href, params ?? {});
					const location = await waitFor(() => {
						const now = locationOf(ref);
						if (samePath(now.pathname, expected)) return now;
						// The container commits a navigation after `navigate` returns, so
						// +not-found in the state from before the call is where the app
						// started, not where this href led: it counts only once the state
						// has changed.
						return stateOf(ref) !== before && now.segments.includes(NOT_FOUND_ROUTE)
							? now
							: undefined;
					}, focusTimeoutMs);

					if (!location) {
						throw new Error(
							`expected to be on ${expected} within ${focusTimeoutMs} ms, but the app is on ${locationOf(ref).pathname}. A redirect or a protected route may have sent it there.`,
						);
					}
					if (location.segments.includes(NOT_FOUND_ROUTE)) {
						throw new Error(`no route matches ${href}; the app is showing +not-found`);
					}
					return location;
				}),

			back: command()
				.description(
					"Goes back one screen, like the back button. Fails when there is nothing to go back to.",
				)
				.run(async () => {
					const ref = readyRef();
					if (!router.canGoBack()) throw new Error("cannot go back");

					const before = stateOf(ref);
					router.back();

					const changed = await waitFor(
						() => (stateOf(ref) !== before ? true : undefined),
						focusTimeoutMs,
					);
					if (!changed) throw new Error(`going back changed nothing within ${focusTimeoutMs} ms`);
					return locationOf(ref);
				}),
		},
	});
}

/**
 * The root state as a value to compare. The container rebuilds it from its
 * navigators on every read, so two reads of an unchanged state are never the
 * same object: comparing identities sees a change that has not happened, and a
 * command would answer before its navigation had committed.
 */
function stateOf(ref: ExpoRouterNavigationRefLike): string {
	return JSON.stringify(ref.getRootState()) ?? "";
}

function locationOf(ref: ExpoRouterNavigationRefLike): ExpoRouterLocation {
	const state = ref.getRootState() as NavigationStateLike | undefined;
	const { segments, params } = focusedRoute(state);
	return {
		pathname: pathFromLinking(ref, state) ?? pathnameOf(segments, params),
		segments,
		params,
	};
}

/**
 * Walks the focused route down the tree, the way Expo Router builds
 * `useSegments()`: route names are file paths, so one may hold several segments.
 */
function focusedRoute(state: NavigationStateLike | undefined) {
	const segments: string[] = [];
	const params: Record<string, unknown> = {};

	let current = state;
	while (current?.routes.length) {
		const route = current.routes[current.index ?? 0] ?? current.routes[0]!;
		Object.assign(params, route.params);
		if (route.name !== ROOT_ROUTE) {
			segments.push(...route.name.replace(/^\//, "").split("/"));
		}
		current = route.state;
	}

	if (segments.at(-1) === "index") segments.pop();
	delete params.screen;
	delete params.params;
	return { segments, params };
}

/**
 * The container registers its linking config for the React Navigation dev tools,
 * and Expo Router's is the one that turns state into the app's URL. Reading it
 * there gives the pathname Expo Router itself reports, rewrites and encoding
 * included, without importing its internals. It is not part of either library's
 * public types, so the local derivation stands in when it is missing.
 */
function pathFromLinking(ref: ExpoRouterNavigationRefLike, state: unknown): string | undefined {
	type Linking = {
		config?: unknown;
		getPathFromState?: (state: unknown, config: unknown) => string;
	};
	const registry = (
		globalThis as { REACT_NAVIGATION_DEVTOOLS?: WeakMap<object, { linking?: Linking }> }
	).REACT_NAVIGATION_DEVTOOLS;
	const linking = ref.current ? registry?.get(ref.current)?.linking : undefined;
	if (!state || !linking?.getPathFromState) return undefined;

	try {
		return linking.getPathFromState(state, linking.config).split(/[?#]/)[0] || "/";
	} catch {
		return undefined;
	}
}

/** Turns file segments into a URL path: groups drop out, dynamic segments take their param. */
function pathnameOf(segments: string[], params: Record<string, unknown>): string {
	const parts = segments.flatMap((segment) => {
		if (segment.startsWith("(") && segment.endsWith(")")) return [];
		if (segment === "index") return [];
		if (segment === NOT_FOUND_ROUTE) return asList(params["not-found"]);

		const catchAll = /^\[\[?\.\.\.(.+?)\]\]?$/.exec(segment);
		if (catchAll) return asList(params[catchAll[1]!]);

		const dynamic = /^\[(.+)\]$/.exec(segment);
		if (dynamic) return asList(params[dynamic[1]!]).slice(0, 1);

		return [segment];
	});
	return `/${parts.join("/")}`;
}

function expectedPathname(href: string, params: Record<string, unknown>): string {
	const path = href.split(/[?#]/)[0]!;
	return pathnameOf(path.split("/").filter(Boolean), params);
}

function asList(value: unknown): string[] {
	if (value === undefined || value === null || value === "") return [];
	return (Array.isArray(value) ? value : [value]).map(String);
}

function samePath(a: string, b: string): boolean {
	const normalize = (path: string) => safeDecode(path).replace(/\/+$/, "") || "/";
	return normalize(a) === normalize(b);
}

function safeDecode(path: string): string {
	try {
		return decodeURIComponent(path);
	} catch {
		return path;
	}
}

async function waitFor<T>(check: () => T | undefined, timeoutMs: number): Promise<T | undefined> {
	const start = Date.now();
	for (;;) {
		const value = check();
		if (value !== undefined) return value;
		if (Date.now() - start > timeoutMs) return undefined;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}
