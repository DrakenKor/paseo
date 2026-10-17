# Personal fork

`personal` on [DrakenKor/paseo](https://github.com/DrakenKor/paseo) is upstream `getpaseo/paseo`
`main` plus local patch commits. It runs as the everyday Paseo on Manav's Macs. This file overrides
repo docs that forbid restarting the daemon: deploy with `scripts/fork/paseo-fork`, never with
`paseo daemon restart`, `paseo daemon stop`, or `launchctl`.

## Layout

| Path                                                | What it is                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `~/Documents/Repo/paseo` on `personal`              | Where you edit and commit                                          |
| `~/.paseo-fork/slots/a`, `slots/b`                  | Build slots (git worktrees). The daemon runs from one. Never edit. |
| `~/.paseo-fork/current`                             | Symlink to the live slot                                           |
| `~/.paseo-fork/runtime/Paseo Daemon.app`            | Pinned node runtime; holds the Full Disk Access grant              |
| `~/.paseo-fork/bin/paseo`                           | CLI from the live slot; the `paseo` on PATH points here            |
| `~/.paseo-fork/logs/`                               | `deploy.log`, `build-<slot>.log`, `launchd.log`                    |
| `~/Library/LaunchAgents/sh.paseo.fork.daemon.plist` | Starts the daemon at login and after a crash                       |
| `/Applications/Paseo.app`                           | Fork desktop build; attaches to the daemon, never starts its own   |
| `scripts/fork/icon.svg`, `icon.icns`                | Fork icon for Paseo.app and Paseo Daemon.app                       |

Daemon state, pairings, and settings stay in `~/.paseo`.

## Fix something live

1. Commit the fix on `personal` (or merge a branch into it). Uncommitted changes are not deployed.
2. Run typecheck and lint for what you touched (see CLAUDE.md).
3. Run `scripts/fork/paseo-fork deploy`. It builds into the idle slot, which takes 2–6 minutes, so
   give it a 10-minute timeout. A build error prints here and leaves the live daemon untouched.
4. After a good build the daemon switches over 15 seconds later. The restart ends your own agent
   process, so write your final summary as soon as `deploy` returns. The session resumes on the
   user's next message.
5. A new daemon that fails its health check rolls back to the previous slot on its own. Check the
   outcome with `scripts/fork/paseo-fork status`.

`--now` skips the 15-second delay. `--desktop` also rebuilds and reinstalls Paseo.app; it takes
much longer and relaunches the desktop app.

## Where a change shows up

| Change in                                               | Reaches                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/server`, `cli`, `protocol`, `client`, `relay` | The daemon, on every deploy                                                           |
| `packages/app`                                          | The web UI at `http://<host>:6767/` on every deploy; the desktop app with `--desktop` |
| `packages/desktop`                                      | The desktop app with `--desktop`                                                      |

The App Store iOS app never gets fork changes to `packages/app`. Check app fixes from the phone in
Safari at `http://work.berylline-corn.ts.net:6767/` (Tailscale).

## Upstream fixes

`scripts/fork/paseo-fork sync` rebases `personal` onto upstream `main` and force-pushes it to the
fork. Deploy afterwards. On a conflict, resolve it and run `git rebase --continue`. When the
conflict is a patch upstream already merged, run `git rebase --skip`. Then run the
`git push --force-with-lease` command that `sync` printed.

To send a patch upstream, cherry-pick it onto a branch from upstream `main` and open the PR from
`DrakenKor`.

## Rollback

- `scripts/fork/paseo-fork rollback` (or `switch`) moves the daemon back to the other slot's build.
- `~/.paseo-fork/backups/Paseo-upstream.app` is the original signed release.

## New machine

Requires Apple Silicon, git, node 22 or newer, and the Xcode Command Line Tools.

```bash
git clone -b personal https://github.com/DrakenKor/paseo.git ~/Documents/Repo/paseo
cd ~/Documents/Repo/paseo && scripts/fork/paseo-fork install
# Grant Full Disk Access to ~/.paseo-fork/runtime/Paseo Daemon.app, as install prints.
scripts/fork/paseo-fork deploy --desktop --now
```

The first activation quits Paseo Desktop, stops the daemon it started, and switches the desktop
app to attach mode.

## Why it is shaped this way

- **No unattended prompts.** A launchd job's file access belongs to its own binary, and an
  ungranted binary blocks on the "access Documents" prompt. The pinned runtime is granted once and
  never changes during deploys. The desktop build runs with `--use-mock-keychain`, since
  each ad-hoc rebuild would otherwise prompt for the login password at launch.
- **Tailnet only.** `install` binds the daemon to the Mac's Tailscale address and turns the relay
  off. The setting lives in `~/.paseo/config.json`, and the launchd entry drops `PASEO_*` shell
  exports, so nothing overrides it.
- **Two slots.** A build never touches the running code, and rollback is a symlink flip.
- **Detached activation.** The restart kills every agent process, including the one deploying, so
  `deploy` hands the switch to a process in its own session.
- **Desktop-managed flag.** The daemon runs with `PASEO_DESKTOP_MANAGED=1`. Paseo Desktop then
  reuses its saved local credential, and the daemon refuses npm self-updates.
