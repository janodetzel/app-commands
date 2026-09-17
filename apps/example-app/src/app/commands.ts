import AsyncStorage from "@react-native-async-storage/async-storage";
import { apolloCommands } from "@janodetzel/app-commands/adapters/apollo";
import { buildRegistry, featureCommands } from "@janodetzel/app-commands";
import { keyValueCommands } from "@janodetzel/app-commands/adapters/key-value";
import {
	navigationCommands,
	type NavigationRef,
} from "@janodetzel/app-commands/adapters/react-navigation";
import { zustandCommands } from "@janodetzel/app-commands/adapters/zustand";

import { RouteName } from "../navigation/routes";
import {
	apolloClient,
	dismissedNewsStore,
	navigationRef,
	newsFeature,
	profileFeature,
	settingsStore,
	todosFeature,
} from "./instances";

/**
 * Everything the app-commands plugin can reach.
 *
 * The keys are the namespaces: `featureCommands` names every command by its path
 * in this object, so `todos.newTodoSubmitted` is `todosFeature.newTodoSubmitted`,
 * and a feature nested in
 * another adds a segment. The adapters are the same shape - each returns a slice
 * of the registry - so a library the bridge knows about and a feature the app
 * wrote register identically.
 *
 * Built at module scope: a registry built during render would be a new object on
 * every frame, and the bridge would re-subscribe to each one.
 */
export const commandRegistry = buildRegistry(
	featureCommands({
		todosFeature,
		newsFeature,
		// Nested: settings is registered through profile, as profileFeature.settings.*,
		// so it is not registered a second time on its own.
		profileFeature,
	}),
	navigationCommands(navigationRef as NavigationRef, { routes: RouteName }),
	apolloCommands(apolloClient),

	/**
	 * How the agent reads what the screens render, so no feature has to ship a
	 * read command. Each adapter answers for the state it owns, under its own
	 * namespace, with the keys it has in its own schema where they are known.
	 */
	zustandCommands({ dismissedNews: dismissedNewsStore, settings: settingsStore }),
	keyValueCommands(AsyncStorage),
);
