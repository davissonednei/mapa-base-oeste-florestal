/* Busca lateral por ID dos eventos do Painel do Fogo / CENSIPAM.
   Usa o cache local para velocidade e consulta WFS oficial como fallback,
   permitindo localizar eventos que ainda não entraram no JSON sincronizado. */
(() => {
  const EVENTOS_URL = 'dados/eventos_fogo.json';
  const WFS_URL = 'https://panorama.sipam.gov.br/geoserver/painel_do_fogo/wfs';
  const WFS_TYPENAME = 'painel_do_fogo:tb_evento';

  let eventos = [];
  let highlightLayer = null;
  let timerHighlight = null;
  let carregandoCache = null;

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

  function extrairId(valor, permitirNumeroCurto=false) {
    const bruto = String(valor || '').trim();
    const explicito = /^(?:evento|id\s*(?:do\s*)?evento)\s*#?/i.test(bruto);
    const limpo = bruto
      .replace(/^(?:evento|id\s*(?:do\s*)?evento)\s*#?\s*/i, '')
      .replace(/^#\s*/, '')
      .trim();
    if (!/^\d+$/.test(limpo)) return null;
    if (!explicito && !permitirNumeroCurto && limpo.length < 4) return null;
    return limpo;
  }

  async function carregarEventos() {
    if (carregandoCache) return carregandoCache;
    carregandoCache = (async () => {
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
      } finally {
        carregandoCache = null;
      }
      return eventos;
    })();
    return carregandoCache;
  }

  function idsIguais(a, b) {
    const sa = String(a ?? '').trim();
    const sb = String(b ?? '').trim();
    if (sa === sb) return true;
    if (/^\d+$/.test(sa) && /^\d+$/.test(sb)) return Number(sa) === Number(sb);
    return false;
  }

  function localizarLocal(id) {
    return eventos.find(e => idsIguais(e?.id_evento, id)) || null;
  }

  function featureParaEvento(feature, idSolicitado) {
    if (!feature) return null;
    const props = feature.properties || {};
    const evento = {...props};
    if (feature.geometry) evento.geom = feature.geometry;
    if (evento.id_evento === undefined || evento.id_evento === null) evento.id_evento = idSolicitado;
    return evento;
  }

  async function buscarWfs(id) {
    const idNumerico = Number(id);
    if (!Number.isFinite(idNumerico)) return null;

    const params = new URLSearchParams({
      service: 'WFS',
      version: '1.1.0',
      request: 'GetFeature',
      typeName: WFS_TYPENAME,
      outputFormat: 'application/json',
      maxFeatures: '2',
      CQL_FILTER: `id_evento=${idNumerico}`
    });

    try {
      const r = await fetch(`${WFS_URL}?${params.toString()}&_=${Date.now()}`, {cache:'no-store'});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const payload = await r.json();
      const features = Array.isArray(payload?.features) ? payload.features : [];
      const exata = features.find(f => idsIguais(f?.properties?.id_evento, id)) || features[0];
      return featureParaEvento(exata, id);
    } catch (e) {
      console.warn(`Falha na consulta WFS do evento ${id}`, e);
      return null;
    }
  }

  async function buscarApiDireta(id) {
    /* Segundo fallback. Algumas versões da API aceitam id_evento como filtro;
       se o servidor ignorar o parâmetro, ainda validamos o ID localmente. */
    const url = `https://panorama.sipam.gov.br/painel-do-fogo/api/v1/eventos?id_evento=${encodeURIComponent(id)}`;
    try {
      const r = await fetch(url, {cache:'no-store'});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const payload = await r.json();
      const lista = Array.isArray(payload) ? payload : payload?.eventos;
      if (!Array.isArray(lista)) return null;
      return lista.find(e => idsIguais(e?.id_evento, id)) || null;
    } catch (e) {
      return null;
    }
  }

  async function resolverEvento(id) {
    let evento = localizarLocal(id);
    if (evento) return evento;

    /* Garante que uma busca feita muito cedo não dependa do carregamento assíncrono do cache. */
    await carregarEventos();
    evento = localizarLocal(id);
    if (evento) return evento;

    evento = await buscarWfs(id);
    if (evento) return evento;

    return await buscarApiDireta(id);
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

  function feedback(texto, classe='') {
    const box = document.getElementById('opsSearchResults');
    if (!box) return;
    box.querySelectorAll('.ops-event-search-feedback').forEach(el => el.remove());
    if (!texto) return;
    const item = document.createElement('div');
    item.className = `ops-search-item ops-event-search-feedback ${classe}`.trim();
    item.style.cursor = 'default';
    item.innerHTML = `<b>${esc(texto)}</b>`;
    box.insertBefore(item, box.firstChild);
    box.classList.add('show');
  }

  async function irParaEvento(id) {
    if (typeof map === 'undefined' || typeof L === 'undefined') return false;

    feedback(`Buscando evento ${id}...`);
    const evento = await resolverEvento(id);
    if (!evento) {
      feedback(`Evento ${id} não encontrado`, 'event-search-not-found');
      return false;
    }

    let alvo = null;
    let feature = null;
    const geom = evento?.geom || evento?.geometry;
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

    if (!alvo) {
      feedback(`Evento ${id} encontrado, mas sem geometria utilizável`, 'event-search-not-found');
      return false;
    }

    feedback('');
    destacar(feature, alvo);
    setTimeout(() => {
      L.popup({maxWidth:390, closeButton:true}).setLatLng(alvo).setContent(popupHtml(evento)).openOn(map);
    }, 320);
    return true;
  }

  function render(valor) {
    const box = document.getElementById('opsSearchResults');
    if (!box) return;
    box.querySelectorAll('.ops-event-search-item,.ops-event-search-feedback').forEach(el => el.remove());

    const bruto = String(valor || '').trim();
    const id = extrairId(bruto);
    const explicito = /^(?:evento|id\s*(?:do\s*)?evento)\s*#?/i.test(bruto);
    const termo = bruto.replace(/^(?:evento|id\s*(?:do\s*)?evento)\s*#?\s*/i, '').replace(/^#\s*/, '').trim();
    if (!id && !explicito) return;
    if (!/^\d+$/.test(termo)) return;

    const encontrados = eventos
      .filter(evento => String(evento?.id_evento ?? '').includes(termo))
      .sort((a,b) => Number(idsIguais(b?.id_evento, termo)) - Number(idsIguais(a?.id_evento, termo)))
      .slice(0, 8);

    const frag = document.createDocumentFragment();
    for (const evento of encontrados) {
      const eventId = String(evento.id_evento);
      const btn = document.createElement('button');
      btn.className = 'ops-search-item ops-event-search-item';
      btn.dataset.eventId = eventId;
      const titulo = document.createElement('b');
      titulo.textContent = `🔥 Evento ${eventId}`;
      const detalhe = document.createElement('small');
      detalhe.textContent = [evento.municipio || evento.nm_municipio, evento.status_evento || 'CENSIPAM'].filter(Boolean).join(' • ');
      btn.append(titulo, detalhe);
      btn.onmousedown = ev => ev.preventDefault();
      btn.onclick = () => { box.classList.remove('show'); irParaEvento(eventId); };
      frag.appendChild(btn);
    }

    if (encontrados.length) {
      box.insertBefore(frag, box.firstChild);
      box.classList.add('show');
    }
  }

  function instalar(tentativa=0) {
    const busca = document.getElementById('search');
    const box = document.getElementById('opsSearchResults');
    if (!busca || !box || typeof map === 'undefined' || typeof L === 'undefined') {
      if (tentativa < 100) setTimeout(() => instalar(tentativa + 1), 100);
      return;
    }
    if (busca.dataset.eventSearchReady === '2') return;
    busca.dataset.eventSearchReady = '2';
    busca.placeholder = 'Buscar município, GCIF, militar, viatura ou ID do evento...';

    busca.addEventListener('input', e => render(e.target.value));

    /* Enter vira uma busca direta e determinística por ID. O listener em captura
       impede que a busca lateral normal tente tratar o mesmo número como outra coisa. */
    busca.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const id = extrairId(busca.value);
      if (!id) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      irParaEvento(id);
    }, true);

    carregarEventos();
    setInterval(carregarEventos, 120000);
  }

  instalar();
})();
