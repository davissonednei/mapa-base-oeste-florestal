/* BLOQUEIO OPERACIONAL DE SEGURANÇA — VENTO
   O botão de vento permanece desabilitado até existir uma integração cuja fonte,
   produto, horário de referência e comportamento tenham sido verificados contra
   uma fonte operacional confiável. Não usar GFS/Open-Meteo como substituto silencioso.
*/
(() => {
  window.__windAnimationInstalled = true;
  window.__windSourcePolicy = 'DISABLED_UNTIL_VERIFIED';

  const TEXTO = '🌬️ VENTO — INDISP.';
  const TITULO = 'Vento desabilitado por segurança operacional: nenhuma fonte integrada foi validada como equivalente ao produto usado para planejamento.';

  function removerFallbacks() {
    document.querySelectorAll('#toggleWindFallback, #windParticleCanvas').forEach(el => el.remove());
    document.querySelectorAll('.wind-speed-label').forEach(el => el.remove());
  }

  function bloquear() {
    removerFallbacks();
    const btn = document.getElementById('toggleWind');
    if (!btn) return false;

    if (!btn.dataset.windSafetyLock) {
      btn.dataset.windSafetyLock = '1';
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }, true);
    }

    btn.disabled = true;
    btn.onclick = null;
    btn.classList.remove('active');
    btn.style.display = '';
    btn.style.opacity = '.45';
    btn.style.cursor = 'not-allowed';
    btn.innerHTML = TEXTO;
    btn.title = TITULO;
    btn.setAttribute('aria-disabled', 'true');
    return true;
  }

  bloquear();

  const obs = new MutationObserver(() => bloquear());
  obs.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'style', 'class']
  });

  /* O instalador oficial é assíncrono; reforça o bloqueio durante a inicialização. */
  let tentativas = 0;
  const timer = setInterval(() => {
    bloquear();
    tentativas += 1;
    if (tentativas >= 120) clearInterval(timer);
  }, 250);

  console.warn('Vento desabilitado por segurança operacional até validação de uma fonte confiável equivalente.');
})();
