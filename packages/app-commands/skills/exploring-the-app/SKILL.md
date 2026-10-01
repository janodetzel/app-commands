---
name: exploring-the-app
description: Explore a running React Native or Expo app on app-commands to find user-visible bugs that no test covers — drive it through the UI with agent-device, reach states and check the data behind a screen with app-commands, and write a findings report with severity, repro steps from a fresh install, and evidence. Use when asked to explore, dogfood, bug-hunt or QA an area of the app, or to find out what agent tests an app needs.
---

# Exploring the app

Tests check what someone already thought of. Exploration looks for what nobody has, and
its findings become the next tests (`writing-agent-tests`). It follows
`agent-device help dogfood` — read that first; this skill adds what app-commands changes.
Where a written test covers a flow, run it with `running-agent-tests` instead.

## Scope

Before the first action, settle:

- **Area and goal**: "the editor's overlay panel", "import edge cases", "everything on
  the settings screen". Take them from the request; ask only when there is none.
- **Budget**: 20 minutes unless the user gives one. Stop at the budget and report what
  was not covered.

Stay in the area. Something broken outside it is one line in the report, not a detour.

## Environment

The same as for tests (`running-agent-tests`, "The device"): the dedicated device, a
fresh install before exploring, every tool pointed at its id. Reset again whenever the
state gets in the way, and every repro in the report starts from a reset.

## UI to explore, commands to get there and to check

- **Explore through the UI.** Exploration is about what a user sees and can do: taps,
  typing, gestures, system dialogs, the paths between screens.
- **Commands to set up.** Reach an interesting state in one call instead of twenty taps:
  many items, long names, a second unit system, every variant of a setting, a sheet opened
  through the navigation command.
- **Commands to check.** After a UI action, read the state behind the screen. A screen
  that shows one thing while the store holds another is a finding.
- **Commands to compare.** A command and the tap it stands for run the same code. When
  they give different results, that is a finding too — and so is a command that accepts
  input the UI would never send, or that reports success for something that did not
  happen.

Edge cases worth a try in any app: empty input, one item, many items, duplicates, very
long text, a value at a boundary, a cleared field, a refused permission, a missing app
for a share target, no network, a second tap during an operation, and an app update over
existing data.

## Guardrails

- **Runtime only.** A finding is something the app did, not something its source suggests.
  Do not read `src/` to look for bugs. Do not change code, commit, or fix anything — report.
- **Never complete an action that leaves the app.** Open a mail draft, never send it.
  Stop a share at the system sheet or the handoff to another app. Check that a link opens;
  do not browse.
- **System dialogs** are the app's behavior too: note one that appears at a bad moment,
  answer it, and go on.
- **Known behavior** in the app's agent-tests README is not a finding, unless it is
  exactly what is being explored.
- **Confirm before it counts.** Reproduce each finding once from a fresh install, and rule
  out the run: a tap beside its target, a check that matched the wrong text, a dialog left
  over. Retract a finding that does not hold, and say so in the report.

## Report

Write `agent-tests/runs/<YYYY-MM-DD-HHmm>-explore-<area>/report.md` from
[report-template.md](report-template.md), with a screenshot or a short recording per
finding. Severity:

| Severity | Means                                                                    |
| -------- | ------------------------------------------------------------------------ |
| critical | Blocks a core flow, loses data, or crashes                               |
| high     | A main feature gives a wrong result                                      |
| medium   | Friction or a wrong result with a workaround; a broken edge of a feature |
| low      | Polish: wording, layout, accessibility labels, timing                    |

Write each finding as soon as it is confirmed. Never pad the report: no findings is a
valid result, with the coverage it rests on. A finding worth guarding gets a suggested
test; write the test only when the user asks.
