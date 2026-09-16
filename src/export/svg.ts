/**
 * Charts as inline SVG, drawn by hand.
 *
 * A chart library would be a script tag, and a script tag is the one thing
 * these pages cannot have: the export is a file that opens from disk and asks
 * the network for nothing. So the marks are computed here and written out as
 * geometry — no runtime, no layout pass, nothing to load.
 *
 * Two consequences worth knowing before editing:
 *  - **No `xmlns` attribute.** Inline SVG in an HTML document does not need
 *    one, and the only form of it is `http://www.w3.org/2000/svg` — which the
 *    export's own "reaches the network for nothing" test rejects on sight.
 *  - **The hover layer is `<title>`.** A tooltip normally wants script; the
 *    browser draws one for free from a `<title>` inside a mark. Every mark
 *    carries its own, so a number is readable without a legend lookup.
 *
 * Every function here is pure: data in, a string out. They never read the
 * journal and never touch the filesystem.
 */

/** Text that lands inside a tag or an attribute. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Rounded to two places, and never `NaN` or `Infinity` on the page. */
function n(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value * 100) / 100);
}

/**
 * A y-axis top that reads as a number rather than as the data's maximum.
 *
 * 1, 2, 5 × a power of ten: the ticks a reader can divide in their head.
 */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const pow = Math.pow(10, exp);
  const frac = value / pow;
  const step = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return step * pow;
}

/** A bar with a 4px rounded data-end and a square foot on the baseline. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  if (h <= 0) return '';
  return (
    `M${n(x)},${n(y + h)}L${n(x)},${n(y + r)}Q${n(x)},${n(y)} ${n(x + r)},${n(y)}` +
    `L${n(x + w - r)},${n(y)}Q${n(x + w)},${n(y)} ${n(x + w)},${n(y + r)}` +
    `L${n(x + w)},${n(y + h)}Z`
  );
}

/** The same shape lying down: rounded at the tip, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, h / 2, w);
  if (w <= 0) return '';
  return (
    `M${n(x)},${n(y)}L${n(x + w - r)},${n(y)}Q${n(x + w)},${n(y)} ${n(x + w)},${n(y + r)}` +
    `L${n(x + w)},${n(y + h - r)}Q${n(x + w)},${n(y + h)} ${n(x + w - r)},${n(y + h)}` +
    `L${n(x)},${n(y + h)}Z`
  );
}

function frame(width: number, height: number, label: string, body: string): string {
  // `role="img"` plus the label is what a screen reader gets; the table beside
  // every chart is what everyone else gets when the shape is not enough.
  return (
    `<svg class="viz" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" ` +
    `role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${body}</svg>`
  );
}

export interface Series {
  name: string;
  /** A CSS custom property name, e.g. `--s1`. */
  color: string;
  values: number[];
}

/**
 * Grouped columns: one band per label, one column per series.
 *
 * Two series of the same unit share one axis. Two units would need two charts —
 * a second y-scale invents a correlation the data does not have.
 */
export function columnsChart(opts: {
  labels: string[];
  series: Series[];
  unit: string;
  height?: number;
}): string {
  const W = 760;
  const H = opts.height ?? 220;
  const pad = { top: 12, right: 14, bottom: 30, left: 38 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const count = Math.max(1, opts.labels.length);
  const band = plotW / count;
  const max = niceMax(Math.max(0, ...opts.series.flatMap((s) => s.values)));
  const y = (v: number): number => pad.top + plotH - (v / max) * plotH;

  const parts: string[] = [];
  // Hairline, solid, one step off the surface: present but never competing.
  for (const tick of [0, max / 2, max]) {
    parts.push(
      `<line class="grid" x1="${pad.left}" y1="${n(y(tick))}" x2="${n(W - pad.right)}" y2="${n(y(tick))}"/>`,
      `<text class="tick" x="${pad.left - 6}" y="${n(y(tick) + 3.5)}" text-anchor="end">${n(tick)}</text>`,
    );
  }

  // Columns of a group touch, separated by the 2px surface gap, and the group
  // is centred in its band. Spreading them across the band instead puts as
  // much air inside a pair as between two periods, and the pairing is the
  // whole point of a grouped column chart.
  const seam = 2;
  const available = (band - 8 - seam * (opts.series.length - 1)) / opts.series.length;
  const thick = Math.min(24, Math.max(2, available));
  const groupW = thick * opts.series.length + seam * (opts.series.length - 1);
  opts.series.forEach((s, si) => {
    opts.labels.forEach((label, i) => {
      const v = s.values[i] ?? 0;
      const h = plotH - (y(v) - pad.top);
      if (h <= 0) return;
      const x = pad.left + i * band + (band - groupW) / 2 + si * (thick + seam);
      parts.push(
        `<path d="${columnPath(x, y(v), thick, h)}" fill="var(${s.color})">` +
          `<title>${esc(label)} · ${esc(s.name)}: ${v} ${esc(opts.unit)}</title></path>`,
      );
    });
  });

  // Every label on a long axis is a wall of text, so past eight bands only the
  // ends are drawn and the table below carries the rest.
  const dense = opts.labels.length > 8;
  opts.labels.forEach((label, i) => {
    const isEnd = i === 0 || i === opts.labels.length - 1;
    if (dense && !isEnd) return;
    if (dense) {
      const x = i === 0 ? pad.left : W - pad.right;
      parts.push(
        `<text class="tick" x="${n(x)}" y="${n(H - 10)}" text-anchor="${i === 0 ? 'start' : 'end'}">${esc(label)}</text>`,
      );
      return;
    }
    parts.push(
      `<text class="tick" x="${n(pad.left + i * band + band / 2)}" y="${n(H - 10)}" text-anchor="middle">${esc(label)}</text>`,
    );
  });

  const label = `${opts.series.map((s) => s.name).join(' and ')} per period, in ${opts.unit}.`;
  return frame(W, H, label, parts.join(''));
}

/**
 * Stacked bands over time — the cumulative flow diagram.
 *
 * Bands are stacked bottom-up in reverse board order, so finished work grows
 * from the baseline and the band above it is the work still to do. The 2px
 * separation between bands is the surface colour, not a stroke: a border would
 * add ink that is not data.
 */
export function stackedAreaChart(opts: {
  dates: string[];
  bands: Series[];
  height?: number;
}): string {
  const W = 760;
  const H = opts.height ?? 240;
  // The right gutter is for the band names. A legend alone would make the
  // reader match seven colours by eye, and a band that collapses to nothing
  // puts two slots side by side that the palette never promised to separate.
  const pad = { top: 12, right: 104, bottom: 30, left: 38 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const days = Math.max(1, opts.dates.length);
  // One day is a column, not a line: dividing by `days - 1` would be a
  // division by zero on the day a repository is created.
  const x = (i: number): number => (days === 1 ? pad.left + plotW / 2 : pad.left + (i / (days - 1)) * plotW);

  const totals = opts.dates.map((_, i) => opts.bands.reduce((sum, b) => sum + (b.values[i] ?? 0), 0));
  const max = niceMax(Math.max(0, ...totals));
  const y = (v: number): number => pad.top + plotH - (v / max) * plotH;

  const parts: string[] = [];
  for (const tick of [0, max / 2, max]) {
    parts.push(
      `<line class="grid" x1="${pad.left}" y1="${n(y(tick))}" x2="${n(W - pad.right)}" y2="${n(y(tick))}"/>`,
      `<text class="tick" x="${pad.left - 6}" y="${n(y(tick) + 3.5)}" text-anchor="end">${n(tick)}</text>`,
    );
  }

  const running = opts.dates.map(() => 0);
  const ordered = [...opts.bands].reverse();
  const endLabels: { name: string; y: number; height: number }[] = [];
  for (const band of ordered) {
    const lower = [...running];
    opts.dates.forEach((_, i) => {
      running[i] = (running[i] ?? 0) + (band.values[i] ?? 0);
    });
    const top = opts.dates.map((_, i) => `${n(x(i))},${n(y(running[i] ?? 0))}`);
    const bottom = opts.dates.map((_, i) => `${n(x(i))},${n(y(lower[i] ?? 0))}`).reverse();
    if (days === 1) {
      // A single day has no width to fill: draw the column it is.
      const w = Math.min(24, plotW);
      const h = y(lower[0] ?? 0) - y(running[0] ?? 0);
      if (h > 0) {
        parts.push(
          `<rect x="${n(x(0) - w / 2)}" y="${n(y(running[0] ?? 0))}" width="${n(w)}" height="${n(h)}" ` +
            `fill="var(${band.color})"><title>${esc(band.name)}: ${band.values[0] ?? 0}</title></rect>`,
        );
      }
      continue;
    }
    parts.push(
      `<path d="M${top.join('L')}L${bottom.join('L')}Z" fill="var(${band.color})" fill-opacity="0.9">` +
        `<title>${esc(band.name)}</title></path>`,
      // The gap, in the surface colour. Drawn after the fill it separates.
      `<polyline class="seam" points="${top.join(' ')}"/>`,
    );
    const last = opts.dates.length - 1;
    const bandTop = y(running[last] ?? 0);
    const bandBottom = y(lower[last] ?? 0);
    endLabels.push({ name: band.name, y: (bandTop + bandBottom) / 2, height: bandBottom - bandTop });
  }

  // A label that does not fit is not drawn rather than drawn over its
  // neighbour: the legend and the table carry the bands too thin to name.
  let lastLabelY = Number.NEGATIVE_INFINITY;
  for (const label of [...endLabels].sort((a, b) => a.y - b.y)) {
    if (label.height < 10 || label.y - lastLabelY < 13) continue;
    lastLabelY = label.y;
    parts.push(
      `<text class="tick" x="${n(W - pad.right + 10)}" y="${n(label.y + 3.5)}">${esc(label.name)}</text>`,
    );
  }

  opts.dates.forEach((date, i) => {
    const show = i === 0 || i === opts.dates.length - 1;
    if (!show) return;
    parts.push(
      `<text class="tick" x="${n(x(i))}" y="${n(H - 10)}" text-anchor="${i === 0 ? 'start' : 'end'}">${esc(date)}</text>`,
    );
  });

  return frame(W, H, `Tasks per column per day, ${opts.bands.map((b) => b.name).join(', ')}.`, parts.join(''));
}

export interface BarRow {
  name: string;
  value: number;
  /** Drawn in the critical colour and named in the table, never colour alone. */
  critical?: boolean;
  note?: string;
}

/**
 * Horizontal bars, one per row, with an optional reference line.
 *
 * The reference line is why a row is critical: "19 days, and p85 is 6" is an
 * argument; a red bar on its own is a mood.
 */
export function barsChart(opts: {
  rows: BarRow[];
  unit: string;
  reference?: { value: number; label: string };
}): string {
  const W = 760;
  const rowH = 26;
  const pad = { top: 8, right: 52, bottom: 26, left: 92 };
  const H = pad.top + pad.bottom + Math.max(1, opts.rows.length) * rowH;
  const plotW = W - pad.left - pad.right;
  const max = niceMax(Math.max(opts.reference?.value ?? 0, ...opts.rows.map((r) => r.value)));
  const x = (v: number): number => pad.left + (v / max) * plotW;

  const parts: string[] = [];
  parts.push(
    `<line class="grid" x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${n(H - pad.bottom)}"/>`,
  );

  opts.rows.forEach((row, i) => {
    const top = pad.top + i * rowH;
    const thick = Math.min(14, rowH - 10);
    const w = x(row.value) - pad.left;
    const fill = row.critical === true ? 'var(--critical)' : 'var(--s1)';
    parts.push(
      `<text class="tick mono" x="${pad.left - 8}" y="${n(top + thick / 2 + 8)}" text-anchor="end">${esc(row.name)}</text>`,
      `<path d="${barPath(pad.left, top + 5, Math.max(w, 1), thick)}" fill="${fill}">` +
        `<title>${esc(row.name)}: ${row.value} ${esc(opts.unit)}${row.note === undefined ? '' : ` · ${esc(row.note)}`}</title></path>`,
      `<text class="tick" x="${n(x(row.value) + 6)}" y="${n(top + thick / 2 + 8)}">${row.value}</text>`,
    );
  });

  if (opts.reference !== undefined && opts.reference.value > 0) {
    parts.push(
      `<line class="reference" x1="${n(x(opts.reference.value))}" y1="${pad.top}" ` +
        `x2="${n(x(opts.reference.value))}" y2="${n(H - pad.bottom + 4)}"/>`,
      `<text class="tick" x="${n(x(opts.reference.value))}" y="${n(H - 10)}" text-anchor="middle">${esc(opts.reference.label)}</text>`,
    );
  }

  return frame(W, H, `${opts.rows.length} rows, in ${opts.unit}.`, parts.join(''));
}

export interface PercentileRow {
  name: string;
  p50: number;
  p85: number;
  p95: number;
  n: number;
}

/**
 * Three dots on a line, per measure: p50, p85, p95.
 *
 * A bar would say there is one number. There is not — the whole reason this
 * codebase reports percentiles is that the tail is the part worth managing,
 * and a shape that hides the tail would undo the decision.
 */
export function percentileStrips(rows: PercentileRow[], unit: string): string {
  const W = 760;
  const rowH = 44;
  const pad = { top: 10, right: 20, bottom: 26, left: 92 };
  const H = pad.top + pad.bottom + Math.max(1, rows.length) * rowH;
  const plotW = W - pad.left - pad.right;
  const max = niceMax(Math.max(1, ...rows.map((r) => r.p95)));
  const x = (v: number): number => pad.left + (v / max) * plotW;

  const parts: string[] = [];
  for (const tick of [0, max / 2, max]) {
    parts.push(
      `<line class="grid" x1="${n(x(tick))}" y1="${pad.top}" x2="${n(x(tick))}" y2="${n(H - pad.bottom + 2)}"/>`,
      `<text class="tick" x="${n(x(tick))}" y="${n(H - 10)}" text-anchor="middle">${n(tick)}</text>`,
    );
  }

  rows.forEach((row, i) => {
    const cy = pad.top + i * rowH + rowH / 2 - 4;
    parts.push(
      `<text class="tick" x="${pad.left - 8}" y="${n(cy + 4)}" text-anchor="end">${esc(row.name)}</text>`,
      `<line class="range" x1="${n(x(row.p50))}" y1="${n(cy)}" x2="${n(x(row.p95))}" y2="${n(cy)}"/>`,
    );
    for (const [label, value, r] of [
      ['p50', row.p50, 4.5],
      ['p85', row.p85, 6],
      ['p95', row.p95, 4.5],
    ] as const) {
      parts.push(
        `<circle class="dot" cx="${n(x(value))}" cy="${n(cy)}" r="${r}">` +
          `<title>${esc(row.name)} ${label}: ${value} ${esc(unit)} (n=${row.n})</title></circle>`,
      );
    }
    // One label, on the number the service level expectation is quoted from.
    parts.push(
      `<text class="tick" x="${n(x(row.p85))}" y="${n(cy - 12)}" text-anchor="middle">p85 = ${row.p85}</text>`,
    );
  });

  return frame(W, H, `p50, p85 and p95 per measure, in ${unit}.`, parts.join(''));
}

/**
 * Lines over time, one axis, same unit.
 *
 * A series marked `reference` is drawn as what it is — an expectation, not a
 * measurement — in muted ink and without an end dot, so the eye reads the real
 * line first and the ideal as the thing it is being compared against.
 */
export function lineChart(opts: {
  labels: string[];
  series: (Series & { reference?: boolean })[];
  unit: string;
  height?: number;
}): string {
  const W = 760;
  const H = opts.height ?? 230;
  const pad = { top: 12, right: 60, bottom: 30, left: 38 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const points = Math.max(1, opts.labels.length);
  const x = (i: number): number => (points === 1 ? pad.left + plotW / 2 : pad.left + (i / (points - 1)) * plotW);
  const max = niceMax(Math.max(0, ...opts.series.flatMap((s) => s.values)));
  const y = (v: number): number => pad.top + plotH - (v / max) * plotH;

  const parts: string[] = [];
  for (const tick of [0, max / 2, max]) {
    parts.push(
      `<line class="grid" x1="${pad.left}" y1="${n(y(tick))}" x2="${n(W - pad.right)}" y2="${n(y(tick))}"/>`,
      `<text class="tick" x="${pad.left - 6}" y="${n(y(tick) + 3.5)}" text-anchor="end">${n(tick)}</text>`,
    );
  }

  for (const s of opts.series) {
    const path = s.values.map((v, i) => `${n(x(i))},${n(y(v))}`).join('L');
    const muted = s.reference === true;
    parts.push(
      `<path class="line${muted ? ' reference-line' : ''}" d="M${path}" ` +
        `${muted ? '' : `stroke="var(${s.color})"`}><title>${esc(s.name)}, ${esc(opts.unit)}</title></path>`,
    );
    const lastIndex = s.values.length - 1;
    const last = s.values[lastIndex];
    if (!muted && last !== undefined) {
      parts.push(
        `<circle class="dot" cx="${n(x(lastIndex))}" cy="${n(y(last))}" r="4.5" fill="var(${s.color})"/>`,
        `<text class="tick" x="${n(x(lastIndex) + 9)}" y="${n(y(last) + 3.5)}">${last}</text>`,
      );
    }
  }

  opts.labels.forEach((label, i) => {
    if (i !== 0 && i !== opts.labels.length - 1) return;
    parts.push(
      `<text class="tick" x="${n(x(i))}" y="${n(H - 10)}" text-anchor="${i === 0 ? 'start' : 'end'}">${esc(label)}</text>`,
    );
  });

  return frame(W, H, `${opts.series.map((s) => s.name).join(' against ')}, in ${opts.unit}.`, parts.join(''));
}
