#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const REPO_URL = "https://github.com/tasjen/flexi-report";
const USAGE = `Usage:
  pnpm bump <X.Y.Z | major | minor | patch>   bump versions, branch, commit, push, open the PR page
  pnpm bump --tag [--yes]                     tag v<current version> on up-to-date main and push it
  pnpm bump --tag-if-changed <commit>         tag when the version changed since <commit> (CI only)
  pnpm bump --verify-tag <vX.Y.Z>             verify a release tag against every version file`;

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function readTauriVersion() {
  return JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).version;
}

function requireReleasableState() {
  const isGitHubMain =
    process.env.GITHUB_ACTIONS === "true" &&
    process.env.GITHUB_REF === "refs/heads/main";
  if (git("branch", "--show-current") !== "main" && !isGitHubMain) {
    fail("must be run on main");
  }
  if (git("status", "--porcelain", "-uno") !== "") {
    fail("tracked files have uncommitted changes — commit or stash them first");
  }
  if (isGitHubMain) {
    if (
      process.env.RELEASE_HEAD_SHA &&
      git("rev-parse", "HEAD") !== process.env.RELEASE_HEAD_SHA
    ) {
      fail("HEAD does not match the successful main CI commit");
    }
    return;
  }
  git("fetch", "origin", "main");
  if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) {
    fail("HEAD is not in sync with origin/main — pull (or push) first");
  }
}

function writeGitHubOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
  }
}

function readMatchedVersion(file, pattern) {
  const matches = [...readFileSync(file, "utf8").matchAll(pattern)];
  if (matches.length !== 1) {
    fail(`expected exactly one version in ${file}, found ${matches.length}`);
  }
  return matches[0][1];
}

function readSynchronizedVersion() {
  const versions = [
    ["package.json", JSON.parse(readFileSync("package.json", "utf8")).version],
    ["src-tauri/tauri.conf.json", readTauriVersion()],
    [
      "src-tauri/Cargo.toml",
      readMatchedVersion("src-tauri/Cargo.toml", /^version = "([^"]+)"$/gm),
    ],
    [
      "src-tauri/Cargo.lock",
      readMatchedVersion(
        "src-tauri/Cargo.lock",
        /^\[\[package\]\]\nname = "flexi-report"\nversion = "([^"]+)"$/gm,
      ),
    ],
  ];
  const uniqueVersions = new Set(versions.map(([, version]) => version));
  if (uniqueVersions.size !== 1) {
    fail(
      `version files disagree: ${versions
        .map(([file, version]) => `${file}=${version}`)
        .join(", ")}`,
    );
  }
  return versions[0][1];
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
  const current = readTauriVersion();
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
    `name = "flexi-report"\\nversion = "${next.replaceAll(".", "\\.")}"`,
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
    `Prepares the v${next} release. Merging starts the CI-gated release automatically.`,
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
    "Next: create + merge the PR. CI will tag and build the release.",
  );
}

function remoteTagTarget(tagName) {
  // An annotated tag is listed twice: the tag object, then a `^{}` line
  // carrying the commit it points at. The commit is what to compare against,
  // and a bare `refs/tags/<tag>` pattern filters the `^{}` line out — so ask
  // for both refs explicitly rather than globbing, which would also drag in
  // unrelated tags sharing the prefix.
  const lines = git(
    "ls-remote",
    "--tags",
    "origin",
    `refs/tags/${tagName}`,
    `refs/tags/${tagName}^{}`,
  )
    .split("\n")
    .filter((line) => line !== "");
  if (lines.length === 0) {
    return undefined;
  }
  const peeled = lines.find((line) => line.endsWith("^{}"));
  return (peeled ?? lines[0]).split(/\s/)[0];
}

async function tag(skipConfirm) {
  requireReleasableState();
  const tagName = `v${readSynchronizedVersion()}`;
  const head = git("rev-parse", "HEAD");
  const remoteTarget = remoteTagTarget(tagName);
  if (remoteTarget !== undefined) {
    if (remoteTarget === head) {
      console.log(`${tagName} already points to ${head} on origin.`);
      return tagName;
    }
    fail(`tag ${tagName} already exists on origin at ${remoteTarget}`);
  }
  const hasLocalTag = git("tag", "-l", tagName) !== "";
  if (hasLocalTag && git("rev-list", "-n", "1", tagName) !== head) {
    fail(`tag ${tagName} already exists locally at a different commit`);
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
  if (!hasLocalTag) {
    git("tag", tagName);
  }
  git("push", "origin", tagName);
  console.log(`\nPushed ${tagName}. Watch the build: ${REPO_URL}/actions`);
  console.log(
    "When the draft release appears, verify its asset list (CLAUDE.md release checklist) before publishing.",
  );
  return tagName;
}

async function tagIfVersionChanged(before) {
  if (!/^[0-9a-f]{40}$/.test(before)) {
    fail(`"${before}" is not a full Git commit SHA`);
  }
  const previous = JSON.parse(
    git("show", `${before}:src-tauri/tauri.conf.json`),
  ).version;
  // Read every version file, not just tauri.conf.json: a commit that leaves
  // the Tauri version alone while drifting another file must fail loudly
  // rather than pass as "nothing to release".
  const current = readSynchronizedVersion();
  if (current === previous) {
    console.log(`Version remains ${current}; no release tag needed.`);
    writeGitHubOutput("should_release", "false");
    return;
  }
  if (compareVersions(current, previous) <= 0) {
    fail(`version changed from ${previous} to non-increasing ${current}`);
  }
  const tagName = await tag(true);
  writeGitHubOutput("should_release", "true");
  writeGitHubOutput("tag", tagName);
}

function verifyTag(tagName) {
  const expected = `v${readSynchronizedVersion()}`;
  if (tagName !== expected) {
    fail(`tag ${tagName} does not match synchronized version ${expected}`);
  }
  console.log(`${tagName} matches every version file.`);
}

process.chdir(git("rev-parse", "--show-toplevel"));
const args = process.argv.slice(2);
if (args[0] === "--tag-if-changed" && args.length === 2) {
  await tagIfVersionChanged(args[1]);
} else if (args[0] === "--verify-tag" && args.length === 2) {
  verifyTag(args[1]);
} else if (args.includes("--tag")) {
  await tag(args.includes("--yes"));
} else if (args.length === 1 && !args[0].startsWith("-")) {
  bump(args[0]);
} else {
  console.error(USAGE);
  process.exit(1);
}
