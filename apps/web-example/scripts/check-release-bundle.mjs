#!/usr/bin/env node
// The command transport is a remote control for the page, so it must not reach a
// release build. This builds the app and fails if the transport shows up in it.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// What only the transport and the registry contain. The registry names every
// command and describes it, so its command names stand for the whole of it.
const FORBIDDEN = [
	"attachWebCommands",
	"app-commands:request",
	"app-commands:response",
	"__app-commands",
	"todos.newTodoSubmitted",
];
// What the page itself contains, so an empty or misplaced output cannot pass.
const EXPECTED = "What needs doing?";

const outputDir = mkdtempSync(join(tmpdir(), "web-release-bundle-"));

try {
	execFileSync("npx", ["vite", "build", "--outDir", outputDir, "--emptyOutDir"], {
		stdio: "inherit",
	});

	const files = readdirSync(outputDir, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.(js|css|html)$/.test(entry.name))
		.map((entry) => join(entry.parentPath, entry.name));
	const contents = files.map((file) => [file, readFileSync(file)]);

	if (!contents.some(([, bytes]) => bytes.includes(EXPECTED))) {
		console.error(`The build holds no "${EXPECTED}", so this check proved nothing.`);
		process.exit(1);
	}

	const found = contents.flatMap(([file, bytes]) =>
		FORBIDDEN.filter((needle) => bytes.includes(needle)).map((n) => `${n} in ${file}`),
	);
	if (found.length > 0) {
		console.error("The release build contains the command transport:");
		for (const hit of found) console.error(`  ${hit}`);
		process.exit(1);
	}

	console.log(`The release build is clean: ${files.length} files checked.`);
} finally {
	rmSync(outputDir, { recursive: true, force: true });
}
