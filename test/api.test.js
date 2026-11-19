"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("../app");
const { createStore } = require("../src/store");

const TOKEN = "token-de-teste-1234567890";
let server, base, dir;
const valido = { categoria: "buraco", descricao: "Buraco grande na faixa da direita", bairro: "Pinheiros", lat: -23.5667, lng: -46.6917 };

test.before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "zela-"));
  const store = createStore(dir, path.join(__dirname, "..", "data", "seed.json"));
  await new Promise((resolve) => {
    server = createApp({ store, adminToken: TOKEN, limits: { escrita: 100 } }).listen(0, () => { base = "http://127.0.0.1:" + server.address().port; resolve(); });
  });
});
test.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

const post = (p, body, headers = {}) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

test("health responde ok", async () => {
  const r = await fetch(base + "/health");
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await r.json()).status, "ok");
});

test("lista os relatos simulados iniciais", async () => {
  const list = await (await fetch(base + "/api/reports")).json();
  assert.strictEqual(list.length, 36);
  assert.ok(list.every((r) => r.simulado === true));
});

test("cria um relato válido e ele aparece na lista", async () => {
  const r = await post("/api/reports", valido);
  assert.strictEqual(r.status, 201);
  const criado = await r.json();
  assert.strictEqual(criado.status, "aberto");
  assert.strictEqual(criado.simulado, false);
  const list = await (await fetch(base + "/api/reports")).json();
  assert.ok(list.some((x) => x.id === criado.id));
});

test("rejeita dados inválidos", async () => {
  for (const ruim of [
    { ...valido, categoria: "xyz" },
    { ...valido, descricao: "curto" },
    { ...valido, bairro: "" },
    { ...valido, lat: 10, lng: 10 },
    { ...valido, lat: "abc" }
  ]) {
    assert.strictEqual((await post("/api/reports", ruim)).status, 400, JSON.stringify(ruim));
  }
});

test("apoiar incrementa os apoios e id inexistente dá 404", async () => {
  const c = await (await post("/api/reports", valido)).json();
  const a = await (await post("/api/reports/" + c.id + "/apoiar", {})).json();
  assert.strictEqual(a.apoios, 1);
  assert.strictEqual((await post("/api/reports/nao-existe/apoiar", {})).status, 404);
});

test("só administrador altera o status", async () => {
  const c = await (await post("/api/reports", valido)).json();
  const patch = (headers) => fetch(base + "/api/reports/" + c.id, { method: "PATCH", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ status: "resolvido" }) });
  assert.strictEqual((await patch({})).status, 401);
  assert.strictEqual((await patch({ authorization: "Bearer errado" })).status, 401);
  const ok = await patch({ authorization: "Bearer " + TOKEN });
  assert.strictEqual(ok.status, 200);
  const r = await ok.json();
  assert.strictEqual(r.status, "resolvido");
  assert.ok(r.resolvidoEm);
});

test("sem ADMIN_TOKEN configurado, ninguém é administrador", async () => {
  const store = createStore(fs.mkdtempSync(path.join(os.tmpdir(), "zela-")), null);
  const s = createApp({ store, adminToken: undefined }).listen(0);
  const r = await fetch("http://127.0.0.1:" + s.address().port + "/api/admin/check", { headers: { authorization: "Bearer " } });
  s.close();
  assert.strictEqual(r.status, 401);
});

test("estatísticas somam o total", async () => {
  const s = await (await fetch(base + "/api/stats")).json();
  const soma = s.porStatus.aberto + s.porStatus.em_andamento + s.porStatus.resolvido;
  assert.strictEqual(soma, s.total);
  assert.ok(s.taxaResolucao >= 0 && s.taxaResolucao <= 100);
});

test("rate limit bloqueia excesso de escritas", async () => {
  const store = createStore(fs.mkdtempSync(path.join(os.tmpdir(), "zela-")), null);
  const s = createApp({ store, adminToken: TOKEN, limits: { escrita: 3 } }).listen(0);
  const url = "http://127.0.0.1:" + s.address().port + "/api/reports";
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(valido) })).status);
  s.close();
  assert.deepStrictEqual(codes, [201, 201, 201, 429, 429]);
});

test("em produção, HTTP é redirecionado para HTTPS, mas /health responde 200", async () => {
  const anterior = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const store = createStore(fs.mkdtempSync(path.join(os.tmpdir(), "zela-")), null);
    const s = createApp({ store, adminToken: TOKEN }).listen(0);
    const url = "http://127.0.0.1:" + s.address().port;
    const h = { "x-forwarded-proto": "http" };
    const raiz = await fetch(url + "/", { headers: h, redirect: "manual" });
    const saude = await fetch(url + "/health", { headers: h, redirect: "manual" });
    s.close();
    assert.strictEqual(raiz.status, 301);
    assert.match(raiz.headers.get("location"), /^https:/);
    assert.strictEqual(saude.status, 200);
  } finally {
    process.env.NODE_ENV = anterior;
  }
});

test("cabeçalhos de segurança e arquivos privados", async () => {
  const r = await fetch(base + "/");
  assert.ok(r.headers.get("content-security-policy"));
  assert.ok(r.headers.get("strict-transport-security"));
  assert.strictEqual(r.headers.get("x-powered-by"), null);
  for (const p of ["/server.js", "/package.json", "/app.js", "/data/reports.json", "/src/store.js", "/.git/config", "/.github/workflows/azure-deploy.yml"]) {
    assert.strictEqual((await fetch(base + p)).status, 404, p);
  }
});
