# Agent-addressable architecture: principles

An app is agent-addressable when every capability it has can be reached by name, with typed arguments, from outside the user interface. An AI agent can then set up a state, exercise a behavior, and read the result in one call instead of twenty taps, and it verifies the same code path a user takes.

These principles describe how to build such an app. They are constraints, not a framework. An app can satisfy all of them with none of the packages below, and no package makes an app satisfy them.

The packages exist to make the constraints cheap to follow and expensive to break:

## 1. The user interface is a client, not the application

A screen is one way to reach a capability. A command is another. Neither owns the behavior.

The practical test: for every action a user can take, there is a command that does the same thing. A button that can do something no command can is an incomplete feature, not a UI detail.

This is the oldest principle here. Hexagonal architecture stated the goal in 2005: an application should be equally drivable by users, by programs, by automated tests, and by batch scripts. Command palettes in editors, `rails console`, and Blender's scriptable operators are all the same idea. The only thing new is that one of the clients has no eyes.

## 2. One definition per capability

The command and the UI call the same function. A command is a thin entry point: validate arguments, call the logic, return a serializable result.

A second implementation is worse than no command at all, because the agent then verifies a path no user takes and reports success for behavior that does not exist. The most common way this happens is a rule hiding in a UI handler: a `catch` block that treats a conflict as success, a guard that silently skips a duplicate. Those rules belong in the logic, where both clients see them.

## 3. Every entry point is awaitable and honest

An operation returns a promise that resolves only when its work is finished, and rejects when it fails.

This carries more weight than it looks. Without a reducer and effect runtime, nothing structurally connects an action to the work it triggers, so the promise is the only signal. One fire-and-forget call makes a command report success before the save runs, and the agent's next read is a race it cannot see. Await delegates too.

This is the principle most likely to be violated silently and the first place to look when an agent reports a result that turns out to be false.

## 4. State is owned outside the component tree

Server state lives in a query cache. Client state lives in stores created at module scope. Both the UI and the commands subscribe to the same instances.

Component state is for what can be lost on unmount. Anything a command must read or change cannot live there, because a command runs when no component is mounted.

## 5. Instances are created in one place

One file constructs the API client, the stores, and the navigation reference. The UI and the command registry both read from it.

This is what makes principle 2 structural rather than aspirational. If a command can construct its own client, it will eventually construct a different one, and the divergence will be invisible until a user reports a bug the agent could not reproduce.

## 6. The world arrives through dependencies

Storage, the network, the clock, and randomness are injected, never reached implicitly.

Two payoffs. Logic becomes testable without a simulator, which is the precondition for ever running it headlessly. And a replayed command sequence produces the same result twice, so an agent can distinguish a regression from noise. A feature that calls `Date.now()` directly cannot give an agent a stable signal.

## 7. Features own a slice and never import a sibling

A feature owns its logic and its commands; screens are clients of it, like the command registry. It reaches another feature only through a narrow port it was given, and announces events only through delegates it declares. All wiring happens at the composition root.

A namespace in the command surface is a feature boundary made visible. Once features reach into each other, namespaces stop describing the app, and the command surface stops being a map of it.

## 8. Descriptions are API, not documentation

A command's description tells an agent what the command does and what it does not do. "No-op if the item is already a favorite" prevents a wrong conclusion. A description generated from a method name prevents nothing.

The agent-facing instructions are part of the deliverable too, not an appendix: which commands to prefer, how to verify a mutation, what to do after a code change. An architecture built for agents that ships no instructions for them is half built.

## 9. Commands assert data; pixels are verified elsewhere

Commands arrange state and read it back. Screenshots and recordings verify rendering and usability.

Using screenshots to check data is slow and unreliable. Using commands to check rendering is impossible. When an agent starts inspecting props or reading text from an image to confirm a value, a command is missing.

## 10. The transport is replaceable

The command contract is four things: a description, a schema, a parse function, and a callable. Nothing in it names a UI framework, a state library, or a validation library.

A running app on a simulator is one transport. A headless process, a test harness, and an MCP server are others. Keeping the contract narrow is what lets the fast feedback loop arrive later as an addition rather than a rewrite.

## 11. Every principle has a mechanical check

A guideline nobody can point to in a review is a preference. Each principle above maps to something that fails a build:

| Principle | Check                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | A conformance check (`checkUiCallers`) fails when a feature command has no caller in the UI                                                             |
| 2, 5      | A test builds the registry and asserts it uses the shared instances                                                                                     |
| 2         | Lint forbids a UI file calling a store action or taking a whole store, which would change state without the command                                     |
| 3         | `no-floating-promises` as an error in logic files                                                                                                       |
| 4         | Lint forbids store mutation outside store files                                                                                                         |
| 6         | Lint forbids `Date.now`, `Date.parse`, and `Math.random` in logic files. `new Date()` without arguments is not caught and stays a review habit          |
| 7         | dependency-cruiser forbids imports between sibling feature folders, deep imports past a feature's barrel, and a feature importing the app               |
| 8         | A conformance test asserts every description is non-empty and longer than its command name                                                              |
| 10        | dependency-cruiser forbids UI, state, and validation libraries in the core and in `command()`; a test drives `handleRequest` with a hand-built registry |
| All       | A release bundle contains no trace of the command transport                                                                                             |

Principle 1 is only half checked, and that is worth admitting. `checkUiCallers` proves every feature command has a caller in the UI, but nothing can prove a button has a command equivalent. That half stays a review habit, which means it is the principle most likely to erode.

## What these principles do not claim

They do not prescribe a state library, a navigation library, or a validation library. They do not require reducers, effects as values, or pure state transitions. Those constraints buy exhaustive test guarantees at a cost in boilerplate that TypeScript cannot hide the way Swift macros can. A feature with genuinely complex flow logic can use a state machine for itself without the rest of the app following.

They also do not claim to be state of the art. There is no consensus on business-logic organization in React Native, and this design optimizes for a property almost nobody else optimizes for: one implementation callable from both a UI and a CLI. Argue it from that constraint and from the checks above, never from consensus or lineage.
