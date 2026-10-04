import { appCommands } from "@janodetzel/app-commands/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `appCommands()` only runs on the dev server (`apply: "serve"`), so `vite build`
// never contains it. Drive the page with `pnpm app-commands --url http://localhost:5173`.
export default defineConfig({
	plugins: [react(), appCommands()],
});
