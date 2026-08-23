/* Carrega o núcleo do mapa e aplica melhorias de interação operacional. */
(() => {
  const EVENTOS_CACHE_TOKEN = "dados/eventos_fogo.json";
  let eventosFogoCache = [];

  /* Captura a mesma resposta já usada pelo núcleo para enriquecer os cartões,
     sem fazer uma segunda chamada ao CENSIPAM. */
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const resposta = await fetchOriginal(...args);
    try {
      const url = String(args?.[0]?.url || args?.[0] || "");
      if (url.includes(EVENTOS_CACHE_TOKEN)) {
        resposta.clone().json().then(payload => {
          const eventos = Array.isArray(payload) ? payload : payload?.eventos;
          if (Array.isArray(eventos)) eventosFogoCache = eventos;
        }).catch(() => {});
      }
    } catch (e) {}
    return resposta;
  };

  /* Eventos de fogo ficam acima dos polígonos municipais, mas abaixo dos marcadores. */
  try {
    if (!map.getPane("censipamPane")) map.createPane("censipamPane");
    const pane = map.getPane("censipamPane");
    pane.style.zIndex = 450;
    pane.style.pointerEvents = "auto";
  } catch (e) {}

  const core = document.createElement("script");
  core.src = `js/gcif-spiderfy-core.js?v=${Date.now()}`;
  core.onload = () => {
    try {
      const mapEl = map.getContainer();
      const mapActions = document.querySelector(".map-actions");
      const mapWrap = document.querySelector(".map-wrap");
      let selecionarMunicipio = false;
      let rulerAtiva = false;

      const extraStyle = document.createElement("style");
      extraStyle.textContent = `
        .municipio-select-mode{cursor:pointer!important}
        .fire-card{min-width:305px;max-width:355px;font-family:Inter,Segoe UI,Arial,sans-serif}
        .fire-card-head{display:flex;align-items:center;gap:9px;padding-bottom:9px;margin-bottom:9px;border-bottom:1px solid #263949}
        .fire-card-icon{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:rgba(239,68,68,.13);border:1px solid rgba(239,68,68,.32);font-size:19px;flex:none}
        .fire-card-title{font-size:15px;font-weight:900;color:#fff;line-height:1.05}.fire-card-id{font-size:9px;color:#8399ab;margin-top:4px}
        .fire-card-status{margin-left:auto;border-radius:999px;padding:5px 8px;font-size:8px;font-weight:900;color:#9cebb8;border:1px solid rgba(34,197,94,.38);background:rgba(34,197,94,.10);white-space:nowrap}
        .fire-card-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px}
        .fire-card-metric{border:1px solid #223443;border-radius:8px;background:#0a151f;padding:7px 8px;min-width:0}
        .fire-card-metric span{display:block;color:#7f93a4;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.fire-card-metric b{display:block;color:#fff;font-size:11px;margin-top:4px;overflow-wrap:anywhere}
        .fire-card-row{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:5px 1px;font-size:10px;line-height:1.35}.fire-card-row span{color:#8da1b2}.fire-card-row b{color:#eef5fa;text-align:right;max-width:68%}
        .fire-card-foot{margin-top:8px;padding-top:7px;border-top:1px solid #263949;color:#718697;font-size:8px;line-height:1.4}
        .ruler-mode{cursor:crosshair!important}
        .ruler-mode .leaflet-interactive,.ruler-mode .leaflet-marker-icon,.ruler-mode .leaflet-tooltip{pointer-events:none!important}
        .ruler-hud{display:none;position:absolute;z-index:690;left:14px;bottom:18px;min-width:245px;max-width:330px;padding:10px 11px;border:1px solid #33495d;border-radius:10px;background:rgba(7,16,25,.96);color:#f8fafc;box-shadow:0 6px 20px rgba(0,0,0,.28);font:700 11px/1.3 Inter,Segoe UI,Arial,sans-serif;backdrop-filter:blur(7px)}
        .ruler-hud.show{display:block}.ruler-hud-head{display:flex;align-items:center;gap:8px}.ruler-hud-title{font-weight:900;margin-right:auto}.ruler-total{font-size:17px;font-weight:900;color:#ffd18a;margin:6px 0 2px}.ruler-help{font-size:9px;font-weight:600;color:#9dafbe}.ruler-actions{display:flex;gap:6px;margin-top:8px}.ruler-mini{border:1px solid #33495d;border-radius:7px;background:#101d29;color:#e7eef4;padding:5px 8px;font-size:9px;font-weight:800;cursor:pointer}.ruler-mini:hover{background:#17293a}.ruler-label{background:#071019!important;border:1px solid #f59e0b!important;color:#fff!important;border-radius:999px!important;padding:3px 6px!important;font:800 9px/1 Inter,Segoe UI,Arial,sans-serif!important;box-shadow:0 2px 7px rgba(0,0,0,.28)!important}.ruler-label:before{display:none!important}
        @media(max-width:820px){.ruler-hud{left:10px;bottom:12px;min-width:220px;max-width:calc(100% - 20px)}}
      `;
      document.head.appendChild(extraStyle);

      function normalizar(txt) {
        return String(txt || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      }

      function numero(...valores) {
        for (const valor of valores) {
          if (valor === null || valor === undefined || valor === "") continue;
          const n = Number(valor);
          if (Number.isFinite(n)) return n;
        }
        return null;
      }

      function dataValida(valor) {
        if (!valor) return null;
        const d = new Date(valor);
        return Number.isNaN(d.getTime()) ? null : d;
      }

      function formatarData(valor) {
        const d = dataValida(valor);
        if (!d) return "—";
        return d.toLocaleString("pt-BR", {
          timeZone: "America/Bahia",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        });
      }

      function formatarDuracao(ms) {
        if (!Number.isFinite(ms) || ms < 0) return "—";
        const totalMin = Math.floor(ms / 60000);
        const dias = Math.floor(totalMin / 1440);
        const horas = Math.floor((totalMin % 1440) / 60);
        const min = totalMin % 60;
        if (dias > 0) return `${dias}d ${horas}h${min ? ` ${min}min` : ""}`;
        if (horas > 0) return `${horas}h${String(min).padStart(2, "0")}`;
        return `${min}min`;
      }

      function areaEventoHa(evento) {
        const hectaresDireto = numero(evento?.area_total_evento_ha, evento?.area_ha, evento?.area_total_ha);
        if (hectaresDireto !== null) return hectaresDireto;
        const metrosQuadrados = numero(evento?.area_total_evento);
        if (metrosQuadrados !== null) return metrosQuadrados / 10000;
        const km2 = numero(evento?.area_km2);
        return km2 === null ? null : km2 * 100;
      }

      function localizarEvento(id) {
        return eventosFogoCache.find(e => String(e?.id_evento) === String(id)) || null;
      }

      function htmlCartaoEvento(evento) {
        const id = evento?.id_evento ?? "—";
        const status = evento?.status_evento || "Ativo / em observação";
        const municipio = evento?.municipio || evento?.nm_municipio || "Não informado";
        const primeiraRaw = evento?.dt_minima || evento?.dt_min_evento || evento?.primeira_deteccao;
        const ultimaRaw = evento?.dt_ultima_visao || evento?.dt_maxima || evento?.dt_max_evento || evento?.ultima_deteccao;
        const primeira = dataValida(primeiraRaw);
        const ultima = dataValida(ultimaRaw);
        const duracao = primeira && ultima ? formatarDuracao(ultima - primeira) : "—";
        const idade = ultima ? formatarDuracao(Date.now() - ultima.getTime()) : "—";
        const areaHa = areaEventoHa(evento);
        const area = areaHa === null ? "—" : `${areaHa.toLocaleString("pt-BR", {maximumFractionDigits:2})} ha`;
        const lat = numero(evento?.latitude, evento?.lat);
        const lng = numero(evento?.longitude, evento?.lng, evento?.lon);
        const coords = lat !== null && lng !== null ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : "—";
        const ativo = normalizar(status).includes("ativo");
        const statusStyle = ativo ? "" : "color:#ffd18a;border-color:rgba(245,158,11,.38);background:rgba(245,158,11,.10)";

        return `<div class="fire-card">
          <div class="fire-card-head">
            <div class="fire-card-icon">🔥</div>
            <div><div class="fire-card-title">Evento ${id}</div><div class="fire-card-id">Painel do Fogo • CENSIPAM</div></div>
            <span class="fire-card-status" style="${statusStyle}">${status}</span>
          </div>
          <div class="fire-card-grid">
            <div class="fire-card-metric"><span>Última detecção</span><b>${formatarData(ultimaRaw)}</b></div>
            <div class="fire-card-metric"><span>Idade da detecção</span><b>${idade}</b></div>
            <div class="fire-card-metric"><span>Duração</span><b>${duracao}</b></div>
            <div class="fire-card-metric"><span>Área</span><b>${area}</b></div>
          </div>
          <div class="fire-card-row"><span>Município</span><b>${municipio}</b></div>
          <div class="fire-card-row"><span>Primeira detecção</span><b>${formatarData(primeiraRaw)}</b></div>
          <div class="fire-card-row"><span>Coordenadas</span><b>${coords}</b></div>
          <div class="fire-card-foot">Dados sincronizados com o Painel do Fogo. Horários apresentados no fuso da Bahia.</div>
        </div>`;
      }

      /* Enriquece apenas os popups de evento que o núcleo já cria. */
      map.on("popupopen", e => {
        try {
          const popup = e.popup;
          const el = popup.getElement();
          const texto = el?.textContent || "";
          const achou = texto.match(/Evento\s+#?(\d+)/i);
          if (!achou) return;
          const evento = localizarEvento(achou[1]);
          if (!evento) return;
          popup.setContent(htmlCartaoEvento(evento));
        } catch (err) {
          console.warn("Falha ao montar cartão do evento de fogo", err);
        }
      });

      /* ---------- MODO DE SELEÇÃO DE MUNICÍPIO ---------- */
      const municipioBtn = document.createElement("button");
      municipioBtn.id = "toggleMunicipioSelect";
      municipioBtn.className = "map-btn";
      municipioBtn.innerHTML = "🗺️ MUNICÍPIO";
      municipioBtn.title = "Ativar clique nos municípios";
      mapActions?.appendChild(municipioBtn);

      function percorrerPaths(layer, fn) {
        if (!layer) return;
        if (typeof layer.eachLayer === "function") {
          layer.eachLayer(child => percorrerPaths(child, fn));
          return;
        }
        if (typeof layer.getElement === "function") fn(layer);
      }

      function aplicarInteratividadeMunicipios() {
        const podeClicar = selecionarMunicipio && !rulerAtiva;
        [westLayer, contextLayer].forEach(grupo => {
          percorrerPaths(grupo, layer => {
            if (layer.options) layer.options.interactive = podeClicar;
            const el = layer.getElement?.();
            if (el) el.style.pointerEvents = podeClicar ? "auto" : "none";
          });
        });
        mapEl.classList.toggle("municipio-select-mode", podeClicar);
      }

      function setMunicipioSelect(ativa) {
        selecionarMunicipio = ativa;
        municipioBtn.classList.toggle("active", ativa);
        municipioBtn.innerHTML = ativa ? "🗺️ MUNICÍPIO ✓" : "🗺️ MUNICÍPIO";
        municipioBtn.title = ativa ? "Desativar seleção de município" : "Ativar clique nos municípios";
        if (ativa) map.closePopup();
        aplicarInteratividadeMunicipios();
      }

      municipioBtn.onclick = () => {
        if (!selecionarMunicipio && rulerAtiva) setReguaAtiva(false);
        if (!selecionarMunicipio) {
          try {
            if (typeof coordsEnabled !== "undefined" && coordsEnabled) document.getElementById("toggleCoords")?.click();
          } catch (e) {}
        }
        setMunicipioSelect(!selecionarMunicipio);
      };

      [westLayer, contextLayer].forEach(grupo => {
        grupo.on?.("layeradd", () => requestAnimationFrame(aplicarInteratividadeMunicipios));
      });
      setTimeout(aplicarInteratividadeMunicipios, 0);
      setTimeout(aplicarInteratividadeMunicipios, 500);
      setTimeout(aplicarInteratividadeMunicipios, 1500);

      /* Coordenadas também é um modo exclusivo de clique. */
      document.getElementById("toggleCoords")?.addEventListener("click", () => {
        if (selecionarMunicipio) setMunicipioSelect(false);
      }, true);

      /* ---------- RÉGUA ---------- */
      const rulerLayer = L.layerGroup().addTo(map);
      const rulerHud = document.createElement("div");
      rulerHud.className = "ruler-hud";
      rulerHud.innerHTML = `<div class="ruler-hud-head"><span>📏</span><span class="ruler-hud-title">Medir distância</span></div><div class="ruler-total" id="rulerTotal">0 m</div><div class="ruler-help" id="rulerHelp">Clique no mapa para marcar o primeiro ponto.</div><div class="ruler-actions"><button class="ruler-mini" id="rulerUndo">↶ Desfazer</button><button class="ruler-mini" id="rulerClear">Limpar</button><button class="ruler-mini" id="rulerClose">Fechar</button></div>`;
      mapWrap?.appendChild(rulerHud);
      L.DomEvent.disableClickPropagation(rulerHud);
      L.DomEvent.disableScrollPropagation(rulerHud);

      const rulerBtn = document.getElementById("toggleRuler") || document.createElement("button");
      if (!rulerBtn.id) {
        rulerBtn.id = "toggleRuler";
        rulerBtn.className = "map-btn";
        rulerBtn.innerHTML = "📏 RÉGUA";
        rulerBtn.title = "Medir distância em linha reta";
        mapActions?.appendChild(rulerBtn);
      }

      let rulerPontos = [];
      let rulerPreview = null;

      function formatarDistanciaMedida(metros) {
        if (!Number.isFinite(metros)) return "—";
        if (metros < 1000) return `${Math.round(metros).toLocaleString("pt-BR")} m`;
        return `${(metros / 1000).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2})} km`;
      }

      function distanciaAcumulada(ate = rulerPontos.length) {
        let total = 0;
        for (let i = 1; i < Math.min(ate, rulerPontos.length); i++) total += map.distance(rulerPontos[i - 1], rulerPontos[i]);
        return total;
      }

      function atualizarRulerHud() {
        const total = document.getElementById("rulerTotal");
        const help = document.getElementById("rulerHelp");
        if (total) total.textContent = formatarDistanciaMedida(distanciaAcumulada());
        if (help) {
          help.textContent = rulerPontos.length === 0
            ? "Clique no mapa para marcar o primeiro ponto."
            : rulerPontos.length === 1
              ? "Clique em outro ponto para medir."
              : `${rulerPontos.length} pontos • clique para continuar a medição.`;
        }
      }

      function desenharRegua() {
        rulerLayer.clearLayers();
        rulerPreview = null;
        if (rulerPontos.length > 1) {
          L.polyline(rulerPontos, {color:"#f59e0b", weight:3, opacity:.95, interactive:false}).addTo(rulerLayer);
        }
        rulerPontos.forEach((p, i) => {
          const acumulada = i === 0 ? 0 : distanciaAcumulada(i + 1);
          const ponto = L.circleMarker(p, {radius:5, color:"#071019", weight:2, fillColor:"#f59e0b", fillOpacity:1, interactive:false}).addTo(rulerLayer);
          ponto.bindTooltip(formatarDistanciaMedida(acumulada), {permanent:true, direction:"top", offset:[0,-5], className:"ruler-label"});
        });
        atualizarRulerHud();
      }

      function limparRegua() {
        rulerPontos = [];
        rulerLayer.clearLayers();
        rulerPreview = null;
        atualizarRulerHud();
      }

      function setReguaAtiva(ativa) {
        rulerAtiva = ativa;
        rulerBtn.classList.toggle("active", ativa);
        rulerBtn.innerHTML = ativa ? "📏 RÉGUA ✓" : "📏 RÉGUA";
        rulerHud.classList.toggle("show", ativa);
        mapEl.classList.toggle("ruler-mode", ativa);
        if (ativa) {
          if (selecionarMunicipio) setMunicipioSelect(false);
          try {
            if (typeof coordsEnabled !== "undefined" && coordsEnabled) document.getElementById("toggleCoords")?.click();
          } catch (e) {}
          map.closePopup();
          atualizarRulerHud();
        } else {
          limparRegua();
        }
        aplicarInteratividadeMunicipios();
      }

      rulerBtn.onclick = () => setReguaAtiva(!rulerAtiva);
      document.getElementById("rulerClear").onclick = limparRegua;
      document.getElementById("rulerUndo").onclick = () => {
        if (!rulerPontos.length) return;
        rulerPontos.pop();
        desenharRegua();
      };
      document.getElementById("rulerClose").onclick = () => setReguaAtiva(false);

      map.on("click", e => {
        if (!rulerAtiva) return;
        rulerPontos.push(e.latlng);
        desenharRegua();
      });
      map.on("mousemove", e => {
        if (!rulerAtiva || !rulerPontos.length) return;
        const ultimo = rulerPontos[rulerPontos.length - 1];
        if (!rulerPreview) {
          rulerPreview = L.polyline([ultimo, e.latlng], {color:"#f59e0b", weight:2, opacity:.65, dashArray:"6 6", interactive:false}).addTo(rulerLayer);
        } else {
          rulerPreview.setLatLngs([ultimo, e.latlng]);
        }
      });
      document.addEventListener("keydown", e => {
        if (!rulerAtiva) return;
        if (e.key === "Escape") setReguaAtiva(false);
        if ((e.key === "Backspace" || e.key === "Delete") && rulerPontos.length) {
          e.preventDefault();
          rulerPontos.pop();
          desenharRegua();
        }
      });

      /* Municípios começam visíveis, porém passivos. */
      aplicarInteratividadeMunicipios();
    } catch (e) {
      console.warn("Falha ao aplicar melhorias operacionais do mapa", e);
    }
  };
  core.onerror = () => console.error("Falha ao carregar o núcleo do mapa operacional");
  document.head.appendChild(core);
})();
