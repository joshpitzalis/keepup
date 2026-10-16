import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

function files(root: string, prefix = ""): string[] {
  return readdirSync(join(root, prefix), { withFileTypes: true }).flatMap(
    (entry) => {
      const name = join(prefix, entry.name);

      if (entry.isDirectory()) {
        return files(root, name);
      }

      if (!entry.isFile()) {
        throw new Error(`Unsupported skill source: ${name}`);
      }

      return [name];
    }
  );
}

function install(): void {
  const args = process.argv.slice(2);
  const directoryIndex = args.indexOf("--directory");

  const directory =
    directoryIndex === -1
      ? join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "skills")
      : args[directoryIndex + 1];

  if (
    !directory ||
    args.some(
      (arg, index) =>
        arg !== "--check" &&
        arg !== "--directory" &&
        !(directoryIndex !== -1 && index === directoryIndex + 1)
    )
  ) {
    throw new Error(
      "Usage: install-agent-skills.ts [--check] [--directory <skills directory>]"
    );
  }

  const destination = resolve(directory);
  const source = resolve(import.meta.dirname, "../agent-skills");

  const changes = [
    { source: "implement-spec", target: "implement-spec" },
    { source: "coding-best-practices", target: "cbp" },
  ]
    .flatMap((skill) =>
      files(join(source, skill.source)).map((file) => ({
        from: join(source, skill.source, file),
        relative: join(skill.target, file),
        to: join(destination, skill.target, file),
      }))
    )
    .filter(
      (file) =>
        !existsSync(file.to) ||
        !readFileSync(file.from).equals(readFileSync(file.to))
    );

  if (args.includes("--check")) {
    if (changes.length) {
      throw new Error(
        `Agent skill overrides differ: ${changes.map((file) => file.relative).join(", ")}`
      );
    }

    console.log("Installed agent skills match reviewed sources");

    return;
  }

  const backup = join(
    dirname(destination),
    "skill-backups",
    String(Date.now())
  );

  for (const file of changes) {
    if (!existsSync(file.to)) {
      continue;
    }

    const target = join(backup, file.relative);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(file.to, target);
  }

  for (const file of changes) {
    mkdirSync(dirname(file.to), { recursive: true });
    copyFileSync(file.from, file.to);
  }

  console.log(
    `Installed ${changes.length} changed skill files into ${destination}; previous files backed up under ${backup}`
  );
}

try {
  install();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Skill installation failed"
  );
  process.exitCode = 1;
}
