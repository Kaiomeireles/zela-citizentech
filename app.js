"use strict";

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { STATUS } = require("./src/store");

const CATEGORIAS = ["buraco", "iluminacao", "lixo", "calcada", "alagamento", "outros"];
// Retângulo aproximado da Grande São Paulo: rejeita coordenadas fora da área do piloto.
const BOUNDS = { latMin: -24.1, latMax: -23.2, lngMin: -47.0, lngMax: -46.2 };

function limparTexto(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

function validarReport(body) {
  const b = body || {};
  const categoria = limparTexto(b.categoria, 20);
  const descricao = limparTexto(b.descricao, 280);
  const bairro = limparTexto(b.bairro, 60);
  const lat = Number(b.lat);
  const lng = Number(b.lng);
  const erros = [];
  if (!CATEGORIAS.includes(categoria)) erros.push("categoria inválida");
  if (descricao.length < 10) erros.push("descreva o problema com pelo menos 10 caracteres");
  if (!bairro) erros.push("informe o bairro");
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < BOUNDS.latMin || lat > BOUNDS.latMax || lng < BOUNDS.lngMin || lng > BOUNDS.lngMax) {
    erros.push("localização fora da área do piloto (Grande São Paulo)");
  }
  return { erros, dados: { categoria, descricao, bairro, lat: Math.round(lat * 1e4) / 1e4, lng: Math.round(lng * 1e4) / 1e4 } };
}

// Papel "administrador": quem tem o ADMIN_TOKEN (App Setting do Azure, fora do código).
function exigirAdmin(adminToken) {
  return (req, res, next) => {
    const h = req.headers.authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";
    const ok =
      adminToken &&
      token.length === adminToken.length &&
      crypto.timingSafeEqual(Buffer.from(token), Buffer.from(adminToken));
    if (!ok) return res.status(401).json({ erro: "acesso restrito a administradores" });
    next();
  };
}

function createApp({ store, adminToken = process.env.ADMIN_TOKEN, limits = {} } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    if (process.env.NODE_ENV === "production" && req.headers["x-forwarded-proto"] === "http") {
      return res.redirect(301, "https://" + req.headers.host + req.originalUrl);
    }
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
          styleSrc: ["'self'", "https://cdnjs.cloudflare.com"],
          imgSrc: ["'self'", "data:", "https://cdnjs.cloudflare.com", "https://*.basemaps.cartocdn.com", "https://*.tile.openstreetmap.org"],
          connectSrc: ["'self'", "https://nominatim.openstreetmap.org"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"]
        }
      },
      strictTransportSecurity: { maxAge: 31536000, includeSubDomains: true }
    })
  );

  app.get("/health", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ status: "ok", uptime: Math.round(process.uptime()) });
  });

  const api = express.Router();
  api.use(express.json({ limit: "4kb" }));
  api.use(rateLimit({ windowMs: 60 * 1000, limit: limits.geral || 120, standardHeaders: true, legacyHeaders: false }));
  const limiteEscrita = rateLimit({ windowMs: 60 * 1000, limit: limits.escrita || 10, standardHeaders: true, legacyHeaders: false, message: { erro: "muitas tentativas, aguarde um minuto" } });

  api.get("/reports", (req, res) => {
    const status = STATUS.includes(req.query.status) ? req.query.status : undefined;
    const categoria = CATEGORIAS.includes(req.query.categoria) ? req.query.categoria : undefined;
    res.json(store.list({ status, categoria }));
  });

  api.post("/reports", limiteEscrita, (req, res) => {
    const { erros, dados } = validarReport(req.body);
    if (erros.length) return res.status(400).json({ erro: erros.join("; ") });
    res.status(201).json(store.create(dados));
  });

  api.post("/reports/:id/apoiar", limiteEscrita, (req, res) => {
    const r = store.apoiar(req.params.id);
    if (!r) return res.status(404).json({ erro: "relato não encontrado" });
    res.json(r);
  });

  api.patch("/reports/:id", exigirAdmin(adminToken), (req, res) => {
    const status = (req.body || {}).status;
    if (!STATUS.includes(status)) return res.status(400).json({ erro: "status inválido" });
    const r = store.setStatus(req.params.id, status);
    if (!r) return res.status(404).json({ erro: "relato não encontrado" });
    res.json(r);
  });

  api.get("/stats", (req, res) => res.json(store.stats()));
  api.get("/admin/check", exigirAdmin(adminToken), (req, res) => res.json({ ok: true }));
  api.use((req, res) => res.status(404).json({ erro: "rota não encontrada" }));
  app.use("/api", api);

  // Só a pasta public é servida. Código, dados e .github nunca ficam acessíveis.
  app.use(express.static(path.join(__dirname, "public"), { dotfiles: "ignore", index: "index.html" }));
  app.use((req, res) => res.status(404).type("text").send("Página não encontrada"));
  return app;
}

module.exports = { createApp, CATEGORIAS };
