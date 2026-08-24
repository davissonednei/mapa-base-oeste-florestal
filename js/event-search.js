/* Busca lateral por ID dos eventos sincronizados do Painel do Fogo / CENSIPAM. */
(() => {
  const EVENTOS_URL = 'dados/eventos_fogo.json';
  let eventos = [];
  let highlightLayer = null;
  let timerHighlight = null;

  const esc = valor => String(valor ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const numero = (...valores) => {
    for (const valor of valores) {
      if (valor === null || valor === undefined || valor === '') continue;
      const n = Number(valor);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  async function carregarEventos() {
    try {
      const r = await fetch(`${EVENTOS_URL}?v=${Date.now()}`, {cache:'no-store'});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const payload = await r.json();
      const lista = Array.isArray(payload) ? payload : payload?.eventos;
      if (Array.isArray(lista)) eventos = lista;
      const busca = document.getElementById('search');
      if (busca?.value) render(busca.value);
    } catch (e) {
      console.warn('Falha ao carregar eventos para busca por ID', e);
    }
  }

  function localizar(id) {
    return eventos.find(e => String(e?.id_evento ?? '') === String(id)) || null;
  }

  function popupHtml(evento) {
    const id = esc(evento?.id_evento ?? '—');
    const municipio = esc(evento?.municipio || evento?.nm_municipio || 'Não informado');
    const status = esc(evento?.status_evento || 'CENSIPAM');
    const ultimaRaw = evento?.dt_ultima_visao || evento?.dt_maxima || evento?.dt_max_evento;
    let ultima = '—';
    if (ultimaRaw) {
      const d = new Date(ultimaRaw);
      if (!Number.isNaN(d.getTime())) ultima = esc(d.toLocaleString('pt-BR', {timeZone:'America/Bahia'}));
    }
    const lat = numero(evento?.latitude, evento?.lat);
    const lng = numero(evento?.longitude, evento?.lng, evento?.lon);
    const coords = lat !== null && lng !== null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : '—';
    return `<div class="fire-card"><div class="fire-card-head"><div class="fire-card-icon">🔥</div><div><div class="fire-card-title">Evento ${id}</div><div class="fire-card-id">Painel do Fogo • CENSIPAM</div></div></div><div class="fire-card-row"><span>Município</span><b>${municipio}</b></div><div class="fire-card-row"><span>Status</span><b>${status}</b></div><div class="fire-card-row"><span>Última detecção</span><b>${ultima}</b></div><div class="fire-card-row"><span>Coordenadas</span><b>${esc(coords)}</b></div><div class="fire-card-foot">Localizado pela busca de ID do evento.</div></div>`;
  }

  function destacar(feature, alvo) {
    try {
      if (!highlightLayer) highlightLayer = L.layerGroup().addTo(map);
      highlightLayer.clearLayers();
      if (feature) {
        L.geoJSON(feature, {
          interactive:false,
          style:{color:'#f59e0b', weight:4, opacity:1, fillColor:'#f59e0b', fillOpacity:.08, dashArray:'8 5'}
        }).addTo(highlightLayer);
      } else if (alvo) {
        L.circleMarker(alvo, {radius:16, color:'#f59e0b', weight:4, fillOpacity:.08, interactive:false}).addTo(highlightLayer);
      }
      clearTimeout(timerHighlight);
      timerHighlight = setTimeout(() => highlightLayer?.clearLayers(), 10000);
    } catch (e) {}
  }

  function irParaEvento(id) {
    if (typeof map === 'undefined' || typeof L === 'undefined') return;
    const evento = localizar(id);
    if (!evento) return;

    let alvo = null;
    let feature = null;
    const geom = evento?.geom;
    if (geom?.coordinates?.length) {
      feature = {type:'Feature', properties:{id_evento:evento.id_evento}, geometry:{type:geom.type || 'Polygon', coordinates:geom.coordinates}};
      try {
        const camada = L.geoJSON(feature, {interactive:false});
        const bounds = camada.getBounds();
        if (bounds?.isValid?.()) {
          alvo = bounds.getCenter();
          map.fitBounds(bounds, {padding:[55,55], maxZoom:14, animate:true});
        }
      } catch (e) {}
    }

    if (!alvo) {
      const lat = numero(evento?.latitude, evento?.lat);
      const lng = numero(evento?.longitude, evento?.lng, evento?.lon);
      if (lat !== null && lng !== null) {
        alvo = L.latLng(lat, lng);
        map.setView(alvo, Math.max(map.getZoom(), 14), {animate:true});
      }
    }
    if (!alvo) return;

    destacar(feature, alvo);
    setTimeout(() => {
      L.popup({maxWidth:390, closeButton:true}).setLatLng(alvo).setContent(popupHtml(evento)).openOn(map);
    }, 320);
  }

  function render(valor) {
    const box = document.getElementById('opsSearchResults');
    if (!box) return;
    box.querySelectorAll('.ops-event-search-item').forEach(el => el.remove());

    const bruto = String(valor || '').trim();
    const explicito = /^evento\s*#?/i.test(bruto);
    const termo = bruto.replace(/^evento\s*#?\s*/i, '').trim();
    if (!termo || (!explicito && !/^\d{4,}$/.test(termo))) return;

    const encontrados = eventos
      .filter(evento => String(evento?.id_evento ?? '').includes(termo))
      .sort((a,b) => Number(String(b?.id_evento ?? '') === termo) - Number(String(a?.id_evento ?? '') === termo))
      .slice(0, 6);
    if (!encontrados.length) return;

    const frag = document.createDocumentFragment();
    for (const evento of encontrados) {
      const id = String(evento.id_evento);
      const btn = document.createElement('button');
      btn.className = 'ops-search-item ops-event-search-item';
      btn.dataset.eventId = id;
      const titulo = document.createElement('b');
      titulo.textContent = `🔥 Evento ${id}`;
      const detalhe = document.createElement('small');
      detalhe.textContent = [evento.municipio || evento.nm_municipio, evento.status_evento || 'CENSIPAM'].filter(Boolean).join(' • ');
      btn.append(titulo, detalhe);
      btn.onmousedown = ev => ev.preventDefault();
      btn.onclick = () => { box.classList.remove('show'); irParaEvento(id); };
      frag.appendChild(btn);
    }
    box.insertBefore(frag, box.firstChild);
    box.classList.add('show');
  }

  function instalar(tentativa=0) {
    const busca = document.getElementById('search');
    const box = document.getElementById('opsSearchResults');
    if (!busca || !box || typeof map === 'undefined' || typeof L === 'undefined') {
      if (tentativa < 80) setTimeout(() => instalar(tentativa + 1), 100);
      return;
    }
    if (busca.dataset.eventSearchReady === '1') return;
    busca.dataset.eventSearchReady = '1';
    busca.placeholder = 'Buscar município, GCIF, militar, viatura ou ID do evento...';
    busca.addEventListener('input', e => render(e.target.value));
    carregarEventos();
    setInterval(carregarEventos, 120000);
  }

  instalar();
})();
