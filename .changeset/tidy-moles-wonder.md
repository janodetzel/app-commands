---
"@janodetzel/app-commands": minor
---

Every adapter that owns state now names its read `inspect`, so a feature ships
only the commands its UI calls.

A read command written by a feature for the agent is a second implementation of
what a screen already renders, and it drifts the moment the two are edited apart.
The adapters already sit next to the state, so the read belongs to them:

```ts
buildRegistry(
	featureCommands({ news: newsFeature }), //                   news.dismissButtonTapped
	navigationCommands(navigationRef, { routes: RouteName }), // nav.navigate, nav.back, nav.inspect
	apolloCommands(apolloClient), //                             apollo.refetch, apollo.inspect
	zustandCommands({ settings: settingsStore }), //             store.inspect
	keyValueCommands(AsyncStorage), //                           storage.inspect
);
```

Each `inspect` declares the keys it has where they are known, so an agent reads
them off the tool definition rather than discovering them: `store.inspect` takes a
`z.enum` of the store names, `nav.inspect` of `current` and `state`. Where keys are
discovered at runtime, `apollo.inspect` and `storage.inspect` list them when called
with no argument.

They are read-only on purpose. A command that wrote state directly would put the
app in a state no tap can produce.

**New:**

- `keyValueCommands(storage)` reads AsyncStorage, MMKV, or anything with
  `getItem` and `getAllKeys` - the two methods are copied, not imported, so the
  package depends on none of them. Reading both this and the store that owns a
  value is how an agent tells a save that happened from one that only looked
  like it did.
- A key that matches nothing now fails and names the keys that exist.
  `apollo.cache` used to return `{}`, which an agent cannot tell apart from
  "no data".

**Breaking:**

- `zustandInspect` is renamed `zustandCommands`, and `store.get --store x`
  becomes `store.inspect --store x`.
- `apollo.cache --prefix x` becomes `apollo.inspect --prefix x`. Called with no
  prefix it lists the prefixes present instead of requiring one.
- `nav.current` and `nav.state` become `nav.inspect --key current|state`, with
  `current` the default.

Also fixes the built CLI and MCP entry points losing their executable bit, which
made `app-commands` and the MCP server fail with `EACCES` after a build.
