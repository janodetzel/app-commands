// Metro has to see the workspace packages, and it must not walk out of the
// workspace looking for a second copy of react.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
	path.resolve(projectRoot, "node_modules"),
	path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

// Agent tests are never bundled, and a run writes screenshots and recordings into
// agent-tests/runs/. Watched, each new image would flash the dev client's
// "Refreshing…" banner in the middle of a test.
const agentTests = path.join(projectRoot, "agent-tests");
config.resolver.blockList = [
	...[].concat(config.resolver.blockList ?? []),
	new RegExp(`^${agentTests.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\\\/]`),
];

// The bridge needs no Metro config of its own.
module.exports = config;
