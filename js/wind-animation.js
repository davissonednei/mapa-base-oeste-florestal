/* BLOQUEIO DE SEGURANÇA — FONTE DE VENTO
   O mapa operacional deve usar exclusivamente a camada oficial disponibilizada
   pelo CENSIPAM/Painel do Fogo através do WMS configurado em gcif-spiderfy-base.js.

   Este arquivo existia para substituir o botão VENTO por uma animação baseada em
   Open-Meteo/GFS. Essa substituição foi desativada de forma permanente para evitar
   divergência entre o nosso mapa e a referência operacional do Painel do Fogo.

   Regra: este arquivo NÃO pode assumir o botão #toggleWind, NÃO pode consultar
   Open-Meteo e NÃO pode produzir campo de vento próprio.
*/
(() => {
  window.__windAnimationInstalled = true;
  window.__windSourcePolicy = 'CENSIPAM_ONLY';
  console.info('Vento: fonte bloqueada no CENSIPAM/Painel do Fogo; animação GFS desativada.');
})();
