#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const REPO_URL = "https://github.com/tasjen/daily-report";
const USAGE = `Usage:
  pnpm bump <X.Y.Z | major | minor | patch>   bump versions, branch, commit, push, open the PR page
  pnpm bump --tag [--yes]                     tag v<current version> on up-to-date main and push it`;

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function readVersion() {
  return JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
}

function requireReleasableState() {
  if (git("branch", "--show-current") !== "main") {
    fail("must be run on main");
  }
  if (git("status", "--porcelain", "-uno") !== "") {
    fail("tracked files have uncommitted changes — commit or stash them first");
  }
  git("fetch", "origin", "main");
  if (git("rev-parse", "main") !== git("rev-parse", "origin/main")) {
    fail("local main is not in sync with origin/main — pull (or push) first");
  }
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) {
      return pa[i] - pb[i];
    }
  }
  return 0;
}

function targetVersion(arg, current) {
  const [major, minor, patch] = current.split(".").map(Number);
  const keywordBumps = {
    major: `${major + 1}.0.0`,
    minor: `${major}.${minor + 1}.0`,
    patch: `${major}.${minor}.${patch + 1}`,
  };
  const next = keywordBumps[arg] ?? arg;
  if (!/^\d+\.\d+\.\d+$/.test(next)) {
    fail(`"${arg}" is not major|minor|patch or an X.Y.Z version`);
  }
  if (compareVersions(next, current) <= 0) {
    fail(`target version ${next} is not greater than current ${current}`);
  }
  return next;
}

function replaceVersionLine(file, pattern, next) {
  const source = readFileSync(file, "utf8");
  const count = (source.match(new RegExp(pattern, "gm")) ?? []).length;
  if (count !== 1) {
    fail(`expected exactly one version line in ${file}, found ${count}`);
  }
  writeFileSync(file, source.replace(new RegExp(pattern, "m"), `$1${next}$2`));
}

function bump(arg) {
  requireReleasableState();
  const current = readVersion();
  const next = targetVersion(arg, current);

  replaceVersionLine("package.json", '^(\\s*"version": ")[^"]+(",)$', next);
  replaceVersionLine(
    "src-tauri/tauri.conf.json",
    '^(\\s*"version": ")[^"]+(",)$',
    next,
  );
  replaceVersionLine("src-tauri/Cargo.toml", '^(version = ")[^"]+(")$', next);

  // Re-resolve so Cargo.lock picks up the new version. `cargo metadata` has
  // the same lockfile effect as `cargo check` without compiling anything;
  // CI still runs the full `cargo check` on the bump PR.
  execFileSync(
    "cargo",
    [
      "metadata",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--format-version",
      "1",
    ],
    {
      stdio: ["ignore", "ignore", "inherit"],
    },
  );
  const lockPattern = new RegExp(
    `name = "daily-report"\\nversion = "${next.replaceAll(".", "\\.")}"`,
  );
  if (!lockPattern.test(readFileSync("src-tauri/Cargo.lock", "utf8"))) {
    fail(`Cargo.lock did not pick up ${next}`);
  }

  const branch = `release/v${next}`;
  git("switch", "-c", branch);
  git(
    "add",
    "package.json",
    "src-tauri/tauri.conf.json",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
  );
  git("commit", "-m", `Bump version to ${next}`);
  git("push", "-u", "origin", branch);

  const title = encodeURIComponent(`Bump version to ${next}`);
  const body = encodeURIComponent(
    `Prepares the v${next} release. After merging, run \`pnpm bump --tag\`.`,
  );
  const prUrl = `${REPO_URL}/compare/main...${branch}?expand=1&title=${title}&body=${body}`;
  console.log(`\nBumped ${current} -> ${next} on ${branch}.`);
  console.log(`PR page: ${prUrl}`);
  if (process.env.BUMP_NO_OPEN !== "1") {
    try {
      execFileSync("open", [prUrl]);
    } catch {
      // URL is already printed; nothing else to do.
    }
  }
  console.log(
    "Next: create + merge the PR, then run `pnpm bump --tag` on main.",
  );
}

async function tag(skipConfirm) {
  requireReleasableState();
  const tagName = `v${readVersion()}`;
  if (git("tag", "-l", tagName) !== "") {
    fail(`tag ${tagName} already exists locally`);
  }
  if (git("ls-remote", "--tags", "origin", `refs/tags/${tagName}`) !== "") {
    fail(`tag ${tagName} already exists on origin`);
  }
  if (!skipConfirm) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = (
      await rl.question(
        `Tagging ${tagName} — this triggers the release build. Continue? [y/N] `,
      )
    )
      .trim()
      .toLowerCase();
    rl.close();
    if (answer !== "y" && answer !== "yes") {
      fail("aborted");
    }
  }
  git("tag", tagName);
  git("push", "origin", tagName);
  console.log(`\nPushed ${tagName}. Watch the build: ${REPO_URL}/actions`);
  console.log(
    "When the draft release appears, verify its asset list (CLAUDE.md release checklist) before publishing.",
  );
}

process.chdir(git("rev-parse", "--show-toplevel"));
const args = process.argv.slice(2);
if (args.includes("--tag")) {
  await tag(args.includes("--yes"));
} else if (args.length === 1 && !args[0].startsWith("-")) {
  bump(args[0]);
} else {
  console.error(USAGE);
  process.exit(1);
}
