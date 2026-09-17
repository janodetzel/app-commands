import { ApolloClient, InMemoryCache } from "@apollo/client";
import { beforeEach, describe, expect, it } from "vitest";

import { apiLink } from "../../server/server";
import { createNewsFeature, NEWS, visibleArticles, type Article } from ".";
import { createDismissedNewsStore } from "./store";

/**
 * The feature ships one command, the one the screen calls. What a dismissal did
 * is checked the way the agent checks it: by reading the two places the state
 * actually lives and combining them with `visibleArticles`, which is what
 * `useVisibleArticles` does for the screen. There is no `list` to test against,
 * because a list command would be a second implementation of exactly this.
 */

const memoryDismissedStorage = () => {
	let saved: string[] | null = null;
	return {
		get: async () => saved,
		set: async (ids: string[]) => {
			saved = ids;
		},
	};
};

/** A fresh client, so each test starts with an empty cache. */
const freshApollo = () => new ApolloClient({ link: apiLink, cache: new InMemoryCache() });

describe("the news feature", () => {
	let apollo: ApolloClient;
	let store: ReturnType<typeof createDismissedNewsStore>;
	let news: ReturnType<typeof createNewsFeature>;

	/** What the screen renders: server data from the cache, dismissals from the store. */
	const onScreen = async () => {
		const { data } = await apollo.query<{ news: Article[] }>({ query: NEWS });
		return visibleArticles(data?.news ?? [], new Set(store.getState().dismissedIds));
	};

	beforeEach(() => {
		apollo = freshApollo();
		store = createDismissedNewsStore({ storage: memoryDismissedStorage() });
		news = createNewsFeature({ apollo, store });
	});

	it("drops the article out of what the screen shows", async () => {
		const before = await onScreen();
		const target = before[0]!.id;

		await news.dismissButtonTapped({ id: target });

		const after = await onScreen();
		expect(after.map((a) => a.id)).not.toContain(target);
		expect(after.length).toBe(before.length - 1);
	});

	it("saves the dismissal, so a fresh store reads it back", async () => {
		const storage = memoryDismissedStorage();
		const saving = createDismissedNewsStore({ storage });
		const feature = createNewsFeature({ apollo, store: saving });

		const before = await onScreen();
		await feature.dismissButtonTapped({ id: before[0]!.id });

		const reloaded = createDismissedNewsStore({ storage });
		await reloaded.getState().load();
		expect(reloaded.getState().dismissedIds).toEqual([before[0]!.id]);
	});

	it("is a no-op the second time, so a double tap does not dismiss twice", async () => {
		const before = await onScreen();

		await news.dismissButtonTapped({ id: before[0]!.id });
		await news.dismissButtonTapped({ id: before[0]!.id });

		expect(store.getState().dismissedIds).toEqual([before[0]!.id]);
	});

	it("rolls back and fails when the save fails", async () => {
		const failing = createDismissedNewsStore({
			storage: {
				get: async () => null,
				set: async () => {
					throw new Error("disk full");
				},
			},
		});
		const feature = createNewsFeature({ apollo, store: failing });

		await expect(feature.dismissButtonTapped({ id: "a1" })).rejects.toThrow("disk full");
		expect(failing.getState().dismissedIds).toEqual([]);
	});
});
