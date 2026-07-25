import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

// The script under test stays .mjs so the release workflow keeps running it
// through bare `node`, with no type-stripping floor on the runner's Node. Only
// this file goes through Vitest's TypeScript transform.
const SCRIPT = join(process.cwd(), "scripts/bump-version.mjs");
const FIXTURE_CARGO_PACKAGE = "fixture-app";
const temporaryDirectories: string[] = [];

type FixtureVersions = {
  cargo: string;
  lock: string;
  package: string;
  tauri: string;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function writeVersions(repository: string, versions: FixtureVersions) {
  mkdirSync(join(repository, "src-tauri"), { recursive: true });
  writeFileSync(
    join(repository, "package.json"),
    `${JSON.stringify({ version: versions.package }, undefined, 2)}\n`,
  );
  writeFileSync(
    join(repository, "src-tauri/tauri.conf.json"),
    `${JSON.stringify({ version: versions.tauri }, undefined, 2)}\n`,
  );
  writeFileSync(
    join(repository, "src-tauri/Cargo.toml"),
    `[package]\nname = "${FIXTURE_CARGO_PACKAGE}"\nversion = "${versions.cargo}"\n`,
  );
  writeFileSync(
    join(repository, "src-tauri/Cargo.lock"),
    `[[package]]\nname = "${FIXTURE_CARGO_PACKAGE}"\nversion = "${versions.lock}"\n`,
  );
}

function createRepository(version = "2.0.0") {
  const root = mkdtempSync(join(tmpdir(), "flexireport-release-"));
  temporaryDirectories.push(root);
  const origin = join(root, "origin.git");
  const repository = join(root, "work");

  mkdirSync(repository);
  git(root, "init", "--bare", origin);
  git(repository, "init", "--initial-branch=main");
  git(repository, "config", "user.email", "release-test@example.com");
  git(repository, "config", "user.name", "Release Test");
  writeVersions(repository, {
    cargo: version,
    lock: version,
    package: version,
    tauri: version,
  });
  git(repository, "add", ".");
  git(repository, "commit", "-m", `Set version to ${version}`);
  git(repository, "remote", "add", "origin", origin);
  git(repository, "push", "-u", "origin", "main");

  return { origin, repository };
}

function commitVersions(repository: string, version: string): string {
  const before = git(repository, "rev-parse", "HEAD");
  writeVersions(repository, {
    cargo: version,
    lock: version,
    package: version,
    tauri: version,
  });
  git(repository, "add", ".");
  git(repository, "commit", "-m", `Set version to ${version}`);
  git(repository, "push", "origin", "main");
  git(repository, "switch", "--detach");
  return before;
}

function runTagIfChanged(repository: string, before: string) {
  const head = git(repository, "rev-parse", "HEAD");
  const githubOutput = join(repository, ".github-output");
  writeFileSync(githubOutput, "");
  const result = spawnSync(
    process.execPath,
    [SCRIPT, "--tag-if-changed", before],
    {
      cwd: repository,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_ACTIONS: "true",
        GITHUB_OUTPUT: githubOutput,
        GITHUB_REF: "refs/heads/main",
        RELEASE_HEAD_SHA: head,
      },
    },
  );
  return {
    ...result,
    githubOutput: readFileSync(githubOutput, "utf8"),
  };
}

describe("automatic release tagging", () => {
  it("tags a synchronized version bump from a detached CI checkout", () => {
    const { origin, repository } = createRepository();
    const before = commitVersions(repository, "2.0.1");

    const result = runTagIfChanged(repository, before);

    expect(result.status).toBe(0);
    expect(result.githubOutput).toContain("should_release=true");
    expect(result.githubOutput).toContain("tag=v2.0.1");
    expect(git(origin, "rev-parse", "refs/tags/v2.0.1")).toBe(
      git(repository, "rev-parse", "HEAD"),
    );
  });

  it("succeeds without moving a tag when the CI job is repeated", () => {
    const { origin, repository } = createRepository();
    const before = commitVersions(repository, "2.0.1");

    expect(runTagIfChanged(repository, before).status).toBe(0);
    const firstTarget = git(origin, "rev-parse", "refs/tags/v2.0.1");
    const repeated = runTagIfChanged(repository, before);

    expect(repeated.status).toBe(0);
    expect(repeated.stdout).toContain("already points to");
    expect(git(origin, "rev-parse", "refs/tags/v2.0.1")).toBe(firstTarget);
  });

  it("accepts an existing annotated tag that points to the release commit", () => {
    const { origin, repository } = createRepository();
    const before = commitVersions(repository, "2.0.1");
    git(repository, "tag", "-a", "v2.0.1", "-m", "Release v2.0.1");
    git(repository, "push", "origin", "v2.0.1");

    const result = runTagIfChanged(repository, before);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("already points to");
    expect(git(origin, "rev-list", "-n", "1", "refs/tags/v2.0.1")).toBe(
      git(repository, "rev-parse", "HEAD"),
    );
  });

  it("refuses to move a remote tag that points to another commit", () => {
    const { origin, repository } = createRepository();
    const conflictingTarget = git(repository, "rev-parse", "HEAD");
    git(repository, "tag", "v2.0.1");
    git(repository, "push", "origin", "v2.0.1");
    const before = commitVersions(repository, "2.0.1");

    const result = runTagIfChanged(repository, before);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("already exists on origin");
    expect(git(origin, "rev-parse", "refs/tags/v2.0.1")).toBe(
      conflictingTarget,
    );
  });

  it("refuses to move a local tag that points to another commit", () => {
    const { origin, repository } = createRepository();
    const before = commitVersions(repository, "2.0.1");
    git(repository, "tag", "v2.0.1", before);

    const result = runTagIfChanged(repository, before);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "already exists locally at a different commit",
    );
    expect(git(origin, "tag", "-l")).toBe("");
  });

  it("does not tag an ordinary main commit", () => {
    const { origin, repository } = createRepository();
    const before = git(repository, "rev-parse", "HEAD");
    writeFileSync(join(repository, "README.md"), "No release here.\n");
    git(repository, "add", "README.md");
    git(repository, "commit", "-m", "Update documentation");
    git(repository, "push", "origin", "main");
    git(repository, "switch", "--detach");

    const result = runTagIfChanged(repository, before);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("no release tag needed");
    expect(result.githubOutput).toBe("should_release=false\n");
    expect(git(origin, "tag", "-l")).toBe("");
  });

  it("refuses version drift even when the Tauri version did not change", () => {
    const { origin, repository } = createRepository();
    const before = git(repository, "rev-parse", "HEAD");
    writeVersions(repository, {
      cargo: "2.0.0",
      lock: "2.0.0",
      package: "2.0.1",
      tauri: "2.0.0",
    });
    git(repository, "add", ".");
    git(repository, "commit", "-m", "Drift the package version");
    git(repository, "push", "origin", "main");
    git(repository, "switch", "--detach");

    const result = runTagIfChanged(repository, before);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("version files disagree");
    expect(git(origin, "tag", "-l")).toBe("");
  });

  it("refuses to tag when the version files disagree", () => {
    const { origin, repository } = createRepository();
    const before = git(repository, "rev-parse", "HEAD");
    writeVersions(repository, {
      cargo: "2.0.1",
      lock: "2.0.1",
      package: "2.0.2",
      tauri: "2.0.1",
    });
    git(repository, "add", ".");
    git(repository, "commit", "-m", "Create mismatched versions");
    git(repository, "push", "origin", "main");
    git(repository, "switch", "--detach");

    const result = runTagIfChanged(repository, before);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("version files disagree");
    expect(
      spawnSync("git", ["rev-parse", "refs/tags/v2.0.1"], {
        cwd: origin,
      }).status,
    ).not.toBe(0);
  });
});
