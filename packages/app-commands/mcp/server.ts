/**
 * An MCP server over the same client the CLI uses.
 *
 * Every app command becomes an MCP tool, built from the JSON Schema the app
 * reports, so an agent calls `todos_add` with typed arguments instead of shelling
 * out. Two tools are always present: `list` returns what the app has right now,
 * and `run` calls a command by name when the tool list has gone stale.
 *
 * Like the CLI, it connects per call and disconnects. The app keeps one client at a
 * time, so a server holding the socket open would drop a terminal running
 * `app-commands` and be dropped by it in turn.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

import type { CommandInfo } from "../src/core/protocol";
import { AppCommandsClient, ResponseError, type ClientOptions } from "../cli/client";
import { buildTools, differs, EMPTY_TOOL_MAP, type ToolDefinition, type ToolMap } from "./tools";

export type McpServerOptions = ClientOptions & {
	/** Passed to every command, so a slow app fails here the way it does in the CLI. */
	defaultTimeoutMs?: number;
};

const LIST_TOOL = "list";
const RUN_TOOL = "run";
const RESERVED = new Set([LIST_TOOL, RUN_TOOL]);

const UNREACHABLE_HINT =
	"Start Metro and the app in a simulator, or the Vite dev server with the page open, then try " +
	"again. On Metro only one CLI, web console, or MCP server can be attached at a time.";

const META_TOOLS: ToolDefinition[] = [
	{
		name: LIST_TOOL,
		description:
			"Lists every command the running app exposes, with the JSON Schema of its arguments. " +
			"Call it when the app was not running yet, or after reloading the app, to bring the " +
			"per-command tools in line with what the app has now.",
		inputSchema: { type: "object", properties: {} },
	},
	{
		name: RUN_TOOL,
		description:
			"Runs one command by its '<namespace>.<name>' name. The per-command tools are the " +
			"normal way in; use this one when a command is missing from the tool list.",
		inputSchema: {
			type: "object",
			properties: {
				command: { type: "string", description: "For example 'todos.add'." },
				args: { type: "object", description: "The command's arguments." },
				timeoutMs: { type: "number", description: "How long the app may take to answer." },
			},
			required: ["command"],
		},
	},
];

export function createServer(options: McpServerOptions = {}): Server {
	const server = new Server(
		{ name: "app-commands", version: "0.1.0" },
		{ capabilities: { tools: { listChanged: true } } },
	);

	const { defaultTimeoutMs, ...clientOptions } = options;
	let advertised: ToolMap = EMPTY_TOOL_MAP;

	async function withClient<T>(fn: (client: AppCommandsClient) => Promise<T>): Promise<T> {
		const client = await AppCommandsClient.connect(clientOptions);
		try {
			return await fn(client);
		} finally {
			client.close();
		}
	}

	/** Re-reads the command list. `notify` tells clients already holding a stale list. */
	async function refresh(notify: boolean): Promise<CommandInfo[]> {
		const commands = await withClient((client) => client.commands());
		const next = buildTools(commands, RESERVED);
		const changed = differs(next, advertised);
		advertised = next;
		if (changed && notify) await server.sendToolListChanged();
		return commands;
	}

	server.setRequestHandler(ListToolsRequestSchema, async () => {
		try {
			// The app is usually not running when a client starts the server. Falling back
			// to the two meta tools keeps `list` reachable, which is what brings the
			// rest of the list in.
			await refresh(false);
		} catch (e) {
			console.error(`app-commands: listing tools without the app: ${message(e)}`);
		}
		return { tools: [...META_TOOLS, ...advertised.tools] };
	});

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: args } = request.params;

		if (name === LIST_TOOL) {
			try {
				return ok(await refresh(true));
			} catch (e) {
				return failure(e);
			}
		}

		if (name === RUN_TOOL) {
			const call = (args ?? {}) as { command?: unknown; args?: unknown; timeoutMs?: unknown };
			if (typeof call.command !== "string" || call.command.length === 0) {
				return error({ error: "run needs a command name, for example 'todos.add'", code: "USAGE" });
			}
			return runCommand(
				call.command,
				call.args,
				typeof call.timeoutMs === "number" ? call.timeoutMs : undefined,
			);
		}

		const command = advertised.commandOf.get(name);
		if (!command) {
			return error({
				error: `unknown tool "${name}". Call "list" to see what the app exposes now.`,
				code: "UNKNOWN_COMMAND",
			});
		}
		return runCommand(command, args, undefined);
	});

	async function runCommand(
		command: string,
		args: unknown,
		timeoutMs: number | undefined,
	): Promise<CallToolResult> {
		try {
			const response = await withClient((client) =>
				client.run(command, args ?? {}, timeoutMs ?? defaultTimeoutMs),
			);
			if (response.ok) return ok(response.result);
			return error({
				error: response.error,
				code: response.code,
				...(response.issues ? { issues: response.issues } : {}),
				...(response.code === "PROTOCOL_MISMATCH"
					? {
							hint:
								"The MCP server and the app disagree on the protocol. Rebuild with " +
								"`pnpm --filter @janodetzel/app-commands build` and reload the app.",
						}
					: {}),
			});
		} catch (e) {
			return failure(e);
		}
	}

	return server;
}

/** One JSON document per call, the way the CLI writes one to stdout. */
function ok(result: unknown): CallToolResult {
	return { content: [{ type: "text", text: JSON.stringify(result ?? null, null, 2) }] };
}

function error(payload: Record<string, unknown>): CallToolResult {
	return {
		content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
		isError: true,
	};
}

/** A throw is either the app answering a failure, or the app being out of reach. */
function failure(e: unknown): CallToolResult {
	if (e instanceof ResponseError) {
		return error({ error: e.response.error, code: e.response.code });
	}
	return error({ error: message(e), code: "CONNECTION_FAILED", hint: UNREACHABLE_HINT });
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
