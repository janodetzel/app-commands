---
name: driving-the-app
description: Run typed commands against a running React Native, Expo or Vite web app with the app-commands CLI to set up state, call business logic, and read results back without tapping through the UI. Use when verifying that a change works at runtime, reading app state, reproducing a bug in the running app, or putting the app on a screen before a visual check.
---

# Driving the app with app-commands

The app exposes its business logic as named commands over the Metro dev server. A command calls the same function the UI calls, on the same instances, so a result here is what a user gets.

Run the CLI through the project's package manager: `pnpm app-commands`, `npx app-commands`, or `yarn app-commands`. The examples below use `app-commands`.

A web app on Vite is reached through its dev server instead of Metro: add `--url`, such as `app-commands --url http://localhost:5173 list`, to every call below. The MCP server takes the same `--url`, or `APP_COMMANDS_URL`.

For a normal task, start immediately. Do not probe first with `--help`:

```bash
app-commands list
```

That returns every command with its description and the JSON Schema of its arguments. Never guess a command name or an argument. The list comes from the running app and changes with it. Read the descriptions: they say what a command does not do.

Loop: call a command, read the JSON on stdout, then verify with a read command instead of trusting the write's result alone.

```bash
app-commands <namespace>.<name> --<arg> <value>
app-commands <namespace>.<name> --args '{"items":["a","b"]}'
```

Flags follow the schema. A string takes the value as typed, a number is parsed, a boolean is `--flag` or `--no-flag`, and an enum is checked before the call goes out. An object or array argument has no flag, so pass the whole argument object with `--args`. `--args` cannot be combined with other flags. Globals: `--pretty`, `--timeout <ms>`, `--host`, `--port` (default `localhost:8081`).

stdout holds one JSON document per call. On failure it is `{ "error", "code", "issues" }`. stderr holds the duration and diagnostics.

| Exit | Codes                                                        | Do this                                                                                                                                                  |
| ---- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | none                                                         | Read the result.                                                                                                                                         |
| 1    | `COMMAND_FAILED`, `INVALID_ARGS`, `UNKNOWN_COMMAND`, `USAGE` | Fix the call from `issues` or the message. Run `list` again for an unknown command.                                                                      |
| 2    | `CONNECTION_FAILED`, `PROTOCOL_MISMATCH`                     | For `CONNECTION_FAILED`, check the rules below. For `PROTOCOL_MISMATCH`, the CLI and the app use different package versions: rebuild and reload the app. |

## Rules

- **Metro and the app must be running.** If exit code 2 persists, ask the user to start Metro and open the app. Do not start a simulator on your own unless the task says so.
- **Reload after a code change.** The commands run the bundle the app has loaded. Reload the app (`r` in the Metro terminal, or ask the user), then run `list` again.
- **One client at a time.** The app keeps one CLI, web console, or MCP server and drops the older one, which then exits with code 2.
- **One device at a time.** Every connected device runs the command. Keep only one on Metro.
- **Android emulator:** run `adb reverse tcp:8081 tcp:8081` once before the first call.
- **Web apps (`--url`):** the Vite dev server must be running and the page open in a browser. `no page is connected` (exit code 2) means no tab is open; `no page answered` means a tab is open but does not call `attachWebCommands`. Ask the user to open the app rather than starting a browser yourself. Reload the page after a code change. There is no one-client limit, and with several tabs open the newest one runs the command.

If the project registers the `app-commands` MCP server and its tools are in your tool list, prefer them. Each command is a tool with `_` in place of the dot, so `cart.add` becomes `cart_add`. The tool list is a snapshot, so call the `list` tool after a reload. The MCP server counts as the one client.

## Commands check data, the UI tools check pixels

Use commands to set up state and read it back. A screenshot or a UI tree cannot tell a cached value from a saved one. When the question is whether a screen renders correctly or a button is wired up, use the `ios-simulator` or `android-emulator` skill. A common pattern is to set up state with commands, navigate with a navigation command if the app has one, then take a snapshot with `agent-device`.

Never run commands against a dev build that points at production data.

To check a flow end to end and repeatably — a written test an agent runs on a device from a fresh install — see `writing-agent-tests` and `running-agent-tests`. To look for bugs no test covers, see `exploring-the-app`.
