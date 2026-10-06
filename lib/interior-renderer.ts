import { roomObstacles, exitTile, mapName } from "./world-data.mjs";
export function drawInterior(ctx: CanvasRenderingContext2D, map: string) {
  const t = 24,
    castle = map === "castle",
    left = castle ? 5 : 9,
    right = castle ? 34 : 30,
    top = castle ? 3 : 5,
    bottom = castle ? 26 : 25;
  const rect = (color: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  rect("#1b2e39", 0, 0, 960, 672);
  rect(
    "#0d1c28",
    (left - 1) * t,
    (top - 1) * t,
    (right - left + 3) * t,
    (bottom - top + 3) * t,
  );
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++) {
      const wall = x === left || x === right || y === top || y === bottom;
      rect(
        wall
          ? castle
            ? "#7e424c"
            : "#694f43"
          : (x + y) % 2 === 0
            ? castle
              ? "#c0a982"
              : "#aa8061"
            : castle
              ? "#bda079"
              : "#a07859",
        x * t,
        y * t,
        t,
        t,
      );
      if (wall) {
        rect("#a27668", x * t, y * t, 23, 3);
        rect("#493943", x * t + 22, y * t, 2, 24);
      }
    }
  rect(
    castle ? "#943d50" : "#8a5145",
    18 * t,
    (castle ? 8 : 11) * t,
    5 * t,
    (castle ? 17 : 13) * t,
  );
  rect("#d7b56d", 18 * t, (castle ? 8 : 11) * t, 3, (castle ? 17 : 13) * t);
  rect("#d7b56d", 23 * t - 3, (castle ? 8 : 11) * t, 3, (castle ? 17 : 13) * t);
  // Warm windows, garlands, candles and a hearth.
  for (const x of castle ? [10, 16, 24, 30] : [13, 26]) {
    rect("#3a6474", x * t, top * t + 7, 24, 28);
    rect("#e9d6a2", x * t + 11, top * t + 7, 3, 28);
    rect("#e9d6a2", x * t, top * t + 20, 24, 3);
    rect("#287061", x * t - 4, top * t + 38, 32, 6);
    rect("#d76258", x * t + 10, top * t + 35, 8, 9);
  }
  for (const b of roomObstacles[map as keyof typeof roomObstacles] || []) {
    rect("#6b4b40", b.x * t + 3, b.y * t + 5, b.w * t, b.h * t);
    rect("#c59969", b.x * t, b.y * t, b.w * t, b.h * t - 5);
    rect("#e5ba83", b.x * t, b.y * t, b.w * t, 5);
  }
  if (castle) {
    // Santa's gilded chair and Santa, with a snowy beard and red winter clothes.
    rect("#e1ba69", 18 * t, 5 * t, 5 * t, 3 * t);
    rect("#9c3f52", 18 * t + 8, 5 * t + 8, 5 * t - 16, 3 * t - 16);
    const x = 20 * t + 12,
      y = 7 * t + 8;
    rect("#c84d56", x - 12, y - 20, 24, 36);
    rect("#f8ebd4", x - 10, y - 10, 20, 18);
    rect("#f1c4a3", x - 7, y - 17, 14, 10);
    rect("#d24d57", x - 12, y - 29, 24, 10);
    rect("#fff2d7", x - 14, y - 22, 28, 5);
    rect("#e8c984", x - 12, y + 6, 24, 4);
    rect("#24313d", x - 10, y + 16, 8, 7);
    rect("#24313d", x + 3, y + 16, 8, 7);
    for (const x of [8, 29]) {
      for (let i = 0; i < 3; i++)
        rect(
          ["#235f52", "#2b7964", "#3f9475"][i],
          x * t + i * 6,
          6 * t - i * 10,
          56 - i * 12,
          20,
        );
      rect("#ecc775", x * t + 12, 6 * t - 28, 8, 8);
      rect("#c85059", x * t, 6 * t, 9, 6);
    }
    for (const x of [8, 30]) {
      rect("#ba4c5e", x * t, 20 * t, 24, 24);
      rect("#efd18e", x * t + 9, 20 * t, 5, 24);
      rect("#e6bf71", x * t, 20 * t + 9, 24, 5);
    }
  } else if (map === "toy-workshop") {
    for (const x of [13, 24]) {
      rect("#46888a", x * t, 9 * t + 8, 18, 18);
      rect("#da6965", x * t + 25, 9 * t + 12, 14, 12);
      rect("#d7c06d", x * t + 50, 9 * t + 6, 12, 22);
    }
  } else if (map === "bakery") {
    for (const x of [13, 24]) {
      rect("#514748", x * t, 8 * t + 6, 44, 34);
      rect("#ecac53", x * t + 8, 8 * t + 14, 28, 15);
    }
    for (let i = 0; i < 5; i++)
      rect("#eac47e", (17 + i) * t, 15 * t + 8, 16, 12);
  } else if (map === "post-office") {
    for (let i = 0; i < 8; i++)
      rect(i % 2 ? "#e3d3a1" : "#c55758", (12 + i * 2) * t, 8 * t + 8, 30, 24);
  } else if (map === "elf-house") {
    rect("#b3515d", 12 * t, 8 * t, 5 * t, 4 * t);
    rect("#eee2bf", 12 * t, 8 * t, 5 * t, 28);
    rect("#ddd1ac", 12 * t + 8, 8 * t + 5, 35, 16);
  } else {
    rect("#423d3e", 12 * t, 8 * t, 4 * t, 2 * t);
    rect("#eea64f", 13 * t, 8 * t + 8, 48, 27);
    for (const x of [18, 21]) {
      rect("#ead7ad", x * t, 14 * t + 12, 12, 12);
      rect("#624334", x * t + 12, 14 * t + 14, 4, 8);
    }
  }
  const exit = exitTile(map);
  rect("#d9c9a3", exit.x * t, exit.y * t, 24, 24);
  rect("#a06850", exit.x * t + 6, exit.y * t, 12, 24);
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#dfd8b9";
  ctx.fillText(mapName(map).toUpperCase(), 480, (top - 1) * t - 5);
  ctx.font = "10px monospace";
  ctx.fillText("EXIT TO TOWN", exit.x * t + 12, (bottom + 1) * t + 14);
  if (castle) {
    ctx.fillStyle = "#f5dfbb";
    ctx.fillText("SANTA CLAUS", 20 * t + 12, 9 * t);
  }
}
