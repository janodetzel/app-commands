import { moduleSpecifierVisitors } from "../lib/imports.mjs";
import { isLogicFile } from "../lib/paths.mjs";

/** A trailing `*` matches a prefix; anything else must match exactly. */
const DEFAULT_MODULES = [
	"react",
	"react-native",
	"react-native/*",
	// Native modules published as their own packages: react-native-share,
	// react-native-view-shot, react-native-mmkv. Each needs the native runtime.
	"react-native-*",
	"react-dom",
	"expo",
	"expo-*",
	"@react-navigation/*",
];

const matches = (specifier, pattern) =>
	pattern.endsWith("*") ? specifier.startsWith(pattern.slice(0, -1)) : specifier === pattern;

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"Keep React and the platform out of the files a command calls, so the same code runs from a tap and from the bridge.",
		},
		messages: {
			uiInLogic:
				'"{{specifier}}" only runs inside React, but {{file}} has to be callable from outside it. Move the UI part into a screen, outside the feature.',
		},
		schema: [
			{
				type: "object",
				properties: {
					featuresDir: { type: "string" },
					logicFiles: { type: "array", items: { type: "string" } },
					modules: { type: "array", items: { type: "string" } },
				},
				additionalProperties: false,
			},
		],
	},

	create(context) {
		const options = context.options[0] ?? {};
		if (!isLogicFile(context.filename, options)) return {};

		const modules = options.modules ?? DEFAULT_MODULES;
		const file = context.filename.slice(context.filename.lastIndexOf("/") + 1);

		return moduleSpecifierVisitors((specifier, node) => {
			if (modules.some((pattern) => matches(specifier, pattern))) {
				context.report({ node, messageId: "uiInLogic", data: { specifier, file } });
			}
		});
	},
};
