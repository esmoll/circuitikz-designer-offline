# Anchor map — how circuitikz `(name.anchor)` maps to designer pins

Scope: card `003`. Question answered here: **can `(VT.G)` inside a `\draw` be resolved
to a point without changing any component class?** Short answer: **yes**, for the
anchors this corpus actually uses (`G` on transistors and thyristors).

Every claim below is quoted from the source, with file and line number.

## 1. Mechanism

Pin names and their offsets are declared in `src/data/symbols.svg`: each
`<component tikz="…">` holds one or more `<variant>` blocks, and a variant lists its
`<pin name="…" x="…" y="…"/>` children. `ComponentSymbol` parses those into
`Variant.pins` — `let pinArray = Array.from(variant.getElementsByTagName("pin"))` and
`const pins = pinArray.map(this.parseAnchor, this)` (`src/scripts/components/componentSymbol.ts:145-146`),
with `parseAnchor` taking the name from the `name`/`anchorname` attribute and the
offset from `x`/`y`, converted to pixels (`componentSymbol.ts:228-240`;
`anchor.point = new SVG.Point(ensureInPx(anchor.x), ensureInPx(anchor.y))` at
`componentSymbol.ts:240`). A pin's point is therefore **local to the symbol frame**;
the component turns it into a world point by adding `variant.mid`
(`mid: new SVG.Point(ensureInPx(variant.getAttribute("x") ?? 0), ensureInPx(variant.getAttribute("y") ?? 0))`,
`componentSymbol.ts:165-168`) and then applying its own transform. That is exactly
what `SnapPoint` does — `const point = this.relPosition.transform(transformMatrix)`
(`src/scripts/snapDrag/snapPoint.ts:28-31`), and its own doc comment states the
intent: *"This can be used to recreate CircuiTikZ anchors, which are relative to
components"* (`snapPoint.ts:9-12`). For node symbols every pin becomes a named snap
point, `new SnapPoint(this, pin.name, pin.point.add(this.componentVariant.mid))`
(`src/scripts/components/nodeSymbolComponent.ts:138-140`), plus a `"center"` point at
`componentVariant.mid` (`nodeSymbolComponent.ts:210`); for path symbols the two wire
ends are positioned from the drawn segment — `this.position = this.referencePoints[0].add(this.referencePoints[1]).div(2)`
and `rotationDeg` from `Math.atan2(…)` (`src/scripts/components/pathSymbolComponent.ts:514-520`),
mapped through `getTransformMatrix()` (`pathSymbolComponent.ts:606-619`). One
consequence matters for the importer: **path symbols drop their `START`/`END` pins
from the named snap points** — `.filter((_, index) => !(index == startPinIndex || index == endPinIndex))`
(`pathSymbolComponent.ts:273-274`); only side pins such as the thyristor's `gate`
survive as names (`pathSymbolComponent.ts:270-276`). End anchors of a two-terminal
element must therefore come from the segment's two coordinates, which the importer
already computes, not from a pin lookup.

## 2. Table

One row per symbol the corpus actually uses (the 23 circuitikz files; `cell.tex` is
plain TikZ and contributes no circuitikz symbols). Line numbers are the
`<component>` declaration in `src/data/symbols.svg`; the quoted lines are in §4.

| TikZ symbol | `symbols.svg` entry | designer pin names | circuitikz anchors covered |
| --- | --- | --- | --- |
| `Tnigfete` | `nigfete` (node, line 25373) | `D`, `G`, `S` | `D`, `G`, `S` |
| `Ty` | `empty thyristor` / `full thyristor` / `stroke thyristor` (path, 30797 / 30839 / 30881) | `START`, `END`, `gate` | `A`, `K`, `G` |
| `V` | `european voltage source` (path, 30946) | `START`, `END` | `+`, `-` |
| `sV` | `sinusoidal voltage source` (path, 30982) | `START`, `END` | `+`, `-` |
| `C` | `capacitor` (path, 30465) | `START`, `END` | `+`, `-` |
| `R` | `european resistor` (path, 30395) | `START`, `END` | `+`, `-` |
| `L` | `american inductor` (path, 30542) | `START`, `END`, `center` | `+`, `-`, `center` |
| `D` | `full diode` (path, 30664) and `empty diode` (path, 30592) | `START`, `END` | `+`, `-` |
| `battery1` | `battery1` (path, 30922) | `START`, `END` | `+`, `-` |
| `generic` | `generic` (path, 30325) | `START`, `END` | `+`, `-` |
| `node[circ]` | `circ` (node, 17598) | *(none — centre only)* | `center` |
| `node[ocirc]` | `ocirc` (node, 17615) | *(none — centre only)* | `center` |

Which corpus files pick which symbol (all 23 circuitikz fixtures set
`\usepackage[european, RPvoltages]{circuitikz}`, `\ctikzset{diodes/fill=ink}` and
`\ctikzset{inductor=american}` — e.g. `tests/fixtures/tex/thyristor.tex:6,12,13`;
`cell.tex` is the plain-TikZ exception and is out of scope — so `R` ⇒ european
resistor, `L` ⇒ american inductor, `D` ⇒ filled (full) diode):

- `Tnigfete`: `boost.tex:29`, `buck.tex:26`, `buckboost.tex:25`, `halfbridge.tex:30,32`,
  `sepic.tex:27`, `vsi1ph.tex:33,35`, `vsi3ph.tex:32,34`, `zeta.tex:33`
- `Ty`: `acreg.tex:23`, `bridge1ph.tex:22,25,26`, `comm1ph.tex:33,34`, `csi3ph.tex:28,29`,
  `inv1ph.tex:30,31`, `thyristor.tex:19`, `zero1ph.tex:23,26`
- `V`/`sV`/`C`/`R`/`L`/`D`/`battery1`/`generic`: the same 23 files, e.g. `boost.tex:23,40,41`,
  `flyback.tex:48,49`, `buckboost.tex:36`, `acreg.tex:29`
- `circ`/`ocirc`: `acreg.tex:21`, `boost.tex:20,23,38`, `bridge3ph.tex:23`, `csi3ph.tex:55-58`

## 3. Verdict

**Overall: `RESOLVABLE WITH ALIAS`.** `(VT.G)` is the easy case — the designer symbol
`nigfete` declares a pin literally named `G`, so it resolves without any change to a
component class. The thyristor's `G` and every two-terminal `+`/`-` need a name
translation, but no geometry is missing at import time.

| TikZ symbol | verdict | alias / note |
| --- | --- | --- |
| `Tnigfete` | `RESOLVABLE` | — (`D`, `G`, `S` are literal pin names) |
| `Ty` | `RESOLVABLE WITH ALIAS` | `G` → `gate`, `A` → `START`, `K` → `END` |
| `V`, `sV`, `C`, `R`, `L`, `D`, `battery1`, `generic` | `RESOLVABLE WITH ALIAS` | every end anchor (`+`, `-`, `left`, `right`, `in`, `out`) → `START` (first point of the path) or `END` (second point); which of the two is `+` follows circuitikz's convention for the element and is card `042`'s decision. `center` → the literal `center` pin where the symbol declares one (`american inductor`) |
| `circ`, `ocirc` | `RESOLVABLE` | only `center` exists; a bare `(X)` also means the centre |

Nothing used by the corpus is `NOT RESOLVABLE`. Two caveats belong to downstream
cards, not to this verdict:

1. **Endpoint anchors are geometric, not pin-backed.** `START`/`END` are filtered out
   of `snappingPoints` (`pathSymbolComponent.ts:273-274`), so `coords/anchors.ts` must
   answer the end anchors (`+`, `-`, `left`, `right`, `in`, `out`) from the two
   endpoints the draw statement already yields. The designer keeps both ends as the
   anonymous snap points of the wire (`pathSymbolComponent.ts:270-276`) and flips them
   for an inverted element (`pathSymbolComponent.ts:531-535`); the equivalent rule for
   the importer belongs to the component mapping (card `042`), not to coordinates.
2. **`nigfete` and the thyristors are node symbols in the designer but path elements in
   circuitikz.** Placing them along a segment means midpoint position plus the
   segment angle — the same rule the designer itself uses
   (`pathSymbolComponent.ts:514-520`). If that rotation is not applied, the `G` offset
   (`x=-37.03903, y=10.18600` for `nigfete`) points the wrong way and `.G` is wrong
   even though the lookup succeeds. Card `042` owns the placement.

Pixel/cm note: pin offsets are pixels. `const cmtopx = 4800 / 127 // 96px/2.54`
(`src/scripts/mixins/voltageable.ts:61`); the conversion into the importer's
centimetre points belongs to `coords/absolute.ts` (card `030`), not here.

## 4. Evidence

Quoted verbatim from `src/data/symbols.svg`; `NNNNN:` is the line number.

**`nigfete` — node symbol, pins `D`, `G`, `S`** (`tests/fixtures/tex/boost.tex:29` uses
`to[Tnigfete, name=VT]`, `boost.tex:33` reads `(VT.G)`):

```
25373: <component type="node" display="NIGFET" tikz="nigfete" group="Transistors" class="transistors">
25384: <variant x="37.57039" y="29.63372" viewBox="0 0 40.48183 59.26741" for="node_nigfete">
25385: <pin name="D" y="-29.10236"/>
25386: <pin name="G" x="-37.03903" y="10.18600"/>
25387: <pin name="S" y="29.10238"/>
```

**`empty|full|stroke thyristor` — pins `START`, `END`, `gate`**
(`tests/fixtures/tex/thyristor.tex:19,21` — `to[Ty, name=VS]` then `(VS.G)`):

```
30797: <component type="path" display="Empty thyristor" tikz="empty thyristor" group="Diodes" shape="emptythyristorshape" class="diodes" fillable="True">
30799: <pin name="START" x="-26.45657"/>
30800: <pin name="END" x="26.45656"/>
30801: <pin name="gate" x="26.45656" y="-29.10235"/>
30839: <component type="path" display="Full thyristor" tikz="full thyristor" group="Diodes" shape="fullthyristorshape" class="diodes">
30841: <pin name="START" x="-26.45657"/>
30842: <pin name="END" x="26.45656"/>
30843: <pin name="gate" x="26.45656" y="-29.10235"/>
30881: <component type="path" display="Stroke thyristor" tikz="stroke thyristor" group="Diodes" shape="emptythyristorshape" class="diodes" fillable="True">
30883: <pin name="START" x="-26.45657"/>
30884: <pin name="END" x="26.45656"/>
30885: <pin name="gate" x="26.45656" y="-29.10235"/>
```

All three variants declare the gate pin at the same offset, so the alias is
independent of which thyristor style card `040` chooses.

**`european voltage source` — pins `START`, `END`** (`boost.tex` uses `V`; corpus sets
`european`):

```
30946: <component type="path" display="Voltage source (european)" tikz="european voltage source" group="Sources and generators" shape="vsourceshape" class="sources" fillable="True" source="isVoltage">
30947: <variant x="16.40544" y="16.40544" viewBox="0 0 32.81084 32.81084" for="path_european-voltage-source">
30948: <pin name="START" x="-15.87408"/>
30949: <pin name="END" x="15.87408"/>
```

**`sinusoidal voltage source` (`sV`) — pins `START`, `END`:**

```
30982: <component type="path" display="Sinusoidal voltage source" tikz="sinusoidal voltage source" group="Sources and generators" shape="vsourcesinshape" class="sources" fillable="True" source="isVoltage">
30984: <pin name="START" x="-15.87408"/>
30985: <pin name="END" x="15.87408"/>
```

**`capacitor` (`C`) — pins `START`, `END`:**

```
30465: <component type="path" display="Capacitor" tikz="capacitor" group="Capacitive and dynamic bipoles" shape="capacitorshape" class="capacitors" fillable="True">
30467: <pin name="START" x="-5.29122"/>
30468: <pin name="END" x="5.29121"/>
```

**`european resistor` (`R`) — pins `START`, `END`:**

```
30395: <component type="path" display="Resistor (european)" tikz="european resistor" group="Resistive bipoles" shape="genericshape" class="resistors" fillable="True">
30397: <pin name="START" x="-21.16532"/>
30398: <pin name="END" x="21.16532"/>
```

**`american inductor` (`L`) — pins `START`, `END`, `center`:**

```
30542: <component type="path" display="Inductor (american)" tikz="american inductor" group="Inductors" shape="americaninductorshape" class="inductors">
30544: <pin name="START" x="-21.16530"/>
30545: <pin name="END" x="21.16532"/>
30546: <pin name="center" isDefault="true"/>
```

**`full diode` / `empty diode` (`D`) — pins `START`, `END`:**

```
30664: <component type="path" display="Full diode" tikz="full diode" group="Diodes" shape="fulldiodeshape" class="diodes">
30666: <pin name="START" x="-10.58246"/>
30667: <pin name="END" x="10.58246"/>
30592: <component type="path" display="Empty diode" tikz="empty diode" group="Diodes" shape="emptydiodeshape" class="diodes" fillable="True">
30594: <pin name="START" x="-10.58246"/>
30595: <pin name="END" x="10.58246"/>
```

**`battery1` — pins `START`, `END`:**

```
30922: <component type="path" display="Battery (single cell)" tikz="battery1" group="Sources and generators" shape="battery1shape" class="batteries" source="isVoltage">
30924: <pin name="START" x="-7.93703"/>
30925: <pin name="END" x="7.93703"/>
```

**`generic` — pins `START`, `END`:**

```
30325: <component type="path" display="Generic (symmetric) bipole" tikz="generic" group="Resistive bipoles" shape="genericshape" class="resistors" fillable="True">
30327: <pin name="START" x="-21.16532"/>
30328: <pin name="END" x="21.16532"/>
```

**`circ` / `ocirc` — no `<pin>` children at all**, so only the centre exists:

```
17598: <component type="node" display="Connected terminal" tikz="circ" group="Wiring">
17599: <variant x="2.38186" y="2.38186" viewBox="0 0 4.76367 4.76367" for="node_circ"/>
17615: <component type="node" display="Unconnected terminal" tikz="ocirc" group="Wiring">
17616: <variant x="2.38186" y="2.38186" viewBox="0 0 4.76367 4.76367" for="node_ocirc"/>
```

**Corpus references to sub-node anchors** (the complete set of `(name.anchor)` in the
24 fixtures):

```
boost.tex:33       \draw[grp] (VT.G) -- ++(-0.5,0);
buck.tex:30        \draw[grp] (VT.G) -- ++(0,-0.5);
buckboost.tex:28   \draw[grp] (VT.G) -- ++(0,-0.5);
flyback.tex:30     \draw[grp] (VT.G) -- ++(-0.5,0);
forward.tex:35     \draw[grp] (VT.G) -- ++(-0.5,0);
halfbridge.tex:37  \draw[grp] (VT1.G) -- ++(-0.5,0);
halfbridge.tex:39  \draw[grp] (VT2.G) -- ++(-0.5,0);
pushpull.tex:37    \draw[grp] (VT1.G) -- ++(-0.5,0);
pushpull.tex:39    \draw[grp] (VT2.G) -- ++(-0.5,0);
sepic.tex:30       \draw[grp] (VT.G) -- ++(-0.5,0);
thyristor.tex:21   \node[anchor=west, text=grp] at (VS.G) {УЭ};
zero1ph.tex:46     \node[anchor=north east, text=grp, font=\footnotesize] at (VS2.G) {…};
```

The remaining dotted references are in `cell.tex` (`cell.tex:36,39` — `(inv.north west)`,
`(inv.north)`, `(tr.north)`). They point at plain TikZ `node[block]` boxes built with
`positioning`, not at circuitikz components; that file is out of scope for this run.

## 5. Fallback rule for `NOT RESOLVABLE`

If the anchor is neither a pin name of the mapped designer symbol (case-insensitive)
nor one of the endpoint aliases above, place the point at the component's centre —
`component.position` — and append `{ line, text, reason: "unresolved anchor <node>.<anchor>" }`
to `ctx.report`.

This is one sentence on purpose: `coords/anchors.ts` (card `033`) can implement it
verbatim, and it degrades a bad anchor to a visible warning instead of dropping the
line, which is what the run's locked decision ("unknown construct — skip that line,
record it in `skipped[]`") requires for everything else.