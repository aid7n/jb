import packageJson from "./package.json" with { type: "json" };

await Bun.build({
  entrypoints: ["./src/jb.ts"],
  target: "bun",
  minify: true,
  sourcemap: "inline",
  outdir: "./bin",
  define: {
    JB_CLI_VERSION: JSON.stringify(packageJson.version),
  },
}).then(async (result) => {
  console.log(result);
  const content = await Bun.file("./bin/jb.js").text();
  await Bun.write("./bin/jb.js", `#!/usr/bin/env bun\n${content}`);
  console.log("added shebang to ./bin/jb.js");
});
