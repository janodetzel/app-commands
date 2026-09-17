import { useQuery } from "@apollo/client/react";
import { useStore } from "zustand";
import {
	type Article,
	dismissedNewsStoreSelectors,
	NEWS,
	visibleArticles,
} from "../../features/news";
import { dismissedNewsStore } from "../../app/instances";

/**
 * Binds `visibleArticles` to the live instances: server data from Apollo, local
 * dismissals from the store. `news.list` combines the same two sources with the
 * same function, so the screen and the command cannot disagree.
 *
 * The projection stays in the feature and this binding stays with the screens,
 * because subscribing is a React concern and the rule is not.
 */
export function useVisibleArticles(): { articles: Article[]; loading: boolean } {
	const { data, loading } = useQuery<{ news: Article[] }>(NEWS);
	const dismissedIds = useStore(dismissedNewsStore, dismissedNewsStoreSelectors.dismissedIds);

	return { articles: visibleArticles(data?.news ?? [], new Set(dismissedIds)), loading };
}
