# CircuiTi*k*Z-Designer

[![License](https://img.shields.io/github/license/circuit2tikz/circuitikz-designer)](LICENSE)
![GitHub last commit (dev)](https://img.shields.io/github/last-commit/circuit2tikz/circuitikz-designer/dev)
![GitHub commit activity (dev)](https://img.shields.io/github/commit-activity/m/circuit2tikz/circuitikz-designer/dev)
![GitHub Issues or Pull Requests](https://img.shields.io/github/issues/circuit2tikz/circuitikz-designer)

An interactive, visual, online editor for creating electrical circuit diagrams for LaTeX/CircuiTi*k*Z with ease. Try it out [online](https://circuit2tikz.tf.fau.de/designer/)!

> [!NOTE]
> **This is a fork of [Circuit2TikZ/CircuiTikZ-Designer](https://github.com/Circuit2TikZ/CircuiTikZ-Designer).**
> It is not affiliated with the upstream project or with FAU Erlangen-Nürnberg.
> The official, maintained web version lives at <https://circuit2tikz.tf.fau.de/designer/> — use it unless you specifically need the offline/desktop build from here.

## Download

Prebuilt Windows binaries for this fork are attached to the [releases](../../releases) page:

| Asset | Description |
| --- | --- |
| `circutikz-pwa-<version>.Setup.exe` | Installer (Squirrel). Installs per-user into `%LOCALAPPDATA%`, no administrator rights needed. |
| `circutikz-pwa-win32-x64-<version>.zip` | Portable. Unpack anywhere and run `circutikz-pwa.exe`. |
| `SHA256SUMS.txt` | Checksums. The binaries are **not code-signed**, so verify them before running. |

The installer is built with a space in its name (`circutikz-pwa-<version> Setup.exe`); GitHub
replaces that space with a dot, so the downloaded asset is `circutikz-pwa-<version>.Setup.exe`.

> [!WARNING]
> The executables are unsigned. Windows SmartScreen will warn you on first launch
> ("Windows protected your PC" → *More info* → *Run anyway*). If that is not acceptable,
> build from source — see [Use locally](#use-locally).

Note that only the *application* is portable: user settings and saved diagrams are stored in
`%APPDATA%\circutikz-designer`.

## Changes in this fork

- **Offline assets.** MathJax (`tex-svg`) and the Computer Modern / Material Symbols fonts are
  vendored under `src/vendor/` instead of being fetched from a CDN, so the editor works with no
  internet access. All other use of remote resources is gone.
- **Electron packaging.** `electron-forge` builds a Windows installer and a portable ZIP;
  `src/scripts/main.js` is the Electron main process and loads `dist/index.html`.
- **Repository housekeeping.** `CHANGELOG.md` and `CLA.md` from upstream are not carried over,
  and the upstream `npm-publish.yml` workflow (which cannot work here — the package is private and
  has no `test` script) is replaced by a release workflow.

Everything else is the upstream code base, unmodified. Third-party components and their licenses
are listed in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Overview

CircuiTi*k*Z-Designer bridges the gap between visual circuit design and precise LaTeX code, letting you design, customize, and export diagrams without manually writing TikZ commands.
Whether you’re preparing academic papers, teaching materials, or engineering documentation, CircuiTi*k*Z-Designer provides:

- A clean, intuitive interface for fast diagram creation
- An extensive component library for all your circuit needs
- Real-time previews and instant export to high-quality LaTeX code

Stop wrestling with code syntax — focus on your circuit design, and let CircuiTikZ-Designer handle the Ti*k*Z.

|         Edit in CircuiTi*k*Z-Designer         |            Export to compilable Ti*k*Z code            |
| :-------------------------------------------: | :----------------------------------------------------: |
| ![sallen-key edit](./examples/sallen-key.png) | ![sallen-key export](./examples/sallen-key_export.png) |

|               Use it in your LaTeX project!                |
| :--------------------------------------------------------: |
| ![sallen-key overleaf](./examples/sallen-key_overleaf.png) |

## Key Features

- **Visual Circuit Design:** Intuitive interface with multi-tab support and component grouping
- **Wide Component Library:** Includes most circuit elements plus some tikz components like rectangles, ellipses and arrows
- **Export Ready:** Generate clean LaTeX/TikZ code and compatible SVG exports for seamless document integration
- **Advanced Editing:** Rotate, scale, align, distribute, and snap components with clear visuals and flexible editing capabilities
- **Component Variants:** Easily switch between different versions of components and adjust their properties via the properties window
- **Cross-Platform Friendly:** Dark mode and mobile support for comfortable online editing anywhere
- **MathJax Support:** Write MathJax math expressions directly inside text components with real-time rendering

## Use locally

1. Have [Node.js](https://nodejs.org/) installed
2. Clone the repository
3. Run "npm install" in terminal in project directory
4. Run "npm start" in terminal in project directory
5. Open website at URL provided in command line output

## How to use

All controls of the application are explained in the help menu in the top right corner via the circled questionmark in the application itself.

If you need help, please use the [general discussions](https://github.com/Circuit2TikZ/CircuiTikZ-Designer/discussions/categories/general) page.

## Contributing

### Bug reporting

Please use the [issues page](https://github.com/Circuit2TikZ/CircuiTikZ-Designer/issues) of the project to report bugs. Please always provide steps on how to reproduce the bug.

### Feature requests

You can post feature requests and discuss them on the [discussions](https://github.com/Circuit2TikZ/CircuiTikZ-Designer/discussions/categories/ideas) page.

### Contribute code/component implementations

Fork the repo, and create a pull request. Please always test your code thoroughly!
