/* Loader do mapa operacional: mantém uma única régua visível e adiciona relevo ao modo satélite. */
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

    /* OpenTopoMap por cima da imagem de satélite: relevo, curvas de nível e altitude ficam perceptíveis. */
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

  const observer = new MutationObserver(organizarRegua);
  observer.observe(actions, {childList:true, subtree:true});

  instalarRelevo();

  const app = document.createElement('script');
  app.src = `js/gcif-spiderfy-app.js?v=${Date.now()}`;
  app.onload = () => {
    organizarRegua();
    instalarRelevo();
    setTimeout(organizarRegua, 100);
    setTimeout(organizarRegua, 600);
    setTimeout(organizarRegua, 1600);
  };
  app.onerror = () => console.error('Falha ao carregar as interações do mapa operacional');
  document.head.appendChild(app);
})();