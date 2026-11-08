---
id: "045"
title: "commands/labels.ts — l= and l_= onto path symbols"
track: mapping
pool: remote
wave: 5
size: M
deps: ["042"]
writes:
  - src/scripts/import/commands/labels.ts
---

## Contract

```ts
import type { BuildContext, ComponentSaveObject, RawCommand } from "../types"

export function applyLabels(components: ComponentSaveObject[], cmd: RawCommand, ctx: BuildContext): void
```

This is a **post-processing** hook, not a `CommandHandler`: `dispatch.ts` calls it
with the components that the other handlers produced for the same command, so it
can attach a label to the right one. It returns nothing and mutates in place.

## Label shape

`PathLabel` from `src/scripts/mixins/labelable.ts`:

```ts
{
  value: string,          // MathJax source, e.g. "$R_1$" — keep as written
  otherSide?: boolean,    // true for l_=
  distance?: SVG.Number   // omitted: SVG.Number cannot be built outside the app
}
```

## Rules

- Pairing: the **n-th** `to[...]` element in the command corresponds to the
  **n-th** component with `type === "path"` in `components`. If counts differ,
  warn once and attach nothing.
- Recognised keys inside the `to[...]` options:
  - `l=<value>` → `label.value`, `otherSide: false`
  - `l_=<value>` or `l_<sign>=` → `otherSide: true`
  - `l2=` / `l2_=` → ignore, one warning per file ("second label not imported")
- Values may be braced (`l={$R_1$}`) — strip exactly one layer of braces, keep
  the `$…$`.
- Trailing/leading whitespace is trimmed. Convert `~` to a space.
- `v=` and `i=` (voltage/current arrows with text) are out of scope: ignore
  silently, they are not labels in the designer's model.
- Never overwrite an existing label.

## Acceptance

```bash
npm run test:import
```

- `\draw (0,0) to[R, l=$R_1$] (2,0);` → the path component gets
  `label: { value: "$R_1$", otherSide: false }`.
- `\draw (0,0) to[C, l_={$C_1$}] (2,0);` → `otherSide: true`, braces stripped.
- Two `to[...]` with only one label → the label lands on the first path
  component only.
- Corpus: number of labels imported equals number of `l=`/`l_=` occurrences
  (print both counts in `run.mjs`).

## Out of scope

Labels on wires, standalone nodes (`044`), label distance/rotation, `v=`/`i=`.