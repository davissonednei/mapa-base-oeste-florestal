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
  let spiderState = null;

  /*
   * O mapa principal usava tb_evento, que inclui o universo de eventos do Painel do Fogo.
   * Para reproduzir a camada operacional exibida no painel, usamos a camada
   * CENSIPAM - Frente de Fogo (24h), publicada no mesmo GeoServer.
   */
  const frenteFogo24hLayer = L.tileLayer.wms(
    "https://panorama.sipam.gov.br/geoserver/painel_do_fogo/wms",
    {
      layers:"painel_do_fogo:mv_indicadores_queimadas",
      format:"image/png",
      transparent:true,
      version:"1.1.1",
      opacity:1,
      pane:"censipamPane",
      attribution:"CENSIPAM — Frente de Fogo (24h)"
    }
  );

  // Retira a antiga camada de eventos e deixa somente a Frente de Fogo (24h).
  if(map.hasLayer(censipamLayer)) map.removeLayer(censipamLayer);
  frenteFogo24hLayer.addTo(map);

  const censipamBtn = document.getElementById("toggleCensipam");
  if(censipamBtn){
    censipamBtn.innerHTML = "🔥 Frente de Fogo 24h";
    censipamBtn.classList.remove("off");
    censipamBtn.onclick = () => {
      if(map.hasLayer(frenteFogo24hLayer)){
        map.removeLayer(frenteFogo24hLayer);
        censipamBtn.classList.add("off");
      }else{
        frenteFogo24hLayer.addTo(map);
        censipamBtn.classList.remove("off");
      }
    };
  }

  // Atualiza a legenda sem precisar alterar a estrutura do index principal.
  document.querySelectorAll(".legend-row").forEach(row => {
    if(row.textContent.includes("CENSIPAM")) row.innerHTML = "🔥 Frente de Fogo (24h) — CENSIPAM";
  });

  // O status passa a refletir a nova camada operacional.
  if(typeof apiStatus !== "undefined"){
    apiStatus.classList.remove("ok","err");
    apiStatus.querySelector("span:last-child").textContent = "Conectando à Frente de Fogo (24h) do CENSIPAM…";
    frenteFogo24hLayer.on("load",()=>{
      apiStatus.classList.remove("err");
      apiStatus.classList.add("ok");
      apiStatus.querySelector("span:last-child").textContent = "CENSIPAM conectado — Frente de Fogo das últimas 24h";
    });
    frenteFogo24hLayer.on("tileerror",()=>{
      apiStatus.classList.remove("ok");
      apiStatus.classList.add("err");
      apiStatus.querySelector("span:last-child").textContent = "Frente de Fogo (24h) não respondeu nesta tentativa";
    });
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

  // Força nova consulta ao CENSIPAM para evitar imagens WMS antigas em cache.
  function atualizarCensipam(){
    frenteFogo24hLayer.setParams({_:Date.now()});
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

  // Mantém a camada do Painel do Fogo fresca durante o uso do mapa.
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
