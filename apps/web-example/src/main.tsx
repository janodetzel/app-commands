import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);

// Lets `pnpm app-commands --url <dev server>` and the MCP server drive this page.
//
// `import.meta.hot` is `undefined` in `vite build`, so Vite drops this whole block
// and neither dynamic import becomes a chunk: the transport and the registry never
// reach a release build. Do not write it any other way.
if (import.meta.hot) {
	const [{ attachWebCommands }, { commandRegistry }] = await Promise.all([
		import("@janodetzel/app-commands/web"),
		import("./app/commands"),
	]);
	attachWebCommands(import.meta.hot, commandRegistry);
}
