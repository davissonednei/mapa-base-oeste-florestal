/* Expansão radial (spiderfy) para GCIFs que ocupam exatamente o mesmo ponto. */
(() => {
  const style = document.createElement("style");
  style.textContent = `
    .gcif-cluster-icon{background:transparent!important;border:none!important}
    .gcif-cluster-bubble{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;gap:2px;background:#fff;border:3px solid #0d1721;box-shadow:0 4px 14px rgba(0,0,0,.42);font:900 18px/1 Inter,Segoe UI,Arial,sans-serif;color:#0d1721;cursor:pointer}
    .gcif-cluster-bubble span{font-size:20px}.gcif-cluster-bubble b{min-width:17px;height:17px;padding:0 4px;border-radius:999px;display:grid;place-items:center;background:#0d1721;color:#fff;font-size:10px;margin-left:-5px;margin-top:-19px}
    .accordion-title{display:flex!important;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;user-select:none;padding:9px 8px;margin:9px 0 0!important;border:1px solid #213243;border-radius:9px;background:#0a151f;color:#b8c8d4!important;transition:.15s ease}
    .accordion-title:hover{border-color:#334b60;background:#0d1a26}
    .accordion-title .acc-arrow{font-size:15px;line-height:1;transition:transform .18s ease;color:#f59e0b}
    .accordion-title.open .acc-arrow{transform:rotate(180deg)}
    .accordion-panel{display:none!important;margin-top:6px}
    .accordion-panel.open{display:flex!important}
    .gcif-nav-list{flex-direction:column;gap:5px}
    .gcif-nav{width:100%;display:grid;grid-template-columns:1fr auto;gap:8px;text-align:left;padding:9px 10px;border:1px solid transparent;border-radius:9px;background:#0a151f;color:white;cursor:pointer}
    .gcif-nav:hover{border-color:#334b60;background:#0d1a26}
    .gcif-nav-name{font-size:12px;font-weight:800}.gcif-nav-meta{font-size:9px;color:#9dafbe;margin-top:3px}
    .gcif-nav-status{align-self:center;font-size:8px;font-weight:900;border-radius:999px;padding:5px 7px;white-space:nowrap}
    .gcif-nav-status.status-prontidao{border:1px solid rgba(34,197,94,.45);background:rgba(34,197,94,.12);color:#9cebb8}
    .gcif-nav-status.status-prevencao{border:1px solid rgba(245,158,11,.45);background:rgba(245,158,11,.12);color:#ffd18a}
    .gcif-nav-status.status-combate{border:1px solid rgba(239,68,68,.45);background:rgba(239,68,68,.12);color:#ff9c9c}
    .gcif-nav-status.status-neutro{border:1px solid rgba(148,163,184,.4);background:rgba(148,163,184,.1);color:#cbd5e1}
    @media(max-width:820px){.accordion-title{display:flex!important}.accordion-panel{display:none!important}.accordion-panel.open{display:flex!important}}
  `;
  document.head.appendChild(style);

  const BASE_OESTE_EXATA = L.latLng(-12.148524, -44.996610);
  const EVENTOS_CACHE_URL = "dados/eventos_fogo.json";
  const gcifNavRefs = new Map();
  let spiderState = null;

  /*
   * O navegador no GitHub Pages não consulta mais a API CENSIPAM diretamente.
   * A sincronização é feita no servidor pelo GitHub Actions e gravada em
   * dados/eventos_fogo.json. Assim evitamos bloqueio CORS e exibimos exatamente
   * a resposta oficial de /api/v1/eventos?sigla_estado=BA.
   */
  if(map.hasLayer(censipamLayer)) map.removeLayer(censipamLayer);
  const eventosApiLayer = L.layerGroup().addTo(map);
  let eventosApiCarregados = 0;

  const notice = document.querySelector(".notice");
  if(notice){
    notice.innerHTML = "<b>Atualização automática:</b> informações operacionais e monitoramento integrado são sincronizados continuamente para manter o mapa atualizado.";
  }

  function configurarAccordion(titulo,painel){
    if(!titulo||!painel) return;
    titulo.classList.add("accordion-title");
    const texto=titulo.textContent.trim();
    titulo.innerHTML=`<span>${texto}</span><span class="acc-arrow">⌄</span>`;
    painel.classList.add("accordion-panel");
    titulo.setAttribute("role","button");
    titulo.setAttribute("tabindex","0");
    titulo.setAttribute("aria-expanded","false");
    const toggle=()=>{
      const abriu=!painel.classList.contains("open");
      painel.classList.toggle("open",abriu);
      titulo.classList.toggle("open",abriu);
      titulo.setAttribute("aria-expanded",String(abriu));
    };
    titulo.addEventListener("click",toggle);
    titulo.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle()}});
  }

  function prepararSidebar(){
    const titulos=[...document.querySelectorAll(".section-title")];
    const tituloMunicipios=titulos.find(el=>el.textContent.includes("Municípios da área Oeste"));
    const listaMunicipios=document.getElementById("munList");
    configurarAccordion(tituloMunicipios,listaMunicipios);

    const tituloBases=titulos.find(el=>el.textContent.includes("Bases do PLANOP"));
    if(tituloBases&&!document.getElementById("gcifNavList")){
      const titulo=document.createElement("div");
      titulo.className="section-title";
      titulo.textContent="Guarnições / GCIFs";
      const lista=document.createElement("div");
      lista.id="gcifNavList";
      lista.className="gcif-nav-list";
      tituloBases.parentNode.insertBefore(titulo,tituloBases);
      tituloBases.parentNode.insertBefore(lista,tituloBases);
      configurarAccordion(titulo,lista);
    }
  }

  prepararSidebar();

  const censipamBtn = document.getElementById("toggleCensipam");
  if(censipamBtn){
    censipamBtn.innerHTML = "🔥 Eventos de Fogo";
    censipamBtn.classList.remove("off");
    censipamBtn.onclick = () => {
      if(map.hasLayer(eventosApiLayer)){
        map.removeLayer(eventosApiLayer);
        censipamBtn.classList.add("off");
      }else{
        eventosApiLayer.addTo(map);
        censipamBtn.classList.remove("off");
      }
    };
  }

  document.querySelectorAll(".legend-row").forEach(row => {
    if(row.textContent.includes("CENSIPAM")) row.innerHTML = "🔥 Eventos ativos/observação — API CENSIPAM";
  });

  function setApiStatus(tipo,texto){
    if(typeof apiStatus === "undefined") return;
    apiStatus.classList.remove("ok","err");
    if(tipo) apiStatus.classList.add(tipo);
    const alvo=apiStatus.querySelector("span:last-child");
    if(alvo) alvo.textContent=texto;
  }

  function eventoGeoJson(evento){
    if(!evento?.geom?.coordinates?.length) return null;
    return {
      type:"Feature",
      properties:{
        id_evento:evento.id_evento,
        status_evento:evento.status_evento,
        municipio:evento.municipio,
        dt_maxima:evento.dt_maxima,
        dt_ultima_visao:evento.dt_ultima_visao,
        area_total_evento:evento.area_total_evento
      },
      geometry:{
        type:evento.geom.type || "Polygon",
        coordinates:evento.geom.coordinates
      }
    };
  }

  function popupEvento(evento){
    const municipio=evento.municipio||"Município não informado";
    const status=evento.status_evento||"Ativo / em observação";
    const ultima=evento.dt_ultima_visao?new Date(evento.dt_ultima_visao).toLocaleString("pt-BR"):"—";
    const area=Number.isFinite(evento.area_total_evento)?evento.area_total_evento.toLocaleString("pt-BR",{maximumFractionDigits:1}):"—";
    return `<div class="popup-title">🔥 Evento ${evento.id_evento}</div><div class="popup-row"><span>Município</span><b>${municipio}</b></div><div class="popup-row"><span>Status</span><b>${status}</b></div><div class="popup-row"><span>Última visão</span><b>${ultima}</b></div><div class="popup-row"><span>Área total</span><b>${area}</b></div><div class="popup-foot">Fonte: API oficial do Painel do Fogo / CENSIPAM.</div>`;
  }

  async function atualizarCensipam(){
    try{
      setApiStatus(null,"Carregando última sincronização do Painel do Fogo…");
      const r=await fetch(`${EVENTOS_CACHE_URL}?v=${Date.now()}`,{cache:"no-store"});
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const payload=await r.json();
      const eventos=Array.isArray(payload)?payload:payload?.eventos;
      const atualizadoEm=Array.isArray(payload)?null:payload?.atualizado_em;
      if(!Array.isArray(eventos)) throw new Error("Cache inválido");

      const novos=[];
      for(const evento of eventos){
        const feature=eventoGeoJson(evento);
        if(!feature) continue;
        const layer=L.geoJSON(feature,{
          pane:"censipamPane",
          style:{
            color:"#9ca3af",
            weight:2,
            opacity:.95,
            fillColor:"#9ca3af",
            fillOpacity:.28
          },
          interactive:true,
          onEachFeature:(_,l)=>l.bindPopup(()=>popupEvento(evento),{maxWidth:390})
        });
        novos.push(layer);
      }

      eventosApiLayer.clearLayers();
      novos.forEach(layer=>eventosApiLayer.addLayer(layer));
      eventosApiCarregados=eventos.length;

      if(atualizadoEm){
        const d=new Date(atualizadoEm);
        const hora=Number.isNaN(d.getTime())?"":` • ${d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`;
        setApiStatus("ok",`Painel do Fogo sincronizado — ${eventosApiCarregados} evento(s) na Bahia${hora}`);
      }else{
        setApiStatus(null,"Aguardando primeira sincronização automática do CENSIPAM…");
      }
    }catch(e){
      console.warn("Falha ao ler cache do Painel do Fogo",e);
      setApiStatus("err","Falha ao carregar a sincronização do Painel do Fogo");
    }
  }

  const clusterIcon = count => L.divIcon({
    className: "gcif-cluster-icon",
    html: `<div class="gcif-cluster-bubble"><span>🚒</span><b>${count}</b></div>`,
    iconSize: [46,46],
    iconAnchor: [23,52],
    popupAnchor: [0,-52]
  });

  function aplicarBaseOesteExata(){
    baseOesteCoord = {lat:BASE_OESTE_EXATA.lat,lng:BASE_OESTE_EXATA.lng};
    const oeste = BASES.find(b => b.id === "oeste");
    if(oeste){oeste.lat=BASE_OESTE_EXATA.lat;oeste.lng=BASE_OESTE_EXATA.lng}
    for(const layer of baseLayer.getLayers()){
      const popup = layer.getPopup?.();
      const content = popup?.getContent?.();
      if(typeof content === "string" && content.includes("Base Oeste")){
        layer.setLatLng(BASE_OESTE_EXATA);
        break;
      }
    }
  }

  function collapseSpider(){
    if(!spiderState) return;
    [...spiderState.lines,...spiderState.markers].forEach(layer => {
      if(guarnicaoLayer.hasLayer(layer)) guarnicaoLayer.removeLayer(layer);
    });
    spiderState = null;
  }

  function expandGrupo(grupo, clusterMarker, focusId=null){
    if(spiderState?.clusterMarker === clusterMarker && !focusId){
      collapseSpider();
      return;
    }
    collapseSpider();
    map.closePopup();

    const center = L.latLng(grupo.lat, grupo.lng);
    const centerPx = map.latLngToLayerPoint(center);
    const n = grupo.ids.length;
    const radius = n <= 4 ? 62 : Math.min(92, 55 + n * 5);
    const lines = [], markers = [];
    let focusMarker=null;

    grupo.ids.forEach((id,i) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * i / n);
      const childPx = L.point(
        centerPx.x + Math.cos(angle) * radius,
        centerPx.y + Math.sin(angle) * radius
      );
      const childLatLng = map.layerPointToLatLng(childPx);
      const line = L.polyline([center,childLatLng],{
        color:"#64748b",weight:1.5,opacity:.72,dashArray:"3 4",interactive:false
      }).addTo(guarnicaoLayer);
      const marker = L.marker(childLatLng,{
        icon:guarnicaoIcon,keyboard:false,zIndexOffset:1000
      }).addTo(guarnicaoLayer);
      marker.bindTooltip(`GCIF ${id}`,{direction:"top",offset:[0,-17]});
      marker.bindPopup(() => popupGrupo({ids:[id]}),{maxWidth:440});
      if(id===focusId) focusMarker=marker;
      lines.push(line); markers.push(marker);
    });

    spiderState = {clusterMarker,lines,markers};
    if(focusMarker) setTimeout(()=>focusMarker.openPopup(),50);
  }

  function irParaGcif(id){
    const ref=gcifNavRefs.get(id);
    if(!ref) return;
    const alvo=[ref.grupo.lat,ref.grupo.lng];
    const zoom=Math.max(map.getZoom(),13);
    map.setView(alvo,zoom,{animate:true});
    setTimeout(()=>{
      if(ref.cluster) expandGrupo(ref.grupo,ref.marker,id);
      else ref.marker.openPopup();
    },250);
  }

  function renderListaGcifs(){
    const box=document.getElementById("gcifNavList");
    if(!box) return;
    box.innerHTML="";
    Object.keys(GCIFS_DATA).sort((a,b)=>Number(a)-Number(b)).forEach(id=>{
      const g=GCIFS_DATA[id];
      const btn=document.createElement("button");
      btn.className="gcif-nav";
      const viatura=VIATURAS.porGcif?.[id];
      const detalhe=[g.municipio,viatura?`🚒 ${viatura}`:null].filter(Boolean).join(" • ");
      btn.innerHTML=`<div><div class="gcif-nav-name">GCIF ${id}</div><div class="gcif-nav-meta">${detalhe}</div></div><span class="gcif-nav-status ${statusClasse(g.status)}">${g.status||"—"}</span>`;
      btn.onclick=()=>irParaGcif(id);
      box.appendChild(btn);
    });
  }

  // Substitui somente a renderização dos marcadores; dados, popups e regras continuam no index.
  renderGCIFs = function(){
    collapseSpider();
    guarnicaoLayer.clearLayers();
    gcifNavRefs.clear();
    const grupos = agruparGcifs(), latlngs = [];

    for(const grupo of grupos){
      let marker;
      if(grupo.ids.length > 1){
        marker = L.marker([grupo.lat,grupo.lng],{
          icon:clusterIcon(grupo.ids.length),keyboard:false,zIndexOffset:900
        }).addTo(guarnicaoLayer);
        marker.bindTooltip(`${tituloGrupo(grupo.ids)} • clique para abrir`,{
          direction:"top",offset:[0,-39]
        });
        marker.on("click", e => {
          if(e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
          expandGrupo(grupo, marker);
        });
        grupo.ids.forEach(id=>gcifNavRefs.set(id,{marker,grupo,cluster:true}));
      }else{
        marker = L.marker([grupo.lat,grupo.lng],{
          icon:guarnicaoIcon,keyboard:false
        }).addTo(guarnicaoLayer);
        marker.bindTooltip(tituloGrupo(grupo.ids),{direction:"top",offset:[0,-17]});
        marker.bindPopup(() => popupGrupo(grupo),{maxWidth:440});
        gcifNavRefs.set(grupo.ids[0],{marker,grupo,cluster:false});
      }
      latlngs.push([grupo.lat,grupo.lng]);
    }

    gcifBounds = latlngs.length ? L.latLngBounds(latlngs) : null;
    document.getElementById("gcifCount").textContent = Object.keys(GCIFS_DATA).length;
    document.getElementById("pointCount").textContent = grupos.length;
    renderListaGcifs();
  };

  map.on("click", collapseSpider);
  map.on("zoomstart", collapseSpider);

  // O navegador só lê o cache local; o servidor sincroniza a API oficial a cada 5 minutos.
  atualizarCensipam();
  setInterval(atualizarCensipam,120000);
  window.addEventListener("focus",atualizarCensipam);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)atualizarCensipam()});

  // Garante a coordenada real da Base Oeste e a nova renderização após o GeoJSON carregar.
  const waitForMap = setInterval(() => {
    if(!mapReady) return;
    clearInterval(waitForMap);
    aplicarBaseOesteExata();
    renderGCIFs();
  },250);
})();
