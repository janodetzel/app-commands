import { useQuery } from "@apollo/client/react";
import { useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { type Todo, TODOS } from "../../features/todos";
import { todosFeature } from "../../app/instances";

export function TodosScreen() {
	const { data, loading } = useQuery<{ todos: Todo[] }>(TODOS);
	const [title, setTitle] = useState("");
	const [busy, setBusy] = useState(false);

	// The screen calls the feature method directly, and so does the bridge:
	// `todos.newTodoSubmitted` is the command. No dispatch wrapper in between.
	const submit = async () => {
		if (!title.trim()) return;
		setBusy(true);
		try {
			await todosFeature.newTodoSubmitted({ title: title.trim() });
			setTitle("");
		} finally {
			setBusy(false);
		}
	};

	return (
		<View style={styles.screen}>
			<View style={styles.composer}>
				<TextInput
					value={title}
					onChangeText={setTitle}
					onSubmitEditing={() => void submit()}
					placeholder="What needs doing?"
					style={styles.input}
					editable={!busy}
					returnKeyType="done"
				/>
				<Pressable onPress={() => void submit()} style={styles.add} disabled={busy}>
					<Text style={styles.addLabel}>Add</Text>
				</Pressable>
			</View>

			{loading && <ActivityIndicator style={styles.loading} />}

			<FlatList
				data={data?.todos ?? []}
				keyExtractor={(todo) => todo.id}
				ListEmptyComponent={!loading ? <Text style={styles.empty}>Nothing to do.</Text> : null}
				renderItem={({ item }) => (
					<View style={styles.row}>
						<Pressable
							style={styles.check}
							onPress={() => void todosFeature.checkboxTapped({ id: item.id, done: !item.done })}
						>
							<Text style={styles.checkMark}>{item.done ? "☑" : "☐"}</Text>
							<View style={styles.text}>
								<Text style={[styles.title, item.done && styles.titleDone]}>{item.title}</Text>
								{item.description !== "" && (
									<Text style={styles.description}>{item.description}</Text>
								)}
							</View>
						</Pressable>
						<Pressable onPress={() => void todosFeature.deleteButtonTapped({ id: item.id })}>
							<Text style={styles.remove}>Delete</Text>
						</Pressable>
					</View>
				)}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, padding: 16, gap: 12 },
	composer: { flexDirection: "row", gap: 8 },
	input: {
		flex: 1,
		borderWidth: 1,
		borderColor: "#d0d5dd",
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 16,
	},
	add: {
		justifyContent: "center",
		paddingHorizontal: 16,
		borderRadius: 8,
		backgroundColor: "#2f6feb",
	},
	addLabel: { color: "#ffffff", fontWeight: "600" },
	loading: { marginTop: 8 },
	empty: { color: "#667085", marginTop: 24, textAlign: "center" },
	row: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: "#eaecf0",
	},
	check: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
	text: { flex: 1, gap: 2 },
	checkMark: { fontSize: 18 },
	title: { fontSize: 16, flexShrink: 1 },
	titleDone: { color: "#98a2b3", textDecorationLine: "line-through" },
	description: { fontSize: 14, color: "#667085" },
	remove: { color: "#d92d20", fontSize: 14 },
});
