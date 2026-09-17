import type { NavigationContainerRefWithCurrent, ParamListBase } from "@react-navigation/native";
import { z } from "zod";

import { command } from "../command/builder";
import type { StandardSchemaV1 } from "../command/standard-schema";
import { featureCommands } from "../command/tree";
import type { Registry } from "../core/command";

/**
 * The ref created with `createNavigationContainerRef`. A ref typed with the app's
 * own param list is assignable to this one.
 */
export type NavigationRef = NavigationContainerRefWithCurrent<ParamListBase>;

export type NavigationCommandsOptions = {
	/**
	 * The route names this app has, as any Standard Schema of a string - a
	 * `z.enum`, for example. Types do not exist at runtime, so pass them.
	 */
	routes: StandardSchemaV1<string>;
	namespace?: string;
	focusTimeoutMs?: number;
};

/**
 * Puts the app on a screen so a UI check has something to look at, and says
 * where it is. It does not verify business logic; the data commands do that.
 *
 * `navigate` and `back` are the two things a reader does with a navigator, and
 * each returns the route it waited to become focused - the result of the act,
 * not a projection of state it did not change.
 */
export function navigationCommands(ref: NavigationRef, opts: NavigationCommandsOptions): Registry {
	const focusTimeoutMs = opts.focusTimeoutMs ?? 2_000;

	return featureCommands({
		[opts.namespace ?? "nav"]: {
			inspect: command()
				.input({ key: z.enum(["current", "state"]).default("current") })
				.description(
					"Returns where the app is. current is the focused route and its params; state is the whole navigation tree, which says what else is on the stack. Both answer null before the container is ready, which is an answer rather than a failure.",
				)
				.run(async ({ key }) => {
					if (key === "state") {
						return ref.isReady() ? { state: ref.getState(), rootState: ref.getRootState() } : null;
					}
					const route = ref.getCurrentRoute();
					return route ? { name: route.name, params: route.params ?? null } : null;
				}),

			navigate: command()
				.input({ screen: opts.routes, params: z.record(z.string(), z.unknown()).optional() })
				.description(
					"Navigates like a user tap. Fails if the route does not become focused in time, which is what an unknown route looks like.",
				)
				.run(async ({ screen, params }) => {
					if (!ref.isReady()) throw new Error("navigation is not ready");

					// `navigate` is overloaded per param list; the schema validated the name already.
					(ref.navigate as (screen: string, params?: object) => void)(screen, params);

					// React Navigation logs a warning for an unknown route and does not
					// throw, so waiting for focus is the only failure signal there is.
					await waitFor(
						() => ref.getCurrentRoute()?.name === screen,
						focusTimeoutMs,
						`"${screen}" did not become the focused route within ${focusTimeoutMs} ms`,
					);

					return { name: screen, params: ref.getCurrentRoute()?.params ?? null };
				}),

			back: command()
				.description("Goes back one screen. Fails when there is nothing to go back to.")
				.run(async () => {
					if (!ref.canGoBack()) throw new Error("cannot go back");
					ref.goBack();
					return ref.getCurrentRoute()?.name ?? null;
				}),
		},
	});
}

async function waitFor(check: () => boolean, timeoutMs: number, message: string): Promise<void> {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > timeoutMs) throw new Error(message);
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}
