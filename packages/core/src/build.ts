import path from "node:path";
import { targetMap } from "./jb";

const requestedTarget = process.argv[2];
const targets: Bun.Build.CompileTarget[] = [];

if (requestedTarget === "all") {
  targets.push(...Object.values(targetMap));
} else if (requestedTarget) {
  const target = targetMap[requestedTarget as keyof typeof targetMap];
  if (target) {
    targets.push(target);
  } else {
    console.warn(
      `unrecognized target: ${requestedTarget} - will fall back to default detected os target`,
    );
  }
}

function buildOptions(target?: Bun.Build.CompileTarget): Bun.BuildConfig {
  const pkg = target
    ? Object.entries(targetMap).find(([, t]) => t === target)?.[0]
    : undefined;
  return {
    entrypoints: ["./src/main.ts"],
    target: "bun",
    minify: true,
    compile: {
      ...(target ? { target } : {}),
      outfile: pkg
        ? path.resolve("..", pkg, "bin", "jb-yarn")
        : "./bin/jb-yarn",
    },
  };
}

if (targets.length > 0) {
  for (const target of targets) {
    Bun.build(buildOptions(target)).then((result) => console.log(result));
  }
} else {
  Bun.build(buildOptions()).then((result) => console.log(result));
}
