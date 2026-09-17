import { type SettingsFeature } from "./settings";

export type ProfileFeatureDeps<S extends SettingsFeature> = { settingsFeature: S };

/**
 * A feature composed of another. `settings` is nested as it is, so its commands
 * are reachable as `profile.settings.setUnits` and so on. The nesting is nothing
 * but an object key: `featureCommands` adds the segment.
 *
 * Generic over the settings it is given, so `profileFeature.settings` keeps the
 * full type of the settings feature rather than narrowing to the port.
 */
export const createProfileFeature = <S extends SettingsFeature>(deps: ProfileFeatureDeps<S>) => ({
	settings: deps.settingsFeature,
});

export type ProfileFeature = ReturnType<typeof createProfileFeature>;
