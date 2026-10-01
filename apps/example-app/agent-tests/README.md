# Agent tests

Plain-English tests an agent runs against the example app on a simulator or emulator.
Write one with the `writing-agent-tests` skill from [`_template.md`](_template.md); run
one with `running-agent-tests`. Each run leaves its evidence in `runs/`, which is
git-ignored and which Metro does not watch (`metro.config.js`).

## Environment

- **App:** the example runs in Expo Go or a development build.
  `pnpm --filter example-app ios` (or `android`) starts Metro and opens it. Use a
  simulator you do not need for anything else, and keep only one device connected to
  Metro.
- **Fresh start:** the todos and the news live in an in-memory server inside the app
  (`src/server`), so reloading the app (`r` in Metro, or the dev menu) puts back the two
  seeded todos and the three articles. Settings and dismissed news are saved in
  AsyncStorage and survive a reload; a test that depends on them sets them in its setup.
  Reinstalling the app clears those too.
- **Connected:** `pnpm app-commands list` answers. On Android, run
  `adb reverse tcp:8081 tcp:8081` first.

## Commands for setup and checks

| Need                     | Command                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Todos and news as stored | `apollo.inspect --prefix "Todo:"`, `apollo.inspect --prefix "Article:"`                                                     |
| Settings, dismissed news | `store.inspect`, and `storage.inspect` for what survives a restart                                                          |
| Where the app is         | `nav.inspect`                                                                                                               |
| Put the app on a screen  | `nav.navigate --screen <Home \| AddTodo \| Settings \| News>`                                                               |
| Check the cache update   | `apollo.inspect`, then `apollo.refetch`, then `apollo.inspect` again: a difference means the screen's cache update is wrong |

A query writes to the cache only once its screen has mounted: navigate to the screen
before you expect its data in `apollo.inspect`.

## Known behavior

None recorded yet. A runner that meets something here that is not a finding — a dialog,
a control that only responds at its coordinates — adds it.

## Tests

| Test                                              | Covers                                                   |
| ------------------------------------------------- | -------------------------------------------------------- |
| [add-and-complete-todo](add-and-complete-todo.md) | Adding, ticking off and deleting todos; a repeated title |
