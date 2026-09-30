import { isUiFile } from "../lib/paths.mjs";

const isGetStateCall = (node) =>
	node?.type === "CallExpression" &&
	node.callee.type === "MemberExpression" &&
	!node.callee.computed &&
	node.callee.property.type === "Identifier" &&
	node.callee.property.name === "getState";

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"The UI changes state through commands only, so a tap and an agent's call run one implementation.",
		},
		messages: {
			action:
				"A screen does not call store actions. Call the feature's command instead, so the change runs the same rules as an agent's call.",
			destructured:
				"Taking fields from getState() in the UI hands out the store's actions and reads without subscribing. Read with useStore and a selector, and change state through a command.",
			wholeStore:
				"useStore without a selector hands the store's actions to the UI. Pass one of the feature's selectors, and change state through a command.",
		},
		schema: [
			{
				type: "object",
				properties: { uiDirs: { type: "array", items: { type: "string" } } },
				additionalProperties: false,
			},
		],
	},

	create(context) {
		if (!isUiFile(context.filename, context.options[0] ?? {})) return {};

		return {
			CallExpression(node) {
				// store.getState().action(...)
				if (node.callee.type === "MemberExpression" && isGetStateCall(node.callee.object)) {
					context.report({ node, messageId: "action" });
					return;
				}
				// useStore(store): the whole state, actions included.
				if (
					node.callee.type === "Identifier" &&
					node.callee.name === "useStore" &&
					node.arguments.length === 1
				) {
					context.report({ node, messageId: "wholeStore" });
				}
			},
			// const { add } = store.getState()
			VariableDeclarator(node) {
				if (node.id.type === "ObjectPattern" && isGetStateCall(node.init)) {
					context.report({ node, messageId: "destructured" });
				}
			},
		};
	},
};
