/**
 * Which branches of a result the console shows open. The tree is plain JSON, so a
 * branch is identified by its path from the root. A level sets the default for
 * every branch; a click on one branch overrides that default until the next level
 * is picked.
 */

export type Path = (string | number)[];

export type Openness = { level: number; overrides: ReadonlyMap<string, boolean> };

/** A path as a map key. JSON keeps `["a.b"]` and `["a", "b"]` apart, which a dot would not. */
export const keyOf = (path: Path): string => JSON.stringify(path);

export const isBranch = (value: unknown): value is object =>
	typeof value === "object" && value !== null;

export function childrenOf(value: object): [string | number, unknown][] {
	return Array.isArray(value)
		? value.map((child, index) => [index, child])
		: Object.entries(value);
}

/** Branches nest this many levels deep; a leaf at the root is depth 0. */
export function depthOf(value: unknown): number {
	if (!isBranch(value)) return 0;
	let deepest = 0;
	for (const [, child] of childrenOf(value)) deepest = Math.max(deepest, depthOf(child));
	return deepest + 1;
}

/** The branch at `path` is open when it sits above `level`, unless someone clicked it. */
export function isOpen({ level, overrides }: Openness, path: Path): boolean {
	return overrides.get(keyOf(path)) ?? path.length < level;
}

/** Opens or closes one branch and leaves the rest to their level. */
export function toggle(openness: Openness, path: Path): Openness {
	const overrides = new Map(openness.overrides);
	overrides.set(keyOf(path), !isOpen(openness, path));
	return { ...openness, overrides };
}

/** Shows the branches above `level` and hides the rest, forgetting every click. */
export const atLevel = (level: number): Openness => ({ level, overrides: new Map() });

/** One line standing in for a closed branch: `{ id, title, … }` or `[ 12 items ]`. */
export function summaryOf(value: object): string {
	if (Array.isArray(value)) {
		return `[ ${value.length} ${value.length === 1 ? "item" : "items"} ]`;
	}
	const keys = Object.keys(value);
	if (keys.length === 0) return "{}";
	const shown = keys.slice(0, 3).join(", ");
	return `{ ${shown}${keys.length > 3 ? `, … +${keys.length - 3}` : ""} }`;
}
