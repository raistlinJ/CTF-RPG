import { buildings, trees } from "../lib/world-data.mjs";
import { drawInterior } from "../lib/interior-renderer";
export function drawDefaultMap(ctx: CanvasRenderingContext2D, map: string) {
  const t = 24;
  if (map === "town") {
    for (let y = 0; y < 28; y++)
      for (let x = 0; x < 40; x++) {
        ctx.fillStyle = (x * 7 + y * 13) % 11 === 0 ? "#c9e5e9" : "#dfedef";
        ctx.fillRect(x * t, y * t, t, t);
        if ((x * 11 + y * 3) % 9 === 0) {
          ctx.fillStyle = "#b6d7df";
          ctx.fillRect(x * t + 7, y * t + 14, 3, 2);
        }
      }
    ctx.fillStyle = "#bdd1cf";
    ctx.fillRect(17 * t, 7 * t, 3 * t, 20 * t);
    ctx.fillRect(8 * t, 16 * t, 22 * t, 3 * t);
    ctx.fillRect(6 * t, 7 * t, 27 * t, 2 * t);
    ctx.fillRect(3 * t, 21 * t, 15 * t, 2 * t);
    ctx.fillRect(32 * t, 14 * t, 2 * t, 4 * t);
    ctx.fillRect(10 * t, 5 * t, 2 * t, 4 * t);
    // Town square and its decorated Christmas tree.
    ctx.fillStyle = "#d0d9cb";
    ctx.fillRect(16 * t, 11 * t, 7 * t, 7 * t);
    ctx.fillStyle = "#346c5c";
    ctx.fillRect(19 * t - 12, 14 * t, 72, 24);
    ctx.fillRect(19 * t - 4, 13 * t, 56, 24);
    ctx.fillRect(19 * t + 4, 12 * t, 40, 24);
    ctx.fillRect(19 * t + 12, 11 * t + 12, 24, 24);
    ctx.fillStyle = "#f2d081";
    ctx.fillRect(20 * t - 4, 11 * t + 6, 8, 12);
    ctx.fillRect(20 * t - 8, 11 * t + 10, 16, 4);
    for (const [dx, dy] of [
      [4, 34],
      [26, 42],
      [14, 58],
      [35, 64],
    ]) {
      ctx.fillStyle = dx % 2 ? "#e7bd76" : "#cd6263";
      ctx.fillRect(19 * t + dx, 11 * t + dy, 7, 7);
    }
    ctx.fillStyle = "#b94d59";
    ctx.fillRect(18 * t, 15 * t, 16, 18);
    ctx.fillStyle = "#efd496";
    ctx.fillRect(18 * t + 6, 15 * t, 4, 18);
    ctx.fillStyle = "#487e83";
    ctx.fillRect(21 * t, 15 * t, 18, 16);
    ctx.fillStyle = "#9ec6d1";
    ctx.fillRect(23 * t, 17 * t, 9 * t, 7 * t);
    ctx.fillStyle = "#77afc3";
    ctx.fillRect(24 * t, 18 * t, 7 * t, 5 * t);
    ctx.fillStyle = "#bfe3e7";
    for (let i = 0; i < 7; i++)
      ctx.fillRect((24 + i) * t, (18 + (i % 4)) * t, 20, 3);
    for (const b of buildings) {
      const x = b.x * t,
        y = b.y * t;
      ctx.fillStyle = "#adc4cb";
      ctx.fillRect(x + 8, y + 12, b.w * t, b.h * t);
      ctx.fillStyle = b.color;
      ctx.fillRect(x, y + 24, b.w * t, b.h * t - 24);
      ctx.fillStyle = "#4c353d";
      ctx.fillRect(x - 6, y + 12, b.w * t + 12, 30);
      ctx.fillStyle = "#fff7e6";
      ctx.fillRect(x - 6, y + 8, b.w * t + 12, 12);
      ctx.fillStyle = "#d9e9e7";
      ctx.fillRect(x + 8, y, b.w * t - 16, 12);
      ctx.fillStyle = "#f5c677";
      ctx.fillRect(x + 14, y + 50, 18, 18);
      ctx.fillRect(x + b.w * t - 32, y + 50, 18, 18);
      ctx.fillStyle = "#483a43";
      ctx.fillRect(x + (b.w * t) / 2 - 10, y + b.h * t - 28, 20, 28);
      ctx.fillStyle = "#cf7180";
      ctx.fillRect(x + b.w * t - 26, y - 8, 12, 22);
      if (b.id === "castle") {
        for (const towerX of [x, x + b.w * t - 48]) {
          ctx.fillStyle = "#b9475b";
          ctx.fillRect(towerX, y, 48, 6 * t);
          for (let stripe = 0; stripe < 6; stripe++) {
            ctx.fillStyle = stripe % 2 ? "#f3e5cb" : "#b9475b";
            ctx.fillRect(towerX, y + stripe * 24, 48, 10);
          }
          ctx.fillStyle = "#235f59";
          ctx.fillRect(towerX - 6, y - 8, 60, 24);
          ctx.fillStyle = "#f4edda";
          ctx.fillRect(towerX - 6, y - 8, 60, 6);
          ctx.fillStyle = "#e9c470";
          ctx.fillRect(towerX + 23, y - 24, 3, 18);
          ctx.fillStyle = "#c44959";
          ctx.fillRect(towerX + 26, y - 24, 20, 10);
        }
        ctx.fillStyle = "#2f7360";
        ctx.fillRect(x + 48, y + 3 * t, b.w * t - 96, 9);
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = i % 2 ? "#f2d48b" : "#cf6661";
          ctx.fillRect(x + 54 + i * 22, y + 3 * t, 6, 8);
        }
        ctx.fillStyle = "#374745";
        ctx.fillRect(b.door.x * t, b.door.y * t, 24, 24);
        ctx.fillStyle = "#d5b86d";
        ctx.fillRect(b.door.x * t + 4, b.door.y * t + 2, 16, 22);
      } else {
        ctx.fillStyle = "#ecd296";
        ctx.fillRect(b.door.x * t + 4, b.door.y * t, 16, 24);
        ctx.fillStyle = "#2e735e";
        ctx.fillRect(b.door.x * t + 7, b.door.y * t + 3, 10, 10);
      }
    }
    for (const [x, y] of trees) {
      const a = x * t + 12,
        b = y * t + 10;
      ctx.fillStyle = "#aecbd2";
      ctx.fillRect(a - 12, b + 10, 29, 10);
      ctx.fillStyle = "#745a52";
      ctx.fillRect(a - 3, b + 3, 6, 16);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = ["#21585c", "#2e7775", "#438a83"][i];
        ctx.fillRect(a - 15 + i * 4, b - 4 - i * 9, 30 - i * 8, 13);
        ctx.fillStyle = "#edf5eb";
        ctx.fillRect(a - 10 + i * 3, b - 5 - i * 9, 20 - i * 6, 4);
      }
    }
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = "#526e7c";
    ctx.fillText("SANTA’S CHRISTMAS CASTLE", 20 * t, 8 * t);
    ctx.fillText("EVERGREEN GROVE", 8 * t, 5 * t);
    ctx.fillText("AURORA RIDGE", 29 * t, 5 * t);
    ctx.fillText("FROSTBITE LAKE", 27.5 * t, 24.5 * t);
    ctx.fillText("LANTERN LANE", 10.5 * t, 18 * t);
  } else drawInterior(ctx, map);
}
