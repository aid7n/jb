import { BunJfrog } from "./core";

const BunJFrog = new BunJfrog();

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "--version":
    BunJFrog.invokeVersionCmd();
    break;
  case "info":
    BunJFrog.invokeInfoCmd();
    break;
  case "install":
    BunJFrog.invokeBunInstall();
    break;
  case "config":
    BunJFrog.invokeConfigCmd();
    break;
  default:
    BunJFrog.exitWithError(`Unknown command: ${command}`);
    break;
}
