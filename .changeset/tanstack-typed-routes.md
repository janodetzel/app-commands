---
"@janodetzel/app-commands": patch
---

`tanstackRouterCommands` takes a router with file-based typed routes without a cast. `TanStackRouterLike.routesByPath` is now typed as `object`: TanStack Start types it with the generated `FileRoutesByFullPath` interface, which has no index signature and so was not assignable to `Record<string, unknown>`. The adapter reads only the route paths and ids, as before.
