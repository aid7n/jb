import { targetMap } from "@7x/jb-core";
import { select } from "@inquirer/prompts";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import packageJson from "../package.json" with { type: "json" };

interface InitResult {
  bunBinPath: string;
  jbYarnBinPath: string;
  canDisable?: boolean;
}

const { platform, arch, argv, stdout } = process;
const require = createRequire(import.meta.url);
const pkg = `@7x/jb-${platform}-${arch}`;
const args = argv.slice(2);
const [setupArg] = args;
const isWindows = platform === "win32";

let changeset: {
  oldPath: string;
  newPath: string;
}[] = [];

async function initialize(disableLog?: boolean): Promise<InitResult | null> {
  try {
    changeset = [];
    const target = `jb-${platform}-${arch}`;
    if (!targetMap[target as keyof typeof targetMap]) {
      throw new Error(
        `unsupported platform/arch combination: ${platform}/${arch}`,
      );
    }

    const yarnBkpPath = locateBin("yarn-jb-bak", true);
    if (yarnBkpPath && !disableLog) {
      stdout.write(
        `ℹ️  detected existing yarn bin backup from this tool at ${yarnBkpPath} - you can restore yarn functionality by selecting disable from the menu\n\n`,
      );
    }

    const bunBinPath = execSync("bun pm bin -g").toString().trim();
    if (!bunBinPath || !fs.existsSync(bunBinPath)) {
      throw new Error("Bun binary not found");
    }

    const jbYarnBinPath = path.join(
      path.dirname(require.resolve(`${pkg}/package.json`)),
      "bin",
      `jb-yarn${isWindows ? ".exe" : ""}`,
    );
    if (!jbYarnBinPath || !fs.existsSync(jbYarnBinPath)) {
      throw new Error("jb-yarn binary not found");
    }

    return {
      bunBinPath,
      jbYarnBinPath,
      canDisable: !!yarnBkpPath,
    };
  } catch (err) {
    process.exitCode = 1;
    stdout.write(`❌ failed during initialization - ${err}\n`);
    return null;
  }
}

function locateBin(
  executable: string,
  disableLog?: boolean,
): string | undefined {
  let path: string | undefined;
  try {
    if (isWindows) {
      const _path = execSync(
        `gcm ${executable} -erroraction 'silentlycontinue' | select -expandproperty source`,
      )
        .toString()
        .trim();
      if (!_path.includes("ObjectNotFound")) path = _path;
    } else {
      const _path = execSync(`which ${executable}`).toString().trim();
      if (!_path.includes("not found")) path = _path;
    }
    if (path && !fs.existsSync(path)) return undefined;
  } catch {
    // ignore errors and return undefined
  }
  if (path && !disableLog) {
    stdout.write(`🔎 located ${executable} binary at ${path}\n`);
  } else {
    if (!disableLog) {
      stdout.write(`✅ no ${executable} binary found\n`);
    }
  }
  return path;
}

function renameBin(oldPath: string, newPath: string): boolean {
  try {
    fs.renameSync(oldPath, newPath);
    changeset.push({ oldPath, newPath });
    stdout.write(`✅ renamed ${oldPath} to ${newPath}\n`);
    return true;
  } catch (err) {
    stdout.write(`❌ failed to rename ${oldPath} to ${newPath} - ${err}\n`);
    return false;
  }
}

function removeBin(path: string): boolean {
  try {
    fs.rmSync(path);
    changeset.push({ oldPath: path, newPath: "removed" });
    stdout.write(`✅ removed ${path}\n`);
    return true;
  } catch (err) {
    stdout.write(`❌ failed to remove ${path} - ${err}\n`);
    return false;
  }
}

async function enableJB(
  init: InitResult,
  strategy: "symlink" | "copy",
  src: "menu" | "arg",
): Promise<void> {
  const yarn = locateBin("yarn");
  if (yarn) {
    const backupPath = isWindows
      ? yarn
          .toLowerCase()
          .replace(".exe", "-jb-bak.exe")
          .replace(".ps1", "-jb-bak.ps1")
          .replace(".cmd", "-jb-bak.cmd")
      : yarn + "-jb-bak";
    const renamed = renameBin(yarn, backupPath);
    if (!renamed) {
      stdout.write(
        `❌ failed to rename ${yarn} to ${backupPath} - cannot enable JFrog Bun compatibility\n`,
      );
      process.exitCode = 1;
      return;
    }
    const _init = await initialize(true);
    return enableJB(_init!, strategy, src);
  }

  try {
    if (strategy === "symlink") {
      fs.symlinkSync(
        init.jbYarnBinPath,
        path.join(init.bunBinPath, isWindows ? "yarn.exe" : "yarn"),
      );
      stdout.write(
        `✅ created symlink from ${init.jbYarnBinPath} to ${init.bunBinPath}\n`,
      );
    } else if (strategy === "copy") {
      fs.copyFileSync(
        init.jbYarnBinPath,
        path.join(init.bunBinPath, isWindows ? "yarn.exe" : "yarn"),
      );
      stdout.write(`✅ copied ${init.jbYarnBinPath} to ${init.bunBinPath}\n`);
    } else {
      throw new Error(`invalid strategy: ${strategy}`);
    }

    stdout.write(`📝 summary of changes:\n`);
    changeset.forEach(({ oldPath, newPath }) => {
      stdout.write(`- ${oldPath} -> ${newPath}\n`);
    });

    stdout.write(`\n------------------------\n\n`);

    process.exitCode = 0;

    if (src === "menu") {
      const _init = await initialize(true);
      await main(_init!);
    }
    return;
  } catch (err) {
    stdout.write(`❌ failed to create ${strategy} - ${err}\n`);
    process.exitCode = 1;
    return;
  }
}

async function disableJB(src: "menu" | "arg"): Promise<void> {
  const jbYarn = locateBin("yarn");
  const yarnBkp = locateBin("yarn-jb-bak");
  try {
    if (!jbYarn || !yarnBkp) {
      stdout.write(
        `❌ cannot disable JFrog Bun compatibility - ${jbYarn ? "" : "jb-yarn not found"}${
          jbYarn && !yarnBkp ? ", " : ""
        }${yarnBkp ? "" : "yarn-jb-bak not found"}\n`,
      );
      process.exitCode = 1;
      return;
    }

    removeBin(jbYarn);
    const restorePath = yarnBkp.replace("-jb-bak", "");
    const renamed = renameBin(yarnBkp, restorePath);
    if (!renamed) {
      stdout.write(
        `❌ failed to rename ${yarnBkp} to ${restorePath} - cannot disable JFrog Bun compatibility\n`,
      );
      process.exitCode = 1;
      return;
    }
    const _yarnBkp = locateBin("yarn-jb-bak");
    if (_yarnBkp) {
      return disableJB(src);
    }

    stdout.write(`✅ restored ${yarnBkp} to ${restorePath}\n`);
    stdout.write(`📝 summary of changes:\n`);
    changeset.forEach(({ oldPath, newPath }) => {
      stdout.write(`- ${oldPath} -> ${newPath}\n`);
    });

    stdout.write(`\n------------------------\n\n`);

    process.exitCode = 0;

    if (src === "menu") {
      const _init = await initialize(true);
      await main(_init!);
    }
    return;
  } catch (err) {
    stdout.write(`❌ failed to disable JFrog Bun compatibility - ${err}\n`);
    process.exitCode = 1;
    return;
  }
}

async function handleSelection(
  selection: "enable" | "disable",
  init: InitResult,
  src: "menu" | "arg",
): Promise<void> {
  switch (selection) {
    case "enable":
      if (init.canDisable) {
        stdout.write(
          "⚠️  cannot enable JFrog Bun compatibility - backup yarn binary found\n\n",
        );
        process.exitCode = 1;
        return;
      }
      stdout.write("Enabling JFrog Bun compatibility...\n\n");
      await enableJB(init, isWindows ? "copy" : "symlink", src);
      break;
    case "disable":
      if (!init.canDisable) {
        stdout.write(
          "⚠️  cannot disable JFrog Bun compatibility - no backup yarn binary found\n\n",
        );
        process.exitCode = 1;
        return;
      }
      stdout.write("Disabling JFrog Bun compatibility...\n\n");
      await disableJB(src);
      break;
    default:
      stdout.write(`Invalid selection: ${selection}. Exiting.\n\n`);
      process.exitCode = 1;
      break;
  }
  if (src === "menu") await main(init);
}

async function main(init: InitResult): Promise<void> {
  const selection = await select({
    message: "What would you like to do?",
    choices: [
      {
        value: "enable",
        name: "Enable JFrog Bun compatibility",
        disabled: !!init.canDisable,
        description:
          "This will override system yarn commands to route with Bun where required for JFrog CLI.\nYou can restore default yarn functionality by running this setup again and selecting disable.",
      },
      {
        value: "disable",
        name: "Disable JFrog Bun compatibility",
        disabled: !init.canDisable,
        description: `This will restore default yarn functionality if installed.\nNOTE: This option is only available if you have previously enabled jb and already had a yarn executable installed on your system.\nIf you did not previously have yarn, you can manually remove the yarn link from ${init.bunBinPath}`,
      },
    ],
  });
  await handleSelection(selection, init, "menu");
}

// entry point
stdout.write(`@7x/jb@${packageJson.version} (${platform}-${arch})\n\n`);
const init = await initialize();
if (init) {
  if (!setupArg) {
    await main(init);
  } else {
    await handleSelection(setupArg as "enable" | "disable", init, "arg");
  }
}
