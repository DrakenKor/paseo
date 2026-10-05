import { afterEach, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createDaemonTestContext,
  type DaemonTestContext,
} from "../test-utils/index.js";

const contexts: DaemonTestContext[] = [];
const dirs: string[] = [];

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.cleanup();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
}, 60_000);

function createRepoWithFailingSetup(): string {
  const repo = mkdtempSync(path.join(tmpdir(), "setup-restart-repo-"));
  dirs.push(repo);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, stdio: "ignore" });
  git("init", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  writeFileSync(
    path.join(repo, "paseo.json"),
    JSON.stringify({ worktree: { setup: ["echo before-fail", "exit 3"] } })
  );
  git("add", ".");
  git("commit", "-m", "init");
  return repo;
}

async function startDaemon(paseoHomeRoot: string): Promise<DaemonTestContext> {
  const ctx = await createDaemonTestContext({ paseoHomeRoot, cleanup: false });
  contexts.push(ctx);
  return ctx;
}

test("a failed worktree setup is still reported after the daemon restarts", async () => {
  const repo = createRepoWithFailingSetup();
  const paseoHomeRoot = mkdtempSync(path.join(tmpdir(), "setup-restart-home-"));
  dirs.push(paseoHomeRoot);

  const first = await startDaemon(paseoHomeRoot);
  await first.client.addProject(repo);
  const created = await first.client.createPaseoWorktree({
    cwd: repo,
    worktreeSlug: "failing-setup",
  });
  const workspaceId = created.workspace?.id;
  expect(workspaceId).toBeTruthy();

  await expect
    .poll(
      async () =>
        (
          await first.client.fetchWorkspaceSetupStatus(workspaceId!)
        ).snapshot?.status,
      {
        timeout: 20_000,
      }
    )
    .toBe("failed");

  await first.cleanup();
  contexts.splice(contexts.indexOf(first), 1);
  const second = await startDaemon(paseoHomeRoot);

  const workspaces = await second.client.fetchWorkspaces();
  expect(workspaces.entries.map((entry) => entry.id)).toContain(workspaceId);

  const afterRestart = await second.client.fetchWorkspaceSetupStatus(
    workspaceId!
  );
  expect(afterRestart.snapshot?.status).toBe("failed");
}, 60_000);
