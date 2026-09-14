/* Поиск спортсмена в кадре.
   Съёмка со штатива, поэтому фон неподвижен: усредняем все кадры — получаем
   пустой бассейн, а всё, что от него отличается, и есть летящий человек.

   Запуск:  node трек.js видео/107B.MOV
   Вывод:   номер кадра, центр фигуры и её габариты в координатах ИСХОДНОГО видео,
            плюс готовая строка crop для ffmpeg.

   Ничего не устанавливает: кадры отдаёт ffmpeg сырым потоком, разбираем сами. */

const { execFileSync, spawnSync } = require("child_process");
const path = require("path");

const src = process.argv[2];
if (!src) { console.error("Укажите видео: node трек.js видео/107B.MOV"); process.exit(1); }

/* мелкая копия для поиска: фигуры хватает, а памяти нужно в триста раз меньше */
const W = 216, H = 384;

function probe(sel) {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=" + sel, "-of", "csv=p=0", src], { encoding: "utf8" });
  return out.trim().split(",");
}
const [srcW, srcH] = probe("width,height").map(Number);
/* телефон пишет поворот отдельным полем, поэтому реальные ширина и высота могут быть переставлены */
const rot = (() => { try { return Math.abs(+execFileSync("ffprobe", ["-v", "error",
  "-select_streams", "v:0", "-show_entries", "stream_side_data=rotation",
  "-of", "default=nw=1:nk=1", src], { encoding: "utf8" }).trim()) % 180; } catch (e) { return 0; } })();
const realW = rot === 90 ? srcH : srcW, realH = rot === 90 ? srcW : srcH;

const r = spawnSync("ffmpeg", ["-v", "error", "-i", src, "-vf", `scale=${W}:${H}`,
  "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 30 });
if (r.status !== 0) { console.error(r.stderr.toString()); process.exit(1); }
const buf = r.stdout, frameBytes = W * H * 3, n = Math.floor(buf.length / frameBytes);
console.log(`${path.basename(src)} — ${realW}×${realH}, кадров ${n}\n`);

/* фон: среднее по всем кадрам. Человек мал и всё время в разных местах,
   поэтому в среднем он исчезает, а трибуны и вышка остаются */
const bg = new Float64Array(W * H * 3);
for (let f = 0; f < n; f++) {
  const o = f * frameBytes;
  for (let i = 0; i < frameBytes; i++) bg[i] += buf[o + i];
}
for (let i = 0; i < frameBytes; i++) bg[i] /= n;

/* Зона поиска в координатах исходного видео: x0,y0,x1,y1.
   Нужна обязательно — иначе находится рябь на воде и экран трансляции сбоку,
   они меняются от кадра к кадру не меньше спортсмена. */
const roi = (process.argv[3] || `0,0,${realW},${realH}`).split(",").map(Number);
const rx0 = Math.max(0, Math.floor(roi[0] / realW * W)), rx1 = Math.min(W, Math.ceil(roi[2] / realW * W));
const ry0 = Math.max(0, Math.floor(roi[1] / realH * H)), ry1 = Math.min(H, Math.ceil(roi[3] / realH * H));
console.log(`зона поиска: ${roi.join(",")}\n`);

const rows = [];
const mask = new Uint8Array(W * H), seen = new Uint8Array(W * H);
for (let f = 0; f < n; f++) {
  const o = f * frameBytes;
  mask.fill(0); seen.fill(0);
  /* кандидат = и отличается от фона, и телесного цвета.
     Одного отличия мало: вода рябит сильнее, чем летит человек */
  for (let y = ry0; y < ry1; y++) for (let x = rx0; x < rx1; x++) {
    const i = (y * W + x) * 3, R = buf[o + i], G = buf[o + i + 1], B = buf[o + i + 2];
    const d = Math.abs(R - bg[i]) + Math.abs(G - bg[i + 1]) + Math.abs(B - bg[i + 2]);
    if (d > 85 && R > 110 && R >= G && G >= B && R - B > 18) mask[y * W + x] = 1;
  }
  /* из всех пятен берём самое крупное — это и есть фигура */
  let best = null;
  for (let y = ry0; y < ry1; y++) for (let x = rx0; x < rx1; x++) {
    const s = y * W + x;
    if (!mask[s] || seen[s]) continue;
    const st = [s]; seen[s] = 1;
    let cnt = 0, sx = 0, sy = 0, ax0 = W, ax1 = 0, ay0 = H, ay1 = 0;
    while (st.length) {
      const p = st.pop(), px = p % W, py = (p - px) / W;
      cnt++; sx += px; sy += py;
      if (px < ax0) ax0 = px; if (px > ax1) ax1 = px;
      if (py < ay0) ay0 = py; if (py > ay1) ay1 = py;
      for (const q of [p - 1, p + 1, p - W, p + W]) {
        if (q < 0 || q >= W * H || seen[q] || !mask[q]) continue;
        const qx = q % W; if (Math.abs(qx - px) > 1) continue;   /* не перескакиваем через край строки */
        seen[q] = 1; st.push(q);
      }
    }
    if (!best || cnt > best.n) best = { n: cnt, cx: sx / cnt, cy: sy / cnt, x0: ax0, x1: ax1, y0: ay0, y1: ay1 };
  }
  rows.push(best && best.n >= 14 ? Object.assign({ f }, best) : null);
}

const kx = realW / W, ky = realH / H;
console.log("кадр   пикс   центр (в исходном)   габарит   crop для ffmpeg");
rows.forEach(s => {
  if (!s) return;
  const cx = Math.round(s.cx * kx), cy = Math.round(s.cy * ky);
  const w = Math.round((s.x1 - s.x0) * kx), h = Math.round((s.y1 - s.y0) * ky);
  /* окно кадрирования: квадрат вокруг фигуры с запасом, прижатый к границам кадра */
  const side = Math.min(realW, realH, Math.max(560, Math.round(Math.max(w, h) * 2.1)));
  const ox = Math.max(0, Math.min(realW - side, cx - (side >> 1)));
  const oy = Math.max(0, Math.min(realH - side, cy - (side >> 1)));
  console.log(String(s.f).padStart(4) + String(s.n).padStart(7) +
    ("  " + cx + "," + cy).padEnd(21) + (w + "×" + h).padEnd(10) +
    `crop=${side}:${side}:${ox}:${oy}`);
});
