/* Leitura local do vento no ponto do mapa.
   Usa exclusivamente o mesmo JSON operacional validado do módulo de vento.
   A interface mostra apenas velocidade, seta de deslocamento e direção de origem.
*/
(() => {
  if (window.__windLocalProbeInstalled) return;
  window.__windLocalProbeInstalled = true;

  const DATA_URL = 'dados/vento/operational_wind.json';
  const MAX_VALID_DELTA_MS = 3 * 60 * 60 * 1000;
  const MAX_GENERATED_AGE_MS = 3 * 60 * 60 * 1000;
  const REFRESH_MS = 10 * 60 * 1000;
  const NEIGHBORS = 8;

  let payload = null;
  let samples = [];
  let card = null;
  let btn = null;
  let pendingMove = null;
  let raf = 0;
  let refreshTimer = 0;
  let clickTimer = 0;

  const compass = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

  function parseIso(v){
    const d = new Date(String(v || ''));
    return Number.isFinite(d.getTime()) ? d : null;
  }

  function dadosValidos(d){
    if(!d || d.available !== true || d.operational !== true || !Array.isArray(d.points) || d.points.length < 20) return false;
    const valid = parseIso(d.valid_utc);
    const generated = parseIso(d.generated_at_utc);
    if(!valid || !generated) return false;
    const now = Date.now();
    if(Math.abs(now - valid.getTime()) > MAX_VALID_DELTA_MS) return false;
    if(now - generated.getTime() > MAX_GENERATED_AGE_MS || now < generated.getTime() - 10 * 60 * 1000) return false;
    if(d.source_priority === 'primary') return d.source === 'CPTEC/INPE' && /WRF\s*7\s*km/i.test(d.model || '');
    if(d.source_priority === 'fallback') return /ECMWF/i.test(d.source || '') && /IFS/i.test(d.model || '');
    return false;
  }

  function normalize(d){
    return (d?.points || []).map(p => {
      const lat = Number(p.lat), lng = Number(p.lng), u = Number(p.u_ms), v = Number(p.v_ms);
      if(![lat,lng,u,v].every(Number.isFinite)) return null;
      return {lat,lng,u,v};
    }).filter(Boolean);
  }

  function ventoAtivo(){
    btn = btn || document.getElementById('toggleWind');
    return !!btn && /✓/.test(btn.textContent || '') && dadosValidos(payload) && samples.length >= 20;
  }

  function assegurarUI(){
    if(card) return true;
    const wrap = document.querySelector('.map-wrap');
    if(!wrap) return false;

    if(!document.getElementById('windLocalProbeStyle')){
      const style = document.createElement('style');
      style.id = 'windLocalProbeStyle';
      style.textContent = `
        body.wind-local-probe-active .wind-speed-label{display:none!important}
        .wind-local-card{position:absolute;z-index:432;display:none;align-items:center;gap:12px;min-width:188px;padding:10px 15px;border:1px solid rgba(15,23,42,.12);border-radius:5px;background:rgba(255,255,255,.94);color:#4b5563;box-shadow:0 3px 12px rgba(15,23,42,.18);backdrop-filter:blur(7px);pointer-events:none;white-space:nowrap;font:500 15px/1.15 Inter,Segoe UI,Arial,sans-serif;transform:translate3d(0,0,0);transition:opacity .12s ease}
        .wind-local-speed{font-variant-numeric:tabular-nums;letter-spacing:.01em}
        .wind-local-arrow{display:inline-block;width:22px;text-align:center;color:#111827;font-size:22px;line-height:1;transform-origin:50% 50%;transition:transform .12s linear}
        .wind-local-dir{min-width:34px;color:#4b5563;font-weight:500;letter-spacing:.02em}
        @media(max-width:820px){.wind-local-card{min-width:164px;padding:9px 12px;gap:10px;font-size:14px}.wind-local-arrow{font-size:20px}}
      `;
      document.head.appendChild(style);
    }

    card = document.createElement('div');
    card.id = 'windLocalCard';
    card.className = 'wind-local-card';
    card.innerHTML = '<span class="wind-local-speed">-- km/h</span><span class="wind-local-arrow">↑</span><span class="wind-local-dir">--</span>';
    wrap.appendChild(card);
    return true;
  }

  function esconder(){
    if(card) card.style.display = 'none';
  }

  function syncEstado(){
    const on = ventoAtivo();
    document.body.classList.toggle('wind-local-probe-active', on);
    if(!on) esconder();
  }

  function dentroDaArea(lat,lng){
    const b = payload?.bbox;
    if(!b) return true;
    return lat >= Number(b.south) && lat <= Number(b.north) && lng >= Number(b.west) && lng <= Number(b.east);
  }

  function interpolar(lat,lng){
    if(!samples.length || !dentroDaArea(lat,lng)) return null;
    const cosLat = Math.cos(lat * Math.PI / 180);
    const nearest = [];

    for(const s of samples){
      const dx = (lng - s.lng) * cosLat;
      const dy = lat - s.lat;
      const d2 = dx*dx + dy*dy;
      if(d2 < 1e-12){
        const speed = Math.hypot(s.u,s.v) * 3.6;
        const from = (Math.atan2(-s.u,-s.v) * 180 / Math.PI + 360) % 360;
        return {u:s.u,v:s.v,speed,from};
      }
      let inserted = false;
      for(let i=0;i<nearest.length;i++){
        if(d2 < nearest[i].d2){
          nearest.splice(i,0,{s,d2});
          inserted = true;
          break;
        }
      }
      if(!inserted && nearest.length < NEIGHBORS) nearest.push({s,d2});
      if(nearest.length > NEIGHBORS) nearest.pop();
    }

    if(!nearest.length) return null;
    let wu=0,wv=0,wsum=0;
    for(const n of nearest){
      const w = 1 / Math.max(n.d2, 1e-8);
      wu += n.s.u * w;
      wv += n.s.v * w;
      wsum += w;
    }
    if(!(wsum > 0)) return null;
    const u = wu/wsum, v = wv/wsum;
    const speed = Math.hypot(u,v) * 3.6;
    const from = (Math.atan2(-u,-v) * 180 / Math.PI + 360) % 360;
    return {u,v,speed,from};
  }

  function cardinal(deg){
    return compass[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
  }

  function posicionarCard(point){
    if(!card || typeof map === 'undefined') return;
    const size = map.getSize();
    const w = card.offsetWidth || 190;
    const h = card.offsetHeight || 42;
    let x = point.x + 18;
    let y = point.y - h - 16;
    if(x + w > size.x - 8) x = point.x - w - 18;
    if(x < 8) x = 8;
    if(y < 8) y = point.y + 18;
    if(y + h > size.y - 8) y = size.y - h - 8;
    card.style.left = `${Math.round(x)}px`;
    card.style.top = `${Math.round(y)}px`;
  }

  function mostrar(latlng, point){
    if(!ventoAtivo() || !assegurarUI()) return esconder();
    const w = interpolar(latlng.lat, latlng.lng);
    if(!w || !Number.isFinite(w.speed)) return esconder();

    const to = (w.from + 180) % 360;
    card.querySelector('.wind-local-speed').textContent = `${w.speed.toFixed(2)} km/h`;
    const arrow = card.querySelector('.wind-local-arrow');
    arrow.style.transform = `rotate(${to}deg)`;
    card.querySelector('.wind-local-dir').textContent = cardinal(w.from);
    card.style.display = 'flex';
    posicionarCard(point);
  }

  function agendarMousemove(e){
    pendingMove = e;
    if(raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const evt = pendingMove;
      pendingMove = null;
      if(!evt) return;
      mostrar(evt.latlng, evt.containerPoint);
    });
  }

  async function carregar(){
    try{
      const r = await fetch(`${DATA_URL}?v=${Date.now()}`, {cache:'no-store'});
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      payload = dadosValidos(d) ? d : null;
      samples = payload ? normalize(payload) : [];
    }catch(e){
      payload = null;
      samples = [];
      console.warn('Leitura local do vento indisponível', e);
    }
    syncEstado();
  }

  function instalar(){
    if(typeof map === 'undefined') return false;
    assegurarUI();
    btn = document.getElementById('toggleWind');

    map.on('mousemove', agendarMousemove);
    map.on('mouseout', esconder);
    map.on('movestart zoomstart', esconder);
    map.on('click', e => {
      if(!ventoAtivo()) return;
      mostrar(e.latlng, e.containerPoint);
      clearTimeout(clickTimer);
      clickTimer = setTimeout(esconder, 3500);
    });

    const container = map.getContainer?.();
    if(container) container.addEventListener('mouseleave', esconder);

    const observer = new MutationObserver(syncEstado);
    if(btn) observer.observe(btn,{childList:true,subtree:true,characterData:true});
    else observer.observe(document.documentElement,{childList:true,subtree:true});

    carregar();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(carregar, REFRESH_MS);
    return true;
  }

  if(!instalar()){
    let n=0;
    const timer=setInterval(() => {
      n++;
      if(instalar() || n>120) clearInterval(timer);
    },250);
  }
})();
