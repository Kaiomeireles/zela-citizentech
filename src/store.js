"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STATUS = ["aberto", "em_andamento", "resolvido"];

// Armazenamento em arquivo JSON, com escrita atômica (escreve .tmp e renomeia).
// No Azure App Service (Linux) a pasta /home persiste entre reinícios, por isso DATA_DIR=/home/data.
function createStore(dir, seedFile) {
  const file = path.join(dir, "reports.json");
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) {
    const seed = seedFile && fs.existsSync(seedFile) ? fs.readFileSync(seedFile, "utf8") : "[]";
    fs.writeFileSync(file, seed);
  }
  let reports = JSON.parse(fs.readFileSync(file, "utf8"));

  function persist() {
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(reports));
    fs.renameSync(tmp, file);
  }

  return {
    list({ status, categoria } = {}) {
      return reports
        .filter((r) => (!status || r.status === status) && (!categoria || r.categoria === categoria))
        .sort((a, b) => b.apoios - a.apoios || b.criadoEm.localeCompare(a.criadoEm));
    },
    create(data) {
      const r = {
        id: crypto.randomUUID(),
        categoria: data.categoria,
        descricao: data.descricao,
        bairro: data.bairro,
        lat: data.lat,
        lng: data.lng,
        status: "aberto",
        apoios: 0,
        criadoEm: new Date().toISOString(),
        resolvidoEm: null,
        simulado: false
      };
      reports.push(r);
      persist();
      return r;
    },
    apoiar(id) {
      const r = reports.find((x) => x.id === id);
      if (!r) return null;
      r.apoios += 1;
      persist();
      return r;
    },
    setStatus(id, status) {
      const r = reports.find((x) => x.id === id);
      if (!r) return null;
      r.status = status;
      r.resolvidoEm = status === "resolvido" ? new Date().toISOString() : null;
      persist();
      return r;
    },
    stats() {
      const porStatus = { aberto: 0, em_andamento: 0, resolvido: 0 };
      const porCategoria = {};
      const dias = [];
      for (const r of reports) {
        porStatus[r.status] += 1;
        porCategoria[r.categoria] = (porCategoria[r.categoria] || 0) + 1;
        if (r.resolvidoEm) dias.push((new Date(r.resolvidoEm) - new Date(r.criadoEm)) / 86400000);
      }
      const total = reports.length;
      return {
        total,
        porStatus,
        porCategoria,
        taxaResolucao: total ? Math.round((porStatus.resolvido / total) * 100) : 0,
        diasMedioResolucao: dias.length ? Math.round((dias.reduce((a, b) => a + b, 0) / dias.length) * 10) / 10 : null
      };
    }
  };
}

module.exports = { createStore, STATUS };
