/* Camada animada de vento para o mapa operacional.
   Mantém o botão VENTO ao lado de MUNICÍPIO, mas substitui o WMS estático
   por partículas animadas usando vento a 10 m (GFS via Open-Meteo). */
(() => {
  if (window.__windAnimationInstalled) return;
  window.__windAnimationInstalled = true;

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

  async function carregarVento(force=false) {
    if (!ativo || fetching || typeof map === 'undefined') return;
    const chave = chaveBounds();
    if (!force && samples.length && chave === cacheKey && Date.now() - lastFetchAt < CACHE_MS) {
      construirCampo();
      return;
    }

    fetching = true;
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '.65';
      btn.innerHTML = '🌬️ VENTO…';
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
      if (btn) {
        const media = samples.reduce((s, x) => s + x.speed, 0) / samples.length;
        btn.title = `Vento animado a 10 m • GFS/Open-Meteo • média visível ${media.toFixed(0)} km/h`;
      }
    } catch (e) {
      console.warn('Falha ao carregar vento animado', e);
      if (btn) btn.title = 'Vento animado indisponível nesta tentativa';
    } finally {
      fetching = false;
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.innerHTML = ativo ? '🌬️ VENTO ✓' : '🌬️ VENTO';
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
    if (canvas) canvas.style.display = 'block';
    if (btn) {
      btn.classList.add('active');
      btn.innerHTML = '🌬️ VENTO ✓';
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
    if (btn) {
      btn.classList.remove('active');
      btn.innerHTML = '🌬️ VENTO';
    }
  }

  function takeoverButton() {
    const alvo = document.getElementById('toggleWind');
    const municipio = document.getElementById('toggleMunicipioSelect');
    if (!alvo || !municipio || typeof map === 'undefined') return false;
    btn = alvo;
    if (municipio.nextElementSibling !== btn) municipio.insertAdjacentElement('afterend', btn);
    btn.disabled = false;
    btn.style.opacity = '';
    btn.title = 'Vento animado a 10 m • direção e velocidade';
    if (btn.dataset.animatedWindReady === '1') return true;
    btn.dataset.animatedWindReady = '1';
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
    });
    map.on('movestart zoomstart', () => {
      if (!ativo || !ctx || !canvas) return;
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
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
