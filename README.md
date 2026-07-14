<h1 align="center">
  Bun JFrog
</h1>

<p align="center">
  Wrapper to provide functionality for <a href="https://bun.com/">Bun</a> package manager in JFrog CLI with build info collection support.
</p>

<ul align="center" style="list-style: none;">
  <li>🌐 Usable in any environment including CI</li>
  <li>🚀 Lightning fast builds and accurate build info collection</li>
  <li>❌ No patching of JFrog CLI client required</li>
  <li>⏰ Soon: catalog support</li>
</ul>

<p align="center">
  <a><img src="https://img.shields.io/badge/fast-speed?style=flat&label=speed&labelColor=%23303030&color=%231f1f1f" alt="Speed" /></a>
  <a href="https://github.com/aid7n/bun-jfrog?tab=MIT-1-ov-file"><img src="https://img.shields.io/badge/MIT-license?style=flat&label=license&labelColor=%23303030&color=%231f1f1f" alt="MIT License" /></a>
</p>

---

> This tool **will** override functionality of any installed `yarn` instances on your system. If you require Yarn for any real reason, you should only use this temporarily, for example in CI pipelines to speed up builds, or using temporary PATH changes

## How it works/why

Bun JFrog works by wrapping itself around the functionality that the existing Yarn support provides in JFrog CLI and forwarding the commands on to equivalent Bun commands whilst satisfying the outputs that the CLI expects.

When running `jf yarn install --build-name=<name> --build-number=<number>`, JFrog CLI invokes several `yarn` commands using the Yarn client installed to your system, and parses their outputs accordingly to collect build information from start to finish. These specific required outputs are intercepted and passed into Bun, spitting them back out to the CLI in a familiar output.

Depending on your project setup, using Bun instead of Yarn can result in **huge** improvements in project install times.

## Installation

To download the latest built executable, check the [releases]("https://github.com/aid7n/bun-jfrog/releases") page and download the build for your OS/architecture.

Once downloaded, you will need to:

- Extract the `yarn` executable to any accessible directory on your machine - for example, `/Users/me/bun-jfrog`
- Prepend the directory to your PATH variable; using the example directory above, for Linux/macOS you can use `export PATH="/Users/me/bun-jfrog/:$PATH"`.
  - To use in GitHub Actions CI runners, export to `$GITHUB_PATH` instead

After doing so, any `yarn` commands, both outside and inside JF CLI, will be intercepted by the tool to work natively with Bun.

## Development/building

```bash
# clone the repo and install deps
git clone https://github.com/aid7n/bun-jfrog.git
cd bun-jfrog
bun install

# develop/watch
bun dev <flags>

# building/executing
bun run build # outputs to ./dist/yarn
bun start <flags> # or ./dist/yarn <flags>
```

## Configuration

The app works on its own by default, however you are able to configure some default behaviors via env variables:

| Environment Variable      | Type      | Default | Values                     |
| ------------------------- | --------- | ------- | -------------------------- |
| `BUN_JF_LOGS_ENABLED`     | `boolean` | `true`  | `true` `false`             |
| `BUN_JF_SIMULATE_VERSION` | `string`  | `3.0.0` | `<any valid semver value>` |

## Disclaimer

This project is not affiliated with Bun, Yarn nor JFrog. The software has been created solely for the purposes of providing additional functionality to the JFrog CLI.

## Contact

For any questions or suggestions, feel free to reach out via GitHub issues.

## License

This project is licensed under the MIT license. See the [LICENSE]("https://github.com/aid7n/bun-jfrog?tab=MIT-1-ov-file") file for more details.
