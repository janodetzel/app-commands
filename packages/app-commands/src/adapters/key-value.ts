import { z } from "zod";

import { command } from "../command/builder";
import { featureCommands } from "../command/tree";
import type { Registry } from "../core/command";

/**
 * The shape of AsyncStorage, copied rather than imported so this package does
 * not depend on it. Anything with these two methods works: MMKV, expo-secure-store,
 * `localStorage` behind a promise, a `Map` in a test.
 *
 * This is the one adapter named after a shape rather than a library, which is
 * why it imports no library at all.
 */
export type KeyValueStorage = {
	getItem: (key: string) => Promise<string | null>;
	getAllKeys: () => Promise<readonly string[]>;
};

export type KeyValueCommandsOptions = { namespace?: string };

/**
 * What the app reads back after a restart, which is not always what is in
 * memory now. Reading both this and the store that owns the value is how an
 * agent tells a save that happened from one that only looked like it did.
 *
 * Read-only, like every adapter here: writing a key directly would put the app
 * in a state no tap can produce.
 */
export function keyValueCommands(
	storage: KeyValueStorage,
	opts: KeyValueCommandsOptions = {},
): Registry {
	return featureCommands({
		[opts.namespace ?? "storage"]: {
			inspect: command()
				.input({ key: z.string().min(1).optional() })
				.description(
					"Returns what one key holds, parsed as JSON when it parses so the object comes back rather than an escaped string. Called with no key it lists the keys present right now; a key is only there once something has written it. A key that is absent fails and names the ones that exist, so an empty result never reads as 'no data'.",
				)
				.run(async ({ key }) => {
					const keys = [...(await storage.getAllKeys())];
					if (key === undefined) return keys;

					const raw = await storage.getItem(key);
					if (raw === null) {
						throw new Error(
							keys.length === 0
								? `storage is empty, so nothing is saved under "${key}"`
								: `nothing is saved under "${key}"; storage has ${keys.map((k) => `"${k}"`).join(", ")}`,
						);
					}

					try {
						return JSON.parse(raw) as unknown;
					} catch {
						return raw;
					}
				}),
		},
	});
}
