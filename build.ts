await Bun.build({
  entrypoints: ["./src/index.ts"],
  target: "bun",
  compile: {
    outfile: "./dist/yarn",
  },
}).then((result) => console.log(result));
