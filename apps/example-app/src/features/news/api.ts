import { type Article } from "./gql";

/**
 * Pure, and the single place "what's shown" is decided: no React, no Zustand,
 * so both the screen and the feature combine server data and local dismissals
 * the same way.
 */
export function visibleArticles(articles: Article[], dismissedIds: ReadonlySet<string>): Article[] {
	return articles.filter((article) => !dismissedIds.has(article.id));
}
