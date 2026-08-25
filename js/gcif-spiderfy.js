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

  const base = document.createElement('script');
  base.src = `js/gcif-spiderfy-base.js?v=${Date.now()}`;
  base.onload = () => {
    const buscaEvento = document.createElement('script');
    buscaEvento.src = `js/event-search.js?v=${Date.now()}`;
    buscaEvento.onerror = () => console.error('Falha ao carregar busca por ID de evento');
    document.head.appendChild(buscaEvento);
  };
  base.onerror = () => console.error('Falha ao carregar o mapa operacional');
  document.head.appendChild(base);
})();
