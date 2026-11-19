"use strict";

// Application Insights: a connection string vem de variável de ambiente (nunca do código).
if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
  require("applicationinsights").setup().start();
}

const path = require("path");
const { createApp } = require("./app");
const { createStore } = require("./src/store");

const dataDir = process.env.DATA_DIR || path.join(__dirname, "data");
const store = createStore(dataDir, path.join(__dirname, "data", "seed.json"));

if (process.env.NODE_ENV === "production" && !process.env.ADMIN_TOKEN) {
  console.warn("ADMIN_TOKEN não definido: o painel de administrador ficará bloqueado.");
}

const port = process.env.PORT || 8080;
createApp({ store }).listen(port, () => console.log("Zela ouvindo na porta " + port));
