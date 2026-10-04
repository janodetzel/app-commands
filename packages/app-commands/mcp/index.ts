#!/usr/bin/env node
/**
 * stdio entry point of the app-commands MCP server.
 *
 * stdout carries the MCP protocol and nothing else, which is why every diagnostic
 * here goes to stderr. The client module the server builds on is silent by design.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createServer, type McpServerOptions } from "./server";

const USAGE = `Usage:
  app-commands-mcp [--host <host>] [--port <port>] [--url <url>] [--timeout <ms>]

Speaks MCP over stdio and exposes the commands of the app running on Metro, or of
a web app when --url names its Vite dev server, such as http://localhost:5173. The
same settings can come from APP_COMMANDS_HOST, APP_COMMANDS_PORT, APP_COMMANDS_URL
and APP_COMMANDS_TIMEOUT.`;

function parseOptions(argv: string[]): McpServerOptions {
	if (argv.includes("--help") || argv.includes("-h")) {
		console.log(USAGE);
		process.exit(0);
	}

	const options: McpServerOptions = {};
	const host = process.env.APP_COMMANDS_HOST;
	const port = numeric(process.env.APP_COMMANDS_PORT, "APP_COMMANDS_PORT");
	const timeout = numeric(process.env.APP_COMMANDS_TIMEOUT, "APP_COMMANDS_TIMEOUT");

	const url = process.env.APP_COMMANDS_URL;

	if (url !== undefined && url !== "") options.url = url;
	if (host !== undefined) options.host = host;
	if (port !== undefined) options.port = port;
	if (timeout !== undefined) options.defaultTimeoutMs = timeout;

	for (let i = 0; i < argv.length; i++) {
		const token = argv[i]!;
		switch (token) {
			case "--host":
				options.host = required(argv[++i], token);
				break;
			case "--port":
				options.port = numeric(required(argv[++i], token), token);
				break;
			case "--url":
				options.url = required(argv[++i], token);
				break;
			case "--timeout":
				options.defaultTimeoutMs = numeric(required(argv[++i], token), token);
				break;
			default:
				throw new Error(`unknown option "${token}"\n\n${USAGE}`);
		}
	}

	return options;
}

function required(value: string | undefined, option: string): string {
	if (value === undefined) throw new Error(`${option} needs a value`);
	return value;
}

function numeric(value: string | undefined, source: string): number | undefined {
	if (value === undefined || value === "") return undefined;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) throw new Error(`${source} must be a number, got "${value}"`);
	return parsed;
}

async function main(): Promise<void> {
	const server = createServer(parseOptions(process.argv.slice(2)));
	await server.connect(new StdioServerTransport());
	console.error("app-commands MCP server ready on stdio");
}

main().catch((e: unknown) => {
	console.error(e instanceof Error ? e.message : String(e));
	process.exitCode = 1;
});
