import path from "node:path";
import { build, createServer, type Rollup } from "vite";
import { describe, expect, it } from "vitest";

const root = path.join(__dirname, "..");

// What only the transport and the registry contain: see scripts/check-release-bundle.mjs.
const FORBIDDEN = [
	"attachWebCommands",
	"app-commands:request",
	"app-commands:response",
	"__app-commands",
	"todos.newTodoSubmitted",
];

async function bundle(): Promise<string> {
	const result = (await build({ root, logLevel: "silent", build: { write: false } })) as
		Rollup.RollupOutput | Rollup.RollupOutput[];
	const outputs = Array.isArray(result) ? result : [result];
	return outputs
		.flatMap((o) => o.output)
		.map((chunk) => (chunk.type === "chunk" ? chunk.code : String(chunk.source)))
		.join("\n");
}

describe("the web example's client entry", () => {
	it("leaves the transport and the registry out of a release build", async () => {
		const output = await bundle();

		// The page is there, so an empty output cannot make this pass.
		expect(output).toContain("What needs doing?");
		for (const needle of FORBIDDEN) expect(output).not.toContain(needle);
	}, 60_000);

	it("keeps them in what the dev server serves", async () => {
		const server = await createServer({
			root,
			logLevel: "silent",
			server: { host: "127.0.0.1", port: 0 },
			optimizeDeps: { noDiscovery: true, include: [] },
		});
		try {
			const main = await server.transformRequest("/src/main.tsx");

			expect(main?.code).toContain("attachWebCommands");
			expect(main?.code).toContain("import.meta.hot");
		} finally {
			await server.close();
		}
	}, 60_000);
});
