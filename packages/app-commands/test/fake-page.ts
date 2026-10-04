import { once } from "node:events";
import { createServer, type ViteDevServer } from "vite";
import WebSocket from "ws";

import type { Registry } from "../src/core/command";
import { appCommands, type AppCommandsPluginOptions } from "../vite";
import { attachWebCommands, type HotChannel } from "../src/web";

export type DevServer = {
	url: string;
	port: number;
	server: ViteDevServer;
	close(): Promise<void>;
};

/** A real Vite dev server with the plugin installed, on a free port, with nothing to serve. */
export async function startDevServer(options?: AppCommandsPluginOptions): Promise<DevServer> {
	const server = await createServer({
		root: __dirname,
		configFile: false,
		logLevel: "silent",
		appType: "custom",
		optimizeDeps: { noDiscovery: true, include: [] },
		server: { host: "127.0.0.1", port: 0 },
		plugins: [appCommands(options)],
	});
	await server.listen();
	const address = server.httpServer!.address();
	if (!address || typeof address === "string") throw new Error("the dev server has no port");
	return {
		url: `http://127.0.0.1:${address.port}`,
		port: address.port,
		server,
		close: () => server.close(),
	};
}

export type FakePage = { hot: HotChannel; detach(): void; close(): void };

/**
 * What a browser tab does: opens Vite's HMR WebSocket and speaks its frames. The
 * page's `import.meta.hot.on` and `.send` are these two methods, so the plugin
 * and `attachWebCommands` run over the same wire they use in a browser.
 */
export async function openPage(dev: DevServer, registry?: Registry): Promise<FakePage> {
	// Vite only accepts a socket that presents the token its client module carries.
	const token = (dev.server.config as unknown as { webSocketToken: string }).webSocketToken;
	const ws = new WebSocket(`ws://127.0.0.1:${dev.port}/?token=${token}`, "vite-hmr");
	await once(ws, "open");

	const handlers = new Map<string, Set<(data: unknown) => void>>();
	ws.on("message", (raw) => {
		const frame = JSON.parse(raw.toString()) as { type: string; event?: string; data?: unknown };
		if (frame.type !== "custom" || frame.event === undefined) return;
		for (const handler of handlers.get(frame.event) ?? []) handler(frame.data);
	});

	const hot: HotChannel = {
		on(event, listener) {
			handlers.set(event, (handlers.get(event) ?? new Set()).add(listener));
		},
		off(event, listener) {
			handlers.get(event)?.delete(listener);
		},
		send(event, data) {
			ws.send(JSON.stringify({ type: "custom", event, data }));
		},
	};

	const detach = registry ? attachWebCommands(hot, registry) : () => {};
	return { hot, detach, close: () => ws.close() };
}
