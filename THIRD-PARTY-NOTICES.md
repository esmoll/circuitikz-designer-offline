# Third-party notices

CircuiTikZ-Designer (this fork) is licensed under **GPL-3.0-only** — see [LICENSE](LICENSE).

It bundles or links the third-party components listed below. Each remains under its own license.
This file is provided so that the notices travel with binary distributions (installer, portable ZIP);
the license texts themselves ship unchanged inside the packaged application.

## JavaScript dependencies (runtime)

| Component | Version | License |
| --- | --- | --- |
| [@prettier/plugin-xml](https://www.npmjs.com/package/@prettier/plugin-xml) | 3.4.2 | MIT |
| [@svgdotjs/svg.js](https://www.npmjs.com/package/@svgdotjs/svg.js) | 3.2.5 | MIT |
| [@svgdotjs/svg.draggable.js](https://www.npmjs.com/package/@svgdotjs/svg.draggable.js) | 3.0.6 | MIT |
| [@svgdotjs/svg.panzoom.js](https://www.npmjs.com/package/@svgdotjs/svg.panzoom.js) | 2.1.2 | MIT |
| [bootstrap](https://www.npmjs.com/package/bootstrap) | 5.3.8 | MIT |
| [electron-squirrel-startup](https://www.npmjs.com/package/electron-squirrel-startup) | 1.0.1 | Apache-2.0 |
| [file-saver](https://www.npmjs.com/package/file-saver) | 2.0.5 | MIT |
| [hotkeys-js](https://www.npmjs.com/package/hotkeys-js) | 3.13.15 | MIT |
| [prettier](https://www.npmjs.com/package/prettier) | 3.8.1 | MIT |
| [text-to-svg](https://www.npmjs.com/package/text-to-svg) | 3.1.5 | MIT |

## Bundled assets

| Asset | Origin | License |
| --- | --- | --- |
| `src/vendor/mathjax/tex-svg.js` | [MathJax](https://www.mathjax.org/) 3, TeX→SVG bundle | Apache-2.0 |
| `src/vendor/fonts/CMUSerif-*.woff2`, `cmunrm.woff` | [Computer Modern Unicode](https://sourceforge.net/projects/cm-unicode/) | SIL Open Font License 1.1 |
| `src/styles/material-symbols-outlined.woff2` | [Material Symbols](https://fonts.google.com/icons) (Google) | Apache-2.0 |
| `src/icons/bootstrap-icons.svg` | shortened copy of [Bootstrap Icons](https://icons.getbootstrap.com/) 1.11.3 | MIT |
| `src/data/symbols.svg` | circuit symbol geometry and TikZ metadata derived from the [CircuiTikZ](https://github.com/circuitikz/circuitikz) LaTeX package (© Massimo Redaelli, Stefan Erhardt, Stefan Lindner, Romano Giannetti) | LPPL-1.3c **or** GPL; redistributed here under GPL |

## Application runtime

| Component | Version | License |
| --- | --- | --- |
| [Electron](https://www.electronjs.org/) | 37.10.3 | MIT |
| Chromium and its third-party components | as bundled with Electron | see `LICENSES.chromium.html` shipped next to the executable |
| Node.js | as bundled with Electron | MIT and third-party licenses |

## Notes

- The prebuilt binaries are produced from this repository by the
  [release workflow](.github/workflows/release.yml), so the corresponding source for any release is
  the tagged commit it was built from.
- MIT and Apache-2.0 require their copyright notices to be retained. Bundlers may strip comments
  from the minified output; the authoritative license texts remain available in the respective
  packages in `node_modules/` and via the links above.
- This project is a fork and is not endorsed by the CircuiTikZ LaTeX package authors, by FAU
  Erlangen-Nürnberg, or by the upstream CircuiTikZ-Designer maintainers.