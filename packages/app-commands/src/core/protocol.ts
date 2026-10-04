/**
 * Name of the Expo dev tools plugin. Both sides address messages with it.
 *
 * This is a wire value, not the package name, and the two are deliberately
 * decoupled: renaming the npm package must not require every dev build on a
 * simulator to be rebuilt in lockstep. It was changed from "agent-bridge" when
 * the package became `@janodetzel/app-commands`.
 *
 * PROTOCOL_VERSION was deliberately not bumped for that change. The version is
 * only checked once a message routes, and a plugin-name mismatch stops routing
 * before the handshake - so a stale build fails as a connection timeout (CLI
 * exit code 2) either way, and a bump would not have made it louder.
 */
export const PLUGIN_NAME = "commands";

/** Bumped whenever the shape of a request or a response changes. */
export const PROTOCOL_VERSION = 1;

/**
 * Where the web transport's dev server plugin listens for the CLI and the MCP
 * server: a POST whose body is a {@link Request} and whose answer is the
 * {@link Response}. Wire values, like PLUGIN_NAME, kept apart from the package name.
 */
export const WEB_ENDPOINT = "/__app-commands";

/**
 * The custom events a page and the dev server exchange over Vite's HMR channel:
 * the plugin sends a request to the page and the page answers on the second.
 */
export const WEB_REQUEST_EVENT = "app-commands:request";
export const WEB_RESPONSE_EVENT = "app-commands:response";

/** Message method the CLI and the web UI send on. */
export const REQUEST_MESSAGE = "request";

/** Message method the app answers on. */
export const RESPONSE_MESSAGE = "response";

type RequestBase = {
	/** Unique per request. A client resolves its pending call by this id. */
	id: string;
	/** Identifies the sending client. Every client drops responses addressed to another one. */
	clientId: string;
	protocolVersion: number;
};

export type CommandsRequest = RequestBase & { cmd: "commands" };

export type RunRequest = RequestBase & {
	cmd: "run";
	command: string;
	args?: unknown;
	timeoutMs?: number;
};

export type Request = CommandsRequest | RunRequest;

/** One command as the app describes it. `args` is the JSON Schema of its arguments. */
export type CommandInfo = { name: string; description: string; args: object };

export type ErrorCode =
	| "UNKNOWN_COMMAND"
	| "INVALID_ARGS"
	| "COMMAND_FAILED"
	| "TIMEOUT"
	| "NOT_SERIALIZABLE"
	| "PROTOCOL_MISMATCH";

export type Response = {
	id: string;
	clientId: string;
	protocolVersion: number;
} & (
	| { ok: true; result: unknown; durationMs?: number }
	| { ok: false; error: string; code: ErrorCode; issues?: unknown[] }
);
