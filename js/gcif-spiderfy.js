/* Loader do mapa operacional: mantém uma única régua visível. */
(() => {
  const actions = document.querySelector('.map-actions');
  if (!actions) return;

  function organizarRegua() {
    const botoes = [...actions.querySelectorAll('button')].filter(btn =>
      btn.id === 'toggleRuler' || /R[ÉE]GUA/i.test(btn.textContent || '')
    );
    if (botoes.length > 1) {
      const manter = botoes[botoes.length - 1];
      botoes.slice(0, -1).forEach(btn => btn.remove());
      const municipio = document.getElementById('toggleMunicipioSelect');
      if (municipio && manter.nextElementSibling !== municipio) actions.insertBefore(manter, municipio);
    }
  }

  const observer = new MutationObserver(organizarRegua);
  observer.observe(actions, {childList:true, subtree:true});

  const app = document.createElement('script');
  app.src = `js/gcif-spiderfy-app.js?v=${Date.now()}`;
  app.onload = () => {
    organizarRegua();
    setTimeout(organizarRegua, 100);
    setTimeout(organizarRegua, 600);
    setTimeout(organizarRegua, 1600);
  };
  app.onerror = () => console.error('Falha ao carregar as interações do mapa operacional');
  document.head.appendChild(app);
})();
