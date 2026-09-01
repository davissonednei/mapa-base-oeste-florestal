/* Vento operacional validado.
   O navegador lê somente o JSON preparado pelo job do repositório.
   Política interna de fonte: CPTEC/INPE WRF 7 km como principal; ECMWF IFS como fallback autorizado.
   A interface para o usuário permanece simples: botão VENTO, partículas e velocidade em km/h.
*/
(() => {
  if (window.__windAnimationInstalled) return;
  window.__windAnimationInstalled = true;
  window.__windSourcePolicy = 'CPTEC_WRF_PRIMARY_ECMWF_EXPLICIT_FALLBACK';

  const DATA_URL = 'dados/vento/operational_wind.json';
  const MAX_VALID_DELTA_MS = 3 * 60 * 60 * 1000;
  const MAX_GENERATED_AGE_MS = 3 * 60 * 60 * 1000;
  const FIELD_STEP = 34;
  const REFRESH_MS = 10 * 60 * 1000;

  let btn = null;
  let data = null;
  let samples = [];
  let ativo = false;
  let canvas = null;
  let ctx = null;
  let particles = [];
  let field = null;
  let speedLayer = null;
  let raf = 0;
  let lastFrame = 0;
  let moveTimer = 0;
  let refreshTimer = 0;

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const finite = v => Number.isFinite(Number(v));

  function parseIso(s) {
    const d = new Date(String(s || ''));
    return Number.isFinite(d.getTime()) ? d : null;
  }

  function validarDados(payload) {
    if (!payload || payload.available !== true || payload.operational !== true) {
      return {ok:false, reason: payload?.reason || 'Vento temporariamente indisponível.'};
    }
    if (!Array.isArray(payload.points) || payload.points.length < 20) {
      return {ok:false, reason:'Vento temporariamente indisponível.'};
    }
    const valid = parseIso(payload.valid_utc);
    const generated = parseIso(payload.generated_at_utc);
    if (!valid || !generated) return {ok:false, reason:'Vento temporariamente indisponível.'};
    const agora = Date.now();
    if (Math.abs(agora - valid.getTime()) > MAX_VALID_DELTA_MS) {
      return {ok:false, reason:'Vento temporariamente indisponível.'};
    }
    if (agora - generated.getTime() > MAX_GENERATED_AGE_MS || agora < generated.getTime() - 10 * 60 * 1000) {
      return {ok:false, reason:'Vento temporariamente indisponível.'};
    }
    if (payload.source_priority === 'primary') {
      if (payload.source !== 'CPTEC/INPE' || !/WRF\s*7\s*km/i.test(payload.model || '')) {
        return {ok:false, reason:'Vento temporariamente indisponível.'};
      }
    } else if (payload.source_priority === 'fallback') {
      if (!/ECMWF/i.test(payload.source || '') || !/IFS/i.test(payload.model || '')) {
        return {ok:false, reason:'Vento temporariamente indisponível.'};
      }
    } else {
      return {ok:false, reason:'Vento temporariamente indisponível.'};
    }
    return {ok:true};
  }

  function normalizarSamples(payload) {
    return payload.points.map(p => {
      const lat = Number(p.lat), lng = Number(p.lng);
      const u = Number(p.u_ms), v = Number(p.v_ms);
      const speed = Number(p.speed_kmh);
      const dir = Number(p.direction_from_deg);
      if (![lat,lng,u,v,speed,dir].every(Number.isFinite)) return null;
      const mag = Math.hypot(u, v);
      if (!(mag >= 0)) return null;
      return {
        lat, lng, u, v, speed, dir,
        vx: mag > 0 ? u / mag : 0,
        vy: mag > 0 ? -v / mag : 0
      };
    }).filter(Boolean);
  }

  function assegurarCanvas() {
    if (canvas) return true;
    const wrap = document.querySelector('.map-wrap');
    if (!wrap || typeof map === 'undefined') return false;
    canvas = document.createElement('canvas');
    canvas.id = 'windParticleCanvas';
    canvas.style.cssText = 'position:absolute;inset:0;z-index:426;pointer-events:none;display:none;';
    wrap.appendChild(canvas);
    ctx = canvas.getContext('2d', {alpha:true});
    resizeCanvas();
    return true;
  }

  function assegurarVelocidades() {
    if (typeof map === 'undefined' || typeof L === 'undefined') return false;
    if (!map.getPane('windSpeedPane')) map.createPane('windSpeedPane');
    const pane = map.getPane('windSpeedPane');
    pane.style.zIndex = 427;
    pane.style.pointerEvents = 'none';

    if (!document.getElementById('windSpeedStyle')) {
      const style = document.createElement('style');
      style.id = 'windSpeedStyle';
      style.textContent = `
        .wind-speed-label{background:transparent!important;border:0!important;pointer-events:none!important}
        .wind-speed-value{display:inline-flex;align-items:baseline;justify-content:center;gap:2px;min-width:52px;height:23px;padding:0 7px;border:1px solid rgba(186,230,253,.58);border-radius:999px;background:rgba(7,16,25,.80);color:#f0f9ff;box-shadow:0 2px 8px rgba(0,0,0,.24);backdrop-filter:blur(3px);font:900 10px/1 Inter,Segoe UI,Arial,sans-serif;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.5)}
        .wind-speed-value small{font-size:7px;color:#bae6fd;font-weight:800}
        #windMetaBadge,.wind-meta-badge{display:none!important}
        @media(max-width:820px){.wind-speed-value{min-width:47px;height:21px;padding:0 6px;font-size:9px}.wind-speed-value small{font-size:6px}}
      `;
      document.head.appendChild(style);
    }

    const antigo = document.getElementById('windMetaBadge');
    if (antigo) antigo.remove();
    if (!speedLayer) speedLayer = L.layerGroup();
    return true;
  }

  function esconderVisualizacao() {
    ativo = false;
    cancelAnimationFrame(raf);
    if (ctx && canvas && typeof map !== 'undefined') {
      const size = map.getSize();
      ctx.clearRect(0, 0, size.x, size.y);
    }
    if (canvas) canvas.style.display = 'none';
    if (speedLayer && typeof map !== 'undefined') {
      speedLayer.clearLayers();
      if (map.hasLayer(speedLayer)) map.removeLayer(speedLayer);
    }
    const antigo = document.getElementById('windMetaBadge');
    if (antigo) antigo.remove();
    if (btn) btn.classList.remove('active');
  }

  function aplicarBotao() {
    if (!btn) return;
    const v = validarDados(data);
    if (!v.ok) {
      esconderVisualizacao();
      btn.disabled = true;
      btn.style.display = '';
      btn.style.opacity = '.45';
      btn.style.cursor = 'not-allowed';
      btn.innerHTML = '🌬️ VENTO — INDISP.';
      btn.title = v.reason;
      btn.setAttribute('aria-disabled', 'true');
      return;
    }
    btn.disabled = false;
    btn.style.display = '';
    btn.style.opacity = '';
    btn.style.cursor = '';
    btn.setAttribute('aria-disabled', 'false');
    btn.innerHTML = ativo ? '🌬️ VENTO ✓' : '🌬️ VENTO';
    btn.title = 'Exibir direção e velocidade do vento';
  }

  async function carregarDados() {
    try {
      const r = await fetch(`${DATA_URL}?v=${Date.now()}`, {cache:'no-store'});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const payload = await r.json();
      data = payload;
      samples = validarDados(payload).ok ? normalizarSamples(payload) : [];
      if (samples.length < 20 && payload.available) {
        data = {...payload, available:false, reason:'Vento temporariamente indisponível.'};
      }
    } catch (e) {
      data = {available:false, operational:false, reason:'Vento temporariamente indisponível.'};
      samples = [];
      console.warn('Vento operacional indisponível', e);
    }
    aplicarBotao();
    if (ativo) {
      const v = validarDados(data);
      if (!v.ok) esconderVisualizacao();
      else {
        construirCampo();
        renderizarVelocidades();
      }
    }
  }

  function resizeCanvas() {
    if (!canvas || !ctx || typeof map === 'undefined') return;
    const size = map.getSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
    canvas.width = Math.max(1, Math.floor(size.x * dpr));
    canvas.height = Math.max(1, Math.floor(size.y * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    field = null;
    criarParticulas();
  }

  function nearestSample(lat, lng) {
    let best = null, bestD = Infinity;
    for (const s of samples) {
      const dx = (lng - s.lng) * Math.cos(lat * Math.PI / 180);
      const dy = lat - s.lat;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  function construirCampo() {
    if (!samples.length || !canvas || typeof map === 'undefined') return;
    const size = map.getSize();
    const cols = Math.ceil(size.x / FIELD_STEP) + 1;
    const rows = Math.ceil(size.y / FIELD_STEP) + 1;
    const arr = new Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      const y = Math.min(size.y, r * FIELD_STEP);
      for (let c = 0; c < cols; c++) {
        const x = Math.min(size.x, c * FIELD_STEP);
        const ll = map.containerPointToLatLng([x, y]);
        const s = nearestSample(ll.lat, ll.lng);
        arr[r * cols + c] = s ? {vx:s.vx, vy:s.vy, speed:s.speed} : null;
      }
    }
    field = {cols, rows, data:arr};
  }

  function vetorEm(x, y) {
    if (!field) return null;
    const c = clamp(Math.floor(x / FIELD_STEP), 0, field.cols - 1);
    const r = clamp(Math.floor(y / FIELD_STEP), 0, field.rows - 1);
    return field.data[r * field.cols + c];
  }

  function novaParticula(p={}) {
    const size = map.getSize();
    p.x = Math.random() * size.x;
    p.y = Math.random() * size.y;
    p.px = p.x;
    p.py = p.y;
    p.age = Math.floor(Math.random() * 90);
    p.maxAge = 70 + Math.floor(Math.random() * 90);
    return p;
  }

  function criarParticulas() {
    if (typeof map === 'undefined') return;
    const size = map.getSize();
    const qtd = clamp(Math.floor((size.x * size.y) / 1800), 220, 760);
    particles = Array.from({length:qtd}, () => novaParticula({}));
  }

  function renderizarVelocidades() {
    if (!ativo || !samples.length || !assegurarVelocidades() || typeof map === 'undefined') return;
    speedLayer.clearLayers();
    if (!map.hasLayer(speedLayer)) speedLayer.addTo(map);
    const size = map.getSize();
    const xs = size.x < 760 ? [.22,.50,.78] : [.16,.38,.62,.84];
    const ys = [.22,.50,.78];
    const usados = new Set();
    for (const yf of ys) {
      for (const xf of xs) {
        const ll = map.containerPointToLatLng([size.x * xf, size.y * yf]);
        const s = nearestSample(ll.lat, ll.lng);
        if (!s || !finite(s.speed)) continue;
        const key = `${s.lat.toFixed(4)}|${s.lng.toFixed(4)}`;
        if (usados.has(key)) continue;
        usados.add(key);
        const icon = L.divIcon({
          className:'wind-speed-label',
          html:`<span class="wind-speed-value">${Math.round(s.speed)}<small>km/h</small></span>`,
          iconSize:[58,23],
          iconAnchor:[29,12]
        });
        L.marker([s.lat,s.lng], {pane:'windSpeedPane', icon, interactive:false, keyboard:false, opacity:.94}).addTo(speedLayer);
      }
    }
  }

  function desenhar(ts) {
    if (!ativo || !canvas || !ctx) return;
    raf = requestAnimationFrame(desenhar);
    if (!field) return;
    if (!lastFrame) lastFrame = ts;
    const dt = clamp((ts - lastFrame) / 16.67, .45, 2.2);
    lastFrame = ts;
    const size = map.getSize();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = 'rgba(0,0,0,.92)';
    ctx.fillRect(0, 0, size.x, size.y);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 1.15;
    ctx.lineCap = 'round';
    for (const p of particles) {
      if (p.age++ > p.maxAge || p.x < 0 || p.y < 0 || p.x >= size.x || p.y >= size.y) {
        novaParticula(p);
        continue;
      }
      const v = vetorEm(p.x, p.y);
      if (!v) { novaParticula(p); continue; }
      p.px = p.x; p.py = p.y;
      const speedPx = clamp(.45 + v.speed / 14, .55, 3.1) * dt;
      p.x += v.vx * speedPx;
      p.y += v.vy * speedPx;
      const alpha = clamp(.30 + v.speed / 70, .34, .72);
      ctx.strokeStyle = `rgba(225,243,255,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }

  function ligar() {
    if (ativo || !validarDados(data).ok) return;
    ativo = true;
    assegurarCanvas();
    assegurarVelocidades();
    if (canvas) canvas.style.display = 'block';
    resizeCanvas();
    construirCampo();
    criarParticulas();
    renderizarVelocidades();
    aplicarBotao();
    lastFrame = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(desenhar);
  }

  function desligar() {
    esconderVisualizacao();
    aplicarBotao();
  }

  function assumirBotao() {
    const alvo = document.getElementById('toggleWind');
    const municipio = document.getElementById('toggleMunicipioSelect');
    if (!alvo || !municipio || typeof map === 'undefined') return false;
    btn = alvo;
    if (municipio.nextElementSibling !== btn) municipio.insertAdjacentElement('afterend', btn);

    if (!btn.dataset.operationalWindReady) {
      btn.dataset.operationalWindReady = '1';
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (!validarDados(data).ok) return;
        ativo ? desligar() : ligar();
      }, true);

      map.on('resize', () => {
        if (!ativo) return;
        resizeCanvas();
        construirCampo();
        renderizarVelocidades();
      });
      map.on('movestart zoomstart', () => {
        if (!ativo || !ctx || !canvas) return;
        cancelAnimationFrame(raf);
        const size = map.getSize();
        ctx.clearRect(0, 0, size.x, size.y);
        if (speedLayer) speedLayer.clearLayers();
      });
      map.on('moveend zoomend', () => {
        if (!ativo) return;
        clearTimeout(moveTimer);
        moveTimer = setTimeout(() => {
          resizeCanvas();
          construirCampo();
          renderizarVelocidades();
          lastFrame = 0;
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(desenhar);
        }, 250);
      });
    }

    aplicarBotao();
    carregarDados();
    [1500, 4000, 9000].forEach(ms => setTimeout(aplicarBotao, ms));
    clearInterval(refreshTimer);
    refreshTimer = setInterval(carregarDados, REFRESH_MS);
    return true;
  }

  function instalar() {
    if (assumirBotao()) return;
    const obs = new MutationObserver(() => {
      if (assumirBotao()) obs.disconnect();
    });
    obs.observe(document.documentElement, {childList:true, subtree:true});
    let tentativas = 0;
    const timer = setInterval(() => {
      tentativas++;
      if (assumirBotao() || tentativas > 120) clearInterval(timer);
    }, 250);
  }

  instalar();
})();
