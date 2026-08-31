/*
 * This repository-only checker intentionally reads paths and patterns declared
 * by checked-in guidance files rather than accepting external input.
 */
/* eslint-disable security/detect-non-literal-fs-filename, security/detect-object-injection, security/detect-non-literal-regexp, security/detect-unsafe-regex */
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".yarn",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "reports",
]);

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(directory, repositoryRoot, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(absolutePath, repositoryRoot, files);
    } else if (entry.isFile()) {
      files.push(
        path.relative(repositoryRoot, absolutePath).split(path.sep).join("/"),
      );
    }
  }
  return files;
}

export function globToRegularExpression(pattern) {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      index += 1;
      if (pattern[index + 1] === "/") {
        index += 1;
        expression += "(?:.*/)?";
      } else {
        expression += ".*";
      }
    } else if (character === "*") {
      expression += "[^/]*";
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += character.replace(/[.$()+?[\]^{|}\\]/gu, "\\$&");
    }
  }
  return new RegExp(`${expression}$`, "u");
}

export function parseApplyTo(source) {
  const lines = source.split("\n");
  if (lines[0] !== "---") return [];
  const endOfFrontmatter = lines.indexOf("---", 1);
  const applyToIndex = lines.indexOf("applyTo:", 1);
  if (applyToIndex === -1 || applyToIndex > endOfFrontmatter) return [];

  const patterns = [];
  for (const line of lines.slice(applyToIndex + 1, endOfFrontmatter)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) break;
    const quotedPattern = trimmed.slice(2);
    const quote = quotedPattern[0];
    if ((quote === '"' || quote === "'") && quotedPattern.at(-1) === quote) {
      patterns.push(quotedPattern.slice(1, -1));
    }
  }
  return patterns;
}

export function parseInspectFirstPaths(source) {
  const heading = "## Files to inspect first";
  const headingIndex = source.indexOf(heading);
  if (headingIndex === -1) return [];
  const remainder = source.slice(headingIndex + heading.length);
  const nextHeadingIndex = remainder.search(/^## /mu);
  const section =
    nextHeadingIndex === -1 ? remainder : remainder.slice(0, nextHeadingIndex);
  return [...section.matchAll(/^- `(?<target>[^`]+)`(?: .*)?$/gmu)].map(
    (match) => match.groups.target,
  );
}

export function parseYarnScripts(source) {
  return [...source.matchAll(/`yarn (?<script>[a-z][\w:-]*)/gu)].map(
    (match) => match.groups.script,
  );
}

export function parseLocalMarkdownLinks(source) {
  return [...source.matchAll(/\]\((?<target>[^)\s]+)(?:\s+"[^"]*")?\)/gu)]
    .map((match) => match.groups.target.replace(/^<|>$/gu, ""))
    .filter(
      (target) =>
        !target.startsWith("#") &&
        !target.startsWith("http://") &&
        !target.startsWith("https://") &&
        !target.startsWith("mailto:"),
    );
}

export async function validateAgentGuidance(repositoryRoot) {
  const errors = [];
  const files = await collectFiles(repositoryRoot, repositoryRoot);
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  const rootCommands = new Set([
    ...Object.keys(packageJson.scripts ?? {}),
    "eslint",
    "install",
    "workspace",
  ]);
  const skillsRoot = path.join(repositoryRoot, ".github", "skills");
  const skillFiles = (await collectFiles(skillsRoot, repositoryRoot)).filter(
    (file) => file.endsWith("/SKILL.md"),
  );

  const agentsSource = await readFile(
    path.join(repositoryRoot, "AGENTS.md"),
    "utf8",
  );
  const listedSkills = [
    ...agentsSource.matchAll(
      /^- `(?<target>\.github\/skills\/[^`]+\/SKILL\.md)`$/gmu,
    ),
  ].map((match) => match.groups.target);

  for (const skillFile of skillFiles) {
    if (!listedSkills.includes(skillFile)) {
      errors.push(`${skillFile}: skill is not listed in AGENTS.md`);
    }

    const source = await readFile(path.join(repositoryRoot, skillFile), "utf8");
    const patterns = parseApplyTo(source);
    if (patterns.length === 0) {
      errors.push(`${skillFile}: applyTo must contain at least one pattern`);
    }
    for (const pattern of patterns) {
      const matcher = globToRegularExpression(pattern);
      if (!files.some((file) => matcher.test(file))) {
        errors.push(
          `${skillFile}: applyTo pattern matches no files: ${pattern}`,
        );
      }
    }

    for (const target of parseInspectFirstPaths(source)) {
      if (!(await exists(path.join(repositoryRoot, target)))) {
        errors.push(
          `${skillFile}: inspect-first path does not exist: ${target}`,
        );
      }
    }

    for (const script of parseYarnScripts(source)) {
      if (!rootCommands.has(script)) {
        errors.push(`${skillFile}: unknown root Yarn command: ${script}`);
      }
    }
  }

  for (const listedSkill of listedSkills) {
    if (!skillFiles.includes(listedSkill)) {
      errors.push(`AGENTS.md: listed skill does not exist: ${listedSkill}`);
    }
  }

  const linkSources = [
    "AGENTS.md",
    "CONTRIBUTING.md",
    "README.md",
    ...skillFiles,
  ];
  for (const sourceFile of linkSources) {
    const absoluteSource = path.join(repositoryRoot, sourceFile);
    if (!(await exists(absoluteSource))) continue;
    const source = await readFile(absoluteSource, "utf8");
    for (const link of parseLocalMarkdownLinks(source)) {
      const target = decodeURIComponent(link.split("#", 1)[0]);
      const absoluteTarget = path.resolve(path.dirname(absoluteSource), target);
      if (!(await exists(absoluteTarget))) {
        errors.push(`${sourceFile}: local link does not exist: ${link}`);
      }
    }
  }

  const rootReadme = await readFile(
    path.join(repositoryRoot, "README.md"),
    "utf8",
  );
  const packageDirectories = files
    .filter((file) => /^packages\/[^/]+\/package\.json$/u.test(file))
    .map((file) => file.split("/")[1]);
  for (const packageDirectory of packageDirectories) {
    const readmeLink = `./packages/${packageDirectory}/README.md`;
    if (!rootReadme.includes(readmeLink)) {
      errors.push(
        `README.md: workspace is missing from package map: ${packageDirectory}`,
      );
    }
  }

  const pullRequestTemplate = await readFile(
    path.join(repositoryRoot, ".github", "pull_request_template.md"),
    "utf8",
  );
  for (const heading of [
    "## Manual acceptance tests",
    "## Repository learning check",
  ]) {
    if (!pullRequestTemplate.includes(heading)) {
      errors.push(`.github/pull_request_template.md: missing ${heading}`);
    }
  }

  return errors;
}

async function main() {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const errors = await validateAgentGuidance(repositoryRoot);
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
    return;
  }
  console.log("Agent guidance is internally consistent.");
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
