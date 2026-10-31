import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GET, POST } from "./api/google.mjs";
import { GET as accessGET, POST as accessPOST } from "./api/access.mjs";
try {
  process.loadEnvFile(new URL(".env.local", import.meta.url));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.GOOP_PORT || 4173);
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (["/api/google", "/api/access"].includes(url.pathname)) {
        if (!["GET", "POST"].includes(req.method)) {
          res.writeHead(405);
          return res.end();
        }
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 8192) {
            res.writeHead(413);
            return res.end();
          }
          chunks.push(chunk);
        }
        const request = new Request(url, {
          method: req.method,
          headers: req.headers,
          ...(req.method === "POST" ? { body: Buffer.concat(chunks) } : {}),
        });
        const handler =
          url.pathname === "/api/access"
            ? req.method === "POST"
              ? accessPOST
              : accessGET
            : req.method === "POST"
              ? POST
              : GET;
        const response = await handler(request);
        res.statusCode = response.status;
        for (const [k, v] of response.headers)
          if (k !== "set-cookie") res.setHeader(k, v);
        const cookies = response.headers.getSetCookie();
        if (cookies.length) res.setHeader("Set-Cookie", cookies);
        return res.end(Buffer.from(await response.arrayBuffer()));
      }
      const file =
        url.pathname === "/"
          ? "index.html"
          : decodeURIComponent(url.pathname.slice(1));
      const full = path.resolve(root, file);
      if (
        !full.startsWith(root + path.sep) ||
        file.split(/[\\/]/).some((p) => p.startsWith(".")) ||
        !types[path.extname(full)] ||
        /^(api|lib|scripts|tests|node_modules)[\\/]/.test(file)
      )
        throw Error();
      const body = await readFile(full);
      res.writeHead(200, {
        "Content-Type": types[path.extname(full)],
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`GOOP preview: http://127.0.0.1:${port}`),
  );
