/**
 * The preprocess pipeline: raw `.tex` in, a `TextDoc` ready for the scanner out.
 *
 * The stages are small, independent passes; this module is the only place that
 * knows they belong together and in which order:
 *
 * 1. `stripComments` — blank `%` comments, normalise whitespace;
 * 2. `collectColors` — `\definecolor` into `doc.colors`;
 * 3. `applySettings` — `\usepackage[...]{circuitikz}`, `\ctikzset`,
 *    `\begin{tikzpicture}[...]` into `doc.settings`;
 * 4. `expandForeach` — copy loop bodies, last, so a commented-out `%` inside a
 *    body is not duplicated N times and the settings are already gone.
 *
 * Every stage blanks what it consumes instead of dropping the line, which keeps
 * the 1-based line numbers stable for `doc.warnings` and for the scanner. The
 * document scaffolding (`\documentclass`, `\usepackage`, `\begin{tikzpicture}`
 * …) is blanked the same way at the very end — removing it is not statement
 * parsing, so nothing else is touched here.
 *
 * @module import/pipeline
 */

import type { PreprocessStage, TextDoc } from "./types"
import { stripComments } from "./preprocess/comments"
import { collectColors } from "./preprocess/colors"
import { applySettings } from "./preprocess/ctikzset"
import { expandForeach } from "./preprocess/foreach"

/**
 * Lines that carry no schematic information and are blanked after the stages.
 *
 * The patterns are anchored at the start of the trimmed line, so `\draw` lines
 * that merely mention a package name in a label are never touched. `circuitikz`
 * arrives here only when `applySettings` did not consume the `\usepackage`
 * (e.g. a bare `\usepackage{circuitikz}` is consumed there, but a
 * `\begin{circuitikz}` environment is not).
 */
const SCAFFOLDING: RegExp[] = [
	/^\\documentclass(?![A-Za-z@])/,
	/^\\usepackage(?![A-Za-z@])/,
	/^\\usetikzlibrary(?![A-Za-z@])/,
	/^\\setmainfont(?![A-Za-z@])/,
	/^\\newcommand(?![A-Za-z@])/,
	/^\\renewcommand(?![A-Za-z@])/,
	/^\\begin\{document\}/,
	/^\\end\{document\}/,
	/^\\begin\{tikzpicture\}/,
	/^\\end\{tikzpicture\}/,
	/^\\begin\{circuitikz\}/,
	/^\\end\{circuitikz\}/,
]

/**
 * Blanks the scaffolding lines, keeping the total number of lines unchanged.
 *
 * @param text - the document text after every preprocess stage
 * @returns the text with the scaffolding lines replaced by empty lines
 */
function blankScaffolding(text: string): string {
	return text
		.split("\n")
		.map((line) => {
			const trimmed = line.trim()
			return SCAFFOLDING.some((pattern) => pattern.test(trimmed)) ? "" : line
		})
		.join("\n")
}

/**
 * Runs every preprocess stage over `text` and returns the resulting document.
 *
 * The function is pure: it builds a fresh `TextDoc` per call, so calling it
 * twice with the same input yields equal results and no state is shared
 * between calls. `file` is accepted for the caller's logging only — `TextDoc`
 * has no field for it.
 *
 * @param text - the raw contents of a `.tex` file
 * @param file - the file name, for callers that want to label their output
 * @returns the preprocessed document, warnings in stage order
 */
export function preprocess(text: string, file: string): TextDoc {
	const base: TextDoc = {
		text,
		colors: {},
		settings: {
			european: false,
			rpvoltages: false,
			bipolesLength: 1.0,
			inductorStyle: null,
			defaultLineWidth: null,
			defaultColor: null,
		},
		warnings: [],
	}

	// `expandForeach` runs last: the loop body is copied only after the comments
	// and the settings are gone, so a `%` inside it is never duplicated.
	const stages: PreprocessStage[] = [stripComments, collectColors, applySettings, expandForeach]
	const doc = stages.reduce((current, stage) => stage(current), base)

	doc.text = blankScaffolding(doc.text)
	return doc
}