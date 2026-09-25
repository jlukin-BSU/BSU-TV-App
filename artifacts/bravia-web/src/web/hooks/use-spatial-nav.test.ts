import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { pickNeighbor } from "./use-spatial-nav";

/**
 * Arrow-key movement in the windowed layouts is by screen position. These
 * cases mirror the layouts: a window above an app row, a list beside a window,
 * and a grid with a 2x2 window in its corner.
 */

const box = (id: string, left: number, top: number, w: number, h: number) => ({ id, left, top, right: left + w, bottom: top + h });

describe("pickNeighbor", () => {
  // Signage window with a row of tiles underneath (guide / backdrop).
  const win = box("win", 0, 0, 1000, 560);
  const row = [0, 1, 2, 3, 4].map((i) => box(`t${i}`, i * 200, 620, 180, 160));

  test("down from the window lands on the tile under its centre", () => {
    assert.equal(pickNeighbor(win, row, "down")?.id, "t2");
  });

  test("up from any tile in the row reaches the window", () => {
    assert.equal(pickNeighbor(row[3]!, [win, ...row], "up")?.id, "win");
  });

  test("left and right walk the row", () => {
    assert.equal(pickNeighbor(row[2]!, row, "right")?.id, "t3");
    assert.equal(pickNeighbor(row[2]!, row, "left")?.id, "t1");
  });

  test("right from the window does not drop into the row below it", () => {
    assert.equal(pickNeighbor(win, row, "right"), null);
  });

  test("nothing beyond the edge returns null", () => {
    assert.equal(pickNeighbor(row[0]!, row, "left"), null);
    assert.equal(pickNeighbor(win, row, "up"), null);
  });

  // Grid: 2x2 window in the top-left, tiles to its right and below.
  const gwin = box("gwin", 0, 0, 440, 260);
  const grid = [
    box("a", 460, 0, 210, 120), box("b", 690, 0, 210, 120),
    box("c", 460, 140, 210, 120), box("d", 690, 140, 210, 120),
    box("e", 0, 280, 210, 120), box("f", 230, 280, 210, 120), box("g", 460, 280, 210, 120),
  ];

  test("right from the grid window goes to the first tile beside it", () => {
    assert.equal(pickNeighbor(gwin, grid, "right")?.id, "a");
  });

  test("left from a tile beside the window returns to the window", () => {
    assert.equal(pickNeighbor(grid[2]!, [gwin, ...grid], "left")?.id, "gwin");
  });

  test("down from the window prefers the tile directly under it over one further right", () => {
    assert.equal(pickNeighbor(gwin, grid, "down")?.id, "e");
  });

  test("up from a tile past the window's right edge still reaches the window", () => {
    const farRight = box("far", 1100, 620, 180, 160);
    assert.equal(pickNeighbor(farRight, [win, ...row], "up")?.id, "win");
  });

  test("a tile straight ahead beats a nearer one off to the side", () => {
    const cur = box("cur", 0, 0, 100, 100);
    const ahead = box("ahead", 300, 0, 100, 100);
    const diagonal = box("diag", 120, 400, 100, 100);
    assert.equal(pickNeighbor(cur, [diagonal, ahead], "right")?.id, "ahead");
  });
});
