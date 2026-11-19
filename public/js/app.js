(function () {
  "use strict";

  var CAT = {
    buraco: { r: "Buraco", e: "🕳️" },
    iluminacao: { r: "Iluminação", e: "💡" },
    lixo: { r: "Lixo", e: "🗑️" },
    calcada: { r: "Calçada", e: "🚶" },
    alagamento: { r: "Alagamento", e: "🌊" },
    outros: { r: "Outro problema", e: "📍" }
  };
  var STATUS = { aberto: "Aberto", em_andamento: "Em andamento", resolvido: "Resolvido" };
  var CENTRO = [-23.5617, -46.656];
  var LIMITES = { latMin: -24.1, latMax: -23.2, lngMin: -47.0, lngMax: -46.2 };
  var TILES = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
  var ATTR = "&copy; colaboradores do <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> &copy; <a href='https://carto.com/attributions'>CARTO</a>";

  var $ = function (id) { return document.getElementById(id); };
  var token = null;
  try { token = sessionStorage.getItem("zela_token"); } catch (e) {}
  var local = null, pinNovo = null, marcadores = {};

  function el(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto != null) n.textContent = texto; // textContent: nada vindo do usuário vira HTML
    return n;
  }
  function pinIcon(status, emoji, novo) {
    var s = el("span", "pin pin--" + status);
    s.appendChild(el("i", null, emoji));
    var wrap = el("div"); wrap.appendChild(s);
    return L.divIcon({ className: "zpin", html: wrap.innerHTML, iconSize: [34, 34], iconAnchor: [8, 32], popupAnchor: [9, -30] });
  }

  /* ---------- Mapa principal ---------- */
  var map = L.map("map", { scrollWheelZoom: false }).setView(CENTRO, 12);
  L.tileLayer(TILES, { subdomains: "abcd", maxZoom: 19, attribution: ATTR }).addTo(map);
  var cluster = L.markerClusterGroup({ maxClusterRadius: 45, showCoverageOnHover: false });
  map.addLayer(cluster);
  map.on("focus", function () { map.scrollWheelZoom.enable(); });
  map.on("blur", function () { map.scrollWheelZoom.disable(); });

  /* ---------- Mapa de escolha do local ---------- */
  var picker = L.map("map-picker", { scrollWheelZoom: false }).setView(CENTRO, 12);
  L.tileLayer(TILES, { subdomains: "abcd", maxZoom: 19, attribution: ATTR }).addTo(picker);

  function dentro(lat, lng) { return lat >= LIMITES.latMin && lat <= LIMITES.latMax && lng >= LIMITES.lngMin && lng <= LIMITES.lngMax; }

  function definirLocal(lat, lng, zoom) {
    if (!dentro(lat, lng)) { erro("lugar", "Este ponto fica fora da área do piloto (Grande São Paulo)."); return; }
    local = { lat: Math.round(lat * 1e4) / 1e4, lng: Math.round(lng * 1e4) / 1e4 };
    if (pinNovo) picker.removeLayer(pinNovo);
    pinNovo = L.marker([local.lat, local.lng], { icon: pinIcon("aberto", "📍") }).addTo(picker);
    if (zoom) picker.setView([local.lat, local.lng], zoom);
    $("loc-info").textContent = "Local marcado. Se precisar, toque em outro ponto para ajustar.";
    erro("lugar", "");
    preencherBairro(local.lat, local.lng);
  }
  picker.on("click", function (e) { definirLocal(e.latlng.lat, e.latlng.lng); });

  // Geocodificação reversa gratuita (Nominatim). Só roda quando a pessoa marca um ponto.
  function preencherBairro(lat, lng) {
    var campo = $("form").elements.bairro;
    if (campo.value.trim()) return;
    fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=pt-BR&lat=" + lat + "&lon=" + lng)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var a = (d && d.address) || {};
        var b = a.suburb || a.neighbourhood || a.quarter || a.city_district || "";
        if (b && !campo.value.trim()) { campo.value = b; erro("bairro", ""); }
      }).catch(function () {});
  }

  function buscarEndereco() {
    var q = $("busca").value.trim();
    if (q.length < 3) { erro("lugar", "Digite o endereço para buscar."); return; }
    var btn = $("btn-busca"); btn.disabled = true; btn.textContent = "Buscando…";
    var url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=br&accept-language=pt-BR" +
      "&viewbox=" + LIMITES.lngMin + "," + LIMITES.latMax + "," + LIMITES.lngMax + "," + LIMITES.latMin + "&bounded=1&q=" + encodeURIComponent(q);
    fetch(url).then(function (r) { return r.json(); }).then(function (lista) {
      if (!lista.length) { erro("lugar", "Não encontramos esse endereço na Grande São Paulo. Tente com o nome da rua e o número."); return; }
      definirLocal(parseFloat(lista[0].lat), parseFloat(lista[0].lon), 17);
    }).catch(function () { erro("lugar", "A busca está indisponível agora. Toque no mapa para marcar o local."); })
      .then(function () { btn.disabled = false; btn.textContent = "Buscar"; });
  }
  $("btn-busca").addEventListener("click", buscarEndereco);
  $("busca").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); buscarEndereco(); } });

  $("btn-loc").addEventListener("click", function () {
    if (!navigator.geolocation) { erro("lugar", "Seu navegador não permite localização. Busque o endereço ou toque no mapa."); return; }
    $("loc-info").textContent = "Buscando a sua localização…";
    navigator.geolocation.getCurrentPosition(function (pos) {
      definirLocal(pos.coords.latitude, pos.coords.longitude, 17);
    }, function () {
      $("loc-info").textContent = "Ou toque no mapa para marcar o ponto exato.";
      erro("lugar", "Não foi possível obter a localização. Busque o endereço ou toque no mapa.");
    }, { enableHighAccuracy: true, timeout: 10000 });
  });

  /* ---------- API ---------- */
  function api(caminho, opcoes) {
    opcoes = opcoes || {};
    opcoes.headers = Object.assign({ "Content-Type": "application/json" }, opcoes.headers || {});
    return fetch("/api" + caminho, opcoes).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (corpo) {
        if (!r.ok) { var err = new Error(corpo.erro || "Erro " + r.status); err.status = r.status; throw err; }
        return corpo;
      });
    });
  }

  function carregarStats() {
    api("/stats").then(function (s) {
      $("m-total").textContent = s.total;
      $("m-taxa").textContent = s.taxaResolucao + "%";
      $("m-dias").textContent = s.diasMedioResolucao == null ? "–" : String(s.diasMedioResolucao).replace(".", ",");
    }).catch(function () {});
  }

  /* ---------- Lista e marcadores ---------- */
  function data(iso) { return new Date(iso).toLocaleDateString("pt-BR"); }

  function conteudoPopup(r) {
    var d = el("div");
    d.appendChild(el("div", "pp-t", CAT[r.categoria].e + " " + CAT[r.categoria].r + " · " + STATUS[r.status]));
    d.appendChild(el("div", null, r.descricao));
    d.appendChild(el("small", null, r.bairro + " · " + r.apoios + " apoios" + (r.simulado ? " · simulado" : "")));
    return d;
  }

  function itemLista(r) {
    var c = CAT[r.categoria] || CAT.outros;
    var li = el("li", "item");
    li.appendChild(el("div", "item__ico", c.e));
    var corpo = el("div");
    var t = el("div", "item__titulo", c.r);
    t.appendChild(el("span", "tag tag--" + r.status, STATUS[r.status]));
    if (r.simulado) t.appendChild(el("span", "tag tag--sim", "simulado"));
    corpo.appendChild(t);
    corpo.appendChild(el("div", null, r.descricao));
    corpo.appendChild(el("div", "item__meta", r.bairro + " · relatado em " + data(r.criadoEm)));
    li.appendChild(corpo);

    var b = el("button", "btn btn--ghost btn--sm apoio", "👍 Apoiar · " + r.apoios);
    b.type = "button";
    b.setAttribute("aria-label", "Apoiar este relato. Apoios atuais: " + r.apoios);
    var jaApoiou = false;
    try { jaApoiou = localStorage.getItem("zela_apoio_" + r.id) === "1"; } catch (e) {}
    if (jaApoiou) { b.disabled = true; b.textContent = "✔ Apoiado · " + r.apoios; }
    b.addEventListener("click", function () {
      b.disabled = true;
      api("/reports/" + encodeURIComponent(r.id) + "/apoiar", { method: "POST", body: "{}" }).then(function (nr) {
        try { localStorage.setItem("zela_apoio_" + r.id, "1"); } catch (e) {}
        b.textContent = "✔ Apoiado · " + nr.apoios;
      }).catch(function (e) { b.disabled = false; alert(e.message); });
    });
    li.appendChild(b);

    if (token) {
      var acoes = el("div", "admin-acoes");
      Object.keys(STATUS).forEach(function (st) {
        if (st === r.status) return;
        var ab = el("button", "btn btn--ghost btn--sm", "Marcar: " + STATUS[st]);
        ab.type = "button";
        ab.addEventListener("click", function () {
          api("/reports/" + encodeURIComponent(r.id), { method: "PATCH", body: JSON.stringify({ status: st }), headers: { Authorization: "Bearer " + token } })
            .then(recarregar).catch(function (e) { alert(e.message); if (e.status === 401) sair(); });
        });
        acoes.appendChild(ab);
      });
      li.appendChild(acoes);
    }
    return li;
  }

  function recarregar(destaqueId) {
    var q = [];
    if ($("f-categoria").value) q.push("categoria=" + encodeURIComponent($("f-categoria").value));
    if ($("f-status").value) q.push("status=" + encodeURIComponent($("f-status").value));
    return api("/reports" + (q.length ? "?" + q.join("&") : "")).then(function (lista) {
      cluster.clearLayers(); marcadores = {};
      lista.forEach(function (r) {
        var c = CAT[r.categoria] || CAT.outros;
        var m = L.marker([r.lat, r.lng], { icon: pinIcon(r.status, c.e), title: c.r })
          .bindPopup(function () { return conteudoPopup(r); });
        marcadores[r.id] = m; cluster.addLayer(m);
      });
      var ul = $("lista"); ul.textContent = "";
      lista.slice(0, 10).forEach(function (r) { ul.appendChild(itemLista(r)); });
      $("msg-lista").textContent = lista.length ? "Mostrando " + Math.min(10, lista.length) + " de " + lista.length + " relatos." : "Nenhum relato com esses filtros.";
      if (typeof destaqueId === "string" && marcadores[destaqueId]) {
        cluster.zoomToShowLayer(marcadores[destaqueId], function () { marcadores[destaqueId].openPopup(); });
      }
    }).catch(function () { $("msg-lista").textContent = "Não foi possível carregar os relatos agora."; })
      .then(carregarStats);
  }
  $("f-categoria").addEventListener("change", function () { recarregar(); });
  $("f-status").addEventListener("change", function () { recarregar(); });

  /* ---------- Formulário ---------- */
  var form = $("form");
  function erro(nome, msg) {
    var s = form.querySelector('.erro[data-for="' + nome + '"]');
    if (s) s.textContent = msg;
    var c = form.elements[nome];
    if (c && !c.length) c.setAttribute("aria-invalid", msg ? "true" : "false");
  }
  function statusForm(msg, ehErro) {
    var s = $("status-form");
    s.hidden = !msg; s.textContent = msg || "";
    s.className = "status" + (ehErro ? " is-erro" : "");
  }
  form.addEventListener("change", function (e) { if (e.target.name === "categoria") erro("categoria", ""); });
  // Limpa o aviso de erro assim que o campo deixa de estar errado.
  form.elements.descricao.addEventListener("input", function () { if (this.value.trim().length >= 10) erro("descricao", ""); });
  form.elements.bairro.addEventListener("input", function () { if (this.value.trim()) erro("bairro", ""); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    statusForm("");
    var f = form.elements;
    var cat = form.querySelector('input[name="categoria"]:checked');
    var ok = true;
    var checks = [
      ["lugar", !!local, "Marque o local: busque o endereço, use a sua localização ou toque no mapa."],
      ["categoria", !!cat, "Escolha o tipo de problema."],
      ["descricao", f.descricao.value.trim().length >= 10, "Descreva com pelo menos 10 caracteres."],
      ["bairro", !!f.bairro.value.trim(), "Informe o bairro."]
    ];
    checks.forEach(function (c) { erro(c[0], c[1] ? "" : c[2]); if (!c[1]) ok = false; });
    if (!ok) { var primeiro = form.querySelector(".erro:not(:empty)"); if (primeiro) primeiro.scrollIntoView({ block: "center", behavior: "smooth" }); return; }

    var btn = $("btn-enviar");
    btn.disabled = true; btn.textContent = "Enviando…";
    api("/reports", {
      method: "POST",
      body: JSON.stringify({ categoria: cat.value, descricao: f.descricao.value, bairro: f.bairro.value, lat: local.lat, lng: local.lng })
    }).then(function (novo) {
      form.reset();
      local = null;
      if (pinNovo) { picker.removeLayer(pinNovo); pinNovo = null; }
      $("loc-info").textContent = "Ou toque no mapa para marcar o ponto exato.";
      statusForm("Relato enviado. Obrigado por cuidar da sua rua! Veja o seu pino no mapa.");
      $("f-categoria").value = ""; $("f-status").value = "";
      $("mapa").scrollIntoView({ behavior: "smooth" });
      return recarregar(novo.id);
    }).catch(function (err) {
      statusForm(err.message, true);
    }).then(function () { btn.disabled = false; btn.textContent = "Enviar relato"; });
  });

  /* ---------- Acesso da equipe (administrador) ---------- */
  var dlg = $("dlg-admin");
  function atualizarBotaoAdmin() { $("btn-admin").textContent = token ? "Sair do modo equipe" : "Acesso da equipe"; }
  function sair() {
    token = null;
    try { sessionStorage.removeItem("zela_token"); } catch (e) {}
    atualizarBotaoAdmin(); recarregar();
  }
  $("btn-admin").addEventListener("click", function () {
    if (token) { sair(); return; }
    $("erro-admin").textContent = ""; $("token").value = "";
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  });
  $("admin-cancelar").addEventListener("click", function () { dlg.close(); });
  $("form-admin").addEventListener("submit", function (e) {
    e.preventDefault();
    var t = $("token").value.trim();
    api("/admin/check", { headers: { Authorization: "Bearer " + t } }).then(function () {
      token = t;
      try { sessionStorage.setItem("zela_token", t); } catch (er) {}
      dlg.close(); atualizarBotaoAdmin(); recarregar();
    }).catch(function () { $("erro-admin").textContent = "Token inválido."; });
  });

  atualizarBotaoAdmin();
  recarregar();
})();
