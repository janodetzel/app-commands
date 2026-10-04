---
"@janodetzel/app-commands": minor
---

Add a TanStack Router adapter at `@janodetzel/app-commands/adapters/tanstack-router`. `tanstackRouterCommands({ router })` gives `nav.inspect`, `nav.navigate` and `nav.back` under the same `nav` namespace as the other navigation adapters. `router` is the router or a function that returns it, for TanStack Start, which builds it in a factory. `nav.navigate` takes a route path with params, search and hash, fails before navigating when the route does not exist or a path param is missing, and fails afterwards when a loader throws `notFound` or an error or a redirect lands elsewhere. `@tanstack/react-router` is an optional peer dependency.
