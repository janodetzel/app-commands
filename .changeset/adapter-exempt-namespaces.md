---
"@janodetzel/app-commands": patch
---

`checkUiCallers` exempts `tinybase.inspect` by default. The default exempt list is now derived from the namespaces the built-in adapters register under, so an adapter added later is exempt as well. It is exported as `defaultExempt` from `@janodetzel/app-commands/conformance`, to extend rather than repeat when an app gives an adapter its own namespace.
