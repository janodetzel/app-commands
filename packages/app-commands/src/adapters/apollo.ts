import type { ApolloClient } from "@apollo/client";
import { z } from "zod";

import { command } from "../command/builder";
import { featureCommands } from "../command/tree";
import type { Registry } from "../core/command";

export type ApolloCommandsOptions = { namespace?: string };

/**
 * The cache the screens read from, and the one act a reader performs on server
 * data without changing it: asking for it again.
 *
 * Mutations are not here. They belong to whoever owns the data, whose methods
 * the UI calls too.
 */
export function apolloCommands(client: ApolloClient, opts: ApolloCommandsOptions = {}): Registry {
	const entries = () => client.cache.extract() as Record<string, unknown>;

	const prefixes = () => {
		const of = (id: string) => {
			const colon = id.indexOf(":");
			return colon === -1 ? id : id.slice(0, colon + 1);
		};
		return [...new Set(Object.keys(entries()).map(of))].sort();
	};

	return featureCommands({
		[opts.namespace ?? "apollo"]: {
			inspect: command()
				.input({ prefix: z.string().min(1).optional() })
				.description(
					"Returns the normalized cache entries whose key starts with the prefix, for example 'Article:'. Called with no prefix it lists the prefixes present right now, which change as the app runs: a query writes to the cache only once the screen that owns it has mounted. A prefix that matches nothing fails and names the ones that do, so an empty result never reads as 'no data'. A full dump is never returned; a real app's cache is megabytes.",
				)
				.run(async ({ prefix }) => {
					const present = prefixes();
					if (prefix === undefined) return present;

					const matching = Object.entries(entries()).filter(([id]) => id.startsWith(prefix));
					if (matching.length === 0) {
						throw new Error(
							present.length === 0
								? `the cache is empty, so nothing starts with "${prefix}"`
								: `nothing in the cache starts with "${prefix}"; it has ${present.map((p) => `"${p}"`).join(", ")}`,
						);
					}

					return Object.fromEntries(matching);
				}),

			refetch: command()
				.input({ operations: z.array(z.string().min(1)).min(1) })
				.description(
					"Refetches the named active queries and returns the operation names that ran. A query that is not mounted anywhere does not run, so navigate to the screen that owns it first. Writes what comes back to the cache, which is where apollo.inspect reads from.",
				)
				.run(async ({ operations }) => {
					// The returned object is a promise that also carries the queries it
					// touched, which is where the names are.
					const refetch = client.refetchQueries({ include: operations });
					const names = refetch.queries.map((query) => query.queryName).filter(Boolean);
					await refetch;
					return names;
				}),
		},
	});
}
