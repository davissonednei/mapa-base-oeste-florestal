/* Compatibilidade: preserva o loader operacional existente, amplia a cobertura e adiciona busca por ID de evento. */
(() => {
  try {
    if (typeof COBERTURA_MANUAL !== 'undefined' && COBERTURA_MANUAL?.add) {
      [
        'cocos',
        'jaborandi',
        'feira da mata',
        'coribe',
        'sao felix do coribe',
        'carinhanha',
        'serra do ramalho',
        'serra dourada',
        'tabocas do brejo velho',
        'brejolandia',
        'muquem do sao francisco',
        'sitio do mato',
        'canapolis',
        'santa maria da vitoria',
        'santana',
        'baianopolis'
      ].forEach(nome => COBERTURA_MANUAL.add(nome));
    }
  } catch (e) {
    console.warn('Falha ao ampliar a cobertura manual da Base Oeste', e);
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
