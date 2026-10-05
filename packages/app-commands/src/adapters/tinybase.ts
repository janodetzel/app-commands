import { z } from "zod";

import { command } from "../command/builder";
import { featureCommands } from "../command/tree";
import type { Registry } from "../core/command";

export type TinybaseCommandsOptions = {
	namespace?: string;
	/** Rows returned from one table when the call gives no `limit`. Defaults to 100. */
	defaultLimit?: number;
};

/**
 * The part of a TinyBase store the adapter reads. A `Store` or `MergeableStore`
 * from `tinybase` is assignable to it, and so is one from `tinybase/with-schemas`:
 * its setters take only the schema's types, which makes it no `Store`, and its
 * getters take the schema's ids. The methods are declared as methods, not
 * properties, so those narrower ids still fit.
 */
export interface TinybaseStoreLike {
	getTableIds(): string[];
	hasTable(tableId: string): boolean;
	getRowCount(tableId: string): number;
	getRowIds(tableId: string): string[];
	hasRow(tableId: string, rowId: string): boolean;
	getRow(tableId: string, rowId: string): object;
	getValueIds(): string[];
	hasValue(valueId: string): boolean;
	getValue(valueId: string): unknown;
}

/** How many ids a failure names before it says "and N more". */
const NAMED_IDS = 20;

const named = (ids: readonly string[]) =>
	ids.length === 0
		? "none"
		: ids
				.slice(0, NAMED_IDS)
				.map((id) => `"${id}"`)
				.join(", ") + (ids.length > NAMED_IDS ? ` and ${ids.length - NAMED_IDS} more` : "");

/**
 * Stores that come and go while the app runs, such as one per signed-in user or
 * one per open document. The adapter calls `list` and `get` on every read, so a
 * store created after the registry was built can be inspected.
 */
export type TinybaseStoreSource = {
	/** The ids of the stores that exist now. */
	list: () => readonly string[];
	/** The store with this id, or `undefined` when there is none (any more). */
	get: (id: string) => TinybaseStoreLike | undefined;
};

const isSource = (
	stores: Record<string, TinybaseStoreLike> | TinybaseStoreSource,
): stores is TinybaseStoreSource =>
	typeof stores.list === "function" && typeof stores.get === "function";

/**
 * Reads TinyBase stores: the tables, rows and values the screens render from.
 * A `MergeableStore` is a `Store`, so it is passed the same way and reads as the
 * merged content, without the CRDT bookkeeping behind it. A store typed with
 * `tinybase/with-schemas` is passed as it is, without a cast.
 *
 * Pass a record of the stores the app creates at module scope; their names go into
 * the schema. Pass a {@link TinybaseStoreSource} instead when stores are created
 * and destroyed at runtime; the id an agent gives is then checked when it calls.
 *
 * Read-only on purpose. A command that wrote a cell would put the app in a state
 * no tap can produce, and the agent would verify something users never see. To
 * change data, expose the store's mutation as a named entry point.
 */
export function tinybaseCommands(
	stores: Record<string, TinybaseStoreLike> | TinybaseStoreSource,
	opts: TinybaseCommandsOptions = {},
): Registry {
	const source: TinybaseStoreSource = isSource(stores)
		? stores
		: { list: () => Object.keys(stores), get: (id) => stores[id] };
	const names = isSource(stores) ? undefined : Object.keys(stores);
	if (names?.length === 0) throw new Error("tinybaseCommands needs at least one store");
	const defaultLimit = opts.defaultLimit ?? 100;

	return featureCommands({
		[opts.namespace ?? "tinybase"]: {
			inspect: command()
				.input({
					store: (names ? z.enum(names as [string, ...string[]]) : z.string().min(1)).optional(),
					part: z.enum(["tables", "values"]).optional(),
					table: z.string().min(1).optional(),
					row: z.string().min(1).optional(),
					value: z.string().min(1).optional(),
					prefix: z.string().min(1).optional(),
					limit: z.number().int().min(1).max(1000).optional(),
				})
				.description(
					`Reads one TinyBase store, without writing anything. Without 'store' it returns { stores: [id] }, the stores that exist now. With only a store it returns an outline, { tables: { tableId: rowCount }, values: [valueId] }, because a real store is too large to dump. Give 'table' for its rows, as { total, rows } with at most 'limit' rows (default ${defaultLimit}); 'row' returns that one row; 'prefix' keeps only the rows whose id starts with it. Use part 'values' for the store's values, all of them or one by 'value'; 'prefix' filters value ids the same way. In the outline 'prefix' filters the table ids and value ids. A store, table, row or value that is not there fails and names the ones that are, so an empty result never reads as 'no data'. ${names ? `Stores: ${names.join(", ")}.` : "Stores are created while the app runs, so list them first."}`,
				)
				.run(async ({ store: name, part, table, row, value, prefix, limit }) => {
					if (name === undefined) {
						if ([part, table, row, value, prefix, limit].some((arg) => arg !== undefined)) {
							throw new Error(
								"give the 'store' to read; call with no arguments to list the stores",
							);
						}
						return { stores: [...source.list()] };
					}
					const store = source.get(name);
					if (store === undefined) {
						throw new Error(`there is no store "${name}"; there are ${named(source.list())}`);
					}
					const startsWith = (id: string) => prefix === undefined || id.startsWith(prefix);

					const wantsValues = part === "values" || value !== undefined;
					if (wantsValues && table !== undefined) {
						throw new Error("'table' reads tables and 'value' reads values; give one of them");
					}
					if (value !== undefined && part === "tables") {
						throw new Error("'value' reads values, so it cannot be combined with part 'tables'");
					}
					if (row !== undefined && table === undefined) {
						throw new Error("'row' needs the 'table' it is in");
					}
					if (row !== undefined && prefix !== undefined) {
						throw new Error("give either 'row' for one row or 'prefix' for several, not both");
					}
					if (value !== undefined && prefix !== undefined) {
						throw new Error("give either 'value' for one value or 'prefix' for several, not both");
					}

					if (wantsValues) {
						const ids = store.getValueIds();
						if (value !== undefined) {
							if (!store.hasValue(value)) {
								throw new Error(
									ids.length === 0
										? `store "${name}" has no values, so there is no "${value}"`
										: `store "${name}" has no value "${value}"; it has ${named(ids)}`,
								);
							}
							return store.getValue(value) ?? null;
						}

						const matching = ids.filter(startsWith);
						if (prefix !== undefined && matching.length === 0) {
							throw new Error(
								ids.length === 0
									? `store "${name}" has no values, so none start with "${prefix}"`
									: `no value in store "${name}" starts with "${prefix}"; it has ${named(ids)}`,
							);
						}
						return Object.fromEntries(matching.map((id) => [id, store.getValue(id) ?? null]));
					}

					if (table === undefined) {
						const tableIds = store.getTableIds();
						const valueIds = store.getValueIds();
						const tables = tableIds.filter(startsWith);
						const values = valueIds.filter(startsWith);
						if (prefix !== undefined && tables.length === 0 && values.length === 0) {
							throw new Error(
								tableIds.length === 0 && valueIds.length === 0
									? `store "${name}" is empty, so nothing starts with "${prefix}"`
									: `no table or value in store "${name}" starts with "${prefix}"; tables: ${named(tableIds)}; values: ${named(valueIds)}`,
							);
						}
						return {
							tables: Object.fromEntries(tables.map((id) => [id, store.getRowCount(id)])),
							values,
						};
					}

					if (!store.hasTable(table)) {
						const tableIds = store.getTableIds();
						throw new Error(
							tableIds.length === 0
								? `store "${name}" has no tables, so there is no "${table}"`
								: `store "${name}" has no table "${table}"; it has ${named(tableIds)}`,
						);
					}

					const rowIds = store.getRowIds(table);
					if (row !== undefined) {
						if (!store.hasRow(table, row)) {
							throw new Error(
								`table "${table}" has no row "${row}"; it has ${rowIds.length} rows: ${named(rowIds)}`,
							);
						}
						return store.getRow(table, row);
					}

					const matching = rowIds.filter(startsWith);
					if (prefix !== undefined && matching.length === 0) {
						throw new Error(
							`no row in table "${table}" starts with "${prefix}"; it has ${rowIds.length} rows: ${named(rowIds)}`,
						);
					}
					return {
						total: matching.length,
						rows: Object.fromEntries(
							matching.slice(0, limit ?? defaultLimit).map((id) => [id, store.getRow(table, id)]),
						),
					};
				}),
		},
	});
}
