import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { newsFeature } from "../../app/instances";
import { useVisibleArticles } from "./useVisibleArticles";

export function NewsScreen() {
	// The same two sources, combined by the same function, as news.list.
	const { articles, loading } = useVisibleArticles();

	return (
		<View style={styles.screen}>
			{loading && <ActivityIndicator style={styles.loading} />}

			<FlatList
				data={articles}
				keyExtractor={(article) => article.id}
				ListEmptyComponent={!loading ? <Text style={styles.empty}>No news.</Text> : null}
				renderItem={({ item }) => (
					<View style={styles.row}>
						<View style={styles.text}>
							<Text style={styles.title}>{item.title}</Text>
							<Text style={styles.summary}>{item.summary}</Text>
						</View>
						<Pressable onPress={() => void newsFeature.dismissButtonTapped({ id: item.id })}>
							<Text style={styles.dismiss}>Dismiss</Text>
						</Pressable>
					</View>
				)}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, padding: 16, gap: 12 },
	loading: { marginTop: 8 },
	empty: { color: "#667085", marginTop: 24, textAlign: "center" },
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: "#eaecf0",
	},
	text: { flex: 1, gap: 4 },
	title: { fontSize: 16, fontWeight: "600" },
	summary: { fontSize: 14, color: "#667085" },
	dismiss: { color: "#d92d20", fontSize: 14 },
});
