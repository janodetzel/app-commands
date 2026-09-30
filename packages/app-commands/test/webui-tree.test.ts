import { describe, expect, it } from "vitest";

import { atLevel, depthOf, isOpen, summaryOf, toggle } from "../webui/tree";

const cache = {
	"Todo:1": { __typename: "Todo", id: "1", tags: ["a", "b"] },
	"Todo:2": { __typename: "Todo", id: "2", tags: [] },
	ROOT_QUERY: { todos: [{ __ref: "Todo:1" }] },
};

describe("webui tree", () => {
	it("measures how deep branches nest", () => {
		expect(depthOf("x")).toBe(0);
		expect(depthOf({})).toBe(1);
		expect(depthOf(cache)).toBe(4);
	});

	it("opens every branch above the level", () => {
		const openness = atLevel(2);
		expect(isOpen(openness, [])).toBe(true);
		expect(isOpen(openness, ["Todo:1"])).toBe(true);
		expect(isOpen(openness, ["Todo:1", "tags"])).toBe(false);
	});

	it("toggles one branch and leaves the others to their level", () => {
		const openness = toggle(atLevel(1), ["Todo:1"]);
		expect(isOpen(openness, ["Todo:1"])).toBe(true);
		expect(isOpen(openness, ["Todo:2"])).toBe(false);
		expect(isOpen(toggle(openness, ["Todo:1"]), ["Todo:1"])).toBe(false);
	});

	it("keeps a key with a dot apart from a nested path", () => {
		const openness = toggle(atLevel(0), ["a.b"]);
		expect(isOpen(openness, ["a.b"])).toBe(true);
		expect(isOpen(openness, ["a", "b"])).toBe(false);
	});

	it("summarizes a closed branch", () => {
		expect(summaryOf([1, 2, 3])).toBe("[ 3 items ]");
		expect(summaryOf([1])).toBe("[ 1 item ]");
		expect(summaryOf({})).toBe("{}");
		expect(summaryOf({ a: 1, b: 2, c: 3, d: 4, e: 5 })).toBe("{ a, b, c, … +2 }");
	});
});
