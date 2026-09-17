import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useStore } from "zustand";
import { profileFeature, settingsStore } from "../../app/instances";
import { settingsStoreSelectors } from "../../features/profile/settings";

export function SettingsScreen() {
	// Reads come from the store the feature writes through; writes go through the
	// feature, which is the same entry point the command calls.
	const units = useStore(settingsStore, settingsStoreSelectors.units);
	const notifications = useStore(settingsStore, settingsStoreSelectors.notifications);

	return (
		<View style={styles.screen}>
			<Text style={styles.label}>Distance</Text>
			<View style={styles.choices}>
				{(["km", "mi"] as const).map((option) => (
					<Pressable
						key={option}
						onPress={() => void profileFeature.settings.unitButtonTapped({ units: option })}
						style={[styles.choice, units === option && styles.choiceSelected]}
					>
						<Text style={[styles.choiceLabel, units === option && styles.choiceLabelSelected]}>
							{option}
						</Text>
					</Pressable>
				))}
			</View>

			<View style={styles.row}>
				<Text style={styles.label}>Notifications</Text>
				<Switch
					value={notifications}
					onValueChange={(value) =>
						void profileFeature.settings.notificationsSwitchToggled({ notifications: value })
					}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, padding: 16, gap: 16 },
	label: { fontSize: 16 },
	choices: { flexDirection: "row", gap: 8 },
	choice: {
		paddingVertical: 8,
		paddingHorizontal: 20,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "#d0d5dd",
	},
	choiceSelected: { backgroundColor: "#2f6feb", borderColor: "#2f6feb" },
	choiceLabel: { fontSize: 16 },
	choiceLabelSelected: { color: "#ffffff", fontWeight: "600" },
	row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
