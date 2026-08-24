/* Loader do mapa operacional: mantém uma única régua visível e adiciona camadas auxiliares. */
(() => {
  const actions = document.querySelector('.map-actions');
  if (!actions) return;

  function organizarRegua() {
    const botoes = [...actions.querySelectorAll('button')].filter(btn =>
      btn.id === 'toggleRuler' || /R[ÉE]GUA/i.test(btn.textContent || '')
    );
    if (botoes.length > 1) {
      const manter = botoes[botoes.length - 1];
      botoes.slice(0, -1).forEach(btn => btn.remove());
      const municipio = document.getElementById('toggleMunicipioSelect');
      if (municipio && manter.nextElementSibling !== municipio) actions.insertBefore(manter, municipio);
    }
  }

  function instalarRelevo() {
    if (document.getElementById('terrainToggle')) return;
    if (typeof map === 'undefined' || typeof L === 'undefined' || typeof satelliteLayer === 'undefined') return;

    const mapWrap = document.querySelector('.map-wrap');
    const satBtn = document.getElementById('toggleSatellite');
    if (!mapWrap || !satBtn) return;

    if (!map.getPane('terrainPane')) map.createPane('terrainPane');
    const terrainPane = map.getPane('terrainPane');
    terrainPane.style.zIndex = 390;
    terrainPane.style.pointerEvents = 'none';

    const terrainLayer = L.tileLayer(
      'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      {
        pane: 'terrainPane',
        opacity: 0.48,
        maxZoom: 17,
        subdomains: 'abc',
        attribution: 'Relevo © OpenTopoMap, dados © OpenStreetMap'
      }
    );

    const style = document.createElement('style');
    style.textContent = `
      .terrain-toggle{display:none;position:absolute;z-index:690;right:13px;bottom:148px;align-items:center;gap:8px;padding:7px 9px;border:1px solid #33495d;border-radius:10px;background:rgba(7,16,25,.94);color:#e8eef4;box-shadow:0 4px 16px rgba(0,0,0,.25);backdrop-filter:blur(7px);font:800 9px/1 Inter,Segoe UI,Arial,sans-serif;user-select:none}
      .terrain-toggle.show{display:flex}.terrain-toggle.on{border-color:#f59e0b;background:rgba(28,20,8,.96);color:#ffd18a}.terrain-toggle span{white-space:nowrap}.terrain-switch{position:relative;width:32px;height:18px;flex:none}.terrain-switch input{position:absolute;opacity:0;width:0;height:0}.terrain-slider{position:absolute;inset:0;border-radius:999px;background:#263949;border:1px solid #41596d;cursor:pointer;transition:.15s ease}.terrain-slider:before{content:'';position:absolute;width:12px;height:12px;left:2px;top:2px;border-radius:50%;background:#b8c5cf;transition:.15s ease}.terrain-switch input:checked + .terrain-slider{background:rgba(245,158,11,.30);border-color:#f59e0b}.terrain-switch input:checked + .terrain-slider:before{transform:translateX(14px);background:#ffd18a}
      @media(max-width:820px){.terrain-toggle{right:8px;bottom:142px;padding:6px 8px;font-size:8px}}
    `;
    document.head.appendChild(style);

    const control = document.createElement('div');
    control.id = 'terrainToggle';
    control.className = 'terrain-toggle';
    control.innerHTML = `<span>⛰️ RELEVO</span><label class="terrain-switch"><input id="terrainCheck" type="checkbox"><i class="terrain-slider"></i></label>`;
    mapWrap.appendChild(control);

    L.DomEvent.disableClickPropagation(control);
    L.DomEvent.disableScrollPropagation(control);

    const check = document.getElementById('terrainCheck');

    function sateliteAtivo() {
      return map.hasLayer(satelliteLayer);
    }

    function sincronizarRelevo() {
      const sat = sateliteAtivo();
      control.classList.toggle('show', sat);
      control.classList.toggle('on', sat && check.checked);
      if (sat && check.checked) {
        if (!map.hasLayer(terrainLayer)) terrainLayer.addTo(map);
        terrainLayer.bringToFront();
      } else if (map.hasLayer(terrainLayer)) {
        map.removeLayer(terrainLayer);
      }
    }

    check.addEventListener('change', sincronizarRelevo);
    satBtn.addEventListener('click', () => setTimeout(sincronizarRelevo, 20));
    map.on('layeradd layerremove', () => setTimeout(sincronizarRelevo, 0));
    sincronizarRelevo();
  }

  function instalarProximidadesCensipam() {
    if (document.getElementById('proximityControls')) return;
    if (typeof map === 'undefined' || typeof L === 'undefined') return;

    const mapWrap = document.querySelector('.map-wrap');
    if (!mapWrap) return;

    const WMS = 'https://panorama.sipam.gov.br/geoserver/painel_do_fogo/wms';

    if (!map.getPane('proximityUrbanPane')) map.createPane('proximityUrbanPane');
    if (!map.getPane('proximityRoadPane')) map.createPane('proximityRoadPane');
    map.getPane('proximityUrbanPane').style.zIndex = 452;
    map.getPane('proximityRoadPane').style.zIndex = 453;
    map.getPane('proximityUrbanPane').style.pointerEvents = 'none';
    map.getPane('proximityRoadPane').style.pointerEvents = 'none';

    const style = document.createElement('style');
    style.textContent = `
      .proximity-controls{position:absolute;z-index:691;right:13px;bottom:190px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-family:Inter,Segoe UI,Arial,sans-serif}
      .proximity-toggle{display:flex;align-items:center;gap:8px;padding:7px 9px;border:1px solid #33495d;border-radius:10px;background:rgba(7,16,25,.94);color:#e8eef4;box-shadow:0 4px 16px rgba(0,0,0,.25);backdrop-filter:blur(7px);font:800 9px/1 Inter,Segoe UI,Arial,sans-serif;user-select:none}
      .proximity-toggle.on{border-color:#ef4444;background:rgba(50,13,13,.96);color:#ffb4b4}.proximity-toggle.loading{opacity:.62}.proximity-toggle.unavailable{opacity:.42}.proximity-toggle span{white-space:nowrap}
      .proximity-switch{position:relative;width:32px;height:18px;flex:none}.proximity-switch input{position:absolute;opacity:0;width:0;height:0}.proximity-slider{position:absolute;inset:0;border-radius:999px;background:#263949;border:1px solid #41596d;cursor:pointer;transition:.15s ease}.proximity-slider:before{content:'';position:absolute;width:12px;height:12px;left:2px;top:2px;border-radius:50%;background:#b8c5cf;transition:.15s ease}.proximity-switch input:checked + .proximity-slider{background:rgba(239,68,68,.30);border-color:#ef4444}.proximity-switch input:checked + .proximity-slider:before{transform:translateX(14px);background:#ffb4b4}.proximity-switch input:disabled + .proximity-slider{cursor:not-allowed}
      @media(max-width:820px){.proximity-controls{right:8px;bottom:184px;gap:5px}.proximity-toggle{padding:6px 8px;font-size:8px}}
    `;
    document.head.appendChild(style);

    const box = document.createElement('div');
    box.id = 'proximityControls';
    box.className = 'proximity-controls';
    box.innerHTML = `
      <div id="urbanProximityToggle" class="proximity-toggle loading" title="Localizando a camada oficial do CENSIPAM">
        <span>🏘️ PROX. URBANA</span>
        <label class="proximity-switch"><input id="urbanProximityCheck" type="checkbox" disabled><i class="proximity-slider"></i></label>
      </div>
      <div id="roadProximityToggle" class="proximity-toggle loading" title="Localizando a camada oficial do CENSIPAM">
        <span>⚠️ PROX. PISTA</span>
        <label class="proximity-switch"><input id="roadProximityCheck" type="checkbox" disabled><i class="proximity-slider"></i></label>
      </div>`;
    mapWrap.appendChild(box);
    L.DomEvent.disableClickPropagation(box);
    L.DomEvent.disableScrollPropagation(box);

    const urbanWrap = document.getElementById('urbanProximityToggle');
    const roadWrap = document.getElementById('roadProximityToggle');
    const urbanCheck = document.getElementById('urbanProximityCheck');
    const roadCheck = document.getElementById('roadProximityCheck');

    let urbanLayer = null;
    let roadLayer = null;

    const normalizar = txt => String(txt || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    function scoreCamada(item, tipo) {
      const t = normalizar(`${item.title || ''} ${item.name || ''}`);
      let score = 0;
      if (t.includes('proxim')) score += 5;
      if (tipo === 'urban') {
        if (t.includes('urbaniz')) score += 8;
        if (t.includes('area urbana')) score += 8;
        if (t.includes('urbana')) score += 6;
        if (t.includes('urbano')) score += 5;
      } else {
        if (t.includes('pista')) score += 9;
        if (t.includes('rodovia')) score += 7;
        if (t.includes('estrada')) score += 6;
        if (t.includes('malha viaria')) score += 5;
      }
      if (t.includes('proxim') && (t.includes('fogo') || t.includes('evento'))) score += 2;
      return score;
    }

    function melhorCamada(items, tipo) {
      const pontuadas = items
        .map(item => ({item, score: scoreCamada(item, tipo)}))
        .filter(x => x.score >= 8)
        .sort((a, b) => b.score - a.score);
      return pontuadas[0]?.item || null;
    }

    function configurarToggle(wrap, check, layer, titulo) {
      wrap.classList.remove('loading', 'unavailable');
      check.disabled = false;
      wrap.title = `Camada oficial do CENSIPAM: ${titulo}`;
      check.addEventListener('change', () => {
        wrap.classList.toggle('on', check.checked);
        if (check.checked) {
          if (!map.hasLayer(layer)) layer.addTo(map);
        } else if (map.hasLayer(layer)) {
          map.removeLayer(layer);
        }
      });
    }

    function indisponivel(wrap, check) {
      wrap.classList.remove('loading');
      wrap.classList.add('unavailable');
      check.disabled = true;
      wrap.title = 'Camada oficial não localizada neste acesso ao CENSIPAM';
    }

    async function descobrir() {
      try {
        const url = `${WMS}?service=WMS&version=1.1.1&request=GetCapabilities&_=${Date.now()}`;
        const r = await fetch(url, {cache:'no-store'});
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const xml = new DOMParser().parseFromString(await r.text(), 'text/xml');
        const items = [...xml.querySelectorAll('Layer')]
          .map(el => ({
            name: el.querySelector(':scope > Name')?.textContent?.trim(),
            title: el.querySelector(':scope > Title')?.textContent?.trim()
          }))
          .filter(x => x.name);

        const urban = melhorCamada(items, 'urban');
        const road = melhorCamada(items, 'road');

        if (urban) {
          urbanLayer = L.tileLayer.wms(WMS, {
            layers: urban.name,
            format: 'image/png',
            transparent: true,
            version: '1.1.1',
            opacity: 1,
            pane: 'proximityUrbanPane',
            attribution: 'CENSIPAM — Proximidade com áreas urbanizadas'
          });
          configurarToggle(urbanWrap, urbanCheck, urbanLayer, urban.title || urban.name);
        } else indisponivel(urbanWrap, urbanCheck);

        if (road) {
          roadLayer = L.tileLayer.wms(WMS, {
            layers: road.name,
            format: 'image/png',
            transparent: true,
            version: '1.1.1',
            opacity: 1,
            pane: 'proximityRoadPane',
            attribution: 'CENSIPAM — Proximidade com pista'
          });
          configurarToggle(roadWrap, roadCheck, roadLayer, road.title || road.name);
        } else indisponivel(roadWrap, roadCheck);
      } catch (e) {
        console.warn('Falha ao descobrir camadas de proximidade do CENSIPAM', e);
        indisponivel(urbanWrap, urbanCheck);
        indisponivel(roadWrap, roadCheck);
      }
    }

    descobrir();
  }

  const observer = new MutationObserver(organizarRegua);
  observer.observe(actions, {childList:true, subtree:true});

  instalarRelevo();
  instalarProximidadesCensipam();

  const app = document.createElement('script');
  app.src = `js/gcif-spiderfy-app.js?v=${Date.now()}`;
  app.onload = () => {
    organizarRegua();
    instalarRelevo();
    instalarProximidadesCensipam();
    setTimeout(organizarRegua, 100);
    setTimeout(organizarRegua, 600);
    setTimeout(organizarRegua, 1600);
  };
  app.onerror = () => console.error('Falha ao carregar as interações do mapa operacional');
  document.head.appendChild(app);
})();