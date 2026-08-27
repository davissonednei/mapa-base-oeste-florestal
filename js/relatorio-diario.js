/* Relatório operacional diário + menu suspenso das Bases do PLANOP. */
(() => {
  const DATA_URLS = {
    movimentos: 'dados/movimentacoes.json',
    gcifs: 'dados/gcifs.json',
    efetivo: 'dados/efetivo.json',
    viaturas: 'dados/viaturas.json'
  };

  const style = document.createElement('style');
  style.textContent = `
    .report-launch-btn{width:100%;min-height:42px;margin:8px 0 3px;border:1px solid rgba(56,189,248,.38);border-radius:9px;background:linear-gradient(180deg,rgba(14,116,144,.24),rgba(8,47,73,.28));color:#d9f3ff;font-size:10px;font-weight:900;letter-spacing:.04em;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;box-shadow:0 4px 14px rgba(0,0,0,.12)}
    .report-launch-btn:hover{border-color:#38bdf8;background:rgba(14,116,144,.32)}
    .report-base-title{display:flex!important;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;user-select:none;padding:9px 8px;margin:9px 0 0!important;border:1px solid #213243;border-radius:9px;background:#0a151f;color:#b8c8d4!important;transition:.15s ease}
    .report-base-title:hover{border-color:#334b60;background:#0d1a26}.report-base-title .report-arrow{font-size:15px;line-height:1;transition:transform .18s ease;color:#f59e0b}.report-base-title.open .report-arrow{transform:rotate(180deg)}
    #baseList.report-base-panel{display:none!important;margin-top:6px}#baseList.report-base-panel.open{display:flex!important}
    .daily-report-overlay{position:fixed;inset:0;z-index:5000;background:rgba(3,9,15,.82);backdrop-filter:blur(5px);display:none;align-items:flex-start;justify-content:center;padding:24px;overflow:auto}.daily-report-overlay.show{display:flex}
    .daily-report-shell{width:min(1180px,100%);background:#f8fafc;color:#17202a;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.5);overflow:hidden}
    .daily-report-top{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:12px;padding:14px 18px;background:#071019;color:white;border-bottom:1px solid #213243}.daily-report-top-title{margin-right:auto}.daily-report-top-title b{display:block;font-size:15px}.daily-report-top-title span{display:block;font-size:10px;color:#9dafbe;margin-top:2px}.daily-report-actions{display:flex;gap:7px;flex-wrap:wrap}.daily-report-action{border:1px solid #33495d;border-radius:8px;background:#101d29;color:#f8fafc;padding:8px 10px;font-size:10px;font-weight:800;cursor:pointer}.daily-report-action.primary{border-color:#0ea5e9;background:#075985}.daily-report-action:hover{filter:brightness(1.12)}
    .daily-report-body{padding:24px}.report-doc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;border-bottom:3px solid #17202a;padding-bottom:14px;margin-bottom:16px}.report-doc-head h1{font-size:22px;line-height:1.1;margin:0 0 5px}.report-doc-head p{margin:2px 0;font-size:11px;color:#52606d}.report-doc-meta{text-align:right;font-size:10px;color:#52606d;line-height:1.45}
    .report-summary{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:14px 0 20px}.report-kpi{border:1px solid #d8e0e7;border-radius:10px;padding:10px;background:white}.report-kpi b{display:block;font-size:20px}.report-kpi span{display:block;font-size:8px;color:#657482;font-weight:800;text-transform:uppercase;letter-spacing:.05em;margin-top:4px}.report-kpi.combate{border-top:3px solid #ef4444}.report-kpi.prontidao{border-top:3px solid #22c55e}.report-kpi.monitoramento{border-top:3px solid #eab308}.report-kpi.deslocamento{border-top:3px solid #38bdf8}
    .report-section{margin-top:22px}.report-section-title{font-size:13px;font-weight:950;text-transform:uppercase;letter-spacing:.07em;color:#17202a;border-bottom:1px solid #ccd6df;padding-bottom:7px;margin-bottom:10px}.report-section-note{font-size:9px;color:#71808e;margin-top:-5px;margin-bottom:10px}
    .report-timeline{display:flex;flex-direction:column;gap:7px}.report-move{display:grid;grid-template-columns:58px 115px 1fr;gap:10px;border:1px solid #dbe3ea;border-radius:10px;background:white;padding:10px 11px;break-inside:avoid}.report-time{font-size:12px;font-weight:950;color:#334155}.report-gcif{font-size:11px;font-weight:950}.report-move-main{font-size:10px;line-height:1.45}.report-move-main b{font-size:11px}.report-coord{font:9px/1.35 Consolas,monospace;color:#64748b;margin-top:3px}.report-resource{font-size:9px;color:#52606d;margin-top:4px}.report-status{display:inline-block;font-size:8px;font-weight:900;border-radius:999px;padding:3px 6px;margin-left:5px;border:1px solid #cbd5e1}.report-status.combate{color:#b91c1c;background:#fef2f2;border-color:#fecaca}.report-status.prontidao{color:#15803d;background:#f0fdf4;border-color:#bbf7d0}.report-status.prevencao{color:#a16207;background:#fffbeb;border-color:#fde68a}.report-status.monitoramento{color:#854d0e;background:#fefce8;border-color:#fde047}.report-status.deslocamento{color:#0369a1;background:#f0f9ff;border-color:#bae6fd}
    .report-table-wrap{overflow-x:auto;border:1px solid #dbe3ea;border-radius:10px}.report-table{width:100%;border-collapse:collapse;background:white;font-size:9px}.report-table th{background:#eef3f7;text-align:left;padding:8px;border-bottom:1px solid #dbe3ea;color:#475569;text-transform:uppercase;font-size:8px;letter-spacing:.04em}.report-table td{padding:8px;vertical-align:top;border-bottom:1px solid #edf1f4;line-height:1.35}.report-table tr:last-child td{border-bottom:0}.report-table .gcif-id{font-size:12px;font-weight:950;white-space:nowrap}.report-person{display:block;margin-bottom:2px}.report-person strong{font-weight:850}.report-muted{color:#6b7a88}.report-staff-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.report-staff{border:1px solid #dbe3ea;border-radius:9px;background:white;padding:8px 10px;font-size:9px;line-height:1.4;break-inside:avoid}.report-foot{margin-top:24px;padding-top:10px;border-top:1px solid #cfd8e1;font-size:8px;color:#71808e;line-height:1.45}
    .report-loading{padding:70px 20px;text-align:center;font-size:12px;color:#64748b}.report-error{padding:30px;color:#b91c1c;font-size:11px}
    @media(max-width:900px){.daily-report-overlay{padding:8px}.daily-report-body{padding:14px}.report-summary{grid-template-columns:repeat(3,1fr)}.report-doc-head{flex-direction:column}.report-doc-meta{text-align:left}.report-move{grid-template-columns:52px 90px 1fr}.report-staff-grid{grid-template-columns:1fr}.daily-report-top{align-items:flex-start;flex-wrap:wrap}.daily-report-top-title{width:100%}}
    @media print{
      @page{size:A4 landscape;margin:10mm}
      body>*:not(#dailyReportOverlay){display:none!important}
      #dailyReportOverlay{display:block!important;position:static!important;background:white!important;padding:0!important;overflow:visible!important;backdrop-filter:none!important}
      .daily-report-shell{width:100%!important;box-shadow:none!important;border-radius:0!important;overflow:visible!important}
      .daily-report-top{display:none!important}.daily-report-body{padding:0!important}.report-summary{grid-template-columns:repeat(6,1fr)!important}.report-table-wrap{overflow:visible!important}.report-section{break-inside:auto}.report-doc-head{margin-top:0}.report-move,.report-kpi,.report-staff{box-shadow:none!important}
    }
  `;
  document.head.appendChild(style);

  function norm(s){
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function localDateKey(date = new Date()){
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatDateBR(key){
    const [y,m,d] = key.split('-');
    return `${d}/${m}/${y}`;
  }

  function statusClass(status){
    const s = norm(status);
    if(s.includes('combate')) return 'combate';
    if(s.includes('prontidao')) return 'prontidao';
    if(s.includes('prevencao')) return 'prevencao';
    if(s.includes('monitor')) return 'monitoramento';
    if(s.includes('desloc')) return 'deslocamento';
    return '';
  }

  function escapeHtml(value){
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  }

  async function loadJson(url){
    const r = await fetch(`${url}?v=${Date.now()}`, {cache:'no-store'});
    if(!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  }

  function setupBaseAccordionAndButton(){
    const titles = [...document.querySelectorAll('.section-title')];
    const title = titles.find(el => norm(el.textContent).includes('bases do planop'));
    const panel = document.getElementById('baseList');
    if(!title || !panel) return false;

    if(!title.dataset.reportAccordion){
      title.dataset.reportAccordion = '1';
      title.classList.add('report-base-title');
      const text = title.textContent.trim();
      title.innerHTML = `<span>${escapeHtml(text)}</span><span class="report-arrow">⌄</span>`;
      title.setAttribute('role','button');
      title.setAttribute('tabindex','0');
      title.setAttribute('aria-expanded','false');
      panel.classList.add('report-base-panel');
      const toggle = () => {
        const open = !panel.classList.contains('open');
        panel.classList.toggle('open', open);
        title.classList.toggle('open', open);
        title.setAttribute('aria-expanded', String(open));
      };
      title.addEventListener('click', toggle);
      title.addEventListener('keydown', e => {
        if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); toggle(); }
      });
    }

    if(!document.getElementById('dailyReportButton')){
      const btn = document.createElement('button');
      btn.id = 'dailyReportButton';
      btn.className = 'report-launch-btn';
      btn.type = 'button';
      btn.innerHTML = '<span>📄</span><span>RELATÓRIO OPERACIONAL DO DIA</span>';
      btn.addEventListener('click', openReport);
      panel.insertAdjacentElement('afterend', btn);
    }
    return true;
  }

  function ensureOverlay(){
    let overlay = document.getElementById('dailyReportOverlay');
    if(overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'dailyReportOverlay';
    overlay.className = 'daily-report-overlay';
    overlay.innerHTML = `
      <div class="daily-report-shell" role="dialog" aria-modal="true" aria-label="Relatório operacional diário">
        <div class="daily-report-top">
          <div class="daily-report-top-title"><b>Relatório Operacional Diário</b><span>20º BBM • Base Florestal Oeste</span></div>
          <div class="daily-report-actions">
            <button type="button" class="daily-report-action" id="dailyReportRefresh">↻ Atualizar</button>
            <button type="button" class="daily-report-action primary" id="dailyReportPrint">🖨 Imprimir / Salvar PDF</button>
            <button type="button" class="daily-report-action" id="dailyReportClose">✕ Fechar</button>
          </div>
        </div>
        <div class="daily-report-body" id="dailyReportBody"><div class="report-loading">Carregando relatório…</div></div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#dailyReportClose').addEventListener('click', closeReport);
    overlay.querySelector('#dailyReportPrint').addEventListener('click', () => window.print());
    overlay.querySelector('#dailyReportRefresh').addEventListener('click', renderReport);
    overlay.addEventListener('click', e => { if(e.target === overlay) closeReport(); });
    document.addEventListener('keydown', e => { if(e.key === 'Escape' && overlay.classList.contains('show')) closeReport(); });
    return overlay;
  }

  function closeReport(){
    const overlay = document.getElementById('dailyReportOverlay');
    if(overlay) overlay.classList.remove('show');
  }

  function commanderFor(efetivo, id){
    const p = (efetivo[id] || []).find(x => norm(x.funcao).includes('cmd'));
    return p ? `${p.posto} ${p.nome}` : '—';
  }

  function vehicleFor(viaturas, id){
    return viaturas?.porGcif?.[id] || '—';
  }

  function peopleHtml(list){
    if(!Array.isArray(list) || !list.length) return '<span class="report-muted">Sem efetivo cadastrado</span>';
    return list.map(p => {
      const funcao = p.funcao ? ` • ${escapeHtml(p.funcao)}` : '';
      const numero = p.numero != null ? ` • Florestal ${escapeHtml(p.numero)}` : '';
      const equipamento = p.equipamento ? ` • ${escapeHtml(p.equipamento)}` : '';
      return `<span class="report-person"><strong>${escapeHtml(p.posto)} ${escapeHtml(p.nome)}</strong>${funcao}${numero}${equipamento}</span>`;
    }).join('');
  }

  function movementResourceHtml(item, efetivo, viaturas){
    const ids = item.gcifs || [];
    if(!ids.length) return '';
    return ids.map(id => `GCIF ${escapeHtml(id)}: ${escapeHtml(vehicleFor(viaturas,id))} • Cmd. ${escapeHtml(commanderFor(efetivo,id))}`).join(' &nbsp; | &nbsp; ');
  }

  async function renderReport(){
    const body = document.getElementById('dailyReportBody');
    if(!body) return;
    body.innerHTML = '<div class="report-loading">Carregando dados operacionais atualizados…</div>';
    try{
      const [movimentosAll, gcifs, efetivo, viaturas] = await Promise.all([
        loadJson(DATA_URLS.movimentos), loadJson(DATA_URLS.gcifs), loadJson(DATA_URLS.efetivo), loadJson(DATA_URLS.viaturas)
      ]);
      const dateKey = localDateKey();
      const movimentos = [...(movimentosAll?.[dateKey] || [])].sort((a,b) => String(a.hora).localeCompare(String(b.hora)));
      const ids = Object.keys(gcifs || {}).sort((a,b) => Number(a) - Number(b));
      const count = key => ids.filter(id => norm(gcifs[id]?.status).includes(key)).length;
      const combate = count('combate');
      const prontidao = count('prontidao');
      const monitoramento = ids.filter(id => norm(gcifs[id]?.status).includes('monitor')).length;
      const deslocamento = ids.filter(id => norm(gcifs[id]?.status).includes('desloc')).length;
      const bmGcif = ids.reduce((sum,id) => sum + ((efetivo[id] || []).length), 0);
      const staff = (efetivo.STAFF || []).length;
      const viaturasEmpregadas = ids.filter(id => viaturas?.porGcif?.[id]).length;
      const totalAcoesGcif = movimentos.reduce((sum,m) => sum + ((m.gcifs || []).length || 1), 0);
      const generated = new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});

      const movementRows = movimentos.length ? movimentos.map(item => {
        const idsLabel = (item.gcifs || []).map(id => `GCIF ${id}`).join(', ') || 'Registro';
        const coords = Number.isFinite(item.lat) && Number.isFinite(item.lng) ? `${item.lat}, ${item.lng}` : '';
        return `<div class="report-move">
          <div class="report-time">${escapeHtml(item.hora || '—')}</div>
          <div class="report-gcif">${escapeHtml(idsLabel)}</div>
          <div class="report-move-main">
            <b>${escapeHtml(item.descricao || item.local || 'Movimentação operacional')}</b><span class="report-status ${statusClass(item.status)}">${escapeHtml(item.status || '—')}</span>
            ${item.local ? `<div class="report-muted">${escapeHtml(item.local)}</div>` : ''}
            ${coords ? `<div class="report-coord">${escapeHtml(coords)}</div>` : ''}
            <div class="report-resource">${movementResourceHtml(item, efetivo, viaturas)}</div>
          </div>
        </div>`;
      }).join('') : '<div class="report-muted">Nenhuma movimentação registrada para hoje.</div>';

      const gcifRows = ids.map(id => {
        const g = gcifs[id] || {};
        const coord = Number.isFinite(g.lat) && Number.isFinite(g.lng) ? `${g.lat}, ${g.lng}` : 'Base Oeste';
        return `<tr>
          <td class="gcif-id">GCIF ${escapeHtml(id)}</td>
          <td><span class="report-status ${statusClass(g.status)}">${escapeHtml(g.status || '—')}</span></td>
          <td><strong>${escapeHtml(g.local || '—')}</strong><br><span class="report-muted">${escapeHtml(g.municipio || '—')}</span><br><span class="report-coord">${escapeHtml(coord)}</span></td>
          <td><strong>${escapeHtml(vehicleFor(viaturas,id))}</strong><br><span class="report-muted">${escapeHtml(viaturas?.frota?.[vehicleFor(viaturas,id)]?.condutor || '')}</span></td>
          <td>${peopleHtml(efetivo[id])}</td>
        </tr>`;
      }).join('');

      const staffRows = (efetivo.STAFF || []).map(p => `<div class="report-staff"><strong>${escapeHtml(p.posto)} ${escapeHtml(p.nome)}</strong><br><span class="report-muted">${escapeHtml(p.funcao || 'STAFF')}${p.numero != null ? ` • Florestal ${escapeHtml(p.numero)}` : ''}</span></div>`).join('');

      body.innerHTML = `
        <div class="report-doc-head">
          <div><h1>RELATÓRIO OPERACIONAL DIÁRIO</h1><p><strong>20º BBM • Operação Florestal • Base Florestal Oeste</strong></p><p>Consolidação das movimentações, situação das GCIFs, efetivo e viaturas.</p></div>
          <div class="report-doc-meta"><strong>Data: ${formatDateBR(dateKey)}</strong><br>Gerado em: ${escapeHtml(generated)}<br>Fonte: Mapa Operacional Base Oeste</div>
        </div>
        <div class="report-summary">
          <div class="report-kpi"><b>${ids.length}</b><span>GCIFs</span></div>
          <div class="report-kpi combate"><b>${combate}</b><span>Em combate</span></div>
          <div class="report-kpi prontidao"><b>${prontidao}</b><span>Em prontidão</span></div>
          <div class="report-kpi monitoramento"><b>${monitoramento}</b><span>Monitoramento</span></div>
          <div class="report-kpi deslocamento"><b>${deslocamento}</b><span>Deslocamento</span></div>
          <div class="report-kpi"><b>${totalAcoesGcif}</b><span>Ações GCIF no dia</span></div>
        </div>

        <section class="report-section">
          <div class="report-section-title">1. Movimentações e alterações operacionais do dia</div>
          <div class="report-section-note">Histórico cronológico registrado no mapa operacional. O efetivo e a viatura exibidos em cada registro correspondem à composição cadastrada da GCIF.</div>
          <div class="report-timeline">${movementRows}</div>
        </section>

        <section class="report-section">
          <div class="report-section-title">2. Situação atual das GCIFs</div>
          <div class="report-section-note">Efetivo GCIF: ${bmGcif} militares • STAFF: ${staff} militares • Viaturas vinculadas: ${viaturasEmpregadas}.</div>
          <div class="report-table-wrap"><table class="report-table"><thead><tr><th>GCIF</th><th>Status</th><th>Localização</th><th>Viatura</th><th>Efetivo / Função</th></tr></thead><tbody>${gcifRows}</tbody></table></div>
        </section>

        <section class="report-section">
          <div class="report-section-title">3. STAFF / Apoio operacional</div>
          <div class="report-staff-grid">${staffRows || '<div class="report-muted">Sem STAFF cadastrado.</div>'}</div>
        </section>

        <div class="report-foot">Relatório gerado automaticamente a partir dos registros do Mapa Operacional da Base Florestal Oeste. Alterações posteriores no efetivo, viaturas ou situação das GCIFs serão refletidas na próxima atualização do relatório.</div>`;
    }catch(err){
      console.error('Falha ao gerar relatório diário', err);
      body.innerHTML = `<div class="report-error"><strong>Não foi possível gerar o relatório.</strong><br>${escapeHtml(err.message || err)}</div>`;
    }
  }

  function openReport(){
    const overlay = ensureOverlay();
    overlay.classList.add('show');
    renderReport();
  }

  window.openDailyOperationalReport = openReport;

  if(!setupBaseAccordionAndButton()){
    const observer = new MutationObserver(() => {
      if(setupBaseAccordionAndButton()) observer.disconnect();
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(() => observer.disconnect(), 15000);
  }
})();
