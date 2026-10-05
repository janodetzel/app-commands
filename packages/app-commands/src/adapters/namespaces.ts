/**
 * The namespace each built-in adapter registers under unless it is given one.
 * Every adapter reads its default from here, and `checkUiCallers` exempts all of
 * them, so an adapter added later cannot be missed. Imports nothing.
 */
export const ADAPTER_NAMESPACES = {
	apollo: "apollo",
	keyValue: "storage",
	navigation: "nav",
	tinybase: "tinybase",
	zustand: "store",
} as const;
