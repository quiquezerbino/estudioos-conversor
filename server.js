// ============================================================================
// Conversor Word→PDF de ESTUDIOOS — servidor HTTP mínimo sobre LibreOffice.
//
// Contrato (pensado para el free tier de Render, 512 MB / 0.1 CPU):
//   GET  /health            → 200 {"status":"up"}  (sin auth, para health checks)
//   POST /convert           → body crudo = bytes del .docx; respuesta = bytes
//                             del PDF. Requiere Basic Auth.
// Decisiones:
//   - Body crudo en vez de multipart: el único cliente es ESTUDIOOS, no hace
//     falta parsear multipart y el server queda sin dependencias.
//   - Conversiones SERIALIZADAS (cola de a 1): dos soffice concurrentes no
//     entran en 512 MB. A 5 sobres/mes no hay contención real.
//   - soffice se lanza por conversión con perfil propio en /tmp y se limpia
//     todo al terminar (éxito o error).
// ============================================================================

const http = require("node:http");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 10000);
const USERNAME = process.env.CONVERSOR_USERNAME || "";
const PASSWORD = process.env.CONVERSOR_PASSWORD || "";
const MAX_BODY_BYTES = 20 * 1024 * 1024; // margen sobre los 15 MB que acepta la app
const CONVERT_TIMEOUT_MS = 180_000;

if (!USERNAME || !PASSWORD) {
  console.error("CONVERSOR_USERNAME y CONVERSOR_PASSWORD son obligatorias");
  process.exit(1);
}

function checkAuth(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  if (idx < 0) return false;
  const user = decoded.slice(0, idx);
  const pass = decoded.slice(idx + 1);
  const eq = (a, b) => {
    const ba = Buffer.from(a), bb = Buffer.from(b);
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
  };
  return eq(user, USERNAME) && eq(pass, PASSWORD);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("body demasiado grande"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function runSoffice(args) {
  return new Promise((resolve, reject) => {
    execFile("soffice", args, { timeout: CONVERT_TIMEOUT_MS }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
  });
}

// Cola de a 1: encadena cada conversión detrás de la anterior.
let queue = Promise.resolve();
function enqueue(job) {
  const run = queue.then(job, job);
  queue = run.catch(() => {});
  return run;
}

async function convert(docxBytes) {
  const id = crypto.randomUUID();
  const workDir = path.join("/tmp", `conv-${id}`);
  const profileDir = path.join(workDir, "profile");
  const inPath = path.join(workDir, "in.docx");
  const outPath = path.join(workDir, "in.pdf");
  await fs.mkdir(profileDir, { recursive: true });
  try {
    await fs.writeFile(inPath, docxBytes);
    await runSoffice([
      "--headless",
      "--norestore",
      "--nolockcheck",
      `-env:UserInstallation=file://${profileDir}`,
      "--convert-to",
      "pdf",
      "--outdir",
      workDir,
      inPath,
    ]);
    return await fs.readFile(outPath);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "up" }));
      return;
    }
    if (req.method !== "POST" || req.url !== "/convert") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    if (!checkAuth(req)) {
      res.writeHead(401, { "content-type": "application/json", "www-authenticate": "Basic" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const body = await readBody(req);
    if (body.length === 0) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "empty body" }));
      return;
    }
    const started = Date.now();
    const pdf = await enqueue(() => convert(body));
    console.log(`convert ok: ${body.length}B docx -> ${pdf.length}B pdf en ${Date.now() - started}ms`);
    res.writeHead(200, { "content-type": "application/pdf" });
    res.end(pdf);
  } catch (err) {
    const status = err.status || 500;
    console.error("convert error:", err.message, err.stderr || "");
    if (!res.headersSent) {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "conversion failed" }));
    } else {
      res.end();
    }
  }
});

server.listen(PORT, () => console.log(`conversor escuchando en :${PORT}`));
