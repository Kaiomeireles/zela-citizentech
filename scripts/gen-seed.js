"use strict";

// Gera data/seed.json: relatos SIMULADOS para demonstrar o painel.
// Os dados são fictícios: bairros reais de São Paulo, coordenadas aproximadas com variação
// aleatória (semente fixa, reproduzível) e textos genéricos. Nenhum relato descreve um fato real.
const fs = require("fs");
const path = require("path");

let s = 20261119; // semente fixa
function rnd() { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }
const pick = (a) => a[Math.floor(rnd() * a.length)];

const BAIRROS = [
  ["Pinheiros", -23.5667, -46.6917], ["Itaim Bibi", -23.5838, -46.6753], ["Moema", -23.6000, -46.6650],
  ["Vila Madalena", -23.5530, -46.6910], ["Mooca", -23.5600, -46.5990], ["Tatuapé", -23.5405, -46.5760],
  ["Santana", -23.5013, -46.6290], ["Lapa", -23.5230, -46.7020], ["Vila Mariana", -23.5890, -46.6340],
  ["Santo Amaro", -23.6540, -46.7090], ["Penha", -23.5240, -46.5440], ["Butantã", -23.5700, -46.7230]
];
const TEXTOS = {
  buraco: ["Buraco grande no meio da faixa, difícil de desviar", "Asfalto afundado perto do cruzamento", "Cratera após a chuva, risco para motos"],
  iluminacao: ["Poste apagado há semanas, rua escura à noite", "Lâmpada queimada na calçada da escola", "Trecho sem iluminação perto do ponto de ônibus"],
  lixo: ["Lixo acumulado na esquina, mau cheiro", "Entulho deixado na calçada", "Descarte irregular de móveis na rua"],
  calcada: ["Calçada quebrada, cadeirante não consegue passar", "Raiz de árvore levantou o piso", "Falta rampa de acesso na travessia"],
  alagamento: ["Bueiro entupido, a rua alaga com chuva fraca", "Água parada após a chuva, não escoa", "Ponto de alagamento recorrente na descida"],
  outros: ["Semáforo piscando sem funcionar direito", "Placa de sinalização caída", "Pichação cobrindo placa de rua"]
};
const CATS = Object.keys(TEXTOS);
const AGORA = new Date("2026-11-19T12:00:00Z").getTime();

const out = [];
for (let i = 0; i < 36; i++) {
  const [bairro, lat, lng] = pick(BAIRROS);
  const categoria = pick(CATS);
  const idade = Math.floor(rnd() * 55) + 1; // dias desde a criação
  const criado = new Date(AGORA - idade * 86400000 - Math.floor(rnd() * 86400000));
  const r = rnd();
  const status = idade > 20 && r < 0.45 ? "resolvido" : r < 0.7 ? "aberto" : "em_andamento";
  const resolvido = status === "resolvido" ? new Date(criado.getTime() + (3 + Math.floor(rnd() * 14)) * 86400000) : null;
  out.push({
    id: "sim-" + String(i + 1).padStart(3, "0"),
    categoria,
    descricao: pick(TEXTOS[categoria]),
    bairro,
    lat: Math.round((lat + (rnd() - 0.5) * 0.012) * 1e4) / 1e4,
    lng: Math.round((lng + (rnd() - 0.5) * 0.012) * 1e4) / 1e4,
    status,
    apoios: Math.floor(rnd() * 40),
    criadoEm: criado.toISOString(),
    resolvidoEm: resolvido ? resolvido.toISOString() : null,
    simulado: true
  });
}
fs.writeFileSync(path.join(__dirname, "..", "data", "seed.json"), JSON.stringify(out, null, 1));
console.log("seed.json gerado com " + out.length + " relatos simulados");
