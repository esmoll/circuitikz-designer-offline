import type { ComponentSaveObject } from "../components/circuitComponent"

export type Point = { x: number; y: number }

export type GlobalSettings = {
	european: boolean
	rpvoltages: boolean
	bipolesLength: number // cm, default 1.0
	inductorStyle: "american" | "european" | null
	defaultLineWidth: string | null
	defaultColor: string | null
}

export type TextDoc = {
	text: string
	colors: Record<string, string>
	settings: GlobalSettings
	warnings: ImportWarning[]
}

export type PreprocessStage = (doc: TextDoc) => TextDoc

export type CoordContext = {
	named: Map<string, Point>
	anchors: AnchorResolver | null
	lastPoint: Point | null
	bipolesLength: number // cm
}

export type CoordResult = {
	point: Point // cm, TikZ orientation (y up)
	next: number // index in the token string just after the coordinate
	lastPoint: Point
}

export type CoordResolver = (token: string, index: number, ctx: CoordContext) => CoordResult | null

export type AnchorResolver = {
	resolve(node: string, anchor: string): Point | null
}

export type RawCommand = {
	kind: "draw" | "node" | "unknown"
	options: string
	arguments: string
	line: number
	source: string
}

export type BuildContext = {
	settings: GlobalSettings
	colors: Record<string, string>
	coords: CoordContext
	report: ImportWarning[]
}

export type CommandHandler = {
	canHandle(cmd: RawCommand): boolean
	handle(cmd: RawCommand, ctx: BuildContext): ComponentSaveObject[]
}

export type ImportWarning = { line: number; text: string; reason: string }

export type ImportResult = {
	components: ComponentSaveObject[]
	skipped: ImportWarning[]
	settings: GlobalSettings
	colors: Record<string, string>
}