import type { ApolloClient } from "@apollo/client";
import { command } from "@janodetzel/app-commands";
import { z } from "zod";

import type { DismissedNewsStore } from "./store";

export type NewsFeatureDeps = { apollo: ApolloClient; store: DismissedNewsStore };

/**
 * Only what a reader can do on the news screen, named after the thing they do.
 *
 * There is no `list` and no `dismissed` command. A read command is a second
 * implementation of what the screen already renders, written for nobody but the
 * agent, and it drifts from the screen the moment the two are edited apart.
 * What the screen shows is read with `state.get` instead: the articles from the
 * Apollo cache, the dismissals from the store, combined by `visibleArticles` -
 * the same function `useVisibleArticles` binds for the screen.
 */
export const createNewsFeature = (deps: NewsFeatureDeps) => ({
	dismissButtonTapped: command()
		.input({ id: z.string().min(1) })
		.description(
			"Does what tapping Dismiss on an article does: hides it for this reader and saves the dismissal. Returns nothing - read state.get to see the result, the way the screen does. Dismissing an already dismissed article is a no-op. The server never hears about it, and an id no article has is dismissed just the same. Fails when the save fails, and the dismissal is rolled back.",
		)
		.run(async ({ id }) => {
			await deps.store.getState().dismiss(id);
		}),
});

export type NewsFeature = ReturnType<typeof createNewsFeature>;
