#!/usr/bin/env node
import type { CommandInfo, Response } from "../src/core/protocol";
import { AppCommandsClient, ConnectionError, ResponseError } from "./client";
import { describeFlags, parseCommandArgs, UsageError, type JsonSchema } from "./flags";

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_UNREACHABLE = 2;

type GlobalOptions = {
	host?: string;
	port?: number;
	url?: string;
	timeout?: number;
	pretty: boolean;
	help: boolean;
};

const USAGE = `Usage:
  app-commands list
  app-commands <namespace>.<name> [--<arg> <value> ...]
  app-commands <namespace>.<name> --args '<json>'

Options:
  --host <host>    Metro host (default localhost)
  --port <port>    Metro port (default 8081)
  --url <url>      Talk to a web app through its Vite dev server instead of Metro,
                   for example http://localhost:5173 (--host and --port are ignored)
  --timeout <ms>   How long the app may take before it answers TIMEOUT
  --pretty         Indent the JSON on stdout
  --help           Show this message

stdout holds one JSON document per call. Exit code 0 means success, 1 means the
command failed or the call was wrong, 2 means the app could not be reached.`;

async function main(argv: string[]): Promise<number> {
	const { options, rest } = takeGlobalOptions(argv);

	if (options.help || rest.length === 0) {
		console.log(USAGE);
		return options.help ? EXIT_OK : EXIT_FAILED;
	}

	const [name, ...tokens] = rest as [string, ...string[]];

	const client = await AppCommandsClient.connect({
		...(options.url === undefined ? {} : { url: options.url }),
		...(options.host === undefined ? {} : { host: options.host }),
		...(options.port === undefined ? {} : { port: options.port }),
	});

	try {
		let commands: CommandInfo[];
		try {
			commands = await client.commands();
		} catch (e) {
			// A failure here is about the bridge itself, not about one command.
			if (!(e instanceof ResponseError)) throw e;
			return report(e.response, options.pretty);
		}

		if (name === "list") {
			print(commands, options.pretty);
			return EXIT_OK;
		}

		const info = commands.find((c) => c.name === name);
		if (!info) {
			console.error(`Unknown command "${name}". Available:\n${list(commands)}`);
			print({ error: `unknown command "${name}"`, code: "UNKNOWN_COMMAND" }, options.pretty);
			return EXIT_FAILED;
		}

		let args: unknown;
		try {
			args = parseCommandArgs(info.args as JsonSchema, tokens);
		} catch (e) {
			if (!(e instanceof UsageError)) throw e;
			console.error(`${e.message}\n\n${name}:\n${describeFlags(info.args as JsonSchema)}`);
			print({ error: e.message, code: "USAGE" }, options.pretty);
			return EXIT_FAILED;
		}

		const response = await client.run(name, args, options.timeout);
		return report(response, options.pretty);
	} finally {
		client.close();
	}
}

function report(response: Response, pretty: boolean): number {
	if (response.ok) {
		console.error(`${response.durationMs ?? "?"} ms`);
		print(response.result, pretty);
		return EXIT_OK;
	}

	console.error(`${response.code}: ${response.error}`);
	print(
		{
			error: response.error,
			code: response.code,
			...(response.issues ? { issues: response.issues } : {}),
		},
		pretty,
	);

	if (response.code === "PROTOCOL_MISMATCH") {
		console.error(
			"The CLI and the app disagree on the protocol. Rebuild the package with " +
				"`pnpm --filter @janodetzel/app-commands build` and reload the app.",
		);
		return EXIT_UNREACHABLE;
	}
	return EXIT_FAILED;
}

function takeGlobalOptions(argv: string[]): { options: GlobalOptions; rest: string[] } {
	const options: GlobalOptions = { pretty: false, help: false };
	const rest: string[] = [];

	for (let i = 0; i < argv.length; i++) {
		const token = argv[i]!;
		switch (token) {
			case "--pretty":
				options.pretty = true;
				break;
			case "--help":
			case "-h":
				options.help = true;
				break;
			case "--host":
				options.host = argv[++i];
				break;
			case "--port":
				options.port = Number(argv[++i]);
				break;
			case "--url":
				options.url = argv[++i];
				break;
			case "--timeout":
				options.timeout = Number(argv[++i]);
				break;
			default:
				rest.push(token);
		}
	}

	return { options, rest };
}

const list = (commands: CommandInfo[]) => commands.map((c) => `  ${c.name}`).join("\n");

function print(value: unknown, pretty: boolean): void {
	console.log(JSON.stringify(value === undefined ? null : value, null, pretty ? 2 : 0));
}

main(process.argv.slice(2))
	.then((code) => {
		process.exitCode = code;
	})
	.catch((e: unknown) => {
		const message = e instanceof Error ? e.message : String(e);
		console.error(message);
		if (e instanceof ConnectionError) {
			print({ error: message, code: "CONNECTION_FAILED" }, false);
			process.exitCode = EXIT_UNREACHABLE;
			return;
		}
		print({ error: message, code: "CLI_FAILED" }, false);
		process.exitCode = EXIT_FAILED;
	});
