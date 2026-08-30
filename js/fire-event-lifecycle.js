/* Ciclo de vida dos Eventos de Fogo — mesma lógica operacional do Painel do Fogo,
   preservando eventos extintos recentes para leitura de tempo sem nova detecção. */
(() => {
  if (typeof map === 'undefined' || typeof L === 'undefined') return;
  if (window.__fireEventLifecycleInstalled) return;
  window.__fireEventLifecycleInstalled = true;

  const WFS_URL = 'https://panorama.sipam.gov.br/geoserver/painel_do_fogo/wfs';
  const TYPE_NAME = 'painel_do_fogo:tb_evento';
  const RECENT_EXTINCT_DAYS = 30;
  const MAX_FEATURES = 800;
  const CACHE_MS = 3 * 60 * 1000;

  let lifecycleLayer = null;
  let installed = false;
  let enabled = true;
  let loading = false;
  let reloadTimer = null;
  let lastKey = '';
  let lastLoadedAt = 0;
  let lastFeatures = [];

  function norm(v){
    return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function prop(p, names){
    for (const name of names) {
      if (p && p[name] !== undefined && p[name] !== null && p[name] !== '') return p[name];
    }
    const keys = Object.keys(p || {});
    for (const name of names) {
      const wanted = norm(name).replace(/[^a-z0-9]/g, '');
      const key = keys.find(k => norm(k).replace(/[^a-z0-9]/g, '') === wanted);
      if (key && p[key] !== undefined && p[key] !== null && p[key] !== '') return p[key];
    }
    return null;
  }

  function num(v){
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function parseDate(v){
    if (!v) return null;
    if (v instanceof Date && Number.isFinite(v.getTime())) return v;
    let s = String(v).trim();
    if (!s) return null;
    let d = new Date(s);
    if (Number.isFinite(d.getTime())) return d;
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
      d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0));
      if (Number.isFinite(d.getTime())) return d;
    }
    return null;
  }

  function firstSeen(p){
    return parseDate(prop(p, ['dt_minima','dt_primeira_visao','dt_primeira_deteccao','data_inicio','dt_inicio']));
  }

  function lastSeen(p){
    return parseDate(prop(p, ['dt_maxima','dt_ultima_visao','dt_ult_visao','dt_ultima_deteccao','data_fim','dt_fim']));
  }

  function statusId(p){
    const n = num(prop(p, ['id_status_evento','status_evento_id','status_id']));
    return Number.isFinite(n) ? n : null;
  }

  function statusFromAge(p){
    const id = statusId(p);
    if ([1,2,3,4].includes(id)) return id;
    const last = lastSeen(p);
    if (!last) return null;
    const hours = Math.max(0, (Date.now() - last.getTime()) / 3600000);
    if (hours <= 48) return 1;
    if (hours < 120) return 2;
    return 3;
  }

  function statusMeta(p){
    const id = statusFromAge(p);
    if (id === 1) return {id, label:'Ativo', color:'#ef4444', fill:'#dc2626', opacity:.31, weight:1.8};
    if (id === 2) return {id, label:'Em observação', color:'#f59e0b', fill:'#f59e0b', opacity:.23, weight:1.6};
    if (id === 4) return {id, label:'Extinto por fusão', color:'#64748b', fill:'#64748b', opacity:.10, weight:1.0, dash:'3 4'};
    return {id:3, label:'Extinto', color:'#64748b', fill:'#64748b', opacity:.13, weight:1.1};
  }

  function formatDate(d){
    if (!d) return 'não informado';
    return d.toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  }

  function elapsedSince(d){
    if (!d) return 'tempo não disponível';
    const ms = Math.max(0, Date.now() - d.getTime());
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remMin = minutes % 60;
    if (hours < 24) return `${hours}h${remMin ? ` ${remMin}min` : ''}`;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days} dia${days === 1 ? '' : 's'}${remHours ? ` e ${remHours}h` : ''}`;
  }

  function eventId(p){
    return prop(p, ['id','id_evento','evento_id','gid','objectid']) ?? '—';
  }

  function areaText(p){
    const raw = prop(p, ['area_km2','area_km','area','area_acumulada_km2']);
    const n = num(raw);
    if (!Number.isFinite(n)) return null;
    return `${n.toLocaleString('pt-BR',{maximumFractionDigits:2})} km²`;
  }

  function popupHtml(feature){
    const p = feature?.properties || {};
    const meta = statusMeta(p);
    const first = firstSeen(p);
    const last = lastSeen(p);
    const area = areaText(p);
    const persistence = prop(p, ['persistencia_dias','persistencia','dias_persistencia']);
    const detections = prop(p, ['qtd_deteccoes','quantidade_deteccoes','n_deteccoes','num_deteccoes']);
    const municipality = prop(p, ['municipio','nm_municipio','nome_municipio']);
    const uf = prop(p, ['uf','sigla_uf']);
    const mergedNote = meta.id === 4
      ? '<div style="margin-top:7px;padding-top:7px;border-top:1px solid #263949;color:#aab7c2;font-size:9px;line-height:1.4">Evento encerrado por fusão com outro evento; isso não significa necessariamente ausência de fogo na área.</div>'
      : '';

    const rows = [
      ['Status', `<b style="color:${meta.color}">${meta.label}</b>`],
      ['Última detecção', formatDate(last)],
      ['Sem nova detecção', `<b>${elapsedSince(last)}</b>`],
      ['Primeira detecção', formatDate(first)],
      municipality || uf ? ['Local', [municipality, uf].filter(Boolean).join(' / ')] : null,
      area ? ['Área', area] : null,
      persistence !== null && persistence !== undefined ? ['Persistência', `${persistence} dia${Number(persistence) === 1 ? '' : 's'}`] : null,
      detections !== null && detections !== undefined ? ['Detecções', detections] : null
    ].filter(Boolean);

    return `<div style="min-width:270px">
      <div style="font-size:15px;font-weight:900;margin-bottom:8px">🔥 Evento de Fogo #${eventId(p)}</div>
      ${rows.map(([k,v]) => `<div class="popup-row"><span>${k}</span><span style="text-align:right">${v}</span></div>`).join('')}
      <div class="popup-foot">Classificação operacional baseada no ciclo de vida do Painel do Fogo/CENSIPAM. Ativo: detecção nas últimas 48h; observação: última detecção entre 2 e 4 dias; após esse período, extinto.</div>
      ${mergedNote}
    </div>`;
  }

  function styleFeature(feature){
    const meta = statusMeta(feature?.properties || {});
    return {
      color: meta.color,
      weight: meta.weight,
      opacity: meta.id >= 3 ? .72 : .94,
      fillColor: meta.fill,
      fillOpacity: meta.opacity,
      dashArray: meta.dash || null
    };
  }

  function ensurePane(){
    if (!map.getPane('eventLifecyclePane')) map.createPane('eventLifecyclePane');
    const pane = map.getPane('eventLifecyclePane');
    pane.style.zIndex = 432;
    pane.style.pointerEvents = 'auto';
  }

  function buildLayer(features){
    ensurePane();
    return L.geoJSON({type:'FeatureCollection',features}, {
      pane:'eventLifecyclePane',
      style: styleFeature,
      onEachFeature(feature, layer){
        const p = feature.properties || {};
        const meta = statusMeta(p);
        const last = lastSeen(p);
        layer.bindTooltip(`Evento #${eventId(p)} • ${meta.label}${last ? ` • sem detecção há ${elapsedSince(last)}` : ''}`, {sticky:true, direction:'top'});
        layer.bindPopup(() => popupHtml(feature), {maxWidth:390});
        layer.on('mouseover', () => layer.setStyle({weight:Math.max(2.4, meta.weight + 1), fillOpacity:Math.min(.40, meta.opacity + .10)}));
        layer.on('mouseout', () => layer.setStyle(styleFeature(feature)));
      }
    });
  }

  function bboxKey(){
    const b = map.getBounds();
    return [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].map(v => v.toFixed(3)).join('|');
  }

  function bboxParam(){
    const b = map.getBounds();
    return `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()},EPSG:4326`;
  }

  function cutoffIso(){
    const d = new Date(Date.now() - RECENT_EXTINCT_DAYS * 86400000);
    d.setUTCHours(0,0,0,0);
    return d.toISOString().replace('.000Z','Z');
  }

  function makeUrl({withDate=true, withSort=true} = {}){
    const params = new URLSearchParams({
      service:'WFS',
      version:'1.1.0',
      request:'GetFeature',
      typeName:TYPE_NAME,
      outputFormat:'application/json',
      srsName:'EPSG:4326',
      bbox:bboxParam(),
      maxFeatures:String(MAX_FEATURES)
    });
    const filter = withDate
      ? `id_status_evento IN (1,2) OR (id_status_evento IN (3,4) AND dt_maxima >= '${cutoffIso()}')`
      : `id_status_evento IN (1,2,3,4)`;
    params.set('CQL_FILTER', filter);
    if (withSort) params.set('sortBy','dt_maxima+D');
    params.set('_',String(Date.now()));
    return `${WFS_URL}?${params.toString()}`;
  }

  async function fetchGeoJson(){
    const attempts = [
      {withDate:true, withSort:true},
      {withDate:false, withSort:true},
      {withDate:false, withSort:false}
    ];
    let lastError = null;
    for (const attempt of attempts) {
      try {
        const response = await fetch(makeUrl(attempt), {cache:'no-store'});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data || !Array.isArray(data.features)) throw new Error('GeoJSON inválido');
        return data.features;
      } catch (e) {
        lastError = e;
      }
    }
    throw lastError || new Error('WFS indisponível');
  }

  function updateLegend(){
    const legend = document.querySelector('.fire-legend');
    if (!legend || legend.querySelector('[data-lifecycle-legend]')) return;
    const box = document.createElement('div');
    box.dataset.lifecycleLegend = '1';
    box.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px solid #213243';
    box.innerHTML = `
      <div class="legend-title">Ciclo do Evento de Fogo</div>
      <div class="age-row"><span class="age-swatch" style="background:#dc2626"></span>Ativo — detecção até 48h</div>
      <div class="age-row"><span class="age-swatch" style="background:#f59e0b"></span>Em observação — 2 a 4 dias</div>
      <div class="age-row"><span class="age-swatch" style="background:#64748b"></span>Extinto recente — sem detecção</div>
      <div style="font-size:8px;color:#7f93a4;margin-top:5px;line-height:1.35">Extintos recentes ficam visíveis para indicar há quanto tempo o evento não recebe novas detecções.</div>`;
    legend.appendChild(box);
  }

  function updateApiDetail(features){
    const counts = {1:0,2:0,3:0,4:0};
    for (const f of features) {
      const id = statusFromAge(f.properties || {});
      if (counts[id] !== undefined) counts[id]++;
    }
    try {
      if (typeof setApi === 'function') {
        setApi(true, `Eventos CENSIPAM: ${counts[1]} ativos • ${counts[2]} em observação • ${counts[3]} extintos recentes${counts[4] ? ` • ${counts[4]} fundidos` : ''}. Clique no polígono para ver o tempo sem nova detecção.`);
      }
    } catch (_) {}
  }

  function replaceLayer(features){
    const newLayer = buildLayer(features);
    if (lifecycleLayer && map.hasLayer(lifecycleLayer)) map.removeLayer(lifecycleLayer);
    lifecycleLayer = newLayer;
    if (enabled) lifecycleLayer.addTo(map);

    /* Só remove a camada WMS antiga depois que o WFS realmente funcionou. */
    try {
      if (typeof censipamLayer !== 'undefined' && map.hasLayer(censipamLayer)) map.removeLayer(censipamLayer);
    } catch (_) {}

    lastFeatures = features;
    installed = true;
    installToggle();
    updateLegend();
    updateApiDetail(features);
  }

  async function reload(force=false){
    if (!enabled || loading) return;
    const key = bboxKey();
    if (!force && key === lastKey && Date.now() - lastLoadedAt < CACHE_MS) return;
    loading = true;
    try {
      const features = await fetchGeoJson();
      replaceLayer(features);
      lastKey = key;
      lastLoadedAt = Date.now();
    } catch (e) {
      console.warn('WFS de Eventos de Fogo indisponível; mantendo camada WMS original.', e);
      if (!installed) {
        try {
          if (typeof censipamLayer !== 'undefined' && !map.hasLayer(censipamLayer)) censipamLayer.addTo(map);
        } catch (_) {}
      }
    } finally {
      loading = false;
    }
  }

  function scheduleReload(){
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => reload(false), 450);
  }

  function installToggle(){
    const btn = document.getElementById('toggleCensipam');
    if (!btn || btn.dataset.lifecycleToggle === '1') return;
    btn.dataset.lifecycleToggle = '1';
    btn.title = 'Eventos de Fogo: ativos, em observação e extintos recentes';
    btn.onclick = () => {
      enabled = !enabled;
      btn.classList.toggle('off', !enabled);
      if (enabled) {
        if (lifecycleLayer && !map.hasLayer(lifecycleLayer)) lifecycleLayer.addTo(map);
        reload(false);
      } else if (lifecycleLayer && map.hasLayer(lifecycleLayer)) {
        map.removeLayer(lifecycleLayer);
      }
    };
  }

  map.on('moveend', scheduleReload);
  updateLegend();
  reload(true);
})();
