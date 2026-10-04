import { randomUUID } from "node:crypto";

import {
	PLUGIN_NAME,
	PROTOCOL_VERSION,
	REQUEST_MESSAGE,
	RESPONSE_MESSAGE,
	WEB_ENDPOINT,
	type CommandInfo,
	type Request,
	type Response,
} from "../src/core/protocol";
import { BrowserPluginConnection } from "./wire/connection";

/** Reaching the app failed. The CLI turns this into exit code 2. */
export class ConnectionError extends Error {}

/** The app answered, and it answered a failure. The CLI reports its code verbatim. */
export class ResponseError extends Error {
	constructor(readonly response: Extract<Response, { ok: false }>) {
		super(`${response.code}: ${response.error}`);
	}
}

export type ClientOptions = {
	host?: string;
	port?: number;
	/**
	 * The base URL of a Vite dev server running the `app-commands` plugin, such as
	 * `http://localhost:5173`. When it is set the client uses the web transport and
	 * `host` and `port`, which address Metro, are ignored.
	 */
	url?: string;
	/** How long to wait for the socket, and for the app's answer to `commands`. */
	handshakeTimeoutMs?: number;
};

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 8081;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 3_000;
/** Headroom over the command's own timeout before the CLI stops waiting. */
const REPLY_GRACE_MS = 5_000;

/** A request without the envelope the client fills in. */
type RequestBody =
	{ cmd: "commands" } | { cmd: "run"; command: string; args?: unknown; timeoutMs?: number };

/** True for a protocol response, which is what the web endpoint answers when a page ran the request. */
function isResponse(value: unknown): value is Response {
	const r = value as Partial<Response> | null;
	return (
		typeof r === "object" &&
		r !== null &&
		typeof r.id === "string" &&
		typeof r.clientId === "string" &&
		typeof r.ok === "boolean"
	);
}

/**
 * The web transport: one POST per request to the Vite plugin's endpoint, which
 * hands it to the page and answers with the page's response. Nothing is held open
 * between calls, so unlike Metro's single dev tools connection any number of
 * clients can use it at once.
 */
class HttpTransport {
	private readonly endpoint: string;
	private readonly origin: string;
	private readonly abort = new AbortController();

	constructor(url: string) {
		let base: URL;
		try {
			base = new URL(url);
		} catch {
			throw new ConnectionError(`"${url}" is not a URL, such as http://localhost:5173`);
		}
		this.origin = base.origin;
		this.endpoint = new URL(WEB_ENDPOINT, base).toString();
	}

	async post(request: Request): Promise<Response> {
		let res: globalThis.Response;
		try {
			res = await fetch(this.endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(request),
				signal: this.abort.signal,
			});
		} catch (e) {
			throw new ConnectionError(
				`cannot reach ${this.origin}: ${e instanceof Error ? e.message : String(e)}`,
			);
		}

		const body: unknown = await res.json().catch(() => null);
		if (isResponse(body)) return body;

		const message = (body as { error?: unknown } | null)?.error;
		throw new ConnectionError(
			typeof message === "string"
				? message
				: res.status === 404
					? `${this.origin} has no ${WEB_ENDPOINT} endpoint. Is the appCommands() plugin in vite.config and the dev server running?`
					: `${this.origin} answered ${res.status} without a response`,
		);
	}

	close(): void {
		this.abort.abort();
	}
}

type Pending = {
	resolve: (response: Response) => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout;
};

export class AppCommandsClient {
	/** One per process. Every other client's responses are dropped. */
	readonly clientId = randomUUID();

	private readonly pending = new Map<string, Pending>();
	private terminated: ConnectionError | null = null;

	private constructor(
		private readonly connection: BrowserPluginConnection | null,
		private readonly http: HttpTransport | null,
		private readonly handshakeTimeoutMs: number,
	) {
		this.connection?.addMessageListener(RESPONSE_MESSAGE, (payload) => this.deliver(payload));
	}

	static async connect(options: ClientOptions = {}): Promise<AppCommandsClient> {
		if (options.url !== undefined) {
			return new AppCommandsClient(
				null,
				new HttpTransport(options.url),
				options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS,
			);
		}

		const host = options.host ?? DEFAULT_HOST;
		const port = options.port ?? DEFAULT_PORT;
		const handshakeTimeoutMs = options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;

		let client: AppCommandsClient;
		try {
			const connection = await BrowserPluginConnection.connect({
				devServer: `${host}:${port}`,
				pluginName: PLUGIN_NAME,
				connectTimeoutMs: handshakeTimeoutMs,
				onTerminated: (reason) => client?.onTerminated(reason),
			});
			client = new AppCommandsClient(connection, null, handshakeTimeoutMs);
		} catch (e) {
			throw new ConnectionError(
				`cannot reach Metro at ${host}:${port}: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
		return client;
	}

	/** Asks the app what it can do. A silent app means it is not running the bridge. */
	async commands(): Promise<CommandInfo[]> {
		const response = await this.send(
			{ cmd: "commands" },
			this.handshakeTimeoutMs,
			"the app did not answer. Is Metro running with the app connected, and does the app call useAppCommands?",
		);
		if (!response.ok) {
			throw new ResponseError(response);
		}
		return response.result as CommandInfo[];
	}

	async run(command: string, args: unknown, timeoutMs?: number): Promise<Response> {
		const replyTimeoutMs = (timeoutMs ?? 10_000) + REPLY_GRACE_MS;
		return this.send(
			{ cmd: "run", command, args, ...(timeoutMs === undefined ? {} : { timeoutMs }) },
			replyTimeoutMs,
			`the app did not answer "${command}" within ${replyTimeoutMs} ms`,
		);
	}

	close(): void {
		for (const [id, pending] of this.pending) {
			clearTimeout(pending.timer);
			this.pending.delete(id);
			pending.reject(new ConnectionError("the connection closed before the app answered"));
		}
		this.connection?.close();
		this.http?.close();
	}

	private send(body: RequestBody, timeoutMs: number, timeoutMessage: string): Promise<Response> {
		if (this.terminated) return Promise.reject(this.terminated);

		const id = randomUUID();
		const request: Request = {
			id,
			clientId: this.clientId,
			protocolVersion: PROTOCOL_VERSION,
			...body,
		};

		return new Promise<Response>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new ConnectionError(timeoutMessage));
			}, timeoutMs);

			this.pending.set(id, { resolve, reject, timer });
			if (this.http) {
				this.http.post(request).then(
					(response) => this.deliver(response),
					(e: unknown) => this.fail(id, e),
				);
			} else {
				this.connection!.sendMessage(REQUEST_MESSAGE, request);
			}
		});
	}

	/** Resolves the request a response answers. Metro forwards every message to every client. */
	private deliver(payload: unknown): void {
		const response = payload as Response;
		if (!response || response.clientId !== this.clientId) return;

		const pending = this.pending.get(response.id);
		if (!pending) return;
		this.pending.delete(response.id);
		clearTimeout(pending.timer);
		pending.resolve(response);
	}

	/** One request could not be answered. The transport itself may still be fine. */
	private fail(id: string, error: unknown): void {
		const pending = this.pending.get(id);
		if (!pending) return;
		this.pending.delete(id);
		clearTimeout(pending.timer);
		pending.reject(error instanceof ConnectionError ? error : new ConnectionError(String(error)));
	}

	private onTerminated(reason: string): void {
		this.terminated = new ConnectionError(reason);
		for (const [id, pending] of this.pending) {
			clearTimeout(pending.timer);
			this.pending.delete(id);
			pending.reject(this.terminated);
		}
	}
}
