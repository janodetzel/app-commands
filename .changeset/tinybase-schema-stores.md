---
"@janodetzel/app-commands": patch
---

`tinybaseCommands` takes stores typed with `tinybase/with-schemas` without a cast. It now reads each store through `TinybaseStoreLike`, the few getters it calls, instead of requiring a `Store`, whose setters a schema-typed store does not match. Untyped `Store`s and `MergeableStore`s pass as before.
