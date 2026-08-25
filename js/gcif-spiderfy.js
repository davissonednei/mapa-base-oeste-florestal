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

  /* Deixa explícito no pin que o helicóptero representa DRONE, não aeronave tripulada. */
  const droneStyle = document.createElement('style');
  droneStyle.textContent = `
    .marker-equip{left:-12px!important;width:38px!important;padding:0 3px!important;font-size:12px!important}
    .cluster-equip{left:-15px!important;width:39px!important;padding:0 3px!important;font-size:12px!important}
  `;
  document.head.appendChild(droneStyle);

  function identificarDrone(root = document) {
    root.querySelectorAll?.('.marker-equip,.cluster-equip').forEach(el => {
      const texto = el.textContent || '';
      if (texto.includes('🚁') && !texto.includes('🎮')) el.textContent = '🎮🚁';
      el.title = 'Drone';
    });
  }

  const droneObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.('.marker-equip,.cluster-equip')) identificarDrone(node.parentElement || node);
        else identificarDrone(node);
      }
    }
  });
  droneObserver.observe(document.documentElement, {childList:true, subtree:true});

  const base = document.createElement('script');
  base.src = `js/gcif-spiderfy-base.js?v=${Date.now()}`;
  base.onload = () => {
    identificarDrone();
    const buscaEvento = document.createElement('script');
    buscaEvento.src = `js/event-search.js?v=${Date.now()}`;
    buscaEvento.onerror = () => console.error('Falha ao carregar busca por ID de evento');
    document.head.appendChild(buscaEvento);
  };
  base.onerror = () => console.error('Falha ao carregar o mapa operacional');
  document.head.appendChild(base);
})();
