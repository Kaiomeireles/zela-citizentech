(function () {
  "use strict";

  var CORES = { aberto: "#d9480f", em_andamento: "#e8a400", resolvido: "#2f9e44" };
  var ROTULO_STATUS = { aberto: "Aberto", em_andamento: "Em andamento", resolvido: "Resolvido" };
  var ROTULO_CAT = { buraco: "Buraco", iluminacao: "Iluminação", lixo: "Lixo", calcada: "Calçada", alagamento: "Alagamento", outros: "Outros" };

  var $ = function (id) { return document.getElementById(id); };
  var token = null;
  try { token = sessionStorage.getItem("zela_token"); } catch (e) {}
  var local = null; // { lat, lng } escolhido para o novo relato
  var pinNovo = null;

  /* ---------- Mapa ---------- */
  var map = L.map("map", { scrollWheelZoom: false }).setView([-23.5617, -46.6560], 12);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; colaboradores do OpenStreetMap"
  }).addTo(map);
  var camada = L.layerGroup().addTo(map);

  // Mapa pequeno dentro do formulário: é nele que a pessoa marca onde fica o problema.
  var picker = L.map("map-picker", { scrollWheelZoom: false }).setView([-23.5617, -46.6560], 12);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; colaboradores do OpenStreetMap" }).addTo(picker);

  function definirLocal(lat, lng) {
    local = { lat: Math.round(lat * 1e4) / 1e4, lng: Math.round(lng * 1e4) / 1e4 };
    if (pinNovo) picker.removeLayer(pinNovo);
    pinNovo = L.circleMarker([local.lat, local.lng], { radius: 10, color: "#0f766e", weight: 3, fillColor: "#fff", fillOpacity: 1 }).addTo(picker);
    $("loc-info").textContent = "Local marcado (" + local.lat + ", " + local.lng + ")";
    erro("lugar", "");
  }
  picker.on("click", function (e) { definirLocal(e.latlng.lat, e.latlng.lng); });

  $("btn-loc").addEventListener("click", function () {
    if (!navigator.geolocation) { erro("lugar", "Seu navegador não permite localização. Toque no mapa."); return; }
    $("loc-info").textContent = "Buscando…";
    navigator.geolocation.getCurrentPosition(function (pos) {
      definirLocal(pos.coords.latitude, pos.coords.longitude);
      picker.setView([local.lat, local.lng], 16);
    }, function () {
      $("loc-info").textContent = "ou toque no mapa abaixo";
      erro("lugar", "Não foi possível obter a localização. Toque no mapa.");
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

  /* ---------- Indicadores ---------- */
  function carregarStats() {
    api("/stats").then(function (s) {
      $("s-total").textContent = s.total;
      $("s-aberto").textContent = s.porStatus.aberto + s.porStatus.em_andamento;
      $("s-taxa").textContent = s.taxaResolucao + "%";
      $("s-dias").textContent = s.diasMedioResolucao == null ? "–" : String(s.diasMedioResolucao).replace(".", ",");
    }).catch(function () {});
  }

  /* ---------- Lista e mapa ---------- */
  function el(tag, classe, texto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texto != null) n.textContent = texto; // textContent: nada do usuário vira HTML
    return n;
  }
  function data(iso) { return new Date(iso).toLocaleDateString("pt-BR"); }

  function itemLista(r) {
    var li = el("li", "item");
    var corpo = el("div");
    var t = el("div", "item__titulo");
    t.appendChild(el("span", "tag tag--" + r.status, ROTULO_STATUS[r.status]));
    if (r.simulado) t.appendChild(el("span", "tag tag--sim", "simulado"));
    t.appendChild(document.createTextNode(ROTULO_CAT[r.categoria] || r.categoria));
    corpo.appendChild(t);
    corpo.appendChild(el("div", null, r.descricao));
    corpo.appendChild(el("div", "item__meta", r.bairro + " · relatado em " + data(r.criadoEm)));
    li.appendChild(corpo);

    var b = el("button", "btn btn--ghost btn--sm apoio", "Apoiar · " + r.apoios);
    b.type = "button";
    b.setAttribute("aria-label", "Apoiar este relato. Apoios atuais: " + r.apoios);
    var jaApoiou = false;
    try { jaApoiou = localStorage.getItem("zela_apoio_" + r.id) === "1"; } catch (e) {}
    if (jaApoiou) { b.disabled = true; b.textContent = "Apoiado · " + r.apoios; }
    b.addEventListener("click", function () {
      b.disabled = true;
      api("/reports/" + encodeURIComponent(r.id) + "/apoiar", { method: "POST", body: "{}" }).then(function (nr) {
        try { localStorage.setItem("zela_apoio_" + r.id, "1"); } catch (e) {}
        b.textContent = "Apoiado · " + nr.apoios;
      }).catch(function (e) { b.disabled = false; alert(e.message); });
    });
    li.appendChild(b);

    if (token) {
      var acoes = el("div", "admin-acoes");
      Object.keys(ROTULO_STATUS).forEach(function (st) {
        if (st === r.status) return;
        var ab = el("button", "btn btn--ghost btn--sm", "Marcar: " + ROTULO_STATUS[st]);
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

  function recarregar() {
    var q = [];
    if ($("f-categoria").value) q.push("categoria=" + encodeURIComponent($("f-categoria").value));
    if ($("f-status").value) q.push("status=" + encodeURIComponent($("f-status").value));
    api("/reports" + (q.length ? "?" + q.join("&") : "")).then(function (lista) {
      camada.clearLayers();
      lista.forEach(function (r) {
        L.circleMarker([r.lat, r.lng], { radius: 8, color: "#fff", weight: 2, fillColor: CORES[r.status], fillOpacity: 0.95 })
          .bindPopup(function () {
            var d = el("div");
            d.appendChild(el("strong", null, (ROTULO_CAT[r.categoria] || r.categoria) + " · " + ROTULO_STATUS[r.status]));
            d.appendChild(el("div", null, r.descricao));
            d.appendChild(el("small", null, r.bairro + " · " + r.apoios + " apoios"));
            return d;
          })
          .addTo(camada);
      });
      var ul = $("lista");
      ul.textContent = "";
      lista.slice(0, 12).forEach(function (r) { ul.appendChild(itemLista(r)); });
      $("msg-lista").textContent = lista.length ? "Mostrando " + Math.min(12, lista.length) + " de " + lista.length + " relatos." : "Nenhum relato com esses filtros.";
    }).catch(function () { $("msg-lista").textContent = "Não foi possível carregar os relatos agora."; });
    carregarStats();
  }
  $("f-categoria").addEventListener("change", recarregar);
  $("f-status").addEventListener("change", recarregar);

  /* ---------- Formulário ---------- */
  var form = $("form");
  function erro(nome, msg) {
    var s = form.querySelector('.erro[data-for="' + nome + '"]');
    if (s) s.textContent = msg;
    var c = form.elements[nome];
    if (c) c.setAttribute("aria-invalid", msg ? "true" : "false");
  }
  function statusForm(msg, ehErro) {
    var s = $("status-form");
    s.hidden = !msg; s.textContent = msg || "";
    s.className = "status" + (ehErro ? " is-erro" : "");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    statusForm("");
    var f = form.elements, ok = true;
    var regras = {
      categoria: [f.categoria.value, "Escolha uma categoria."],
      descricao: [f.descricao.value.trim().length >= 10 ? "ok" : "", "Descreva com pelo menos 10 caracteres."],
      bairro: [f.bairro.value.trim(), "Informe o bairro."],
      lugar: [local ? "ok" : "", "Toque no mapa para marcar o local ou use a sua localização."]
    };
    Object.keys(regras).forEach(function (k) {
      var falhou = !regras[k][0];
      erro(k, falhou ? regras[k][1] : "");
      if (falhou) ok = false;
    });
    if (!ok) return;

    var btn = $("btn-enviar");
    btn.disabled = true; btn.textContent = "Enviando…";
    api("/reports", {
      method: "POST",
      body: JSON.stringify({ categoria: f.categoria.value, descricao: f.descricao.value, bairro: f.bairro.value, lat: local.lat, lng: local.lng })
    }).then(function () {
      form.reset();
      local = null;
      if (pinNovo) { picker.removeLayer(pinNovo); pinNovo = null; }
      $("loc-info").textContent = "ou toque no mapa abaixo";
      statusForm("Relato enviado. Obrigado por cuidar da sua rua!");
      recarregar();
    }).catch(function (err) {
      statusForm(err.message, true);
    }).then(function () { btn.disabled = false; btn.textContent = "Enviar relato"; });
  });

  /* ---------- Administrador ---------- */
  var dlg = $("dlg-admin");
  function atualizarBotaoAdmin() { $("btn-admin").textContent = token ? "Sair do modo administrador" : "Sou administrador"; }
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
