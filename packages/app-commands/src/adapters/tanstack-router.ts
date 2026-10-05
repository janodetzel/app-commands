import { z } from "zod";

import { command } from "../command/builder";
import { featureCommands } from "../command/tree";
import type { Registry } from "../core/command";
import { ADAPTER_NAMESPACES } from "./namespaces";

type MatchLike = {
	routeId: string;
	params: unknown;
	search?: unknown;
	status?: string;
	error?: unknown;
};

/**
 * The part of a TanStack Router instance the adapter calls. The router that
 * `createRouter` returns is assignable to it, typed routes or not, and the
 * adapter imports nothing from `@tanstack/react-router`.
 */
export type TanStackRouterLike = {
	state: {
		status?: string;
		location: { pathname: string; search: unknown; hash: string };
		matches: readonly MatchLike[];
	};
	/**
	 * Every route by its full path, `/posts/$postId`: what `to` may be. Typed as
	 * `object` because file-based routes type it with the generated
	 * `FileRoutesByFullPath` interface, and an interface has no index signature, so
	 * it is no `Record<string, unknown>`. The adapter reads only its keys and the
	 * route's `id`.
	 */
	routesByPath: object;
	navigate(opts: {
		to: string;
		params?: Record<string, unknown>;
		search?: Record<string, unknown>;
		hash?: string;
	}): Promise<unknown>;
	history: { back(): void; canGoBack(): boolean };
};

export type TanStackRouterCommandsOptions = {
	/**
	 * The router, or a function that returns it. TanStack Start builds its router
	 * in a `getRouter()` factory the framework calls, so an app keeps the browser's
	 * instance in a module variable and passes a function; the adapter asks for it
	 * on every command, and answers "not created yet" until it exists.
	 */
	router: TanStackRouterLike | (() => TanStackRouterLike | null | undefined);
	namespace?: string;
	/** How long `navigate` and `back` wait for the router to settle. Defaults to 2 seconds. */
	focusTimeoutMs?: number;
};

export type TanStackRouterLocation = {
	/** The URL path without its search, as `useLocation().pathname` reports it. */
	pathname: string;
	/** The parsed search params, as `useSearch()` reports them. */
	search: unknown;
	hash: string;
	/** The path params of the deepest match, as `useParams()` reports them. */
	params: unknown;
	/** The id of the deepest match: `/posts/$postId`, or `__root__` where nothing else matched. */
	routeId: string;
};

const ROOT_ROUTE = "__root__";
const NAMED_ROUTES = 20;

/**
 * Puts a TanStack Router app on a route so a UI check has something to look at,
 * and says where it is. It does not verify business logic; the data commands do
 * that.
 *
 * `navigate` and `back` go through the same router a `<Link>` and the back button
 * use, and each returns the location it waited for.
 */
export function tanstackRouterCommands(opts: TanStackRouterCommandsOptions): Registry {
	const focusTimeoutMs = opts.focusTimeoutMs ?? 2_000;
	const current = () => (typeof opts.router === "function" ? opts.router() : opts.router);
	const requireRouter = () => {
		const router = current();
		if (!router) throw new Error("the router has not been created yet");
		return router;
	};

	return featureCommands({
		[opts.namespace ?? ADAPTER_NAMESPACES.navigation]: {
			inspect: command()
				.input({ key: z.enum(["current", "state", "routes"]).default("current") })
				.description(
					"Returns where the app is. current is the pathname, the search params, the hash, the path params and the route id of the deepest match, as useLocation, useSearch and useParams report them; state is every active match with its status, which says whether a loader is still running or threw; routes lists the paths navigate accepts. All answer null before the router exists, which is an answer rather than a failure.",
				)
				.run(async ({ key }) => {
					const router = current();
					if (!router) return null;
					if (key === "routes") return Object.keys(router.routesByPath).sort();
					if (key === "state") {
						return {
							status: router.state.status,
							matches: router.state.matches.map(({ routeId, params, search, status }) => ({
								routeId,
								params,
								search,
								status,
							})),
						};
					}
					return locationOf(router);
				}),

			navigate: command()
				.input({
					to: z.string().regex(/^\//, "must be a route path, such as /settings or /posts/$postId"),
					params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
					search: z.record(z.string(), z.unknown()).optional(),
					hash: z.string().optional(),
				})
				.description(
					"Navigates to a route like a tap on a <Link>. 'to' is a route path as nav.inspect with key routes lists it, such as /posts/$postId, and a dynamic route takes its values from params, as in { to: '/posts/$postId', params: { postId: '7' } }; search sets the search params. Fails before navigating when 'to' is not a route or a path param is missing, because TanStack Router would otherwise land on its not-found page or on /posts/undefined. Fails afterwards when a loader throws notFound or an error, and when the app ends up on another route, which is what a redirect does.",
				)
				.run(async ({ to, params, search, hash }) => {
					const router = requireRouter();
					const routes = Object.keys(router.routesByPath);
					if (!routes.includes(to)) {
						throw new Error(`no route "${to}"; the routes are ${named(routes.sort())}`);
					}
					const missing = requiredParams(to).filter((name) => params?.[name] === undefined);
					if (missing.length > 0) {
						throw new Error(`route "${to}" needs the params ${missing.join(", ")}`);
					}

					await router.navigate({
						to,
						...(params ? { params } : {}),
						...(search ? { search } : {}),
						...(hash ? { hash } : {}),
					});

					const targetId =
						(router.routesByPath as Record<string, { id?: string } | undefined>)[to]?.id ?? to;
					// Older versions answer `navigate` while the loaders still run, so wait
					// for the router to settle, then look at where it ended up.
					const settled = await waitFor(
						() => (isSettled(router) ? true : undefined),
						focusTimeoutMs,
					);

					const failed = router.state.matches.find(
						(match) => match.status === "notFound" || match.status === "error",
					);
					if (failed?.status === "notFound") {
						throw new Error(`"${to}" rendered not found: its loader threw notFound`);
					}
					if (failed) {
						throw new Error(`"${to}" failed to load: ${describeError(failed.error)}`);
					}
					const now = locationOf(router);
					if (!settled) {
						throw new Error(
							`expected to be on ${to} within ${focusTimeoutMs} ms, but the router is still loading ${now.pathname}`,
						);
					}
					if (!isOn(router, targetId)) {
						throw new Error(
							`expected to be on ${to}, but the app is on ${now.pathname} (${now.routeId}). A redirect may have sent it there.`,
						);
					}
					return now;
				}),

			back: command()
				.description(
					"Goes back one entry in the history, like the back button. Fails when there is nothing to go back to.",
				)
				.run(async () => {
					const router = requireRouter();
					if (!router.history.canGoBack()) throw new Error("cannot go back");

					const before = keyOf(router);
					router.history.back();

					const changed = await waitFor(
						() => (keyOf(router) !== before && isSettled(router) ? true : undefined),
						focusTimeoutMs,
					);
					if (!changed) throw new Error(`going back changed nothing within ${focusTimeoutMs} ms`);
					return locationOf(router);
				}),
		},
	});
}

function locationOf(router: TanStackRouterLike): TanStackRouterLocation {
	const { location, matches } = router.state;
	const leaf = matches.at(-1);
	return {
		pathname: location.pathname,
		search: location.search,
		hash: location.hash,
		params: leaf?.params ?? {},
		routeId: leaf?.routeId ?? ROOT_ROUTE,
	};
}

/** Where the history is, as a value to compare. */
function keyOf(router: TanStackRouterLike): string {
	const { pathname, search, hash } = router.state.location;
	return JSON.stringify([pathname, search, hash]);
}

/** A loader that is still running leaves the router `pending`; `idle` is settled. */
function isSettled(router: TanStackRouterLike): boolean {
	return router.state.status === undefined || router.state.status === "idle";
}

function isOn(router: TanStackRouterLike, routeId: string): boolean {
	return router.state.matches.some((match) => match.routeId === routeId);
}

/**
 * The path params a route needs: `$postId` in `/posts/$postId`, and `_splat` for
 * a bare `$`. Optional params, `{-$name}`, are not required.
 */
function requiredParams(to: string): string[] {
	return to
		.split("/")
		.filter((segment) => segment.startsWith("$"))
		.map((segment) => (segment === "$" ? "_splat" : segment.slice(1)));
}

function named(routes: readonly string[]): string {
	return (
		routes
			.slice(0, NAMED_ROUTES)
			.map((route) => `"${route}"`)
			.join(", ") +
		(routes.length > NAMED_ROUTES ? ` and ${routes.length - NAMED_ROUTES} more` : "")
	);
}

function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function waitFor<T>(check: () => T | undefined, timeoutMs: number): Promise<T | undefined> {
	const start = Date.now();
	for (;;) {
		const value = check();
		if (value !== undefined) return value;
		if (Date.now() - start > timeoutMs) return undefined;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
}
