/* Carrega o núcleo do mapa e aplica compatibilidade da régua com as áreas municipais. */
(() => {
  const core = document.createElement("script");
  core.src = `js/gcif-spiderfy-core.js?v=${Date.now()}`;
  core.onload = () => {
    try {
      const mapEl = map.getContainer();
      const gruposMunicipais = [westLayer, contextLayer];

      function ajustarInteratividadeMunicipios() {
        const reguaAtiva = mapEl.classList.contains("ruler-mode");

        gruposMunicipais.forEach(grupo => {
          grupo.eachLayer(layer => {
            if (!layer?.options) return;

            if (layer.options._rulerOriginalInteractive === undefined) {
              layer.options._rulerOriginalInteractive = layer.options.interactive !== false;
            }

            layer.options.interactive = reguaAtiva
              ? false
              : layer.options._rulerOriginalInteractive;
          });
        });

        if (reguaAtiva) map.closePopup();
      }

      const observer = new MutationObserver(ajustarInteratividadeMunicipios);
      observer.observe(mapEl, {attributes:true, attributeFilter:["class"]});
      ajustarInteratividadeMunicipios();
    } catch (e) {
      console.warn("Falha ao aplicar compatibilidade da régua com municípios", e);
    }
  };
  core.onerror = () => console.error("Falha ao carregar o núcleo do mapa operacional");
  document.head.appendChild(core);
})();
