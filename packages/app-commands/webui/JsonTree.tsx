import { useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
	atLevel,
	childrenOf,
	depthOf,
	isBranch,
	isOpen,
	summaryOf,
	toggle,
	type Openness,
	type Path,
} from "./tree";

/** A result this many lines long or shorter opens fully; a longer one opens at its top level. */
const SHORT_RESULT_LINES = 40;
/** Level buttons past this many are noise; "all" covers the rest. */
const MAX_LEVEL_BUTTONS = 6;

/**
 * A command result as a tree whose branches open and close. A level button opens
 * every branch down to that depth; a click toggles one branch. "Raw" shows the
 * plain JSON for copying.
 */
export function JsonTree({ value }: { value: unknown }) {
	const depth = useMemo(() => depthOf(value), [value]);
	const raw = useMemo(() => JSON.stringify(value, null, 2) ?? "undefined", [value]);
	const [openness, setOpenness] = useState<Openness>(() =>
		atLevel(raw.split("\n").length <= SHORT_RESULT_LINES ? Infinity : 1),
	);
	const [showRaw, setShowRaw] = useState(false);

	const onToggle = (path: Path) => setOpenness((o) => toggle(o, path));

	const levels = Array.from({ length: Math.min(depth - 1, MAX_LEVEL_BUTTONS) }, (_, i) => i + 1);
	const picked = (level: number) => !showRaw && openness.overrides.size === 0 && openness.level === level;

	return (
		<View style={styles.box}>
			{depth > 0 && (
				<View style={styles.toolbar}>
					<ToolbarButton label="collapse" active={picked(0)} onPress={() => pick(0)} />
					{levels.map((level) => (
						<ToolbarButton
							key={level}
							label={String(level)}
							active={picked(level)}
							onPress={() => pick(level)}
						/>
					))}
					<ToolbarButton
						label="expand all"
						active={!showRaw && openness.overrides.size === 0 && openness.level >= depth}
						onPress={() => pick(Infinity)}
					/>
					<View style={styles.spacer} />
					<ToolbarButton label="raw" active={showRaw} onPress={() => setShowRaw((r) => !r)} />
				</View>
			)}

			{showRaw || depth === 0 ? (
				<Text style={styles.raw} selectable>
					{raw}
				</Text>
			) : (
				<Node value={value} path={[]} openness={openness} onToggle={onToggle} />
			)}
		</View>
	);

	function pick(level: number) {
		setShowRaw(false);
		setOpenness(atLevel(level));
	}
}

function Node({
	name,
	value,
	path,
	openness,
	onToggle,
	last = true,
}: {
	name?: string | number;
	value: unknown;
	path: Path;
	openness: Openness;
	onToggle: (path: Path) => void;
	last?: boolean;
}) {
	const label = name === undefined ? null : typeof name === "number" ? `${name}: ` : `${JSON.stringify(name)}: `;
	const comma = last ? "" : ",";

	if (!isBranch(value)) {
		return (
			<Line>
				{label && <Text style={styles.key}>{label}</Text>}
				<Leaf value={value} />
				<Text style={styles.punctuation}>{comma}</Text>
			</Line>
		);
	}

	const children = childrenOf(value);
	const [openBracket, closeBracket] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];

	if (children.length === 0) {
		return (
			<Line>
				{label && <Text style={styles.key}>{label}</Text>}
				<Text style={styles.punctuation}>
					{openBracket}
					{closeBracket}
					{comma}
				</Text>
			</Line>
		);
	}

	const open = isOpen(openness, path);

	return (
		<View>
			<Pressable onPress={() => onToggle(path)} style={styles.toggleRow}>
				<Text style={styles.chevron}>{open ? "▾" : "▸"}</Text>
				{label && <Text style={styles.key}>{label}</Text>}
				{open ? (
					<Text style={styles.punctuation}>{openBracket}</Text>
				) : (
					<Text style={styles.summary}>
						{summaryOf(value)}
						<Text style={styles.punctuation}>{comma}</Text>
					</Text>
				)}
			</Pressable>
			{open && (
				<>
					<View style={styles.children}>
						{children.map(([key, child], index) => (
							<Node
								key={key}
								name={key}
								value={child}
								path={[...path, key]}
								openness={openness}
								onToggle={onToggle}
								last={index === children.length - 1}
							/>
						))}
					</View>
					<Line>
						<Text style={styles.punctuation}>
							{closeBracket}
							{comma}
						</Text>
					</Line>
				</>
			)}
		</View>
	);
}

/** A row that lines up with the text after a branch's chevron. */
function Line({ children }: { children: ReactNode }) {
	return (
		<Text style={styles.line} selectable>
			{children}
		</Text>
	);
}

function Leaf({ value }: { value: unknown }) {
	if (typeof value === "string") return <Text style={styles.string}>{JSON.stringify(value)}</Text>;
	if (typeof value === "number") return <Text style={styles.number}>{String(value)}</Text>;
	return <Text style={styles.literal}>{String(value)}</Text>;
}

function ToolbarButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
	return (
		<Pressable onPress={onPress} style={[styles.button, active && styles.buttonActive]}>
			<Text style={styles.buttonLabel}>{label}</Text>
		</Pressable>
	);
}

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
const CHEVRON_WIDTH = 14;

const text = { fontFamily: mono, fontSize: 12, lineHeight: 18 } as const;

const styles = StyleSheet.create({
	box: { backgroundColor: "#161b22", borderRadius: 6, padding: 12, gap: 10 },
	toolbar: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
	spacer: { flex: 1 },
	button: {
		paddingVertical: 3,
		paddingHorizontal: 8,
		borderRadius: 5,
		borderWidth: 1,
		borderColor: "#2a313c",
	},
	buttonActive: { borderColor: "#4c8dff", backgroundColor: "#16243b" },
	buttonLabel: { color: "#c9d1d9", fontSize: 11, fontFamily: mono },
	raw: { ...text, color: "#c9d1d9" },
	toggleRow: { flexDirection: "row", alignItems: "baseline", cursor: "pointer" },
	chevron: { ...text, width: CHEVRON_WIDTH, color: "#7d8590" },
	line: { ...text, paddingLeft: CHEVRON_WIDTH, color: "#c9d1d9" },
	children: { paddingLeft: 16 },
	key: { ...text, color: "#79c0ff" },
	punctuation: { ...text, color: "#7d8590" },
	summary: { ...text, color: "#7d8590", fontStyle: "italic" },
	string: { ...text, color: "#a5d6ff" },
	number: { ...text, color: "#ffa657" },
	literal: { ...text, color: "#d2a8ff" },
});
