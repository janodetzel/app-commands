---
name: add-and-complete-todo
description: Add a todo, tick it off from the list, add the same title again and delete one — the todos screen end to end.
platforms: [ios, android]
---

## Goal

A todo added from anywhere shows on the list, the list's checkbox and Delete are wired to
the same commands the agent calls, and a repeated title adds a second todo instead of
editing the first.

## Setup

- Nothing beyond a fresh start: the two seeded todos, **Wire up the bridge** (done) and
  **Drive the app from the CLI** (open).
- Start on the **Home** screen.

## Steps

1. Add a todo titled **Buy milk**.
   - Expected: the command returns 3 todos; `apollo.inspect --prefix "Todo:"` holds a
     **Buy milk** entry with `done` false and `description` `""`. The list shows it.
2. **(UI)** Tap the checkbox of **Buy milk** on the list.
   - Expected: the row shows ☑ and its title is struck through; the cache entry has `done`
     true.
3. Add a todo titled **Buy milk** again.
   - Expected: 4 todos; two **Buy milk** entries with different ids, the new one not
     done.
4. **(UI)** Tap **Delete** on the **Buy milk** row that is done.
   - Expected: it disappears without a confirmation; the open **Buy milk** stays.

## Expected result

- `apollo.inspect --prefix "Todo:"` holds 3 todos: the two seeded ones and one open
  **Buy milk**.
