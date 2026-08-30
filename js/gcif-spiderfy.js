/* Compatibilidade operacional + campo de atuação oficial da Base Oeste + busca por ID de evento. */
(() => {
  const CAMPO_ATUACAO_OESTE = new Set([
    'angical',
    'baianopolis',
    'barreiras',
    'buritirama',
    'catolandia',
    'cotegipe',
    'cristopolis',
    'formosa do rio preto',
    'mansidao',
    'muquem do sao francisco',
    'riachao das neves',
    'santa rita de cassia',
    'sao desiderio',
    'wanderley',
    'barra',
    'luis eduardo magalhaes'
  ]);

  try {
    /* A cobertura deixa de ser calculada por proximidade: vale exatamente a relação operacional acima. */
    isCoberturaOeste = rec => CAMPO_ATUACAO_OESTE.has(norm(rec.nome));

    /* Mantém a compatibilidade com trechos antigos que consultam COBERTURA_MANUAL. */
    if (typeof COBERTURA_MANUAL !== 'undefined' && COBERTURA_MANUAL?.clear) {
      COBERTURA_MANUAL.clear();
      CAMPO_ATUACAO_OESTE.forEach(nome => COBERTURA_MANUAL.add(nome));
    }
  } catch (e) {
    console.warn('Falha ao aplicar o campo de atuação oficial da Base Oeste', e);
  }

  /* Convenção operacional: monitoramento em amarelo e deslocamento em azul. */
  const monitoramentoStyle = document.createElement('style');
  monitoramentoStyle.textContent = `
    .marker-neutro{background:#facc15!important}
    .quick-status.status-neutro{color:#fde68a!important;background:rgba(250,204,21,.12)!important;border-color:rgba(250,204,21,.45)!important}
    .ops-stat.monitoramento{border-color:rgba(250,204,21,.38)!important;background:rgba(250,204,21,.08)!important}
    .ops-stat.monitoramento b{color:#fde68a!important}

    .marker-deslocamento{background:#38bdf8!important}
    .quick-status.status-deslocamento{color:#bae6fd!important;background:rgba(56,189,248,.12)!important;border-color:rgba(56,189,248,.45)!important}
    .ops-stat.deslocamento{border-color:rgba(56,189,248,.38)!important;background:rgba(56,189,248,.08)!important}
    .ops-stat.deslocamento b{color:#7dd3fc!important}

    .report-base-title{display:flex!important;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;user-select:none;padding:9px 8px;margin:9px 0 0!important;border:1px solid #213243;border-radius:9px;background:#0a151f;color:#b8c8d4!important;transition:.15s ease}
    .report-base-title:hover{border-color:#334b60;background:#0d1a26}
    .report-base-title .report-arrow{font-size:15px;line-height:1;transition:transform .18s ease;color:#f59e0b}
    .report-base-title.open .report-arrow{transform:rotate(180deg)}
    #baseList.report-base-panel{display:none!important;margin-top:6px}
    #baseList.report-base-panel.open{display:flex!important}
    .report-launch-btn{width:100%;min-height:42px;margin:8px 0 3px;border:1px solid rgba(56,189,248,.38);border-radius:9px;background:linear-gradient(180deg,rgba(14,116,144,.24),rgba(8,47,73,.28));color:#d9f3ff;font-size:10px;font-weight:900;letter-spacing:.04em;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;box-shadow:0 4px 14px rgba(0,0,0,.12)}
    .report-launch-btn:hover{border-color:#38bdf8;background:rgba(14,116,144,.32)}

    @media(max-width:1180px){
      #headerOpsSummary .ops-stat:nth-child(7){display:flex}
      #headerOpsSummary .ops-stat:nth-child(8){display:none}
    }
  `;
  document.head.appendChild(monitoramentoStyle);

  /* Copia no formato aceito diretamente pelo Google Maps: latitude, longitude. */
  try {
    if (typeof copyCoords === 'function' && typeof copyText === 'function') {
      copyCoords = async function(latlng){
        updateCoords(latlng);
        const txt = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
        const ok = await copyText(txt);
        if(!coordEl) return;
        coordEl.classList.toggle('copied', ok);
        coordEl.innerHTML = ok ? `✓ Copiado: ${txt}` : `<b>⚑</b> ${txt}`;
        setTimeout(() => {
          if(coordsEnabled){
            coordEl.classList.remove('copied');
            updateCoords(lastCoord);
          }
        }, 900);
      };
    }
  } catch (e) {
    console.warn('Falha ao aplicar formato decimal de cópia de coordenadas', e);
  }

  function normCompat(s){
    return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  }

  /* O relatório deve sair em folha A4 normal (retrato), não deitado. */
  function aplicarImpressaoRetrato(){
    if(document.getElementById('relatorioPrintPortraitStyle')) return;
    const style = document.createElement('style');
    style.id = 'relatorioPrintPortraitStyle';
    style.textContent = `
      @media print{
        @page{size:A4 portrait;margin:10mm}
        .report-summary{grid-template-columns:repeat(3,1fr)!important}
        .report-doc-head{gap:10px!important}
        .report-move{grid-template-columns:45px 78px 1fr!important;gap:6px!important;padding:7px!important}
        .report-table{font-size:7.5px!important;table-layout:fixed!important}
        .report-table th,.report-table td{padding:5px!important;overflow-wrap:anywhere!important;word-break:normal!important}
        .report-table th:nth-child(1),.report-table td:nth-child(1){width:8%!important}
        .report-table th:nth-child(2),.report-table td:nth-child(2){width:12%!important}
        .report-table th:nth-child(3),.report-table td:nth-child(3){width:24%!important}
        .report-table th:nth-child(4),.report-table td:nth-child(4){width:14%!important}
        .report-table th:nth-child(5),.report-table td:nth-child(5){width:42%!important}
        .report-person{margin-bottom:1px!important}
      }
    `;
    document.head.appendChild(style);
  }

  function carregarRelatorioDiario(){
    return new Promise((resolve,reject) => {
      if(typeof window.openDailyOperationalReport === 'function'){
        aplicarImpressaoRetrato();
        return resolve();
      }
      const existente = document.getElementById('relatorioDiarioScript');
      if(existente){
        existente.addEventListener('load', () => { aplicarImpressaoRetrato(); resolve(); }, {once:true});
        existente.addEventListener('error', () => reject(new Error('Falha ao carregar relatório operacional diário')), {once:true});
        setTimeout(() => {
          if(typeof window.openDailyOperationalReport === 'function'){
            aplicarImpressaoRetrato();
            resolve();
          }
        }, 300);
        return;
      }
      const script = document.createElement('script');
      script.id = 'relatorioDiarioScript';
      script.src = `js/relatorio-diario.js?v=${Date.now()}`;
      script.onload = () => { aplicarImpressaoRetrato(); resolve(); };
      script.onerror = () => reject(new Error('Falha ao carregar relatório operacional diário'));
      document.head.appendChild(script);
    });
  }

  function prepararAcessoRelatorio(){
    let painel = document.getElementById('baseList');
    const titulo = [...document.querySelectorAll('.section-title')].find(el => normCompat(el.textContent).includes('bases do planop'));
    if(!titulo) return false;

    /* O HTML antigo não tinha id na lista de bases; identifica pela posição e passa a ter. */
    if(!painel){
      const candidato = titulo.nextElementSibling;
      if(candidato && candidato.classList.contains('base-list')){
        painel = candidato;
        painel.id = 'baseList';
      }
    }
    if(!painel) return false;

    if(!titulo.dataset.reportAccordion){
      titulo.dataset.reportAccordion = '1';
      titulo.classList.add('report-base-title');
      const texto = titulo.textContent.trim();
      titulo.innerHTML = `<span>${texto}</span><span class="report-arrow">⌄</span>`;
      titulo.setAttribute('role','button');
      titulo.setAttribute('tabindex','0');
      titulo.setAttribute('aria-expanded','false');
      painel.classList.add('report-base-panel');
      const toggle = () => {
        const abriu = !painel.classList.contains('open');
        painel.classList.toggle('open', abriu);
        titulo.classList.toggle('open', abriu);
        titulo.setAttribute('aria-expanded', String(abriu));
      };
      titulo.addEventListener('click', toggle);
      titulo.addEventListener('keydown', e => {
        if(e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          toggle();
        }
      });
    }

    if(!document.getElementById('dailyReportButton')){
      const btn = document.createElement('button');
      btn.id = 'dailyReportButton';
      btn.className = 'report-launch-btn';
      btn.type = 'button';
      btn.innerHTML = '<span>📄</span><span>RELATÓRIO OPERACIONAL DO DIA</span>';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const antigo = btn.innerHTML;
        btn.innerHTML = '<span>⏳</span><span>CARREGANDO RELATÓRIO...</span>';
        try{
          await carregarRelatorioDiario();
          if(typeof window.openDailyOperationalReport !== 'function') throw new Error('Relatório indisponível');
          window.openDailyOperationalReport();
        }catch(e){
          console.error(e);
          alert('Não foi possível abrir o relatório. Atualize a página e tente novamente.');
        }finally{
          btn.disabled = false;
          btn.innerHTML = antigo;
        }
      });
      painel.insertAdjacentElement('afterend', btn);
    }
    return true;
  }

  prepararAcessoRelatorio();
  const relatorioObserver = new MutationObserver(() => prepararAcessoRelatorio());
  relatorioObserver.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(() => relatorioObserver.disconnect(), 20000);

  function atualizarMonitoramentoResumo(){
    const box = document.getElementById('headerOpsSummary');
    if(!box || typeof GCIFS_DATA === 'undefined') return;

    const quantidade = Object.values(GCIFS_DATA || {}).filter(g => normCompat(g?.status).includes('monitor')).length;
    let card = box.querySelector('.ops-stat.monitoramento');

    if(!card){
      card = document.createElement('div');
      card.className = 'ops-stat monitoramento';
      card.innerHTML = '<b>0</b><span>Monitor.</span>';
    }

    const valor = card.querySelector('b');
    if(valor && valor.textContent !== String(quantidade)) valor.textContent = String(quantidade);

    const cards = [...box.querySelectorAll('.ops-stat')];
    const deslocamento = cards.find(el => normCompat(el.querySelector('span')?.textContent).startsWith('desloc'));
    const prontidao = cards.find(el => normCompat(el.querySelector('span')?.textContent).startsWith('pront'));

    if(deslocamento && card.nextElementSibling !== deslocamento){
      box.insertBefore(card, deslocamento);
    }else if(!deslocamento && prontidao && prontidao.nextElementSibling !== card){
      prontidao.after(card);
    }
  }

  const resumoObserver = new MutationObserver(() => atualizarMonitoramentoResumo());
  resumoObserver.observe(document.documentElement, {childList:true, subtree:true});
  atualizarMonitoramentoResumo();

  const base = document.createElement('script');
  base.src = `js/gcif-spiderfy-base.js?v=${Date.now()}`;
  base.onload = () => {
    atualizarMonitoramentoResumo();
    prepararAcessoRelatorio();

    const buscaEvento = document.createElement('script');
    buscaEvento.src = `js/event-search.js?v=${Date.now()}`;
    buscaEvento.onerror = () => console.error('Falha ao carregar busca por ID de evento');
    document.head.appendChild(buscaEvento);

    const cicloFogo = document.createElement('script');
    cicloFogo.src = `js/fire-event-lifecycle.js?v=${Date.now()}`;
    cicloFogo.onerror = () => console.error('Falha ao carregar ciclo de vida dos Eventos de Fogo');
    document.head.appendChild(cicloFogo);

    const ventoAnimado = document.createElement('script');
    ventoAnimado.src = `js/wind-animation.js?v=${Date.now()}`;
    ventoAnimado.onerror = () => console.error('Falha ao carregar animação de vento');
    document.head.appendChild(ventoAnimado);

    carregarRelatorioDiario().catch(e => console.error(e));
  };
  base.onerror = () => console.error('Falha ao carregar o mapa operacional');
  document.head.appendChild(base);
})();
