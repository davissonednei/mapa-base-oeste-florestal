/* Expansão radial (spiderfy) para GCIFs que ocupam exatamente o mesmo ponto. */
(() => {
  const style = document.createElement("style");
  style.textContent = `
    .gcif-cluster-icon{background:transparent!important;border:none!important}
    .gcif-cluster-bubble{width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;gap:2px;background:#fff;border:3px solid #0d1721;box-shadow:0 4px 14px rgba(0,0,0,.42);font:900 18px/1 Inter,Segoe UI,Arial,sans-serif;color:#0d1721;cursor:pointer}
    .gcif-cluster-bubble span{font-size:20px}.gcif-cluster-bubble b{min-width:17px;height:17px;padding:0 4px;border-radius:999px;display:grid;place-items:center;background:#0d1721;color:#fff;font-size:10px;margin-left:-5px;margin-top:-19px}
  `;
  document.head.appendChild(style);

  const BASE_OESTE_EXATA = L.latLng(-12.148524, -44.996610);
  const EVENTOS_CACHE_URL = "dados/eventos_fogo.json";
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

  function expandGrupo(grupo, clusterMarker){
    if(spiderState?.clusterMarker === clusterMarker){
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
      lines.push(line); markers.push(marker);
    });

    spiderState = {clusterMarker,lines,markers};
  }

  // Substitui somente a renderização dos marcadores; dados, popups e regras continuam no index.
  renderGCIFs = function(){
    collapseSpider();
    guarnicaoLayer.clearLayers();
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
      }else{
        marker = L.marker([grupo.lat,grupo.lng],{
          icon:guarnicaoIcon,keyboard:false
        }).addTo(guarnicaoLayer);
        marker.bindTooltip(tituloGrupo(grupo.ids),{direction:"top",offset:[0,-17]});
        marker.bindPopup(() => popupGrupo(grupo),{maxWidth:440});
      }
      latlngs.push([grupo.lat,grupo.lng]);
    }

    gcifBounds = latlngs.length ? L.latLngBounds(latlngs) : null;
    document.getElementById("gcifCount").textContent = Object.keys(GCIFS_DATA).length;
    document.getElementById("pointCount").textContent = grupos.length;
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
