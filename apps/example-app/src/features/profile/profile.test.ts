import { command, featureCommands } from "@janodetzel/app-commands";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createProfileFeature } from ".";

/**
 * Settings are a stand-in built with `command()`, because a feature never
 * imports another, not even in a test. It is enough to show what profile adds,
 * which is the nesting: the settings commands are registered a segment deeper.
 */
const fakeSettings = () => {
	const state = { units: "mi" as "km" | "mi", notifications: false };
	return {
		setUnits: command()
			.input({ units: z.enum(["km", "mi"]) })
			.description("Sets the fake units.")
			.run(async ({ units }) => {
				state.units = units;
				return units;
			}),
		setNotifications: command()
			.input({ notifications: z.boolean() })
			.description("Sets the fake notifications.")
			.run(async ({ notifications }) => {
				state.notifications = notifications;
				return notifications;
			}),
	};
};

describe("the profile feature", () => {
	it("nests the settings commands under its own namespace", () => {
		const registry = featureCommands({
			profile: createProfileFeature({ settingsFeature: fakeSettings() }),
		});

		expect(Object.keys(registry).sort()).toEqual([
			"profile.settings.setNotifications",
			"profile.settings.setUnits",
		]);
	});
});
