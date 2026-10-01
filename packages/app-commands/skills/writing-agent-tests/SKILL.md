---
name: writing-agent-tests
description: Write agent tests for a React Native or Expo app on app-commands — plain-English test definitions an agent runs against the real app on a simulator or emulator, taking steps through commands and checking them on screen and in state. Covers where tests live, the test format, choosing command steps versus UI steps, expected lines an agent can check, fixtures, and the app's agent-tests README. Use when adding a test for a flow, turning a bug or an exploration finding into a test, or setting up agent tests in an app.
---

# Writing agent tests

An agent test is a markdown file that describes what a user does and what they should
see, written so that any agent can run it the same way every time. It is not code: the
agent that runs it (`running-agent-tests`) works out which command or tap each step
needs. That keeps a test readable by a person and stable across refactors of the UI.

Agent tests check what headless tests cannot: screens, native sheets, system dialogs,
rendering, and the app's wiring from a tap to a command. The logic under them is already
covered by the feature tests that drive commands in Node; do not repeat those here.

## Where tests live

```
agent-tests/
	README.md          the app's test environment and known behavior (below)
	_template.md       copy of template.md from this skill
	<test-name>.md     one test per file, kebab-case, named after the flow
	fixtures/          input files the tests import (GPX, CSV, images…)
	reports/<date>/    reports of full runs, committed, with downscaled evidence
	runs/              the evidence of every run; git-ignored
```

Add `agent-tests/runs/` to `.gitignore`, and keep Metro from watching `agent-tests/`:
a run writes screenshots and videos there, and Metro answers every new image with an
update that flashes the dev client's "Refreshing…" banner in the middle of a test.

```js
// metro.config.js
const agentTests = path.join(__dirname, "agent-tests");
config.resolver.blockList = [
	...[].concat(config.resolver.blockList ?? []),
	new RegExp(`^${agentTests.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\\\/]`),
];
```

## The test format

Copy [template.md](template.md). A test has five sections:

| Section             | Holds                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| front matter        | `name` (the file name), a one-sentence `description`, `platforms`                                                                        |
| **Goal**            | The user outcome the test protects, in a sentence or two                                                                                 |
| **Setup**           | The state needed before step 1, on top of a fresh install, and the screen to start on. "Nothing beyond a fresh install" is a valid setup |
| **Steps**           | Numbered actions, each followed by an **Expected** line                                                                                  |
| **Expected result** | What must hold at the end, on screen and in saved state                                                                                  |
| **Cleanup**         | Only what a fresh install does not undo: files in the photo library, data in a shared service. Leave it out when there is nothing        |

Every test runs on a fresh install, so a test creates the data it needs and never
depends on another test or on what is already in the app.

## Writing steps

Write a step the way you would hand it to a person testing the app: the action, then
what they should see. Name what is on screen — button labels, sheet titles, alert text —
not how to find it. Selectors, element refs and coordinates belong to the run, not the
test.

**Commands are the default.** Every user action in an app on app-commands is a command
that runs the same code as the tap, so the runner takes a step through the command when
one exists: it is fast, exact, and does not break when the layout moves. Phrase the step
as the user's intent ("Apply the Field Log template", "Add a todo called Milk"), and the
runner maps it to the command.

**Mark a step (UI) when the UI is what you are testing:** that a control is wired to its
command, or that the screen shows feedback a command does not, such as an alert the
screen raises after the command resolves. The runner then taps it like a user, and a (UI)
step that cannot be done through the UI fails — it never falls back to the command. Keep
(UI) steps for what only the UI can prove; they are slower and more fragile. One (UI)
step per flow, on the control that matters most, is usually enough.

System dialogs — permission prompts, review prompts, the OS share sheet — have no command.
The runner answers them through the UI whatever the step says; write what the user does
("Allow photo access if iOS asks").

## Writing expected lines

An expected line is something the runner can check, not an impression:

- **Data** is checked with a read command (`store.inspect`, a cache or storage adapter):
  "The route's `design.layoutId` is `fieldLog`".
- **Screen** is checked in the UI tree: visible text, a label, an enabled or disabled
  control, which screen and sheet are open ("an alert titled **Saved**", "the sidebar
  reads 1:1").
- **Rendering** that has no text — a map, a chart, an image — is checked by looking at a
  screenshot: say what must be true ("the whole route is inside the map frame", "the route
  line is visible"), so a wrong render cannot pass.

Write the value you expect, with its unit, rounded as the app shows it ("about 32.1 km
over 2 days"). An expected line that two readers could check differently is a test that
passes when it should not.

## Fixtures

Inputs the test imports go in `agent-tests/fixtures/`, small and named after what is
special about them (`two-days.gpx`, `no-timestamps.gpx`, `one-point.gpx`). A command takes
file contents, never a path on the developer's machine; the app's agent-tests README says
how to pass a fixture to the import command.

Good fixtures are the edge cases a user's real files will hit: empty, broken, one item,
duplicates, missing fields, very long names, values at a boundary.

## The app's agent-tests README

`agent-tests/README.md` is the app-specific half of the runner's instructions. It
states:

- **Environment**: the bundle or package id, the dev-client URL scheme, the device the
  tests run on, and how to put it back to a fresh install (see `running-agent-tests`).
- **Commands for setup and checks**: the read commands that show saved state, the
  navigation command and the screen URLs, and how to pass fixtures.
- **Known behavior**: what a runner will meet that is not a finding — a review prompt
  after an export, a system notice after refusing a permission, a control that only
  responds to a tap at its coordinates. A runner that hits something new writes it here.
- **The tests**: one line per test and what it covers.

## Turning a finding into a test

A confirmed bug from an exploration (`exploring-the-app`) or a user report becomes a test
when it is worth guarding: copy its repro into **Setup** and **Steps**, and write the
behavior the user should get — not the bug — as the **Expected** line. The test fails
until the bug is fixed, and its failure names the finding.
