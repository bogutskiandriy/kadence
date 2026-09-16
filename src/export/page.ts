/**
 * The shell every exported page shares.
 *
 * One document, no requests. The board export and the report exports are the
 * same experiment and must look like one product, so the tokens, the type and
 * the escaping live here rather than being copied and drifting apart.
 *
 * The chart colours are not a taste: the eight categorical slots and the four
 * status colours below are a validated set — inside the lightness band, above
 * the chroma floor, and separated far enough that adjacent bands stay distinct
 * under colour-vision deficiency, in both light and dark. Three of the light
 * slots sit under 3:1 against white, which is why every chart on these pages
 * ships a legend and a table: colour is never the only channel.
 */

/** Everything a person typed goes through this before it reaches the page. */
export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Light and dark both, from one declaration: the reader's setting decides. */
export const BASE_STYLE = `
:root {
  color-scheme: light dark;
  --bg: #ffffff; --fg: #1a1a1a; --muted: #6b6b6b; --line: #e2e2e2;
  --card: #fafafa; --accent: #2d6cdf; --done: #2e7d32; --warn: #b26a00;
  --danger: #c62828;
  --grid: #ececec;
  --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100;
  --s5: #e87ba4; --s6: #008300; --s7: #4a3aa7; --s8: #e34948;
  --good: #0ca30c; --warning: #fab219; --serious: #ec835a; --critical: #d03b3b;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #17181a; --fg: #e8e8e8; --muted: #9a9a9a; --line: #2e2f33;
    --card: #1f2023; --accent: #6ea8fe; --done: #7bc47f; --warn: #e0a458;
    --danger: #ef6b6b;
    --grid: #2b2c30;
    --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500;
    --s5: #d55181; --s6: #008300; --s7: #9085e9; --s8: #e66767;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 2rem 1.5rem; background: var(--bg); color: var(--fg);
  font: 15px/1.55 ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
main { max-width: 1100px; margin: 0 auto; }
h1 { font-size: 1.5rem; margin: 0 0 .25rem; }
h2 { font-size: 1.05rem; margin: 2rem 0 .75rem; padding-bottom: .3rem; border-bottom: 1px solid var(--line); }
.stamp { color: var(--muted); font-size: .85rem; margin-bottom: 1.5rem; }
.stamp code { background: var(--card); padding: .1rem .3rem; border-radius: 3px; }
.pill { display: inline-block; font-size: .72rem; padding: .05rem .35rem; border-radius: 3px; border: 1px solid var(--line); margin-right: .25rem; }
.pill.danger { color: var(--danger); border-color: var(--danger); }
.pill.warn { color: var(--warn); border-color: var(--warn); }
.bar { background: var(--line); border-radius: 3px; height: .55rem; overflow: hidden; }
.bar > span { display: block; height: 100%; background: var(--accent); }
.bar.done > span { background: var(--done); }
table { border-collapse: collapse; width: 100%; font-size: .88rem; }
th, td { text-align: left; padding: .35rem .5rem; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 600; font-size: .78rem; text-transform: uppercase; letter-spacing: .04em; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
.empty { color: var(--muted); }
footer { margin-top: 2.5rem; color: var(--muted); font-size: .8rem; border-top: 1px solid var(--line); padding-top: .75rem; }
`;

/** Everything the charts and the figures need, and nothing the board needs. */
export const VIZ_STYLE = `
.tiles { display: flex; flex-wrap: wrap; gap: .75rem; margin: 0 0 1.5rem; }
.tile { flex: 1 1 140px; max-width: 16rem; background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: .6rem .75rem; }
.tile .label { color: var(--muted); font-size: .75rem; text-transform: uppercase; letter-spacing: .05em; }
.tile .value { font-size: 1.75rem; font-weight: 600; line-height: 1.2; }
.tile .sub, td .sub { color: var(--muted); font-size: .78rem; }
.tile.critical .value { color: var(--critical); }
.callout { background: var(--card); border-left: 3px solid var(--s1); border-radius: 0 5px 5px 0; padding: .6rem .8rem; margin: 0 0 1.5rem; }
.viz { width: 100%; height: auto; display: block; overflow: visible; }
.viz .grid { stroke: var(--grid); stroke-width: 1; }
.viz .tick { fill: var(--muted); font-size: 11px; font-family: inherit; }
.viz .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.viz .seam { fill: none; stroke: var(--bg); stroke-width: 2; }
.viz .range { stroke: var(--s1); stroke-width: 2; stroke-linecap: round; }
.viz .dot { fill: var(--s1); stroke: var(--bg); stroke-width: 2; }
.viz .reference { stroke: var(--critical); stroke-width: 1; }
.viz .line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.viz .reference-line { stroke: var(--muted); stroke-width: 2; opacity: .45; }
.legend { display: flex; flex-wrap: wrap; gap: .75rem; margin: 0 0 .5rem; font-size: .8rem; color: var(--muted); }
.legend span { display: inline-flex; align-items: center; gap: .35rem; }
.legend i { width: .7rem; height: .7rem; border-radius: 2px; display: inline-block; }
/* A five-column table is wider than a phone. It scrolls inside its own box
   rather than making the whole page scroll sideways. */
.rows { overflow-x: auto; }
.figure { margin: 0 0 1rem; }
.figure figcaption { color: var(--muted); font-size: .8rem; margin-top: .4rem; }
details { margin: .5rem 0 1.5rem; }
summary { color: var(--muted); font-size: .82rem; cursor: pointer; }
summary::marker { color: var(--line); }
tr.critical td:first-child { border-left: 3px solid var(--critical); }
`;

/** One self-contained document: the title, the styles and the body. */
export function page(title: string, style: string, body: readonly string[]): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)}</title>`,
    `<style>${style}</style>`,
    '</head>',
    '<body>',
    '<main>',
    ...body,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
