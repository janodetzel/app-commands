import path from "node:path";

export const DEFAULT_FEATURES_DIR = "src/features";

export const toPosix = (filePath) => filePath.split(path.sep).join("/");

/**
 * Locates a file inside a feature folder: `<…>/<featuresDir>/<feature>/<rest>`.
 * Returns null when the file is not in one, which is how every rule here opts
 * out of the files it has nothing to say about.
 */
export function featureOf(filename, featuresDir = DEFAULT_FEATURES_DIR) {
	const marker = `/${featuresDir.replace(/^\/+|\/+$/g, "")}/`;
	const posix = toPosix(filename);
	const at = posix.lastIndexOf(marker);
	if (at === -1) return null;

	const [feature, ...rest] = posix.slice(at + marker.length).split("/");
	if (!feature) return null;

	// `file` is empty when the path is the feature folder itself, which is what an
	// import of `../todos` resolves to. Callers that need a file check for it.
	return { feature, file: rest.join("/"), root: posix.slice(0, at + marker.length) };
}

/** `api.ts` -> `api`, `NewsScreen.tsx` -> `NewsScreen`. */
export function stem(file) {
	const base = file.slice(file.lastIndexOf("/") + 1);
	const dot = base.indexOf(".");
	return dot === -1 ? base : base.slice(0, dot);
}

/** `todos.test.ts`, `todos.spec.tsx`, or anything under `__tests__/`. */
export function isTestFile(file) {
	return /(^|\/)__tests__\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
}

/**
 * A logic file is one a command has to be able to call from outside React.
 *
 * Every file in a feature folder is one, at any depth, except tests: screens
 * live outside `src/features/`, so nothing inside it needs React. A nested
 * sub-feature (`profile/settings/feature.ts`) is covered the same way.
 * `logicFiles` narrows the check to those file names, for an app that still
 * keeps its screens next to the logic.
 */
export function isLogicFile(filename, options = {}) {
	const found = featureOf(filename, options.featuresDir ?? DEFAULT_FEATURES_DIR);
	if (!found || !found.file || isTestFile(found.file)) return false;
	return options.logicFiles ? options.logicFiles.includes(stem(found.file)) : true;
}

/**
 * Where an app keeps its UI, relative to the repository root. `src/app` is left
 * out: it is where the app starts - the composition root and root component in a
 * React Navigation app, the layouts in an Expo Router one - and loading the
 * stores at startup belongs there.
 */
export const DEFAULT_UI_DIRS = ["src/screens", "src/components", "src/hooks", "src/navigation"];

/**
 * A UI file is any file under one of `uiDirs`, at any depth, except tests. The
 * UI is a client of the features, like the command registry, so it changes
 * state the way the registry does: by calling a command.
 */
export function isUiFile(filename, options = {}) {
	const posix = toPosix(filename);
	if (isTestFile(posix)) return false;
	const dirs = options.uiDirs ?? DEFAULT_UI_DIRS;
	return dirs.some((dir) => posix.includes(`/${dir.replace(/^\/+|\/+$/g, "")}/`));
}

/** Named `store`, wherever it lives. The only place `set` may be called. */
export function isStoreFile(filename) {
	return stem(toPosix(filename)) === "store";
}
