---
name: running-agent-tests
description: Run the agent tests in an app's agent-tests/ folder against the real app on a simulator or emulator — reset the device to a fresh install, take each step through app-commands where a command exists and through agent-device where the UI must be used, check every expected line, record evidence, and write a pass, fail or blocked result in a fixed format. Use when asked to run an agent test, run all agent tests, or check a flow end to end in the running app.
---

# Running agent tests

An agent test (`agent-tests/<name>.md`, see `writing-agent-tests`) is a script a person
could follow. Run it as written: do not explore other screens, read the app's source to
decide what should happen, or add requirements the test does not state. When a step or an
expected line is ambiguous, stop and report the run as `blocked` rather than guess.

Read `agent-tests/README.md` first. It names the device, the bundle id and the dev-client
scheme, the read commands, and the known behavior of this app.

## The tools

| Job                                      | Tool                                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Take a step, set up state, read state    | **app-commands**: the CLI or the MCP server, see `driving-the-app`                                       |
| Put the app on a screen or open a sheet  | The navigation command (`nav.navigate`, `navigation.navigate`), with any sheet the app keeps in the URL  |
| Tap, type, swipe, answer a system dialog | **agent-device**, see the `agent-device` skill and `agent-device help manual-qa`                         |
| Check what is on screen                  | agent-device `snapshot`, `wait`, `is`, `get`, `find`, or a screenshot for rendering that has no text     |
| Install, launch, record, screenshot      | The platform tools: `xcrun simctl` on iOS, `adb` on Android, or agent-device's `record` and `screenshot` |

## Commands first, UI where it has to be

Take each step through a command whenever one exists. A command runs the same code as
the tap on the same instances, so its result is what a user gets, and it does not depend
on where a button is today. `app-commands list` names every command with its arguments;
the step's wording usually maps to one ("add a todo" → `todos.newTodoSubmitted`).

Use agent-device for a step only when:

- the step is marked **(UI)** — the test checks a control's wiring or feedback only the
  screen shows; or
- no command covers it: system dialogs and anything outside the app.

A (UI) step that cannot be done through the UI is a `fail`. Never swap in a command for
it, and never fall back to coordinates without first trying the element's label or ref.

## The device: one per run, fresh for every test

- **A dedicated simulator or emulator**, never the one the user develops on: a fresh
  install deletes all of the app's data. Point every tool at its id — `--udid`/`--serial`
  for agent-device, the UDID for `simctl`, `-s` for `adb` — never at "booted", because the
  user's device is usually booted too.
- **One app on Metro.** Every connected app runs every command. Before a run, close the
  app on every other device.
- **A fresh install before every test**, including each test of a batch. That is what
  lets a test assume nothing and skip cleanup. A reset:
  1. uninstalls the app and installs the dev build again — from a copy of the built app
     (`.app` on iOS, `.apk` on Android) kept outside the device, so no rebuild is needed.
     The uninstall takes the app's data and its permissions with it.
  2. turns off first-launch screens that are not part of the app. On an Expo dev client:
     the dev menu's intro, its sheet at launch and its floating button, which covers the
     top-right corner of the screen.
  3. connects the dev build to Metro. On an Expo dev client: open
     `<scheme>://expo-development-client/?url=<encoded Metro URL>`. iOS asks
     "Open in …?" for a link from outside the app — accept it with agent-device. The first
     load after an install can fail; send the link again.
  4. waits until `app-commands list` answers. On Android, `adb reverse tcp:8081 tcp:8081`
     first.

  The app's agent-tests README says how this app does it, by script or by hand.

A reset that fails is a `blocked` run, never a `fail`.

## The loop

1. **Preflight.** Metro answers on `/status`; the reset succeeds; `app-commands list`
   answers. Read `agent-device help manual-qa` before the first UI step of a session.
2. **Evidence folder.** `agent-tests/runs/<YYYY-MM-DD-HHmm>-<test-name>/`.
3. **Record.** Start a screen recording of the device before setup and stop it after the
   last check: `xcrun simctl io <udid> recordVideo <file>.mp4` (stop with SIGINT),
   `adb shell screenrecord`, or `agent-device record start|stop`. The video is the
   evidence for every step; add a screenshot only where an expected line is about
   rendering, or where a step fails.
4. **Setup** with commands. Record every id a command returns.
5. **Steps**, one at a time, commands first. After each step, check its expected line —
   a read command for data, the navigation state for the screen and sheet, the UI tree for
   what is visible — and write the check down before the next step. A recording or a
   screenshot is evidence, not a check.
6. **On the first failed expectation**, capture what was on screen instead, note the
   video time, and go to the expected result and cleanup.
7. **Expected result**, then **Cleanup** if the test has one. Stop the recording and
   close the agent-device session.

## Pass, fail, blocked

| Result    | Means                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| `pass`    | Every expected line was checked and held                                                                   |
| `fail`    | The app did the wrong thing: an expected line did not hold, or a (UI) step could not be done in the UI     |
| `blocked` | The run could not tell: Metro down, reset failed, a step ambiguous, an unexpected system dialog in the way |

Never round `blocked` up to `pass`. Before you write `fail`, rule out the run itself: a tap
that landed beside its target, a check that matched the wrong text, a dialog left over
from an earlier step. Re-run the step; a failure that does not reproduce is not a finding.

## Result

Write `result.md` in the run's folder, from [result-template.md](result-template.md), and
give the user the same summary. After a run of the whole suite, also write a report to
`agent-tests/reports/<date>/README.md`: one line per test, and each failure's finding with
its repro and downscaled evidence, committed so the team can see it.

## Known behavior

Generic behavior a runner will meet; the app's README adds its own.

- **Oversized accessibility elements.** A press by label or ref can land in the middle of
  a large container instead of on a small control inside it — sidebar buttons, navigation
  bar buttons, swipe actions on a row. Confirm the effect (navigation state, a read
  command) and, if it did not happen, tap the coordinates from a screenshot.
- **Review prompts** after a success (an export, a purchase) are system dialogs: answer
  them with "Not Now" through the UI. They can stack under an alert the screen raises.
- **Links out of the app.** A command that opens another app, a mail draft or a browser
  can put the app in the background; commands then fail with `CONNECTION_FAILED`. Bring
  the app back to the front before the next step.
- **One app-commands client.** The CLI, the web console and the MCP server share one
  connection; a second client drops the first.
- **Code changes need a reload.** The commands run the bundle the app has loaded.
