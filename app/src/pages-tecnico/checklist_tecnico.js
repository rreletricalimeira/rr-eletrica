import {
  PAINEL_ITEMS, BOMBA_ITEMS, INVERSOR_ITEM_TRIGGER, INVERSOR_ITEMS_DEMAIS,
  AMBIENTE_ITEMS, renderChecklist,
} from './laudos.js';
import {
  carregarLogoBase64, desenharCabecalho, desenharRodape, MARGEM, COR_LINHA,
} from '../ui/pdf_papel_timbrado.js';

// ============================================================
// Checklist Técnico Completo (quadro elétrico, motores/bombas/
// inversores, ambiente) — reaproveita as mesmas listas de itens do
// Laudo de Casa de Máquinas (laudos.js), mas como um formulário
// independente e rápido, aberto em overlay de tela cheia a partir do
// ponto 4 do Roteiro de Visita Técnica. Ao "Salvar e fechar" devolve
// os dados preenchidos pro Roteiro (que os guarda dentro do próprio
// registro da visita) e fecha o overlay, voltando pro Roteiro.
// ============================================================

export function dadosChecklistPadrao() {
  return { painel: {}, bombas: [novaBomba(1)], ambiente: {} };
}

function novaBomba(n) {
  return { nome: `Bomba/Motor ${n}`, itens: {}, inversor: {} };
}

// contexto: { clienteNome, endereco } — só para exibir/exportar no PDF.
export function abrirChecklistTecnico({ dadosIniciais, contexto = {}, onSalvarFechar }) {
  const dados = dadosIniciais && Object.keys(dadosIniciais).length ? dadosIniciais : dadosChecklistPadrao();
  if (!dados.bombas || !dados.bombas.length) dados.bombas = [novaBomba(1)];

  const overlay = document.createElement('div');
  overlay.className = 'overlay-tela-cheia';
  overlay.innerHTML = `
    <div class="painel-tela-cheia">
      <div class="painel-tela-cheia-topo">
        <h3>Checklist Técnico Completo</h3>
        <div>
          <button type="button" id="ck-exportar" class="secondary">Exportar PDF</button>
          <button type="button" id="ck-fechar" class="secondary">Fechar sem salvar</button>
        </div>
      </div>

      <div class="card form-card">
        <h3 style="margin-top:0">Quadro Elétrico / Painel de Comando</h3>
        ${renderChecklist(PAINEL_ITEMS, dados.painel, 'painel')}
      </div>

      <div class="card">
        <h3>Motores, Bombas e Inversores de Frequência</h3>
        <div id="ck-lista-bombas"></div>
        <button type="button" id="ck-add-bomba" class="secondary">+ Adicionar bomba</button>
      </div>

      <div class="card form-card">
        <h3>Ambiente</h3>
        ${renderChecklist(AMBIENTE_ITEMS, dados.ambiente, 'ambiente')}
      </div>

      <div class="card">
        <button type="button" id="ck-salvar-fechar">Salvar e fechar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  function renderBombas() {
    const wrap = overlay.querySelector('#ck-lista-bombas');
    wrap.innerHTML = dados.bombas.map((b, i) => `
      <div class="subcard form-card" data-idx="${i}">
        <div class="subcard-titulo campo-full">
          <input type="text" class="ck-bomba-nome" value="${val(b.nome)}" style="max-width:260px" />
          ${dados.bombas.length > 1 ? '<button type="button" class="danger ck-remover-bomba" style="margin:0">Remover</button>' : ''}
        </div>
        ${renderChecklist(BOMBA_ITEMS, b.itens, `ck-bomba-${i}`)}
        <h4 class="campo-full">Inversor de frequência</h4>
        ${renderInversorItens(b, i)}
      </div>
    `).join('');

    wrap.querySelectorAll('.subcard').forEach((sub) => {
      const idx = Number(sub.dataset.idx);
      sub.querySelector('.ck-bomba-nome').addEventListener('input', (e) => { dados.bombas[idx].nome = e.target.value; });
      sub.querySelectorAll('.js-status').forEach((sel) => {
        sel.addEventListener('change', (e) => {
          const item = e.target.dataset.item;
          if (e.target.dataset.grupo === `ck-bomba-${idx}`) dados.bombas[idx].itens[item] = e.target.value;
          if (e.target.dataset.grupo === `ck-bomba-${idx}-inv`) {
            dados.bombas[idx].inversor[item] = e.target.value;
            if (item === INVERSOR_ITEM_TRIGGER[0]) renderBombas();
          }
        });
      });
      const btnRemover = sub.querySelector('.ck-remover-bomba');
      if (btnRemover) btnRemover.addEventListener('click', () => { dados.bombas.splice(idx, 1); renderBombas(); });
    });

    overlay.querySelector('#ck-add-bomba').addEventListener('click', () => {
      dados.bombas.push(novaBomba(dados.bombas.length + 1));
      renderBombas();
    });
  }

  function renderInversorItens(bomba, idx) {
    const statusInstalado = bomba.inversor[INVERSOR_ITEM_TRIGGER[0]] || '';
    const gatilho = renderChecklist([INVERSOR_ITEM_TRIGGER], bomba.inversor, `ck-bomba-${idx}-inv`);
    if (statusInstalado === 'Não conforme') {
      const oportunidade = INVERSOR_ITEMS_DEMAIS.filter(([itemId]) => itemId === 'oportunidade_inversor');
      return gatilho + renderChecklist(oportunidade, bomba.inversor, `ck-bomba-${idx}-inv`);
    }
    return gatilho + renderChecklist(INVERSOR_ITEMS_DEMAIS, bomba.inversor, `ck-bomba-${idx}-inv`);
  }

  // Painel/ambiente ficam fora de um subcard repetível — escuta direto no overlay.
  overlay.querySelectorAll('.js-status').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      const grupo = e.target.dataset.grupo;
      const item = e.target.dataset.item;
      if (grupo === 'painel') dados.painel[item] = e.target.value;
      if (grupo === 'ambiente') dados.ambiente[item] = e.target.value;
    });
  });

  renderBombas();

  const fechar = () => overlay.remove();
  overlay.querySelector('#ck-fechar').addEventListener('click', () => {
    if (confirm('Fechar sem salvar as alterações deste checklist?')) fechar();
  });
  overlay.querySelector('#ck-salvar-fechar').addEventListener('click', () => {
    if (onSalvarFechar) onSalvarFechar(dados);
    fechar();
  });
  overlay.querySelector('#ck-exportar').addEventListener('click', () => gerarPdf(dados, contexto));
}

// ---------- Exportação em PDF ----------

async function gerarPdf(dados, contexto) {
  const logo = await carregarLogoBase64();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const larguraPagina = doc.internal.pageSize.getWidth();
  let y = desenharCabecalho(doc, logo, 'CHECKLIST TÉCNICO COMPLETO');

  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text('Checklist Técnico Completo', MARGEM, y);
  y += 7;
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  if (contexto.clienteNome) { doc.text(`Cliente: ${contexto.clienteNome}`, MARGEM, y); y += 5.5; }
  if (contexto.endereco) { doc.text(`Endereço: ${contexto.endereco}`, MARGEM, y); y += 5.5; }
  y += 3;

  function tabelaSecao(titulo, items, valoresObj) {
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text(titulo, MARGEM, y);
    y += 2;
    doc.autoTable({
      startY: y,
      head: [['Item', 'Status']],
      body: items.map(([id, label]) => [label, valoresObj[id] || '—']),
      theme: 'grid',
      styles: { textColor: [0, 0, 0], lineColor: COR_LINHA, lineWidth: 0.2, fontSize: 9 },
      headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0] },
      columnStyles: { 1: { cellWidth: 34, halign: 'center' } },
      margin: { left: MARGEM, right: MARGEM, bottom: 24 },
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  tabelaSecao('Quadro Elétrico / Painel de Comando', PAINEL_ITEMS, dados.painel);

  dados.bombas.forEach((b, i) => {
    if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = MARGEM + 10; }
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text(b.nome || `Bomba/Motor ${i + 1}`, MARGEM, y);
    y += 2;
    tabelaSecao('Motor e bomba', BOMBA_ITEMS, b.itens);
    const itensInversor = [INVERSOR_ITEM_TRIGGER, ...INVERSOR_ITEMS_DEMAIS];
    tabelaSecao('Inversor de frequência', itensInversor, b.inversor);
  });

  tabelaSecao('Ambiente', AMBIENTE_ITEMS, dados.ambiente);

  desenharRodape(doc);
  doc.save(`checklist-tecnico-${(contexto.clienteNome || 'sem-cliente').replace(/[^a-z0-9]/gi, '-')}.pdf`);
}

function val(v) { return v === undefined || v === null ? '' : String(v).replace(/"/g, '&quot;'); }
