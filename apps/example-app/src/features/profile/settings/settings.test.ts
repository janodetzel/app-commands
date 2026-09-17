import { describe, expect, it } from "vitest";

import { createSettingsFeature } from ".";
import { createSettingsStore, type SettingsState } from "./store";

/**
 * The feature is tested through its own methods, which is what the screen calls
 * and what a command calls. The store takes its storage as a dependency, so a
 * test hands it an in-memory one and no mocking is needed.
 */

const memoryStorage = () => {
	let saved: SettingsState | null = null;
	return {
		get: async () => saved,
		set: async (settings: SettingsState) => {
			saved = settings;
		},
		read: () => saved,
	};
};

describe("the settings feature", () => {
	it("saves what it sets, and leaves it in the store the screen reads", async () => {
		const storage = memoryStorage();
		const store = createSettingsStore({ storage });
		const settings = createSettingsFeature({ store });

		expect(await settings.unitButtonTapped({ units: "mi" })).toBe("mi");
		expect(storage.read()).toEqual({ units: "mi", notifications: true });
		// What `store.inspect --store settings` returns, minus the actions.
		expect(store.getState()).toMatchObject({ units: "mi", notifications: true });
	});

	it("saves a notification toggle through the store the screen reads", async () => {
		const storage = memoryStorage();
		const store = createSettingsStore({ storage });
		const settings = createSettingsFeature({ store });

		await settings.notificationsSwitchToggled({ notifications: false });

		expect(store.getState().notifications).toBe(false);
		expect(storage.read()).toEqual({ units: "km", notifications: false });
	});

	it("rolls back and fails when the save fails", async () => {
		const store = createSettingsStore({
			storage: {
				get: async () => null,
				set: async () => {
					throw new Error("disk full");
				},
			},
		});
		const settings = createSettingsFeature({ store });

		await expect(settings.unitButtonTapped({ units: "mi" })).rejects.toThrow("disk full");
		// The rethrow is what makes the command fail, and the rollback is what keeps
		// the screen showing what was actually saved.
		expect(store.getState().units).toBe("km");
	});

	it("loads what was saved earlier", async () => {
		const storage = memoryStorage();
		await storage.set({ units: "mi", notifications: false });

		const store = createSettingsStore({ storage });
		await store.getState().load();

		expect(store.getState()).toMatchObject({ units: "mi", notifications: false });
	});
});
