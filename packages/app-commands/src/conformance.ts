import { ADAPTER_NAMESPACES } from "./adapters/namespaces";
import { lookup, type Registry } from "./core/command";
import { toJsonSafe } from "./core/serialize";

/** One thing wrong with one command, in the words a reader needs to fix it. */
export type ConformanceProblem = { command: string; problem: string };

export type ConformanceOptions = {
	/**
	 * Arguments for the commands whose results should be round-tripped, keyed by
	 * command name.
	 *
	 * The round-trip check is the only one that has to *run* a command, and a
	 * registry is full of mutations - a suite that called every command would
	 * wipe the app's data to assert a serialization property. So this check is
	 * opt-in per command: name the read-only ones here. Commands with no sample
	 * are still covered by every other check.
	 */
	samples?: Record<string, unknown>;
};

/**
 * Checks a registry against the properties an agent depends on, and returns what
 * is wrong. An empty array means the registry conforms.
 *
 * Returning problems rather than throwing keeps this usable from any test
 * runner, which is the point: it ships in the package so an app can assert
 * against its own registry without copying the rules.
 */
export async function checkRegistry(
	registry: Registry,
	opts: ConformanceOptions = {},
): Promise<ConformanceProblem[]> {
	const problems: ConformanceProblem[] = [];
	const report = (command: string, problem: string) => problems.push({ command, problem });

	// `buildRegistry` throws on a duplicate key, but a registry assembled any
	// other way - an object literal, a merge in app code - has no such guard, and
	// a shadowed command is invisible from the outside.
	const seen = new Set<string>();

	for (const [name, command] of Object.entries(registry)) {
		if (seen.has(name)) report(name, "appears twice in the registry");
		seen.add(name);

		if (!NAME_PATTERN.test(name)) {
			report(name, `is not a <namespace>.<name> key matching ${NAME_PATTERN.source}`);
		}

		const description = command.description ?? "";
		if (description.trim() === "") {
			report(name, "has no description; an agent cannot tell what it does or does not do");
		} else if (description.length <= name.length) {
			// Principle 8: a description generated from the method name prevents
			// nothing, and it is always about as short as the name.
			report(
				name,
				`has a description no longer than its own name (${description.length} chars), which means it was almost certainly generated from the name`,
			);
		}

		problems.push(...schemaProblems(name, command.jsonSchema));

		// `parse` is the command's only guard. One that accepts anything hands
		// unvalidated input to the handler and reports a type error as a crash.
		const rejected = await command.parse(WRONG_INPUT);
		if (rejected.ok) {
			report(name, "accepts a deliberately wrong input instead of rejecting it");
		} else if (!Array.isArray(rejected.issues) || rejected.issues.length === 0) {
			report(name, "rejects a wrong input but reports no issues explaining why");
		}
	}

	for (const [name, args] of Object.entries(opts.samples ?? {})) {
		const command = lookup(registry, name);
		if (!command) {
			report(name, "has a sample in the conformance options but is not in the registry");
			continue;
		}
		problems.push(...(await roundTripProblems(name, command.run, args)));
	}

	return problems;
}

/**
 * Commands are addressed as `<namespace>.<name>`; the namespace is the feature.
 * A feature nested inside another adds a segment: `profile.settings.setUnits`.
 */
const NAME_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;

/**
 * Deliberately wrong for every plausible schema: an argument object is expected,
 * and this is a primitive with no fields at all.
 */
const WRONG_INPUT = "__not_a_valid_argument_object__";

/**
 * A structural check, not full JSON Schema validation - the core has no
 * validation library and the conformance helper ships with it, so pulling one in
 * here would undo principle 10 to test it. This catches what actually goes
 * wrong: a schema that is not an object, or one that does not describe an
 * argument object, which is what the CLI turns into flags.
 */
function schemaProblems(name: string, schema: unknown): ConformanceProblem[] {
	if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
		return [{ command: name, problem: "has a jsonSchema that is not a JSON Schema object" }];
	}

	const problems: ConformanceProblem[] = [];
	const type = (schema as { type?: unknown }).type;
	if (type !== undefined && type !== "object") {
		problems.push({
			command: name,
			problem: `describes its arguments as "${String(type)}" rather than an object, so the CLI has no flags to derive`,
		});
	}

	try {
		JSON.stringify(schema);
	} catch {
		problems.push({
			command: name,
			problem: "has a jsonSchema that cannot be serialized, so the command list cannot include it",
		});
	}

	return problems;
}

/**
 * Every result crosses the wire as JSON. `toJsonSafe` is what the transport
 * applies, so this runs the same conversion and then the round trip it promises.
 */
async function roundTripProblems(
	name: string,
	run: (args: unknown) => Promise<unknown>,
	args: unknown,
): Promise<ConformanceProblem[]> {
	let result: unknown;
	try {
		result = await run(args);
	} catch (e) {
		return [
			{
				command: name,
				problem: `failed on its conformance sample: ${e instanceof Error ? e.message : String(e)}`,
			},
		];
	}

	const safe = toJsonSafe(result);
	if (!safe.ok) {
		return [
			{
				command: name,
				problem: `returns a value JSON cannot carry at ${safe.path}: ${safe.reason}`,
			},
		];
	}

	const text = JSON.stringify(safe.value);
	if (text === undefined) {
		return [{ command: name, problem: "returns a value that JSON.stringify drops entirely" }];
	}
	if (JSON.stringify(JSON.parse(text)) !== text) {
		return [{ command: name, problem: "returns a value that does not survive a JSON round trip" }];
	}

	return [];
}

export type UiCallersOptions = {
	/**
	 * The UI's source text, one entry per file: the screens, their components and
	 * their hooks. In a test, read it with the bundler's glob, for example
	 * `import.meta.glob("../src/screens/**\/*.tsx", { query: "?raw", import: "default", eager: true })`,
	 * which needs no `fs` and so no Node types in a React Native project.
	 */
	sources: readonly string[] | Readonly<Record<string, string>>;
	/**
	 * Namespaces whose commands have no control by design. Defaults to the
	 * built-in adapters' own namespaces: `apollo`, `nav`, `storage`, `store` and
	 * `tinybase`. Passing a list replaces the default, so add a namespace the app
	 * gave an adapter with its `namespace` option to `defaultExempt`.
	 */
	exempt?: readonly string[];
};

/** The namespaces the built-in adapters register under by default. */
export const defaultExempt: readonly string[] = [...new Set(Object.values(ADAPTER_NAMESPACES))];

/**
 * Checks that every feature command has a caller in the UI, and returns the
 * ones that do not. An empty array means every command has its control.
 *
 * Principle 1 asks for a command behind every control. No tool can see a control
 * with no command, but the other direction is checkable: a command named after a
 * control that no screen calls is dead, or something an agent can do that no
 * user can, and an agent's check through it proves nothing about the app.
 *
 * A call is found by its text. A screen calls a command through the feature
 * instance the registry holds, so `profile.settings.unitButtonTapped` is called
 * as `profileFeature.settings.unitButtonTapped(`: the check looks for
 * `.settings.unitButtonTapped(`. A call through an alias or a destructured
 * variable is not found; call the command through its instance. A command named
 * after its control does not collide with unrelated code, but a bare name such
 * as `add` matches `set.add(` and passes.
 */
export function checkUiCallers(registry: Registry, opts: UiCallersOptions): ConformanceProblem[] {
	const files = Array.isArray(opts.sources) ? opts.sources : Object.values(opts.sources);
	const text = files.join("\n");
	const exempt = new Set(opts.exempt ?? defaultExempt);
	const problems: ConformanceProblem[] = [];

	for (const name of Object.keys(registry)) {
		const [namespace, ...path] = name.split(".");
		if (exempt.has(namespace!)) continue;
		const call = `.${path.join(".")}(`;
		if (!text.includes(call)) {
			problems.push({
				command: name,
				problem: `has no caller in the UI: no screen, component or hook contains \`${call}\`. A command named after a control needs that control, or it is dead or reachable only by an agent`,
			});
		}
	}
	return problems;
}
