import fs from "node:fs";
import type { Bunfig, BunLock } from "./types";

export class JBParser {
  constructor() {}

  /**
   * parse a bun.lock file at a given path
   * @param path the path to the bun.lock file
   * @returns parsed {@link BunLock} object
   */
  public async BunLock(path: string): Promise<BunLock> {
    if (!fs.existsSync(path)) {
      throw new Error(`bun.lock file not found at path: ${path}`);
    }
    return await Bun.file(path)
      .text()
      .then((text) => Bun.JSON5.parse(text) as BunLock)
      .catch((err) => {
        throw new Error(`failed to parse bun.lock file - ${err.message}`);
      });
  }

  /**
   * parse a bunfig.toml file at a given path
   * @param path the path to the bunfig.toml file
   * @returns parsed bunfig object
   */
  public async Bunfig(path: string): Promise<Bunfig> {
    if (!fs.existsSync(path)) {
      throw new Error(`bunfig.toml file not found at path: ${path}`);
    }
    return await Bun.file(path)
      .text()
      .then((text) => Bun.TOML.parse(text) as Bunfig)
      .catch((err) => {
        throw new Error(`failed to parse bunfig.toml file - ${err.message}`);
      });
  }
}
