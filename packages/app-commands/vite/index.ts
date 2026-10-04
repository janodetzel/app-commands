import {
	PROTOCOL_VERSION,
	WEB_ENDPOINT,
	WEB_REQUEST_EVENT,
	WEB_RESPONSE_EVENT,
	type Request,
	type Response,
} from "../src/core/protocol";

/**
 * The parts of Node's request and response the endpoint touches. This package's
 * `src` is compiled without Node's types, and structural types keep it that way:
 * `IncomingMessage` and `ServerResponse` are assignable to these.
 */
export type RequestLike = {
	method?: string;
	url?: string;
	headers: Record<string, string | string[] | undefined>;
	on(event: "data", listener: (chunk: Uint8Array) => void): unknown;
	on(event: "end", listener: () => void): unknown;
	on(event: "error", listener: (error: Error) => void): unknown;
};

export type ResponseLike = {
	statusCode: number;
	readonly headersSent: boolean;
	setHeader(name: string, value: string): unknown;
	end(body?: string): unknown;
	on(event: "close", listener: () => void): unknown;
};

/**
 * The parts of Vite's dev server the plugin uses. A real `ViteDevServer` is
 * assignable to it, and so is the `Plugin` this returns to Vite's, so the package
 * imports nothing from `vite`.
 */
export type DevServerLike = {
	middlewares: {
		use(
			path: string,
			handler: (req: RequestLike, res: ResponseLike, next: () => void) => void,
		): unknown;
	};
	ws: {
		/** The connected pages, oldest first. */
		clients?: Set<{ send(event: string, data: unknown): void }>;
		send(event: string, data: unknown): void;
		on(event: string, listener: (data: unknown) => void): unknown;
	};
};

export type AppCommandsPlugin = {
	name: string;
	/** Dev server only: the plugin is never part of `vite build`. */
	apply: "serve";
	configureServer(server: DevServerLike): void;
};

export type AppCommandsPluginOptions = {
	/** Where the CLI and the MCP server POST to. Defaults to {@link WEB_ENDPOINT}. */
	path?: string;
	/** Largest request body accepted, in bytes. Defaults to 1 MB. */
	maxBodyBytes?: number;
	/**
	 * How long a request waits for a page to answer before the endpoint gives up
	 * with a 504. Defaults to the command's own timeout plus a few seconds, or 2.5
	 * seconds for the command list.
	 */
	answerTimeoutMs?: number;
};

/** Headroom over a command's own timeout, kept under the client's reply grace. */
const RUN_GRACE_MS = 4_000;
const DEFAULT_RUN_TIMEOUT_MS = 10_000;
const COMMANDS_TIMEOUT_MS = 2_500;

/**
 * Connects the CLI and the MCP server to the page a Vite dev server is serving.
 *
 * ```ts
 * // vite.config.ts
 * import { appCommands } from "@janodetzel/app-commands/vite";
 * export default defineConfig({ plugins: [appCommands()] });
 * ```
 *
 * It adds one endpoint to the dev server: a POST carrying a request, answered with
 * the response once a page has handled it, which is `attachWebCommands` in the
 * browser. The page is reached through Vite's own HMR channel, so there is no
 * second socket and nothing to configure. With several tabs open the request goes
 * to the most recently connected one.
 *
 * The endpoint runs commands, so it is for the CLI and the MCP server and never
 * for a web page: it refuses any request a browser sent (an `Origin` or
 * `Sec-Fetch-Site` header), and Vite's host check covers DNS rebinding. It only
 * exists while the dev server runs.
 */
export function appCommands(options: AppCommandsPluginOptions = {}): AppCommandsPlugin {
	const path = options.path ?? WEB_ENDPOINT;
	const maxBodyBytes = options.maxBodyBytes ?? 1_000_000;

	return {
		name: "app-commands",
		apply: "serve",
		configureServer(server) {
			// A request waits here for the page's answer, keyed the way the client keys it.
			const waiting = new Map<string, (response: Response) => void>();

			server.ws.on(WEB_RESPONSE_EVENT, (data) => {
				const response = data as Response | null;
				if (!response || typeof response.id !== "string") return;
				const key = keyOf(response.clientId, response.id);
				const resolve = waiting.get(key);
				if (!resolve) return;
				waiting.delete(key);
				resolve(response);
			});

			server.middlewares.use(path, (req, res, next) => {
				if (req.url !== "/" && req.url !== "" && req.url !== undefined) return next();
				void handle(req, res).catch((e: unknown) =>
					reply(res, 500, { error: e instanceof Error ? e.message : String(e) }),
				);
			});

			async function handle(req: RequestLike, res: ResponseLike): Promise<void> {
				if (req.method !== "POST") {
					res.setHeader("Allow", "POST");
					return reply(res, 405, { error: "use POST" });
				}
				// A page is never a client of this endpoint. Browsers add these headers
				// to a cross-origin request and a script cannot remove them, so refusing
				// them keeps a web page from driving the app.
				if (req.headers.origin !== undefined || req.headers["sec-fetch-site"] !== undefined) {
					return reply(res, 403, {
						error: "this endpoint is for the CLI and the MCP server, not for a page",
					});
				}
				if (!/^application\/json\b/i.test([req.headers["content-type"]].flat()[0] ?? "")) {
					return reply(res, 415, { error: "send application/json" });
				}

				const body = await readBody(req, maxBodyBytes);
				if (body === null) {
					// The rest of the upload is not worth reading: answer and let Node close.
					res.setHeader("Connection", "close");
					return reply(res, 413, { error: "the request is too large" });
				}

				let request: Request;
				try {
					request = parseRequest(JSON.parse(body));
				} catch (e) {
					return reply(res, 400, { error: e instanceof Error ? e.message : String(e) });
				}

				if ((server.ws.clients?.size ?? 1) === 0) {
					return reply(res, 503, {
						error: "no page is connected to the dev server. Open the app in a browser first.",
					});
				}

				const timeoutMs =
					options.answerTimeoutMs ??
					(request.cmd === "run"
						? (request.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS) + RUN_GRACE_MS
						: COMMANDS_TIMEOUT_MS);
				const key = keyOf(request.clientId, request.id);

				const answered = new Promise<Response | undefined>((resolve) => {
					const timer = setTimeout(() => {
						waiting.delete(key);
						resolve(undefined);
					}, timeoutMs);
					waiting.set(key, (response) => {
						clearTimeout(timer);
						resolve(response);
					});
				});
				// A closed connection means nobody is waiting for the answer any more.
				res.on("close", () => waiting.delete(key));

				// One page runs it: the most recently connected, which is the tab someone
				// just opened or reloaded. Sending to every tab would run a command with
				// side effects once per tab.
				const page = server.ws.clients ? [...server.ws.clients].at(-1) : undefined;
				if (page) page.send(WEB_REQUEST_EVENT, request);
				else server.ws.send(WEB_REQUEST_EVENT, request);

				const response = await answered;
				if (!response) {
					return reply(res, 504, {
						error: `no page answered within ${timeoutMs} ms. Is the page open, and does it call attachWebCommands?`,
					});
				}
				reply(res, 200, response);
			}
		},
	};
}

const keyOf = (clientId: unknown, id: string) => `${String(clientId)}:${id}`;

/** Checks the envelope only. The app validates the command and its arguments. */
function parseRequest(value: unknown): Request {
	const r = value as Partial<Request> & { cmd?: unknown };
	if (!r || typeof r !== "object") throw new Error("the body must be a JSON object");
	if (typeof r.id !== "string" || r.id === "") throw new Error("id must be a non-empty string");
	if (typeof r.clientId !== "string" || r.clientId === "") {
		throw new Error("clientId must be a non-empty string");
	}
	if (typeof r.protocolVersion !== "number") throw new Error("protocolVersion must be a number");
	if (r.cmd === "commands") return r as Request;
	if (r.cmd === "run" && typeof (r as { command?: unknown }).command === "string") {
		return r as Request;
	}
	throw new Error(
		`cmd must be "commands" or "run" with a command name, got ${JSON.stringify(r.cmd)}`,
	);
}

function readBody(req: RequestLike, maxBytes: number): Promise<string | null> {
	return new Promise((resolve, reject) => {
		const chunks: Uint8Array[] = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > maxBytes) {
				resolve(null);
				chunks.length = 0;
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			const bytes = new Uint8Array(size);
			let offset = 0;
			for (const chunk of chunks) {
				bytes.set(chunk, offset);
				offset += chunk.length;
			}
			resolve(new TextDecoder().decode(bytes));
		});
		req.on("error", reject);
	});
}

function reply(res: ResponseLike, status: number, body: unknown): void {
	if (res.headersSent) return;
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json");
	res.end(JSON.stringify(body));
}

export { PROTOCOL_VERSION };
