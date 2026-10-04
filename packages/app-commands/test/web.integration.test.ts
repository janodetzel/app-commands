import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppCommandsClient, ConnectionError } from "../cli/client";
import type { Registry } from "../src/core/command";
import { PROTOCOL_VERSION, WEB_REQUEST_EVENT, WEB_RESPONSE_EVENT } from "../src/core/protocol";
import { attachWebCommands, type HotChannel } from "../src/web";
import { openPage, startDevServer, type DevServer, type FakePage } from "./fake-page";

const execFileAsync = promisify(execFile);
const CLI = path.join(__dirname, "..", "build", "cli", "index.js");
const MCP = path.join(__dirname, "..", "build", "mcp", "index.js");

let runs = 0;
const registry: Registry = {
	"demo.echo": {
		description: "Returns its arguments.",
		jsonSchema: {
			type: "object",
			properties: { value: { type: "string", minLength: 1 } },
			required: ["value"],
		},
		parse: (input) => {
			const value = (input as { value?: unknown })?.value;
			return typeof value === "string" && value.length > 0
				? { ok: true, value: { value } }
				: { ok: false, issues: [{ path: ["value"], message: "expected a non-empty string" }] };
		},
		run: async (args) => {
			runs++;
			return args;
		},
	},
	"demo.fail": {
		description: "Always throws.",
		jsonSchema: { type: "object", properties: {} },
		parse: (input) => ({ ok: true, value: input }),
		run: async () => {
			throw new Error("demo.fail always throws");
		},
	},
};

let dev: DevServer;
const pages: FakePage[] = [];
const clients: AppCommandsClient[] = [];

async function page(reg?: Registry) {
	const opened = await openPage(dev, reg);
	pages.push(opened);
	return opened;
}

async function client(url = dev.url) {
	const connected = await AppCommandsClient.connect({ url, handshakeTimeoutMs: 2_000 });
	clients.push(connected);
	return connected;
}

beforeEach(async () => {
	runs = 0;
	dev = await startDevServer();
});

afterEach(async () => {
	for (const c of clients.splice(0)) c.close();
	for (const p of pages.splice(0)) p.close();
	await dev.close();
});

describe("the web transport through a Vite dev server", () => {
	it("gets the command list from the page", async () => {
		await page(registry);
		const commands = await (await client()).commands();

		expect(commands.map((c) => c.name)).toEqual(["demo.echo", "demo.fail"]);
		expect(commands[0]!.args).toMatchObject({ type: "object" });
	});

	it("runs a command in the page and returns its result", async () => {
		await page(registry);
		const response = await (await client()).run("demo.echo", { value: "hi" });

		expect(response).toMatchObject({ ok: true, result: { value: "hi" } });
		expect(runs).toBe(1);
	});

	it("reports a command that fails, and one that is not there, as the app does", async () => {
		await page(registry);
		const c = await client();

		expect(await c.run("demo.fail", {})).toMatchObject({
			ok: false,
			code: "COMMAND_FAILED",
			error: "demo.fail always throws",
		});
		expect(await c.run("demo.nope", {})).toMatchObject({ ok: false, code: "UNKNOWN_COMMAND" });
		expect(await c.run("demo.echo", { value: "" })).toMatchObject({
			ok: false,
			code: "INVALID_ARGS",
		});
	});

	it("fails and says so when no page is connected", async () => {
		await expect((await client()).commands()).rejects.toThrow(/no page is connected/);
	});

	it("fails when a page is open but nothing answers", async () => {
		await dev.close();
		dev = await startDevServer({ answerTimeoutMs: 150 });
		await page(); // connected, but never calls attachWebCommands

		await expect((await client()).commands()).rejects.toThrow(
			/no page answered within 150 ms.*attachWebCommands/,
		);
	});

	it("goes quiet again when the page closes", async () => {
		const open = await page(registry);
		const c = await client();
		expect(await c.run("demo.echo", { value: "hi" })).toMatchObject({ ok: true });

		open.close();
		await new Promise((resolve) => setTimeout(resolve, 100));

		await expect(c.run("demo.echo", { value: "again" })).rejects.toThrow(/no page is connected/);
	});

	it("runs a command once with two tabs open, in the most recent one", async () => {
		let first = 0;
		let second = 0;
		const counted = (counter: () => void): Registry => ({
			"demo.echo": {
				...registry["demo.echo"]!,
				run: async (args) => {
					counter();
					return args;
				},
			},
		});
		await page(counted(() => first++));
		await new Promise((resolve) => setTimeout(resolve, 50));
		await page(counted(() => second++));

		await (await client()).run("demo.echo", { value: "hi" });

		expect({ first, second }).toEqual({ first: 0, second: 1 });
	});

	it("serves clients that connect at the same time, unlike Metro's single connection", async () => {
		await page(registry);
		const [a, b] = await Promise.all([client(), client()]);

		const [ra, rb] = await Promise.all([
			a.run("demo.echo", { value: "a" }),
			b.run("demo.echo", { value: "b" }),
		]);

		expect(ra).toMatchObject({ ok: true, result: { value: "a" } });
		expect(rb).toMatchObject({ ok: true, result: { value: "b" } });
	});

	it("says what is wrong when the URL is not a dev server with the plugin", async () => {
		await expect((await client("http://127.0.0.1:1")).commands()).rejects.toThrow(
			/cannot reach http:\/\/127.0.0.1:1/,
		);
		await expect(AppCommandsClient.connect({ url: "not a url" })).rejects.toThrow(ConnectionError);
	});
});

describe("the endpoint", () => {
	type Reply = { status: number; headers: http.IncomingHttpHeaders; body: string };

	const send = (
		options: { method?: string; headers?: Record<string, string>; body?: string; path?: string },
		target = dev,
	) =>
		new Promise<Reply>((resolve, reject) => {
			const req = http.request(
				{
					host: "127.0.0.1",
					port: target.port,
					path: options.path ?? "/__app-commands",
					method: options.method ?? "POST",
					headers: { Host: `127.0.0.1:${target.port}`, ...options.headers },
				},
				(res) => {
					let body = "";
					res.on("data", (chunk) => (body += chunk));
					res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body }));
				},
			);
			req.on("error", reject);
			req.end(options.body);
		});

	const json = { "Content-Type": "application/json" };
	const valid = JSON.stringify({
		id: "1",
		clientId: "c",
		protocolVersion: PROTOCOL_VERSION,
		cmd: "commands",
	});

	it("only takes a POST", async () => {
		const res = await send({ method: "GET" });

		expect(res.status).toBe(405);
		expect(res.headers.allow).toBe("POST");
	});

	it("refuses a request a browser sent, because a page must not drive the app", async () => {
		await page(registry);

		for (const header of [{ Origin: "http://evil.example" }, { "Sec-Fetch-Site": "cross-site" }]) {
			const res = await send({ headers: { ...json, ...header }, body: valid });
			expect(res.status).toBe(403);
		}
		expect(runs).toBe(0);
	});

	it("wants application/json, which a cross-origin page cannot send without a preflight", async () => {
		const res = await send({ headers: { "Content-Type": "text/plain" }, body: valid });

		expect(res.status).toBe(415);
	});

	it("rejects a body that is not a request", async () => {
		for (const body of [
			"not json",
			"[]",
			JSON.stringify({ clientId: "c", protocolVersion: 1, cmd: "commands" }),
			JSON.stringify({ id: "1", clientId: "c", cmd: "commands" }),
			JSON.stringify({ id: "1", clientId: "c", protocolVersion: 1, cmd: "explode" }),
			JSON.stringify({ id: "1", clientId: "c", protocolVersion: 1, cmd: "run" }),
		]) {
			expect((await send({ headers: json, body })).status).toBe(400);
		}
	});

	it("refuses a body over the limit", async () => {
		await dev.close();
		dev = await startDevServer({ maxBodyBytes: 50 });
		const res = await send({ headers: json, body: valid.padEnd(200, " ") });

		expect(res.status).toBe(413);
	});

	it("can be mounted on another path, and leaves the default one alone", async () => {
		await dev.close();
		dev = await startDevServer({ path: "/_agent" });
		await page(registry);

		expect((await send({ headers: json, body: valid, path: "/_agent" })).status).toBe(200);
		expect((await send({ headers: json, body: valid })).status).not.toBe(200);
	});
});

describe("attachWebCommands", () => {
	/** A hot channel that records what the page sends and lets a test fire what the server would. */
	const channel = (opts: { withOff: boolean }) => {
		const listeners = new Map<string, Set<(data: unknown) => void>>();
		const sent: { event: string; data: unknown }[] = [];
		const hot: HotChannel = {
			on: (event, listener) =>
				void listeners.set(event, (listeners.get(event) ?? new Set()).add(listener)),
			send: (event, data) => void sent.push({ event, data }),
			...(opts.withOff
				? {
						off: (event: string, listener: (data: unknown) => void) =>
							void listeners.get(event)?.delete(listener),
					}
				: {}),
		};
		const fire = (event: string, data: unknown) => {
			for (const listener of listeners.get(event) ?? []) listener(data);
		};
		return { hot, sent, fire, listenerCount: (event: string) => listeners.get(event)?.size ?? 0 };
	};

	const request = (id: string) => ({
		id,
		clientId: "c",
		protocolVersion: PROTOCOL_VERSION,
		cmd: "run",
		command: "demo.echo",
		args: { value: id },
	});
	const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

	it("answers a request on the response event", async () => {
		const { hot, sent, fire } = channel({ withOff: true });
		attachWebCommands(hot, registry);
		fire(WEB_REQUEST_EVENT, request("1"));
		await settle();

		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({
			event: WEB_RESPONSE_EVENT,
			data: { id: "1", clientId: "c", ok: true, result: { value: "1" } },
		});
	});

	it("stops answering once detached, with or without Vite's off()", async () => {
		for (const withOff of [true, false]) {
			const { hot, sent, fire, listenerCount } = channel({ withOff });
			const detach = attachWebCommands(hot, registry);
			expect(listenerCount(WEB_REQUEST_EVENT)).toBe(1);

			detach();
			fire(WEB_REQUEST_EVENT, request("late"));
			await settle();

			expect(sent).toEqual([]);
			expect(listenerCount(WEB_REQUEST_EVENT)).toBe(withOff ? 0 : 1);
		}
	});
});

describe("the CLI and the MCP server with --url", () => {
	const built = (file: string) => {
		if (!existsSync(file)) {
			throw new Error(
				`${file} is missing. Run \`pnpm --filter @janodetzel/app-commands build\` first.`,
			);
		}
	};

	it("lists and runs commands from the CLI", async () => {
		built(CLI);
		await page(registry);

		const list = await execFileAsync("node", [CLI, "--url", dev.url, "list"]);
		expect((JSON.parse(list.stdout) as { name: string }[]).map((c) => c.name)).toEqual([
			"demo.echo",
			"demo.fail",
		]);

		const run = await execFileAsync("node", [CLI, "--url", dev.url, "demo.echo", "--value", "hi"]);
		expect(JSON.parse(run.stdout)).toEqual({ value: "hi" });
	});

	it("exits 2 with CONNECTION_FAILED when no page is connected", async () => {
		built(CLI);

		const result = await execFileAsync("node", [CLI, "--url", dev.url, "list"]).catch(
			(e: { code: number; stdout: string }) => e,
		);

		expect(result).toMatchObject({ code: 2 });
		expect(JSON.parse((result as { stdout: string }).stdout)).toMatchObject({
			code: "CONNECTION_FAILED",
			error: expect.stringContaining("no page is connected"),
		});
	});

	it("exposes the page's commands as tools, from --url or APP_COMMANDS_URL", async () => {
		built(MCP);
		await page(registry);

		for (const how of ["flag", "env"] as const) {
			const mcp = new Client({ name: "test", version: "0" });
			await mcp.connect(
				new StdioClientTransport({
					command: "node",
					args: how === "flag" ? [MCP, "--url", dev.url] : [MCP],
					env:
						how === "env"
							? ({ ...process.env, APP_COMMANDS_URL: dev.url } as Record<string, string>)
							: (process.env as Record<string, string>),
					stderr: "ignore",
				}),
			);
			try {
				const tools = (await mcp.listTools()).tools.map((t) => t.name);
				expect(tools).toContain("demo_echo");

				const result = await mcp.callTool({ name: "demo_echo", arguments: { value: how } });
				const text = (result.content as { text: string }[])[0]!.text;
				expect(JSON.parse(text)).toEqual({ value: how });
			} finally {
				await mcp.close();
			}
		}
	});
});
