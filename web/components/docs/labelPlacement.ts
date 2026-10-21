export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Mark {
  cx: number;
  cy: number;
  /** Width and height of the mark (a dot or a bubble). */
  w: number;
  h: number;
  label: string;
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Rough width of 11px text, enough for avoiding collisions.
const CHAR_WIDTH = 6.4;
const TEXT_HEIGHT = 13;

/**
 * Places each label next to its mark: right, left, above, below, then slightly
 * shifted up or down, taking the first spot inside the plot that doesn't cover
 * another label or mark. Returns the top-left corner of each label box.
 */
export function placeLabels(marks: Mark[], plot: Box): Box[] {
  const placed: Box[] = [];
  const markBoxes = marks.map((m) => ({ x: m.cx - m.w / 2, y: m.cy - m.h / 2, w: m.w, h: m.h }));
  const inside = (box: Box) => box.x >= plot.x && box.x + box.w <= plot.x + plot.w && box.y >= plot.y && box.y + box.h <= plot.y + plot.h;

  return marks.map((mark, i) => {
    const w = mark.label.length * CHAR_WIDTH + 4;
    const h = TEXT_HEIGHT;
    const right = mark.cx + mark.w / 2 + 3;
    const left = mark.cx - mark.w / 2 - 3 - w;
    const spots: Box[] = [
      { x: right, y: mark.cy - h / 2, w, h },
      { x: left, y: mark.cy - h / 2, w, h },
      { x: mark.cx - w / 2, y: mark.cy - mark.h / 2 - h - 1, w, h },
      { x: mark.cx - w / 2, y: mark.cy + mark.h / 2 + 1, w, h },
      { x: right, y: mark.cy - h - 2, w, h },
      { x: right, y: mark.cy + 2, w, h },
      { x: left, y: mark.cy - h - 2, w, h },
      { x: left, y: mark.cy + 2, w, h },
    ];
    const others = markBoxes.filter((_, j) => j !== i);
    const free =
      spots.find((box) => inside(box) && !placed.some((p) => overlaps(p, box)) && !others.some((o) => overlaps(o, box))) ?? spots.find(inside) ?? spots[0];
    placed.push(free);
    return free;
  });
}
