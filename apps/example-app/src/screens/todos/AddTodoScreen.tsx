import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { todosFeature } from "../../app/instances";
import { type RootStackParamList } from "../../navigation/routes";

type Props = NativeStackScreenProps<RootStackParamList, "AddTodo">;

/**
 * The long form of adding a todo: a title and a description. The quick composer
 * on the list screen and this screen both call `todos.newTodoSubmitted`, which is also the
 * command, so there is one implementation of adding a todo.
 */
export function AddTodoScreen({ navigation }: Props) {
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const canSave = title.trim().length > 0 && !busy;

	const save = async () => {
		if (!canSave) return;
		setBusy(true);
		setError(null);
		try {
			await todosFeature.newTodoSubmitted({
				title: title.trim(),
				// Left out rather than sent as "", so the API decides what an absent
				// description is and the screen does not encode it twice.
				description: description.trim() || undefined,
			});
			navigation.goBack();
		} catch (cause) {
			setBusy(false);
			setError(cause instanceof Error ? cause.message : "Could not save the todo.");
		}
	};

	return (
		<ScrollView style={styles.screen} contentContainerStyle={styles.content}>
			<Text style={styles.label}>Title</Text>
			<TextInput
				value={title}
				onChangeText={setTitle}
				placeholder="What needs doing?"
				style={styles.input}
				editable={!busy}
				autoFocus
				returnKeyType="next"
			/>

			<Text style={styles.label}>Description</Text>
			<TextInput
				value={description}
				onChangeText={setDescription}
				placeholder="Anything worth remembering about it (optional)"
				style={[styles.input, styles.multiline]}
				editable={!busy}
				multiline
				textAlignVertical="top"
			/>

			{error !== null && <Text style={styles.error}>{error}</Text>}

			<View style={styles.actions}>
				<Pressable onPress={() => navigation.goBack()} style={styles.cancel} disabled={busy}>
					<Text style={styles.cancelLabel}>Cancel</Text>
				</Pressable>
				<Pressable
					onPress={() => void save()}
					style={[styles.save, !canSave && styles.saveDisabled]}
					disabled={!canSave}
				>
					<Text style={styles.saveLabel}>{busy ? "Saving…" : "Save"}</Text>
				</Pressable>
			</View>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1 },
	content: { padding: 16, gap: 8 },
	label: { fontSize: 13, fontWeight: "600", color: "#344054", marginTop: 8 },
	input: {
		borderWidth: 1,
		borderColor: "#d0d5dd",
		borderRadius: 8,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 16,
	},
	multiline: { minHeight: 96 },
	error: { color: "#d92d20", fontSize: 14, marginTop: 4 },
	actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 16 },
	cancel: {
		justifyContent: "center",
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "#d0d5dd",
	},
	cancelLabel: { color: "#344054", fontWeight: "600" },
	save: {
		justifyContent: "center",
		paddingHorizontal: 16,
		paddingVertical: 10,
		borderRadius: 8,
		backgroundColor: "#2f6feb",
	},
	saveDisabled: { backgroundColor: "#a4bdf5" },
	saveLabel: { color: "#ffffff", fontWeight: "600" },
});
