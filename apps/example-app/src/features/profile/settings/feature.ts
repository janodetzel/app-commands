import { command } from "@janodetzel/app-commands";
import { z } from "zod";

import { type SettingsStore } from "./store";

export type SettingsFeatureDeps = { store: SettingsStore };

/**
 * Client state only, so the entry points are the store's actions. The store
 * rolls back and rethrows when the save fails, and that rethrow is what makes
 * the command fail.
 *
 * There is no `get`: the settings are read with `store.inspect --store settings`,
 * the same store the screen subscribes to.
 */
export const createSettingsFeature = (deps: SettingsFeatureDeps) => ({
	setUnits: command()
		.input({ units: z.enum(["km", "mi"]) })
		.description(
			"Sets the distance unit and saves it. Fails when the save fails, and the screen keeps the old value.",
		)
		.run(async ({ units }) => {
			await deps.store.getState().setUnits(units);
			return deps.store.getState().units;
		}),

	setNotifications: command()
		.input({ notifications: z.boolean() })
		.description(
			"Turns notifications on or off and saves. Fails when the save fails, and the screen keeps the old value.",
		)
		.run(async ({ notifications }) => {
			await deps.store.getState().setNotifications(notifications);
			return deps.store.getState().notifications;
		}),
});

export type SettingsFeature = ReturnType<typeof createSettingsFeature>;
