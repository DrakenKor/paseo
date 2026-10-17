// launchd entry for the personal-fork daemon (see FORK.md).
//
// Runs this slot's supervisor in-process so the launchd job is a single, stable runtime binary:
// macOS privacy grants (Full Disk Access) attach to that binary, so deploys never re-prompt.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const slot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const forkRoot = process.env.PASEO_FORK_ROOT ?? path.join(os.homedir(), ".paseo-fork");

/** Reads the interactive login-shell environment, as a Terminal or Paseo Desktop would see it. */
function readLoginShellEnv() {
  const shell = process.env.SHELL || "/bin/zsh";
  const marker = randomUUID();
  const result = spawnSync(shell, ["-ilc", `printf %s ${marker}; env -0; printf %s ${marker}`], {
    encoding: "utf8",
    timeout: 20_000,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const body = result.stdout?.split(marker)[1];
  if (!body) {
    process.stderr.write(`login shell env unavailable (status ${result.status})\n`);
    return {};
  }
  const env = {};
  for (const entry of body.split("\0")) {
    const separator = entry.indexOf("=");
    if (separator > 0) env[entry.slice(0, separator)] = entry.slice(separator + 1);
  }
  return env;
}

const loginEnv = readLoginShellEnv();
// Persisted config owns daemon settings; stray PASEO_* shell exports must not override it.
for (const key of Object.keys(loginEnv)) {
  if (key.startsWith("PASEO_")) delete loginEnv[key];
}
Object.assign(process.env, loginEnv, {
  PASEO_HOME: process.env.PASEO_HOME ?? path.join(os.homedir(), ".paseo"),
  PASEO_FORK_ROOT: forkRoot,
  // Paseo Desktop attaches to a desktop-managed daemon with its saved local credential, and the
  // daemon refuses npm self-updates; deploys come from the fork instead.
  PASEO_DESKTOP_MANAGED: "1",
  PASEO_CLI: path.join(forkRoot, "bin", "paseo"),
});

await import(
  pathToFileURL(path.join(slot, "packages/server/dist/scripts/supervisor-entrypoint.js")).href
);
