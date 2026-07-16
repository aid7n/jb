import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import semver from "semver";
import { JBParser } from "./parser";
import type { PackageJson, YarnInfoLine } from "./types";

export const targetMap = {
  "jb-darwin-arm64": "bun-darwin-arm64",
  "jb-darwin-x64": "bun-darwin-x64",
  "jb-linux-arm64": "bun-linux-arm64",
  "jb-linux-x64": "bun-linux-x64",
  "jb-win32-arm64": "bun-windows-arm64",
  "jb-win32-x64": "bun-windows-x64",
} as const satisfies Record<string, Bun.Build.CompileTarget>;

export class JB {
  private stdout = process.stdout;

  constructor() {}

  /**
   * writes a message to the logfile
   * @param message text to write to logfile
   * @returns void
   */
  private Log(message: string): void {
    const v = Bun.env.JB_LOGS_ENABLED || "true";
    if (v !== "true") return;
    const prefix = `[@7x/jb] ${new Date().toISOString()} - `;
    const rootDir = path.resolve(Bun.env.TURBO_INVOCATION_DIR ?? process.cwd());
    const rootPkgLockPath = path.resolve(rootDir, "jfrog-bun.log");
    if (!fs.existsSync(rootPkgLockPath)) {
      fs.writeFileSync(rootPkgLockPath, prefix + message + "\n", { flag: "w" });
    } else {
      fs.writeFileSync(rootPkgLockPath, prefix + message + "\n", { flag: "a" });
    }
  }

  /**
   * logs an error message to the logfile and optionally to the console, then sets the process exit code to 1
   * @param message text to write to logfile (and screen if consoleLog is enabled)
   * @param consoleLog whether to log to the console or not
   */
  public ExitWithError(message: string, consoleLog?: boolean): void {
    const prefix = `[@7x/jb] -`;
    if (consoleLog) console.error(`${prefix} error: ${message}\n`);
    this.Log(`error: ${message}`);
    process.exitCode = 1;
  }

  /**
   * intercepts `yarn version` command and outputs a simulated version to satisfy jfrog CLI's version checks
   * @returns void
   */
  public InvokeVersionCmd(): void {
    const v = Bun.env.JB_SIMULATE_VERSION || "3.0.0";
    this.stdout.write(v);
    this.Log("intercepted yarn version command successfully");
    process.exitCode = 0;
  }

  /**
   * intercepts `yarn install` command and forwards it to `bun install` with the same arguments
   * @returns void
   */
  public InvokeBunInstall(): void {
    const args = process.argv.slice(3);
    execSync(`bun install ${args.join(" ")}`, { stdio: "inherit" });
    this.Log(
      `intercepted yarn install command - forwarded to bun install with args: ${args.join(
        " ",
      )}`,
    );
    process.exitCode = 0;
  }

  /**
   * intercepts `yarn config get` & `yarn config set` commands and outputs responses to satisfy jfrog CLI's checks
   * @returns void
   */
  public InvokeConfigCmd(typeOverride?: "get" | "set"): void {
    const [type] = process.argv.slice(3);
    const effectiveType = typeOverride ?? type;
    if (effectiveType === "get") {
      this.stdout.write("{}");
      this.Log(`intercepted yarn config get`);
      process.exitCode = 0;
    } else if (effectiveType === "set") {
      // no output needed
      this.Log(`intercepted yarn config set`);
      process.exitCode = 0;
    } else {
      this.ExitWithError(
        `unrecognized config arg type: ${effectiveType}`,
        true,
      );
    }
  }

  /**
   * intercepts **any** `yarn info <...>` command and outputs the expected JSONL data for jfrog CLI to consume for build info collection
   * @returns void
   */
  public async InvokeInfoCmd(): Promise<void> {
    const parser = new JBParser();
    const yarnInfo: Map<string, YarnInfoLine> = new Map();
    const rootDir = path.resolve(Bun.env.TURBO_INVOCATION_DIR ?? process.cwd());
    const rootPkgLockPath = path.resolve(rootDir, "bun.lock");

    const lockFile = await parser.BunLock(rootPkgLockPath).catch((err) => {
      this.ExitWithError(err.message, true);
    });

    if (!lockFile) {
      this.ExitWithError(
        `could not detect lockfile at path: ${rootPkgLockPath}`,
        true,
      );
      return;
    }

    // consumer packages
    for (const pkgData of Object.values(lockFile.packages ?? {})) {
      const [nameWithVersion, , deps] = pkgData;
      if (nameWithVersion.includes("workspace:")) continue;

      const allDeps = {
        ...deps?.dependencies,
        ...deps?.peerDependencies,
      };
      const shouldPushDeps = Object.keys(allDeps).length > 0;
      const isScoped = nameWithVersion.startsWith("@");
      const [pkgName, version] = nameWithVersion
        .slice(isScoped ? 1 : 0)
        .split("@");
      const value = `${isScoped ? "@" : ""}${pkgName}@npm:${version}`;
      const bins = deps?.bin ? Object.keys(deps.bin) : undefined;

      if (!version) continue;

      yarnInfo.set(value, {
        value,
        children: {
          Version: version,
          Dependencies: shouldPushDeps
            ? Object.entries(allDeps).flatMap(([name, requestedVersion]) => {
                const resolvedDep = Object.entries(
                  lockFile.packages ?? {},
                ).find(([, data]) => {
                  const [nameWithVersion] = data;
                  const isScoped = nameWithVersion.startsWith("@");
                  const [pkgName, version] = nameWithVersion
                    .slice(isScoped ? 1 : 0)
                    .split("@");
                  return (
                    version &&
                    pkgName === name &&
                    semver.satisfies(version, requestedVersion)
                  );
                });
                if (!resolvedDep) return [];
                const isScoped = name.startsWith("@");
                const resolvedDepVersion = resolvedDep[1][0]
                  .slice(isScoped ? 1 : 0)
                  .split("@")[1];
                return {
                  descriptor: `${name}@npm:${requestedVersion.replaceAll(
                    "||",
                    " || ",
                  )}`,
                  locator: `${name}@npm:${resolvedDepVersion}`,
                };
              })
            : undefined,
          "Exported Binaries": bins,
        },
      });
    }

    // workspace packages
    for (const [wsName, wsData] of Object.entries(lockFile.workspaces)) {
      const deps = {
        ...wsData.dependencies,
        ...wsData.peerDependencies,
        ...wsData.devDependencies,
      };
      for (const [depName, requestedVersion] of Object.entries(deps)) {
        if (requestedVersion.includes("catalog:")) {
          const catalogName =
            requestedVersion !== "catalog:" && requestedVersion.split(":")[1];
          const catalogVer = catalogName
            ? lockFile.catalogs?.[catalogName]?.[depName]
            : lockFile.catalog?.[depName];
          if (catalogVer) {
            deps[depName] = catalogVer;
            if (Bun.env.JB_WRITE_CATALOG_FIXES === "true") {
              const pkgJson = path.resolve(
                rootDir,
                wsName === "" ? "package.json" : `${wsName}/package.json`,
              );
              if (fs.existsSync(pkgJson)) {
                const pkgData = JSON.parse(
                  fs.readFileSync(pkgJson, "utf-8"),
                ) as PackageJson;
                if (pkgData?.dependencies?.[depName]) {
                  pkgData.dependencies[depName] = catalogVer;
                }
                if (pkgData?.devDependencies?.[depName]) {
                  pkgData.devDependencies[depName] = catalogVer;
                }
                if (pkgData?.peerDependencies?.[depName]) {
                  pkgData.peerDependencies[depName] = catalogVer;
                }
                fs.writeFileSync(pkgJson, JSON.stringify(pkgData, null, 2));
              }
            }
            this.Log(
              `[${
                wsData.name
              }] Resolved ${depName} to version ${catalogVer} from catalog:${
                catalogName ? ` "${catalogName}"` : ""
              }`,
            );
          }
        }
      }
      const shouldPushDeps = Object.keys(deps).length > 0;
      yarnInfo.set(`${wsData.name}@workspace:${wsName === "" ? "." : wsName}`, {
        value: `${wsData.name}@workspace:${wsName === "" ? "." : wsName}`,
        children: {
          Version: wsData.version || "0.0.0",
          Dependencies: shouldPushDeps
            ? Object.entries(deps).flatMap(([name, requestedVersion]) => {
                const resolvedDep = Object.entries(
                  lockFile.packages ?? {},
                ).find(([, data]) => {
                  const [nameWithVersion] = data;
                  const isScoped = nameWithVersion.startsWith("@");
                  const [pkgName, version] = nameWithVersion
                    .slice(isScoped ? 1 : 0)
                    .split("@");
                  return (
                    version &&
                    pkgName === name &&
                    semver.satisfies(version, requestedVersion)
                  );
                });
                if (!resolvedDep) return [];
                const isScoped = name.startsWith("@");
                const isWorkspace = requestedVersion.includes("workspace:");
                const resolvedWorkspace = isWorkspace
                  ? Object.entries(lockFile.workspaces).find(
                      ([, _wsData]) => _wsData.name === name,
                    )
                  : undefined;
                if (isWorkspace && !resolvedWorkspace) return [];
                const resolvedDepVersion = isWorkspace
                  ? resolvedWorkspace?.[0]
                  : resolvedDep[1][0].slice(isScoped ? 1 : 0).split("@")[1];
                return {
                  descriptor: `${name}@${
                    isWorkspace ? "" : "npm:"
                  }${requestedVersion.replaceAll("||", " || ")}`,
                  locator: `${name}@${
                    isWorkspace ? "workspace" : "npm"
                  }:${resolvedDepVersion}`,
                };
              })
            : undefined,
        },
      });
    }

    this.stdout.write(
      yarnInfo
        .values()
        .toArray()
        .sort((a, b) => a.value.localeCompare(b.value))
        .map((line) => JSON.stringify(line))
        .join("\n") + "\n",
    );

    this.Log(
      `intercepted yarn info command successfully - outputted ${yarnInfo.size} lines`,
    );
    process.exitCode = 0;
  }

  /**
   * checks to ensure registry is set to a JFrog Artifactory registry, either via NPM_CONFIG_REGISTRY env var or bunfig.toml install.registry property
   * @returns void
   */
  public async CheckRegistry(): Promise<void> {
    const env = Bun.env.NPM_CONFIG_REGISTRY;
    if (env && env.includes("artifactory")) {
      this.Log(`detected JFrog Artifactory registry configured`);
      return;
    }

    const parser = new JBParser();
    const rootDir = path.resolve(Bun.env.TURBO_INVOCATION_DIR ?? process.cwd());
    const rootBunfigPath = path.resolve(rootDir, "bunfig.toml");

    const bunfig = await parser.Bunfig(rootBunfigPath).catch((err) => {
      throw new Error(err.message);
    });

    if (!bunfig) {
      throw new Error(
        `could not detect bunfig at path: ${rootBunfigPath} and no NPM_CONFIG_REGISTRY env var set`,
      );
    }

    if (!bunfig.install.registry) {
      throw new Error(
        `bunfig install.registry not set and no NPM_CONFIG_REGISTRY env var set`,
      );
    } else if (
      bunfig.install.registry &&
      typeof bunfig.install.registry === "string"
    ) {
      if (bunfig.install.registry.includes("artifactory")) {
        this.Log(`detected JFrog Artifactory registry configured`);
        return;
      } else {
        throw new Error(
          `bunfig install.registry is set to ${bunfig.install.registry} but does not include "artifactory" and no NPM_CONFIG_REGISTRY env var set`,
        );
      }
    } else if (
      bunfig.install.registry &&
      typeof bunfig.install.registry === "object"
    ) {
      if (bunfig.install.registry.url.includes("artifactory")) {
        this.Log(`detected JFrog Artifactory registry configured`);
        return;
      } else {
        throw new Error(
          `bunfig install.registry.url is set to ${bunfig.install.registry.url} but does not include "artifactory" and no NPM_CONFIG_REGISTRY env var set`,
        );
      }
    }

    process.exitCode = 0;
    return;
  }
}
