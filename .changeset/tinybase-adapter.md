---
"@janodetzel/app-commands": minor
---

Add a TinyBase adapter at `@janodetzel/app-commands/adapters/tinybase`. `tinybaseCommands({ name: store })` gives `tinybase.inspect`, a read-only command for the tables, rows and values of a `Store` or `MergeableStore`: with only a store it returns an outline, with a table it returns rows (capped by `limit`, one by `row`, filtered by `prefix`), and `part: "values"` reads the values. A table, row, value or prefix that is not there fails and names what the store has. `tinybase` 6 or later is an optional peer dependency.
