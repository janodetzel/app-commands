import { buildRegistry, featureCommands } from "@janodetzel/app-commands";
import { zustandCommands } from "@janodetzel/app-commands/adapters/zustand";

import { todosFeature, todosStore } from "./instances";

/**
 * Everything the CLI and the MCP server can reach. Built at module scope, and only
 * imported from the guarded block in `main.tsx`, so a release build drops it.
 */
export const commandRegistry = buildRegistry(
	featureCommands({ todos: todosFeature }),
	// How an agent reads what the screen renders, so no feature ships a read command.
	zustandCommands({ todos: todosStore }),
);
