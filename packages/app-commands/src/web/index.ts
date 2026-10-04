import type { Registry } from "../core/command";
import type { HandleOptions } from "../core/handle";
import { REQUEST_MESSAGE, WEB_REQUEST_EVENT, WEB_RESPONSE_EVENT } from "../core/protocol";
import { attachAppCommands, type BridgeClient } from "../expo/attach";

/**
 * The part of Vite's `import.meta.hot` the transport uses. Pass `import.meta.hot`
 * itself: it is `undefined` outside the dev server, which is how a production
 * build drops the transport (see {@link attachWebCommands}).
 */
export type HotChannel = {
	on(event: string, listener: (data: unknown) => void): void;
	off?(event: string, listener: (data: unknown) => void): void;
	send(event: string, data?: unknown): void;
};

/**
 * Answers the CLI's and the MCP server's requests from this page, over the HMR
 * channel the Vite dev server already holds open, until the returned function is
 * called. Call it once, in the browser, from the client entry:
 *
 * ```ts
 * if (import.meta.hot) {
 *   const [{ attachWebCommands }, { commandRegistry }] = await Promise.all([
 *     import("@janodetzel/app-commands/web"),
 *     import("./app/commands"),
 *   ]);
 *   attachWebCommands(import.meta.hot, commandRegistry);
 * }
 * ```
 *
 * The `if` is what keeps the transport out of a release build: Vite replaces
 * `import.meta.hot` with `undefined` there, so the block and both dynamic imports
 * are dead code and neither chunk is emitted. Written any other way - a static
 * import, a guard that is not `import.meta.hot` - the handler can ship to users.
 *
 * The transport accepts any valid command from the dev server's plugin, so it is
 * a remote control for the page: dev servers only, never a deployed build.
 */
export function attachWebCommands(
	hot: HotChannel,
	registry: Registry,
	opts?: HandleOptions,
): () => void {
	// The handler is the one the Expo transport uses. It speaks a two-method
	// contract, so this maps the protocol's messages onto Vite's custom events.
	const eventOf = (method: string) =>
		method === REQUEST_MESSAGE ? WEB_REQUEST_EVENT : WEB_RESPONSE_EVENT;

	const client: BridgeClient = {
		addMessageListener(method, listener) {
			const event = eventOf(method);
			let attached = true;
			// `off` is missing on older Vite clients; the flag keeps a detached
			// listener quiet either way.
			const wrapped = (data: unknown) => {
				if (attached) listener(data);
			};
			hot.on(event, wrapped);
			return {
				remove: () => {
					attached = false;
					hot.off?.(event, wrapped);
				},
			};
		},
		sendMessage(method, params) {
			hot.send(eventOf(method), params);
		},
	};

	return attachAppCommands(client, registry, opts);
}
