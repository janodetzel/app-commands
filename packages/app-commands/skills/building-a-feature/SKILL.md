---
name: building-a-feature
description: Add or change a feature so the UI and an agent call the same business logic, with command() and the lint rules from @janodetzel/app-commands. Use when adding a screen, a store, a mutation, or an entry point, when moving state out of a component, when an app-commands lint rule fails, or when a feature has logic that is not a command.
---

# Building a feature

A feature is agent-addressable when every action a user can take is also a named command with typed arguments. The screen and the command call the same function on the same instances. A second implementation is worse than none, because the agent then verifies a path no user takes.

## The shape

Logic in one folder per feature, the UI next to it in `screens/`:

```
src/features/<feature>/
	feature.ts    createXFeature(deps) returning an object of command()s
	store.ts      createXStore(deps) and its selectors, for client state
	api.ts        a port's type and the operations over it, one per mutation or platform call
	schema.ts     the schemas the commands take, when they are more than one line
	errors.ts     the errors the commands throw
	index.ts      the barrel: export * from the files above
	<sub>/        a nested sub-feature, the same shape with its own barrel
src/screens/<feature>/
	<Feature>Screen.tsx
```

`feature.ts` and `index.ts` are required. Add `store.ts`, `api.ts`, or both, depending on where the state lives. The `setting-up-an-app` skill covers the folders around the features: the composition root, the domain, the adapters, and the tests. Every file in the feature folder, at any depth, is a logic file to the lint rules, except tests, so nothing in it may import React. Anything outside the feature, screens and tests included, imports it through `index.ts` only.

## Steps

1. **Decide the entry points.** One per capability. Name each after the control a user touches and the gesture that triggers it: `favoriteButtonTapped`, `titleTyped`, `photoPicked`. A command named after a control has that control, so a command no screen calls stands out.

   Each gets an argument schema and a description. The description is the only thing an agent knows about the command. Say what it does, what it returns, and what it does _not_ do. If the command needs the app in some state first, say how to get there, for example which screen or sheet to open with `nav.navigate`. Never generate the description from the method name.

   Every id a command takes must be readable through `store.inspect`. If a screen fetches a list into component state and the command takes ids from it, an agent cannot learn the ids. Move the list into a store, filled by a command named after opening the screen.

2. **Keep state outside the component tree.** A command runs when no component is mounted, so anything it reads or changes cannot live in `useState`.
   - Client state goes in a store created by a factory that takes its dependencies: `createFavoritesStore({ storage })`. Only `store.ts` calls `set`.
   - Server state stays in the query cache. Each mutation gets one operation function in `api.ts` that owns its cache update. Reads can stay with the query hook.
   - The platform arrives through a port. `api.ts` declares the port's type and the operations over it, and each operation takes the adapter as its first argument, the way `addTodo(client, …)` takes the Apollo client. The adapter lives outside the feature, and the composition root passes it in.
   - With zustand's `persist` middleware, `set` returns the write's promise, but zustand types it as `void`. Await it, so the command resolves after the save. If the write rejects, put the old state back, then rethrow.
   - Storage, the network, the clock, and randomness arrive as dependencies. Take a `clock` instead of calling `Date.now()`.

3. **Define the commands.** `command()` holds the schema, the description, and the handler together, and the handler's argument type comes from the schema, so an undeclared argument is a compile error:

   ```ts
   import { command } from "@janodetzel/app-commands";
   import { z } from "zod";

   export const createFavorites = (deps: FavoritesDeps) => ({
   	favoriteButtonTapped: command()
   		.input({ itemId: z.string().min(1) })
   		.description(
   			"Does what tapping the heart on an item does: adds it to the favorites and returns the list. No-op if the item is already a favorite.",
   		)
   		.run(async ({ itemId }) => {
   			await deps.store.getState().add(itemId);
   			return deps.store.getState().ids;
   		}),
   });
   ```

   `.input` takes a Standard Schema (zod, Valibot, ArkType), an object of them as above, or a validator function that returns the value and throws to reject it. Leave it out for a command without arguments. `.description` is required before `.run`.

   Every handler returns a promise that resolves when the work is finished and rejects when it fails. Await every call inside it, delegates included. A fire-and-forget call makes the command report success before the save runs.

   Return picked, JSON-safe fields, never a whole store state. Store state carries functions, and `Map`, `Set`, `NaN`, and cycles fail the command.

   Names are camelCase. `featureCommands` throws on anything else.

4. **Create the instance in the composition root.** One file creates the API client, the stores, the navigation reference, and the features, and passes each feature its dependencies. The UI and the command registry both import from that file. Never create a client or a store inside a component.

   A feature never imports another feature. If it needs something from a sibling, the composition root passes it a getter or a delegate, never a snapshot value. To group features, compose them there as plain objects: `{ settings: settingsFeature }` nests and adds a segment to each command name, `{ ...a, ...b }` merges two into one namespace.

5. **Call the feature from the screen.** The screen, in `src/screens/`, calls `favoritesFeature.favoriteButtonTapped({ itemId })`, the same function the command runs, with the same validation. It reads state with `useStore(favoritesStore, favoritesStoreSelectors.ids)`: selectors from the feature's barrel, the store from the composition root. A hook wrapping that lives with the screens. Move any rule in a UI handler into the feature: a `catch` that treats a conflict as success, or a guard that skips a duplicate.

   A command never navigates. The screen navigates after the command resolves, and an agent moves between screens with `nav.navigate`.

6. **Register it.** Add the feature to the `featureCommands({ ... })` object in the registry, keyed by its namespace. That registers each command, named by its path. Nothing else is registered by hand.

7. **Test and verify.** Build the feature with in-memory dependencies and call its commands in a unit test, no simulator needed. Run `checkRegistry` from `@janodetzel/app-commands/conformance` against the registry. Then verify the behavior in the running app with the `driving-the-app` skill.

## What the checks catch

When a rule blocks you, move the code. Do not disable or widen the rule.

| Rule                                                      | Catches                                                                                                                                                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@typescript-eslint/no-floating-promises`                 | A promise nobody awaits. Not part of the plugin: enable it as an error.                                                                                                                            |
| `app-commands/no-ui-in-logic`                             | React, React Native, Expo, or React Navigation imported into a logic file                                                                                                                          |
| `app-commands/no-set-outside-store`                       | `set` or `setState` outside `store.ts`                                                                                                                                                             |
| `app-commands/require-rethrow`                            | A `catch` in `store.ts` that does not rethrow                                                                                                                                                      |
| `app-commands/no-ambient-io`                              | `Date.now`, `Date.parse`, or `Math.random` in a logic file                                                                                                                                         |
| `app-commands/no-cross-feature-import`                    | One feature importing another                                                                                                                                                                      |
| `no-sibling-feature-import` (app-commands/depcruise)      | The same, as a package edge, so a deep relative import cannot slip past                                                                                                                            |
| `no-deep-feature-import` (app-commands/depcruise)         | A file outside the feature importing anything but its `index.ts` barrel                                                                                                                            |
| `features-do-not-import-the-app` (app-commands/depcruise) | A feature importing `src/app/`, `src/screens/` or `src/navigation/`                                                                                                                                |
| `checkRegistry`                                           | A duplicate or malformed name, a description no longer than the name, a schema that is not an object, a `parse` that accepts anything, and a non-JSON-safe result for commands listed in `samples` |

## Mistakes the checks miss

- A button that does something no command can do. No tool can detect it. Check that every user action has a command.
- A mutation hook with its own cache update inside a component. A command cannot reach that update.
- Mutation errors returned in the result, not thrown, for example with an `errorPolicy` of `"all"`. Check the error and throw, or the command reports success on a failed write.
- A `catch` that swallows the error outside `store.ts`, for example in `api.ts` or a handler. `require-rethrow` checks store files only.
- `new Date()` without arguments in a logic file. `no-ambient-io` does not catch it, so take the time from the `clock` dependency.
- A screen that changes state by calling a store action (`store.getState().action()`), or that takes the whole store with `useStore(store)` and calls an action from it. The change skips the command and its rules.
- A command that navigates. An agent then cannot run it without leaving the screen it is checking.
- A command that takes an id no read command returns. An agent has no way to find a valid value.
- A handler that awaits a promise that settles when the user dismisses something, such as `WebBrowser.openBrowserAsync`. The command times out. Let the adapter present the UI and return.

## Checklist

- [ ] Every user action in the feature is a `command()` named after its control, with a description that says what it does not do
- [ ] Every id a command takes is readable through `store.inspect`
- [ ] No command navigates
- [ ] The screen calls the command, not a parallel implementation
- [ ] State a command needs lives in a store or the query cache, not in a component
- [ ] Instances and features are created only in the composition root
- [ ] Every handler awaits its work and rejects on failure
- [ ] Handlers return picked, JSON-safe fields
- [ ] Time, randomness, storage, and network arrive as dependencies
- [ ] The feature is registered in `featureCommands` under its namespace
- [ ] Typecheck, lint, tests, and dependency-cruiser pass
- [ ] The behavior is verified in the running app with `driving-the-app`
