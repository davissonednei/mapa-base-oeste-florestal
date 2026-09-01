/* Vento operacional funcional.
   O CENSIPAM continua sendo a referência oficial, mas a versão atual do Painel do Fogo
   não expõe de forma confiável a camada WRF pelo WMS usado pelo mapa. Para não deixar
   o operador sem vento, este módulo assume o botão e exibe explicitamente o fallback
   GFS/Open-Meteo, sem apresentá-lo como dado oficial CENSIPAM. */
(() => {
  if (window.__windAnimationInstalled) return;
  window.__windAnimationInstalled = true;
  window.__windSourcePolicy = 'GFS_EXPLICIT_FALLBACK';

  const API = 'https://api.open-meteo.com/v1/forecast';
  const GRID_COLS = 8;
  const GRID_ROWS = 6;
  const FIELD_STEP = 34;
  const CACHE_MS = 10 * 60 * 1000;
  const REFRESH_MS = 20 * 60 * 1000;

  let ativo = false;
  let btn = null;
  let canvas = null;
  let ctx = null;
  let particles = [];
  let samples = [];
  let field = null;
  let speedLayer = null;
  let raf = 0;
  let lastFrame = 0;
  let refreshTimer = 0;
  let moveTimer = 0;
  let fetching = false;
  let lastFetchAt = 0;
  let cacheKey = '';

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function assegurarCanvas() {
    if (canvas) return true;
    const wrap = document.querySelector('.map-wrap');
    if (!wrap) return false;
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
        .wind-speed-value{display:inline-flex;align-items:baseline;justify-content:center;gap:2px;min-width:58px;height:23px;padding:0 7px;border:1px solid rgba(186,230,253,.58);border-radius:999px;background:rgba(7,16,25,.82);color:#f0f9ff;box-shadow:0 2px 8px rgba(0,0,0,.24);backdrop-filter:blur(3px);font:900 10px/1 Inter,Segoe UI,Arial,sans-serif;white-space:nowrap;text-shadow:0 1px 2px rgba(0,0,0,.5)}
        .wind-speed-value small{font-size:7px;color:#bae6fd;font-weight:800}
        @media(max-width:820px){.wind-speed-value{min-width:52px;height:21px;padding:0 6px;font-size:9px}.wind-speed-value small{font-size:6px}}
      `;
      document.head.appendChild(style);
    }

    if (!speedLayer) speedLayer = L.layerGroup();
    return true;
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

  function gridDaTela() {
    const b = map.getBounds();
    const north = b.getNorth();
    const south = b.getSouth();
    const west = b.getWest();
    const east = b.getEast();
    const lats = [], lngs = [], pontos = [];
    for (let r = 0; r < GRID_ROWS; r++) {
      const t = GRID_ROWS === 1 ? .5 : r / (GRID_ROWS - 1);
      const lat = north + (south - north) * t;
      for (let c = 0; c < GRID_COLS; c++) {
        const u = GRID_COLS === 1 ? .5 : c / (GRID_COLS - 1);
        const lng = west + (east - west) * u;
        lats.push(lat.toFixed(4));
        lngs.push(lng.toFixed(4));
        pontos.push({lat, lng});
      }
    }
    return {lats, lngs, pontos};
  }

  function chaveBounds() {
    const b = map.getBounds();
    return [b.getNorth(), b.getSouth(), b.getWest(), b.getEast()]
      .map(v => (Math.round(v * 4) / 4).toFixed(2)).join('|');
  }

  function renderizarVelocidades() {
    if (!ativo || !samples.length || !assegurarVelocidades()) return;
    speedLayer.clearLayers();
    if (!map.hasLayer(speedLayer)) speedLayer.addTo(map);

    const size = map.getSize();
    const mobile = size.x < 760;
    const colsDesejadas = mobile ? [1, 4, 6] : [1, 3, 5, 7];
    const rowsDesejadas = [1, 3, 5];

    for (const r of rowsDesejadas) {
      for (const c of colsDesejadas) {
        const s = samples[r * GRID_COLS + c];
        if (!s || !Number.isFinite(s.speed)) continue;
        const valor = Math.round(s.speed);
        const icon = L.divIcon({
          className: 'wind-speed-label',
          html: `<span class="wind-speed-value">${valor}<small>km/h GFS</small></span>`,
          iconSize: [70, 23],
          iconAnchor: [35, 12]
        });
        L.marker([s.lat, s.lng], {
          pane: 'windSpeedPane',
          icon,
          interactive: false,
          keyboard: false,
          opacity: .92
        }).addTo(speedLayer);
      }
    }
  }

  async function carregarVento(force=false) {
    if (!ativo || fetching || typeof map === 'undefined') return;
    const chave = chaveBounds();
    if (!force && samples.length && chave === cacheKey && Date.now() - lastFetchAt < CACHE_MS) {
      construirCampo();
      renderizarVelocidades();
      return;
    }

    fetching = true;
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '.65';
      btn.innerHTML = '🌬️ VENTO GFS…';
    }

    try {
      const g = gridDaTela();
      const params = new URLSearchParams({
        latitude: g.lats.join(','),
        longitude: g.lngs.join(','),
        current: 'wind_speed_10m,wind_direction_10m',
        wind_speed_unit: 'kmh',
        timezone: 'America/Bahia',
        models: 'gfs_global'
      });
      const r = await fetch(`${API}?${params.toString()}`, {cache:'no-store'});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const payload = await r.json();
      const lista = Array.isArray(payload) ? payload : [payload];
      const novos = [];
      lista.forEach((item, i) => {
        const speed = Number(item?.current?.wind_speed_10m);
        const dir = Number(item?.current?.wind_direction_10m);
        const p = g.pontos[i];
        if (!p || !Number.isFinite(speed) || !Number.isFinite(dir)) return;
        const rad = dir * Math.PI / 180;
        novos.push({
          lat: Number(item.latitude ?? p.lat),
          lng: Number(item.longitude ?? p.lng),
          speed,
          dir,
          vx: -Math.sin(rad),
          vy: Math.cos(rad)
        });
      });
      if (novos.length < 8) throw new Error('campo de vento insuficiente');
      samples = novos;
      cacheKey = chave;
      lastFetchAt = Date.now();
      construirCampo();
      criarParticulas();
      renderizarVelocidades();
      if (btn) {
        const media = samples.reduce((s, x) => s + x.speed, 0) / samples.length;
        btn.title = `Vento GFS/Open-Meteo a 10 m — fallback, não CENSIPAM • média visível ${media.toFixed(0)} km/h`;
      }
    } catch (e) {
      console.warn('Falha ao carregar vento GFS', e);
      if (btn) btn.title = 'Vento GFS indisponível nesta tentativa';
    } finally {
      fetching = false;
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.innerHTML = ativo ? '🌬️ VENTO GFS ✓' : '🌬️ VENTO GFS';
      }
    }
  }

  function nearestSample(lat, lng) {
    let best = null;
    let bestD = Infinity;
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
    const data = new Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      const y = Math.min(size.y, r * FIELD_STEP);
      for (let c = 0; c < cols; c++) {
        const x = Math.min(size.x, c * FIELD_STEP);
        const ll = map.containerPointToLatLng([x, y]);
        const s = nearestSample(ll.lat, ll.lng);
        data[r * cols + c] = s ? {vx:s.vx, vy:s.vy, speed:s.speed} : null;
      }
    }
    field = {cols, rows, data, width:size.x, height:size.y};
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
      p.px = p.x;
      p.py = p.y;
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
    if (ativo) return;
    ativo = true;
    assegurarCanvas();
    assegurarVelocidades();
    if (canvas) canvas.style.display = 'block';
    if (btn) {
      btn.classList.add('active');
      btn.innerHTML = '🌬️ VENTO GFS ✓';
    }
    resizeCanvas();
    carregarVento(true);
    lastFrame = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(desenhar);
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => carregarVento(true), REFRESH_MS);
  }

  function desligar() {
    ativo = false;
    cancelAnimationFrame(raf);
    clearInterval(refreshTimer);
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (canvas) canvas.style.display = 'none';
    if (speedLayer) {
      speedLayer.clearLayers();
      if (map.hasLayer(speedLayer)) map.removeLayer(speedLayer);
    }
    if (btn) {
      btn.classList.remove('active');
      btn.innerHTML = '🌬️ VENTO GFS';
    }
  }

  function takeoverButton() {
    const alvo = document.getElementById('toggleWind');
    const municipio = document.getElementById('toggleMunicipioSelect');
    if (!alvo || !municipio || typeof map === 'undefined') return false;
    btn = alvo;
    if (municipio.nextElementSibling !== btn) municipio.insertAdjacentElement('afterend', btn);
    btn.disabled = false;
    btn.style.display = '';
    btn.style.opacity = '';
    btn.innerHTML = ativo ? '🌬️ VENTO GFS ✓' : '🌬️ VENTO GFS';
    btn.title = 'Vento GFS/Open-Meteo a 10 m — fallback explícito, não CENSIPAM';
    if (btn.dataset.gfsWindReady === '1') return true;
    btn.dataset.gfsWindReady = '1';
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
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
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (speedLayer) speedLayer.clearLayers();
    });
    map.on('moveend zoomend', () => {
      if (!ativo) return;
      clearTimeout(moveTimer);
      moveTimer = setTimeout(() => {
        resizeCanvas();
        carregarVento(false);
        lastFrame = 0;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(desenhar);
      }, 250);
    });
    return true;
  }

  function instalar() {
    assegurarCanvas();
    assegurarVelocidades();
    if (takeoverButton()) return;
    const obs = new MutationObserver(() => {
      if (takeoverButton()) obs.disconnect();
    });
    obs.observe(document.body, {childList:true, subtree:true});
    let tentativas = 0;
    const timer = setInterval(() => {
      tentativas++;
      if (takeoverButton() || tentativas > 120) clearInterval(timer);
    }, 250);
  }

  instalar();
})();
