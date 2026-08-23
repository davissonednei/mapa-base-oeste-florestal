/* Expansão radial (spiderfy) para GCIFs que ocupam exatamente o mesmo ponto. */
(() => {
  const style = document.createElement("style");
  style.textContent = `
    .gcif-cluster-icon{background:transparent!important;border:none!important}
    .gcif-cluster-bubble{position:relative;width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;gap:2px;background:#fff;border:3px solid #0d1721;box-shadow:0 4px 14px rgba(0,0,0,.42);font:900 18px/1 Inter,Segoe UI,Arial,sans-serif;color:#0d1721;cursor:pointer}
    .gcif-cluster-bubble span{font-size:20px}.gcif-cluster-bubble b{min-width:17px;height:17px;padding:0 4px;border-radius:999px;display:grid;place-items:center;background:#0d1721;color:#fff;font-size:10px;margin-left:-5px;margin-top:-19px}
    .gcif-marker-wrap{position:relative;width:46px;height:46px}.gcif-marker-wrap .pin{position:absolute;left:4px;top:4px}
    .marker-status,.cluster-status{position:absolute;width:13px;height:13px;border-radius:50%;border:2px solid #0d1721;box-shadow:0 2px 5px rgba(0,0,0,.35)}
    .marker-status{right:0;bottom:0}.cluster-status{right:-4px;bottom:-4px}
    .marker-combate{background:#ef4444}.marker-prontidao{background:#22c55e}.marker-deslocamento{background:#f59e0b}.marker-neutro{background:#94a3b8}
    .marker-equip,.cluster-equip{position:absolute;display:grid;place-items:center;background:#0d1721;border:1px solid rgba(255,255,255,.8);box-shadow:0 2px 6px rgba(0,0,0,.42);border-radius:999px;font-style:normal;line-height:1}
    .marker-equip{left:-5px;top:-7px;width:24px;height:24px;font-size:14px}.cluster-equip{left:-9px;top:-10px;width:25px;height:25px;font-size:14px}
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
    header .brand{flex:none}.header-ops-summary{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;gap:7px;margin:0 16px}
    .ops-stat{min-width:72px;height:45px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid #213243;border-radius:10px;background:#0b1621;padding:4px 8px;white-space:nowrap}
    .ops-stat b{font-size:16px;line-height:1;color:#f8fafc}.ops-stat span{font-size:8px;line-height:1.1;margin-top:4px;color:#8ea2b3;font-weight:800;letter-spacing:.05em;text-transform:uppercase}
    .ops-stat.combate{border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.08)}.ops-stat.combate b{color:#ff9c9c}
    .ops-stat.prontidao{border-color:rgba(34,197,94,.3);background:rgba(34,197,94,.07)}.ops-stat.prontidao b{color:#9cebb8}
    .ops-stat.deslocamento{border-color:rgba(245,158,11,.3);background:rgba(245,158,11,.07)}.ops-stat.deslocamento b{color:#ffd18a}
    .ops-search-results{display:none;position:relative;z-index:950;margin-top:-1px;margin-bottom:7px;border:1px solid #2c4152;border-radius:0 0 9px 9px;background:#07121c;overflow:hidden;box-shadow:0 8px 18px rgba(0,0,0,.28)}
    .ops-search-results.show{display:block}.ops-search-item{width:100%;border:0;border-bottom:1px solid #1d2d3b;background:transparent;color:white;text-align:left;padding:8px 10px;cursor:pointer}.ops-search-item:last-child{border-bottom:0}.ops-search-item:hover{background:#0d1c29}.ops-search-item b{display:block;font-size:11px}.ops-search-item small{display:block;color:#8fa4b5;font-size:9px;margin-top:3px}
    .gcif-quick-card{display:none;margin:8px 0 9px;border:1px solid #2b4153;border-radius:11px;background:#0a151f;overflow:hidden;box-shadow:0 7px 18px rgba(0,0,0,.18)}.gcif-quick-card.show{display:block}
    .quick-head{display:flex;align-items:center;gap:7px;padding:9px 10px;border-bottom:1px solid #213243}.quick-title{font-size:13px;font-weight:900;margin-right:auto}.quick-close{border:0;background:transparent;color:#7f93a4;font-size:16px;cursor:pointer;padding:0 2px}.quick-status{font-size:8px;font-weight:900;border-radius:999px;padding:5px 7px;white-space:nowrap}
    .quick-status.status-combate{color:#ff9c9c;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4)}.quick-status.status-prontidao{color:#9cebb8;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.35)}.quick-status.status-deslocamento{color:#ffd18a;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35)}.quick-status.status-neutro{color:#cbd5e1;background:rgba(148,163,184,.1);border:1px solid rgba(148,163,184,.35)}
    .quick-body{padding:9px 10px}.quick-place{font-size:10px;color:#9dafbe;margin-bottom:8px}.quick-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px}.quick-metric{border:1px solid #1f3040;border-radius:8px;background:#0d1a26;padding:7px}.quick-metric span{display:block;font-size:8px;color:#8399ab;text-transform:uppercase;font-weight:800}.quick-metric b{display:block;font-size:11px;color:#fff;margin-top:3px}
    .quick-line{font-size:10px;line-height:1.45;margin-top:5px;color:#dbe6ee}.quick-line span{color:#8298aa}.quick-resource{margin-top:7px;border:1px solid rgba(56,189,248,.3);background:rgba(56,189,248,.08);color:#b8e8ff;border-radius:8px;padding:7px 8px;font-size:10px;font-weight:800}
    @media(max-width:1180px){.ops-stat{min-width:60px;padding:4px 6px}.ops-stat b{font-size:14px}.ops-stat:nth-child(6){display:none}}
    @media(max-width:920px){.header-ops-summary{display:none}}
    @media(max-width:820px){.accordion-title{display:flex!important}.accordion-panel{display:none!important}.accordion-panel.open{display:flex!important}}
  `;
  document.head.appendChild(style);

  const BASE_OESTE_EXATA = L.latLng(-12.150803, -44.998157);
  const EVENTOS_CACHE_URL = "dados/eventos_fogo.json";
  const gcifNavRefs = new Map();
  let spiderState = null;
  let gcifSelecionada = null;

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

  function prepararResumoCabecalho(){
    const header=document.querySelector("header");
    if(!header||document.getElementById("headerOpsSummary")) return;
    const tag=header.querySelector(".tag");
    const box=document.createElement("div");
    box.id="headerOpsSummary";
    box.className="header-ops-summary";
    box.innerHTML=`<div class="ops-stat"><b>—</b><span>GCIFs</span></div>`;
    header.insertBefore(box,tag||null);
  }

  function atualizarResumoCabecalho(){
    const box=document.getElementById("headerOpsSummary");
    if(!box) return;
    const ids=Object.keys(GCIFS_DATA||{});
    const contar=trecho=>ids.filter(id=>norm(GCIFS_DATA[id]?.status).includes(trecho)).length;
    const combate=contar("combate");
    const prontidao=contar("prontidao");
    const deslocamento=ids.filter(id=>norm(GCIFS_DATA[id]?.status).includes("desloc")).length;
    const efetivo=Object.values(EFETIVO_GCIFS||{}).reduce((s,e)=>s+(Array.isArray(e)?e.length:0),0);
    const viaturas=ids.filter(id=>VIATURAS?.porGcif?.[id]).length;
    box.innerHTML=`
      <div class="ops-stat"><b>${ids.length}</b><span>GCIFs</span></div>
      <div class="ops-stat combate"><b>${combate}</b><span>Combate</span></div>
      <div class="ops-stat prontidao"><b>${prontidao}</b><span>Prontidão</span></div>
      <div class="ops-stat deslocamento"><b>${deslocamento}</b><span>Desloc.</span></div>
      <div class="ops-stat"><b>${efetivo}</b><span>BM</span></div>
      <div class="ops-stat"><b>${viaturas}</b><span>Viaturas</span></div>`;
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

    const search=document.getElementById("search");
    if(search){
      search.placeholder="Buscar município, GCIF, militar ou viatura...";
      if(!document.getElementById("opsSearchResults")){
        const results=document.createElement("div");
        results.id="opsSearchResults";
        results.className="ops-search-results";
        search.insertAdjacentElement("afterend",results);
      }
      if(!document.getElementById("gcifQuickCard")){
        const card=document.createElement("div");
        card.id="gcifQuickCard";
        card.className="gcif-quick-card";
        const results=document.getElementById("opsSearchResults");
        (results||search).insertAdjacentElement("afterend",card);
      }
    }
  }

  prepararResumoCabecalho();
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

  function statusIndicadorClasse(status){
    const s=norm(status);
    if(s.includes("combate")) return "marker-combate";
    if(s.includes("prontidao")) return "marker-prontidao";
    if(s.includes("desloc")) return "marker-deslocamento";
    return "marker-neutro";
  }

  function quickStatusClasse(status){
    const s=norm(status);
    if(s.includes("combate")) return "status-combate";
    if(s.includes("prontidao")) return "status-prontidao";
    if(s.includes("desloc")) return "status-deslocamento";
    return "status-neutro";
  }

  function recursosGcif(id){
    return (EFETIVO_GCIFS?.[id]||[]).filter(m=>m.equipamento);
  }

  function temDrone(id){
    return recursosGcif(id).some(m=>norm(m.equipamento).includes("drone"));
  }

  function iconGcif(id){
    const g=GCIFS_DATA[id]||{};
    const drone=temDrone(id)?'<i class="marker-equip" title="Drone">🚁</i>':"";
    return L.divIcon({
      className:"guarnicao-pin special-gcif-icon",
      html:`<div class="gcif-marker-wrap"><div class="pin">🚒</div><i class="marker-status ${statusIndicadorClasse(g.status)}"></i>${drone}</div>`,
      iconSize:[46,46],iconAnchor:[23,23],popupAnchor:[0,-23]
    });
  }

  function statusGrupoIndicador(ids){
    const sts=ids.map(id=>GCIFS_DATA[id]?.status||"");
    if(sts.some(s=>norm(s).includes("combate"))) return "marker-combate";
    if(sts.some(s=>norm(s).includes("desloc"))) return "marker-deslocamento";
    if(sts.some(s=>norm(s).includes("prontidao"))) return "marker-prontidao";
    return "marker-neutro";
  }

  const clusterIcon = grupo => {
    const drone=grupo.ids.some(temDrone)?'<em class="cluster-equip" title="Há drone neste ponto">🚁</em>':"";
    return L.divIcon({
      className:"gcif-cluster-icon",
      html:`<div class="gcif-cluster-bubble"><span>🚒</span><b>${grupo.ids.length}</b><i class="cluster-status ${statusGrupoIndicador(grupo.ids)}"></i>${drone}</div>`,
      iconSize:[46,46],iconAnchor:[23,52],popupAnchor:[0,-52]
    });
  };

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
        icon:iconGcif(id),keyboard:false,zIndexOffset:1000
      }).addTo(guarnicaoLayer);
      const extras=temDrone(id)?" • 🚁 Drone":"";
      marker.bindTooltip(`GCIF ${id} • ${GCIFS_DATA[id]?.status||"—"}${extras}`,{direction:"top",offset:[0,-20]});
      marker.bindPopup(() => popupGrupo({ids:[id]}),{maxWidth:440});
      if(id===focusId) focusMarker=marker;
      lines.push(line); markers.push(marker);
    });

    spiderState = {clusterMarker,lines,markers};
    if(focusMarker) setTimeout(()=>focusMarker.openPopup(),50);
  }

  function renderFichaRapida(id){
    const card=document.getElementById("gcifQuickCard");
    const g=GCIFS_DATA?.[id];
    if(!card||!g) return;
    gcifSelecionada=id;
    const equipe=EFETIVO_GCIFS?.[id]||[];
    const viatura=VIATURAS?.porGcif?.[id]||"—";
    const cmd=equipe.filter(m=>norm(m.funcao)==="cmd").map(m=>`${m.posto} ${m.nome}`).join(", ")||"—";
    const cond=equipe.filter(m=>norm(m.funcao)==="condutor").map(m=>`${m.posto} ${m.nome}`).join(", ")||"—";
    const recursos=recursosGcif(id);
    const recursoHtml=recursos.length?`<div class="quick-resource">${recursos.map(m=>`${m.equipamento} — ${m.posto} ${m.nome}`).join("<br>")}</div>`:"";
    const local=[g.municipio,g.local].filter(Boolean).join(" • ")||"Local não informado";
    card.innerHTML=`
      <div class="quick-head"><div class="quick-title">GCIF ${id}</div><span class="quick-status ${quickStatusClasse(g.status)}">${g.status||"—"}</span><button class="quick-close" title="Fechar">×</button></div>
      <div class="quick-body"><div class="quick-place">📍 ${local}</div>
      <div class="quick-grid"><div class="quick-metric"><span>Efetivo</span><b>${equipe.length} BM</b></div><div class="quick-metric"><span>Viatura</span><b>🚒 ${viatura}</b></div></div>
      <div class="quick-line"><span>Comando:</span> <b>${cmd}</b></div><div class="quick-line"><span>Condutor:</span> <b>${cond}</b></div>${recursoHtml}</div>`;
    card.classList.add("show");
    card.querySelector(".quick-close").onclick=()=>{card.classList.remove("show");gcifSelecionada=null};
  }

  function irParaGcif(id){
    const ref=gcifNavRefs.get(id);
    if(!ref) return;
    renderFichaRapida(id);
    const alvo=[ref.grupo.lat,ref.grupo.lng];
    const zoom=Math.max(map.getZoom(),13);
    map.setView(alvo,zoom,{animate:true});
    setTimeout(()=>{
      if(ref.cluster) expandGrupo(ref.grupo,ref.marker,id);
      else ref.marker.openPopup();
    },250);
  }

  function resultadosBuscaOperacional(valor){
    const q=norm(valor);
    if(q.length<2) return [];
    const resultados=[];
    for(const [id,equipe] of Object.entries(EFETIVO_GCIFS||{})){
      for(const m of equipe||[]){
        const texto=norm(`${m.posto||""} ${m.nome||""} ${m.funcao||""} ${m.numero??""} ${m.equipamento||""}`);
        if(texto.includes(q)) resultados.push({tipo:"militar",id,titulo:`${m.posto} ${m.nome}`,sub:`GCIF ${id}${m.funcao?` • ${m.funcao}`:""}${m.equipamento?` • ${m.equipamento}`:""}`});
      }
    }
    for(const [id,g] of Object.entries(GCIFS_DATA||{})){
      const v=VIATURAS?.porGcif?.[id]||"";
      const texto=norm(`gcif ${id} ${g.municipio||""} ${g.local||""} ${g.status||""} ${v}`);
      if(texto.includes(q)) resultados.push({tipo:"gcif",id,titulo:`GCIF ${id}`,sub:[g.municipio,v?`🚒 ${v}`:null,g.status].filter(Boolean).join(" • ")});
    }
    const vistos=new Set();
    return resultados.filter(r=>{const k=`${r.tipo}|${r.id}|${r.titulo}`;if(vistos.has(k))return false;vistos.add(k);return true}).slice(0,8);
  }

  function renderResultadosBusca(valor){
    const box=document.getElementById("opsSearchResults");
    if(!box) return;
    const res=resultadosBuscaOperacional(valor);
    if(!res.length){box.classList.remove("show");box.innerHTML="";return}
    box.innerHTML=res.map(r=>`<button class="ops-search-item" data-gcif="${r.id}"><b>${r.titulo}</b><small>${r.sub}</small></button>`).join("");
    box.classList.add("show");
    box.querySelectorAll(".ops-search-item").forEach(btn=>btn.onclick=()=>{
      const id=btn.dataset.gcif;
      box.classList.remove("show");
      irParaGcif(id);
    });
  }

  const searchOperacional=document.getElementById("search");
  if(searchOperacional){
    searchOperacional.addEventListener("input",e=>renderResultadosBusca(e.target.value));
    searchOperacional.addEventListener("keydown",e=>{
      if(e.key!=="Enter") return;
      const primeiro=document.querySelector("#opsSearchResults .ops-search-item");
      if(primeiro){e.preventDefault();primeiro.click()}
    });
    searchOperacional.addEventListener("blur",()=>setTimeout(()=>document.getElementById("opsSearchResults")?.classList.remove("show"),180));
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
      const recurso=temDrone(id)?" • 🚁 Drone":"";
      const detalhe=[g.municipio,viatura?`🚒 ${viatura}`:null].filter(Boolean).join(" • ")+recurso;
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
          icon:clusterIcon(grupo),keyboard:false,zIndexOffset:900
        }).addTo(guarnicaoLayer);
        const drone=grupo.ids.some(temDrone)?" • 🚁 Drone":"";
        marker.bindTooltip(`${tituloGrupo(grupo.ids)}${drone} • clique para abrir`,{
          direction:"top",offset:[0,-39]
        });
        marker.on("click", e => {
          if(e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
          expandGrupo(grupo, marker);
        });
        grupo.ids.forEach(id=>gcifNavRefs.set(id,{marker,grupo,cluster:true}));
      }else{
        const id=grupo.ids[0];
        marker = L.marker([grupo.lat,grupo.lng],{
          icon:iconGcif(id),keyboard:false
        }).addTo(guarnicaoLayer);
        const extra=temDrone(id)?" • 🚁 Drone":"";
        marker.bindTooltip(`${tituloGrupo(grupo.ids)} • ${GCIFS_DATA[id]?.status||"—"}${extra}`,{direction:"top",offset:[0,-20]});
        marker.bindPopup(() => popupGrupo(grupo),{maxWidth:440});
        marker.on("click",()=>renderFichaRapida(id));
        gcifNavRefs.set(id,{marker,grupo,cluster:false});
      }
      latlngs.push([grupo.lat,grupo.lng]);
    }

    gcifBounds = latlngs.length ? L.latLngBounds(latlngs) : null;
    document.getElementById("gcifCount").textContent = Object.keys(GCIFS_DATA).length;
    document.getElementById("pointCount").textContent = grupos.length;
    renderListaGcifs();
    atualizarResumoCabecalho();
    if(gcifSelecionada&&GCIFS_DATA[gcifSelecionada]) renderFichaRapida(gcifSelecionada);
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
