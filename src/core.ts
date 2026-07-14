import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import semver from "semver";
import type { BunLock, PackageJson, YarnInfoLine } from "./types";

export class BunJfrog {
  private stdout = process.stdout;

  constructor() {}

  private log(message: string): void {
    const v = Bun.env.BUN_JF_LOGS_ENABLED || "true";
    if (v !== "true") return;
    const prefix = `[bun-jfrog] ${new Date().toISOString()} - `;
    const rootDir = path.resolve(process.cwd());
    const rootPkgLockPath = path.resolve(rootDir, "bun-jfrog.log");
    if (!fs.existsSync(rootPkgLockPath)) {
      fs.writeFileSync(rootPkgLockPath, prefix + message + "\n", { flag: "w" });
    } else {
      fs.writeFileSync(rootPkgLockPath, prefix + message + "\n", { flag: "a" });
    }
  }

  public exitWithError(message: string): void {
    console.error(`error: ${message}\n`);
    this.log(`error: ${message}`);
    process.exitCode = 1;
  }

  public invokeVersionCmd(): void {
    const v = Bun.env.BUN_JF_SIMULATE_VERSION || "3.0.0";
    this.stdout.write(v);
    this.log("intercepted yarn version command successfully");
    process.exitCode = 0;
  }

  public invokeBunInstall(): void {
    const args = process.argv.slice(3);
    execSync(`bun install ${args.join(" ")}`, { stdio: "inherit" });
    this.log(
      `intercepted yarn install command - forwarded to bun install with args: ${args.join(
        " ",
      )}`,
    );
    process.exitCode = 0;
  }

  public invokeConfigCmd(): void {
    const [type] = process.argv.slice(3);
    if (type === "get") {
      this.stdout.write("{}");
      this.log(`intercepted yarn config get`);
      process.exitCode = 0;
    } else if (type === "set") {
      // no output needed
      this.log(`intercepted yarn config set`);
      process.exitCode = 0;
    } else {
      this.log(`unrecognized config type: ${type}`);
      this.exitWithError(`unrecognized config type: ${type}`);
    }
  }

  public invokeInfoCmd(): void {
    const yarnInfo: Map<string, YarnInfoLine> = new Map();
    const rootDir = path.resolve(process.cwd());
    const rootPkgLockPath = path.resolve(rootDir, "bun.lock");

    if (!fs.existsSync(rootPkgLockPath)) {
      this.log("root bun.lock file not found - exiting with error");
      process.exitCode = 1;
      throw new Error(
        "root bun.lock not found - are you running this script from the root of your repo?",
      );
    }

    const parsedLockFile = fs
      .readFileSync(rootPkgLockPath, "utf-8")
      .replaceAll(" ", "")
      .replaceAll("\n", "")
      .replaceAll(",}", "}")
      .replaceAll(",]", "]");
    const lockFile = JSON.parse(parsedLockFile) as BunLock;

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
            if (Bun.env.BUN_JF_WRITE_CATALOG_FIXES === "true") {
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
            this.log(
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

    this.log(
      `intercepted yarn info command successfully - outputted ${yarnInfo.size} lines`,
    );
    process.exitCode = 0;
  }
}
