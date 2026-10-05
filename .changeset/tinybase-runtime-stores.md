---
"@janodetzel/app-commands": minor
---

`tinybaseCommands` can read stores created after the registry is built. Besides a record of stores it takes a `TinybaseStoreSource`, `{ list, get }`, which it calls on every read, for apps that create a store per signed-in user or per document at runtime. With a source, `store` is any id and is checked when the command runs; an id that is not there fails and names the stores that exist. `tinybase.inspect` without `store` now returns `{ stores: [id] }`, with a record or a source.
