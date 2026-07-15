import { select } from "@inquirer/prompts";
import { JB } from "./jb";

const DEV_PROMPT = "--jbdev";

interface Handler {
  handler: () => void | Promise<void>;
  hidden?: boolean;
}

const jb = new JB();
const args = process.argv.slice(2);
const [yarnArg] = args;

const argHandlers: Record<string, Handler> = {
  [DEV_PROMPT]: {
    handler: devPrompt,
    hidden: true,
  },
  "--version": { handler: () => jb.InvokeVersionCmd() },
  info: { handler: () => jb.InvokeInfoCmd() },
  install: { handler: () => jb.InvokeBunInstall() },
  config: {
    handler: () => jb.InvokeConfigCmd(),
    hidden: yarnArg === DEV_PROMPT,
  },
  "config get": {
    handler: () => jb.InvokeConfigCmd("get"),
    hidden: yarnArg !== DEV_PROMPT,
  },
  "config set": {
    handler: () => jb.InvokeConfigCmd("set"),
    hidden: yarnArg !== DEV_PROMPT,
  },
};

const visibleArgs = Object.entries(argHandlers).filter(
  ([, { hidden }]) => !hidden,
);

async function invokeCmd(cmd: string): Promise<void> {
  const handler = argHandlers[cmd];
  if (!handler || (handler.hidden && yarnArg !== DEV_PROMPT)) {
    jb.ExitWithError(`unrecognized command: ${cmd}`, true);
  } else {
    await handler.handler();
  }
}

async function devPrompt(): Promise<void> {
  const selection = await select({
    message: "select a yarn command to intercept >",
    choices: visibleArgs.map(([arg]) => arg),
  });
  await invokeCmd(selection);
  process.stdout.write("\n\n");
  devPrompt();
}

if (!yarnArg) {
  jb.ExitWithError(
    `no arg provided - please provide a valid arg to execute`,
    true,
  );
} else {
  invokeCmd(yarnArg);
}
