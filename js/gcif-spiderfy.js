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

    const buscaEvento = document.createElement('script');
    buscaEvento.src = `js/event-search.js?v=${Date.now()}`;
    buscaEvento.onerror = () => console.error('Falha ao carregar busca por ID de evento');
    document.head.appendChild(buscaEvento);

    const relatorioDiario = document.createElement('script');
    relatorioDiario.src = `js/relatorio-diario.js?v=${Date.now()}`;
    relatorioDiario.onerror = () => console.error('Falha ao carregar relatório operacional diário');
    document.head.appendChild(relatorioDiario);
  };
  base.onerror = () => console.error('Falha ao carregar o mapa operacional');
  document.head.appendChild(base);
})();
