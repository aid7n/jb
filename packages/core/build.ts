import path from "node:path";

const requestedTarget = process.argv[2];
const targetMap = {
  "jb-darwin-arm64": "bun-darwin-arm64",
  "jb-darwin-x64": "bun-darwin-x64",
  "jb-linux-arm64": "bun-linux-arm64",
  "jb-linux-x64": "bun-linux-x64",
  "jb-win32-arm64": "bun-windows-arm64",
  "jb-win32-x64": "bun-windows-x64",
} as const satisfies Record<string, Bun.Build.CompileTarget>;

const target = targetMap[requestedTarget as keyof typeof targetMap];
if (!target) {
  console.warn(
    `unrecognized target: ${requestedTarget} - will fall back to default detected os target`,
  );
}

await Bun.build({
  entrypoints: ["./src/main.ts"],
  target: "bun",
  minify: true,
  compile: {
    target,
    outfile: target
      ? path.resolve("..", requestedTarget!, "bin", "yarn")
      : "./bin/yarn",
  },
}).then((result) => console.log(result));
