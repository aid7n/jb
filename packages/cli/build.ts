await Bun.build({
  entrypoints: ["./src/jb.ts"],
  target: "bun",
  minify: true,
  outdir: "./bin",
}).then((result) => console.log(result));
