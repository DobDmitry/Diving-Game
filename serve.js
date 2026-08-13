/* Локальный сервер для стенда и игры.
   Запуск:  node serve.js
   Дальше:  http://localhost:5180/bench.html   — стенд
            http://localhost:5180/index.html   — игра
   Останов: Ctrl+C
   Ничего не устанавливает, работает на голом Node. */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 5180;      // если занят, возьмём следующий свободный
const ROOT = path.join(__dirname, "app", "src", "main", "assets");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

if (!fs.existsSync(ROOT)) {
  console.error("Не нашёл папку с игрой:", ROOT);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "bench.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Не найдено: " + rel);
    return;
  }
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store",   // правки видны сразу, без очистки кеша
  });
  fs.createReadStream(file).pipe(res);
});

/* Порт может оказаться занят — чужим сервером или прошлым запуском этого же.
   Вместо падения со стеком молча берём следующий свободный. */
let port = PORT;
server.on("error", (e) => {
  if (e.code === "EADDRINUSE" && port < PORT + 20) {
    port++;
    server.listen(port);
  } else {
    console.error("\n  Не удалось запустить сервер:", e.message, "\n");
    process.exit(1);
  }
});
server.on("listening", () => {
  if (port !== PORT) console.log("\n  Порт " + PORT + " был занят, взял " + port);
  console.log("");
  console.log("  Стенд:  http://localhost:" + port + "/bench.html");
  console.log("  Игра:   http://localhost:" + port + "/index.html");
  console.log("");
  console.log("  Остановить — Ctrl+C");
});
server.listen(port);
