import type { StoreApi } from "zustand";
import { z } from "zod";

import { command } from "../command/builder";
import { featureCommands } from "../command/tree";
import type { Registry } from "../core/command";

export type ZustandCommandsOptions = { namespace?: string };

/**
 * Reads the stores the screens subscribe to, so a feature ships no read command
 * of its own. The store names are the schema's enum, so an agent reads them off
 * the tool definition and a wrong one is rejected before the app is touched.
 *
 * Read-only on purpose. A command that called `setState` would put the app in a
 * state no tap can produce, and the agent would verify something users never
 * see. To change state, expose the store action as a named entry point.
 */
export function zustandCommands(
	stores: Record<string, StoreApi<object>>,
	opts: ZustandCommandsOptions = {},
): Registry {
	const names = Object.keys(stores);
	if (names.length === 0) throw new Error("zustandCommands needs at least one store");

	return featureCommands({
		[opts.namespace ?? "store"]: {
			inspect: command()
				.input({ store: z.enum(names as [string, ...string[]]) })
				.description(
					`Returns the state of one store, without its actions: what the screens subscribing to it render from. Functions do not survive JSON, which is why the actions are dropped. Stores: ${names.join(", ")}.`,
				)
				.run(async ({ store }) => withoutFunctions(stores[store]!.getState())),
		},
	});
}

function withoutFunctions(state: object): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(state).filter(([, value]) => typeof value !== "function"),
	);
}
