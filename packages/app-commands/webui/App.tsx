import {
	PLUGIN_NAME,
	PROTOCOL_VERSION,
	REQUEST_MESSAGE,
	RESPONSE_MESSAGE,
	type CommandInfo,
	type Request,
	type Response,
} from "@janodetzel/app-commands/protocol";
import { useDevToolsPluginClient } from "expo/devtools";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { JsonTree } from "./JsonTree";
import { buildArgs, fieldsOf, type Field } from "./schema";

export default function App() {
	const client = useDevToolsPluginClient(PLUGIN_NAME);
	// Metro forwards every message to every client. This is how the console knows
	// which responses are answers to its own requests.
	const clientId = useMemo(() => `webui-${Math.random().toString(36).slice(2)}`, []);
	const pending = useRef(new Map<string, (response: Response) => void>());

	const [commands, setCommands] = useState<CommandInfo[] | null>(null);
	const [selected, setSelected] = useState<string | null>(null);
	const [values, setValues] = useState<Record<string, string | boolean>>({});
	const [response, setResponse] = useState<Response | null>(null);
	const [problem, setProblem] = useState<string | null>(null);
	const [running, setRunning] = useState(false);

	const send = useCallback(
		(body: { cmd: "commands" } | { cmd: "run"; command: string; args: unknown }) => {
			if (!client) return Promise.reject(new Error("not connected to the app"));

			const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
			const request = { id, clientId, protocolVersion: PROTOCOL_VERSION, ...body } as Request;

			return new Promise<Response>((resolve) => {
				pending.current.set(id, resolve);
				client.sendMessage(REQUEST_MESSAGE, request);
			});
		},
		[client, clientId],
	);

	useEffect(() => {
		if (!client) return;

		const subscription = client.addMessageListener(RESPONSE_MESSAGE, (payload: Response) => {
			if (payload?.clientId !== clientId) return;
			const resolve = pending.current.get(payload.id);
			if (!resolve) return;
			pending.current.delete(payload.id);
			resolve(payload);
		});

		void send({ cmd: "commands" }).then((res) => {
			if (res.ok) setCommands(res.result as CommandInfo[]);
			else setProblem(`${res.code}: ${res.error}`);
		});

		return () => subscription.remove();
	}, [client, clientId, send]);

	const info = commands?.find((c) => c.name === selected) ?? null;
	const fields = useMemo(() => (info ? fieldsOf(info.args) : []), [info]);

	const select = (name: string) => {
		setSelected(name);
		setValues({});
		setResponse(null);
		setProblem(null);
	};

	const run = async () => {
		if (!info) return;
		setProblem(null);

		let args: unknown;
		try {
			args = buildArgs(fields, values);
		} catch (e) {
			setProblem(e instanceof Error ? e.message : String(e));
			return;
		}

		setRunning(true);
		try {
			setResponse(await send({ cmd: "run", command: info.name, args }));
		} finally {
			setRunning(false);
		}
	};

	return (
		<View style={styles.page}>
			<View style={styles.sidebar}>
				<Text style={styles.heading}>app commands</Text>
				{!client && <Text style={styles.muted}>Connecting…</Text>}
				{client && !commands && <Text style={styles.muted}>Asking the app…</Text>}
				<ScrollView>
					{groupByNamespace(commands ?? []).map(([namespace, group]) => (
						<View key={namespace} style={styles.group}>
							<Text style={styles.namespace}>{namespace}</Text>
							{group.map((c) => (
								<Pressable
									key={c.name}
									onPress={() => select(c.name)}
									style={[styles.command, c.name === selected && styles.commandSelected]}
								>
									<Text style={styles.commandName}>{c.name.split(".").slice(1).join(".")}</Text>
								</Pressable>
							))}
						</View>
					))}
				</ScrollView>
			</View>

			<ScrollView style={styles.main} contentContainerStyle={styles.mainContent}>
				{!info && <Text style={styles.muted}>Pick a command.</Text>}

				{info && (
					<>
						<Text style={styles.title}>{info.name}</Text>
						<Text style={styles.description}>{info.description}</Text>

						{fields.length === 0 && <Text style={styles.muted}>No arguments.</Text>}

						{fields.map((field) => (
							<FieldInput
								key={field.name}
								field={field}
								value={values[field.name]}
								onChange={(value) => setValues((v) => ({ ...v, [field.name]: value }))}
							/>
						))}

						<Pressable onPress={run} disabled={running} style={styles.run}>
							<Text style={styles.runLabel}>{running ? "Running…" : "Run"}</Text>
						</Pressable>

						{problem && <Text style={styles.problem}>{problem}</Text>}

						{response && (
							<View style={styles.response}>
								<Text style={response.ok ? styles.ok : styles.failed}>
									{response.ok
										? `ok · ${response.durationMs ?? "?"} ms`
										: `${response.code} · ${response.error}`}
								</Text>
								<JsonTree key={response.id} value={response.ok ? response.result : (response.issues ?? [])} />
							</View>
						)}
					</>
				)}
			</ScrollView>
		</View>
	);
}

function FieldInput({
	field,
	value,
	onChange,
}: {
	field: Field;
	value: string | boolean | undefined;
	onChange: (value: string | boolean) => void;
}) {
	return (
		<View style={styles.field}>
			<Text style={styles.label}>
				{field.name}
				{field.required ? " *" : ""} <Text style={styles.muted}>{field.kind}</Text>
			</Text>

			{field.kind === "boolean" && (
				<Pressable onPress={() => onChange(!value)} style={styles.checkbox}>
					<Text style={styles.checkboxMark}>{value ? "☑" : "☐"}</Text>
					<Text style={styles.muted}>{String(Boolean(value))}</Text>
				</Pressable>
			)}

			{field.kind === "enum" && (
				<View style={styles.choices}>
					{field.values.map((option) => (
						<Pressable
							key={option}
							onPress={() => onChange(option)}
							style={[styles.choice, value === option && styles.choiceSelected]}
						>
							<Text style={styles.choiceLabel}>{option}</Text>
						</Pressable>
					))}
				</View>
			)}

			{(field.kind === "object" || field.kind === "array") && (
				<TextInput
					multiline
					numberOfLines={4}
					value={typeof value === "string" ? value : ""}
					onChangeText={onChange}
					placeholder={field.kind === "array" ? "[]" : "{}"}
					style={[styles.input, styles.jsonInput]}
				/>
			)}

			{(field.kind === "string" || field.kind === "number" || field.kind === "integer") && (
				<TextInput
					value={typeof value === "string" ? value : ""}
					onChangeText={onChange}
					placeholder={field.kind === "string" ? "text" : "number"}
					style={styles.input}
				/>
			)}
		</View>
	);
}

function groupByNamespace(commands: CommandInfo[]): [string, CommandInfo[]][] {
	const groups = new Map<string, CommandInfo[]>();
	for (const c of commands) {
		const namespace = c.name.split(".")[0] ?? "";
		groups.set(namespace, [...(groups.get(namespace) ?? []), c]);
	}
	return [...groups.entries()];
}

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

const styles = StyleSheet.create({
	page: { flex: 1, flexDirection: "row", backgroundColor: "#0f1115" },
	sidebar: {
		width: 240,
		padding: 16,
		gap: 12,
		borderRightWidth: 1,
		borderRightColor: "#21252d",
	},
	heading: { color: "#e6e8ec", fontSize: 14, fontWeight: "600", fontFamily: mono },
	group: { marginBottom: 12, gap: 2 },
	namespace: {
		color: "#7d8590",
		fontSize: 11,
		textTransform: "uppercase",
		letterSpacing: 1,
		marginBottom: 4,
	},
	command: { paddingVertical: 5, paddingHorizontal: 8, borderRadius: 6 },
	commandSelected: { backgroundColor: "#1d2530" },
	commandName: { color: "#c9d1d9", fontSize: 13, fontFamily: mono },
	main: { flex: 1 },
	mainContent: { padding: 24, gap: 12, maxWidth: 760 },
	title: { color: "#e6e8ec", fontSize: 18, fontWeight: "600", fontFamily: mono },
	description: { color: "#9aa4b2", fontSize: 13, lineHeight: 20 },
	field: { gap: 6, marginTop: 8 },
	label: { color: "#c9d1d9", fontSize: 12, fontFamily: mono },
	muted: { color: "#7d8590", fontSize: 12 },
	input: {
		backgroundColor: "#161b22",
		borderWidth: 1,
		borderColor: "#2a313c",
		borderRadius: 6,
		color: "#e6e8ec",
		padding: 8,
		fontFamily: mono,
		fontSize: 13,
	},
	jsonInput: { minHeight: 84, textAlignVertical: "top" },
	checkbox: { flexDirection: "row", alignItems: "center", gap: 8 },
	checkboxMark: { color: "#e6e8ec", fontSize: 16 },
	choices: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
	choice: {
		paddingVertical: 5,
		paddingHorizontal: 10,
		borderRadius: 6,
		borderWidth: 1,
		borderColor: "#2a313c",
	},
	choiceSelected: { borderColor: "#4c8dff", backgroundColor: "#16243b" },
	choiceLabel: { color: "#c9d1d9", fontSize: 12, fontFamily: mono },
	run: {
		alignSelf: "flex-start",
		marginTop: 16,
		paddingVertical: 8,
		paddingHorizontal: 16,
		borderRadius: 6,
		backgroundColor: "#2f6feb",
	},
	runLabel: { color: "#ffffff", fontSize: 13, fontWeight: "600" },
	problem: { color: "#ff7b72", fontSize: 13, marginTop: 8 },
	response: { marginTop: 16, gap: 8 },
	ok: { color: "#3fb950", fontSize: 12, fontFamily: mono },
	failed: { color: "#ff7b72", fontSize: 12, fontFamily: mono },
});
