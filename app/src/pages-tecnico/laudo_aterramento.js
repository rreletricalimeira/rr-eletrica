import { all, run, persist } from '../db/db.js';
import {
  carregarLogoBase64, desenharCabecalho, desenharRodape, MARGEM, COR_LINHA,
} from '../ui/pdf_papel_timbrado.js';
import { entregarPdf } from '../ui/pdf_compartilhar.js';

// ============================================================
// Módulo Técnico — Laudo de Aterramento
// Cabeçalho (cliente/endereço/telefone/data) + medições e um campo
// calculado de resistência de aterramento pela Lei de Ohm:
//   R (Ω) = Voltagem fase-terra com carga (V) / Amperagem com carga (A)
// Esse é o mesmo princípio usado no método de medição por queda de
// potencial em campo (voltímetro + alicate amperímetro). Se você mede
// a resistência de forma diferente (ex.: terrômetro dedicado), me avisa
// que ajusto a fórmula.
// ============================================================

const OPCOES_HASTES = [1, 2, 3, 4, 5];

// Próximo número automático do laudo, no formato LA0001 (4 dígitos) —
// mesmo padrão do laudo de casa de máquinas (LC0001).
function gerarProximoNumeroAterramento() {
  const registros = all(`SELECT numero FROM laudos_aterramento WHERE numero LIKE 'LA%'`);
  let maior = 0;
  registros.forEach((r) => {
    const m = /^LA(\d{4,})$/.exec((r.numero || '').trim());
    if (m) maior = Math.max(maior, Number(m[1]));
  });
  return `LA${String(maior + 1).padStart(4, '0')}`;
}

export function renderLaudoAterramento(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Laudo de Aterramento</h2>
      <button id="btn-novo-aterramento">+ Novo laudo de aterramento</button>
      <ul id="lista-aterramento" class="lista"></ul>
      <div id="form-aterramento-wrap"></div>
    </div>
  `;

  const listaEl = container.querySelector('#lista-aterramento');
  const formWrap = container.querySelector('#form-aterramento-wrap');

  function renderLista() {
    const itens = all(`
      SELECT la.id, la.numero, la.status, la.data_medicao, la.resistencia_aterramento, c.nome as cliente_nome
      FROM laudos_aterramento la LEFT JOIN clientes c ON c.id = la.cliente_id
      ORDER BY la.id DESC
    `);
    listaEl.innerHTML = itens.map((l) => `
      <li data-id="${l.id}">
        <div class="item-principal">
          <strong>Laudo de Aterramento ${escapeHtml(l.numero || `#${l.id}`)} — ${escapeHtml(l.cliente_nome || 'Sem cliente')}</strong>
          <span class="item-sub">${l.status}${l.data_medicao ? ` · ${formatarData(l.data_medicao)}` : ''}${l.resistencia_aterramento != null ? ` · R = ${formatarNumero(l.resistencia_aterramento)} Ω` : ''}</span>
        </div>
        <button class="btn-editar" data-id="${l.id}">Abrir</button>
      </li>
    `).join('') || '<li><em>Nenhum laudo de aterramento cadastrado</em></li>';

    listaEl.querySelectorAll('.btn-editar').forEach((btn) => {
      btn.addEventListener('click', () => renderForm(Number(btn.dataset.id)));
    });
  }

  function renderForm(id = null) {
    const laudo = id ? all('SELECT * FROM laudos_aterramento WHERE id = ?', [id])[0] : {};

    formWrap.innerHTML = `
      <div class="card form-card">
        <h3>${id ? `Laudo de Aterramento ${laudo.numero ? escapeHtml(laudo.numero) : `#${id}`}` : 'Novo Laudo de Aterramento'}</h3>

        <label>Nº do Laudo</label>
        <input id="f-numero" type="text" value="${val(id ? laudo.numero : gerarProximoNumeroAterramento())}" readonly />

        <label>Cliente *</label>
        <select id="f-cliente">
          <option value="">Selecione</option>
          ${all('SELECT id, nome FROM clientes ORDER BY nome').map((c) =>
            `<option value="${c.id}" ${laudo.cliente_id === c.id ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`
          ).join('')}
        </select>

        <label>Endereço completo</label>
        <input id="f-endereco" type="text" value="${val(laudo.endereco)}" />

        <label>Telefone</label>
        <input id="f-telefone" type="text" value="${val(laudo.telefone)}" />

        <label>Celular</label>
        <input id="f-celular" type="text" value="${val(laudo.celular)}" />

        <label>Data da medição</label>
        <input id="f-data" type="date" value="${val(laudo.data_medicao)}" />

        <label>Responsável técnico</label>
        <input id="f-resp-tecnico" type="text" value="${val(laudo.responsavel_tecnico)}" />
      </div>

      <div class="card form-card">
        <h3>Medições</h3>

        <label>Quantidade de hastes</label>
        <select id="f-hastes">
          ${OPCOES_HASTES.map((n) =>
            `<option value="${n}" ${(laudo.quantidade_hastes || 1) === n ? 'selected' : ''}>${n}</option>`).join('')}
        </select>

        <label>Voltagem entre fase e neutro (V)</label>
        <input id="f-v-fn" type="number" step="0.01" value="${val(laudo.voltagem_fase_neutro)}" />

        <label>Voltagem entre fase e terra — sem carga (V)</label>
        <input id="f-v-ft-sem" type="number" step="0.01" value="${val(laudo.voltagem_fase_terra_sem_carga)}" />

        <label>Voltagem entre fase e terra — com carga (V)</label>
        <input id="f-v-ft-com" type="number" step="0.01" value="${val(laudo.voltagem_fase_terra_com_carga)}" />

        <label>Amperagem com carga (A)</label>
        <input id="f-amperagem" type="number" step="0.01" value="${val(laudo.amperagem_com_carga)}" />

        <label>Resistência do aterramento (Ω) — calculado</label>
        <input id="f-resistencia" type="text" value="${val(laudo.resistencia_aterramento != null ? formatarNumero(laudo.resistencia_aterramento) : '')}" readonly />
        <p class="item-sub campo-full">Calculado como Voltagem fase-terra (com carga) ÷ Amperagem com carga. Referência prática de mercado: ≤ 10 Ω.</p>

        <label class="campo-full">Observações</label>
        <textarea id="f-obs" class="campo-full">${val(laudo.observacao)}</textarea>
      </div>

      <div class="card">
        <button id="btn-salvar-aterramento">Salvar laudo</button>
        <button id="btn-cancelar-aterramento" class="secondary">Cancelar</button>
        <button id="btn-imprimir-aterramento" class="secondary">Exportar PDF</button>
        ${id ? '<button id="btn-excluir-aterramento" class="danger">Excluir</button>' : ''}
        <p id="form-erro" class="pin-erro"></p>
      </div>
    `;

    // ---- Cliente: ao escolher, sugere endereço/telefone se ainda vazios
    // (mesmo comportamento do Laudo Técnico e da O.S.) ----
    formWrap.querySelector('#f-cliente').addEventListener('change', (e) => {
      const clienteId = Number(e.target.value) || null;
      if (!clienteId) return;
      const c = all('SELECT * FROM clientes WHERE id = ?', [clienteId])[0];
      if (!c) return;
      const endEl = formWrap.querySelector('#f-endereco');
      const telEl = formWrap.querySelector('#f-telefone');
      const celEl = formWrap.querySelector('#f-celular');
      if (!endEl.value) endEl.value = [c.endereco, c.bairro, c.cidade, c.uf].filter(Boolean).join(', ');
      if (!telEl.value) telEl.value = c.fone1 || '';
      if (!celEl.value) celEl.value = c.celular1 || '';
    });

    // ---- Cálculo automático da resistência, ao vivo ----
    function recalcularResistencia() {
      const vComCarga = Number(formWrap.querySelector('#f-v-ft-com').value);
      const amperagem = Number(formWrap.querySelector('#f-amperagem').value);
      const campoResistencia = formWrap.querySelector('#f-resistencia');
      if (vComCarga > 0 && amperagem > 0) {
        campoResistencia.value = formatarNumero(vComCarga / amperagem);
      } else {
        campoResistencia.value = '';
      }
    }
    formWrap.querySelector('#f-v-ft-com').addEventListener('input', recalcularResistencia);
    formWrap.querySelector('#f-amperagem').addEventListener('input', recalcularResistencia);

    // ---- Ações ----
    formWrap.querySelector('#btn-cancelar-aterramento').addEventListener('click', () => { formWrap.innerHTML = ''; });

    // Lê o formulário inteiro (usado tanto para salvar quanto para o PDF, que
    // por isso sai igual ao que está na tela, mesmo antes de salvar).
    function coletarRegistro() {
      const vComCarga = numOuNull(formWrap.querySelector('#f-v-ft-com').value);
      const amperagem = numOuNull(formWrap.querySelector('#f-amperagem').value);
      const resistencia = (vComCarga && amperagem) ? vComCarga / amperagem : null;
      return {
        numero: formWrap.querySelector('#f-numero').value.trim() || null,
        cliente_id: Number(formWrap.querySelector('#f-cliente').value) || null,
        endereco: formWrap.querySelector('#f-endereco').value.trim(),
        telefone: formWrap.querySelector('#f-telefone').value.trim(),
        celular: formWrap.querySelector('#f-celular').value.trim(),
        data_medicao: formWrap.querySelector('#f-data').value || null,
        responsavel_tecnico: formWrap.querySelector('#f-resp-tecnico').value.trim(),
        quantidade_hastes: Number(formWrap.querySelector('#f-hastes').value) || 1,
        voltagem_fase_neutro: numOuNull(formWrap.querySelector('#f-v-fn').value),
        voltagem_fase_terra_sem_carga: numOuNull(formWrap.querySelector('#f-v-ft-sem').value),
        voltagem_fase_terra_com_carga: vComCarga,
        amperagem_com_carga: amperagem,
        resistencia_aterramento: resistencia,
        observacao: formWrap.querySelector('#f-obs').value.trim(),
      };
    }

    formWrap.querySelector('#btn-imprimir-aterramento').addEventListener('click', () => {
      const registro = coletarRegistro();
      const opt = formWrap.querySelector('#f-cliente').selectedOptions[0];
      registro.cliente_nome = registro.cliente_id && opt ? opt.textContent : '';
      gerarPdf(registro);
    });

    if (id) {
      formWrap.querySelector('#btn-excluir-aterramento').addEventListener('click', async () => {
        if (!confirm('Excluir este laudo de aterramento definitivamente?')) return;
        run('DELETE FROM laudos_aterramento WHERE id = ?', [id]);
        await persist();
        formWrap.innerHTML = '';
        renderLista();
      });
    }

    formWrap.querySelector('#btn-salvar-aterramento').addEventListener('click', async () => {
      const cliente_id = Number(formWrap.querySelector('#f-cliente').value) || null;
      if (!cliente_id) {
        formWrap.querySelector('#form-erro').textContent = 'Selecione um cliente.';
        return;
      }

      const registro = coletarRegistro();

      if (id) {
        run(`UPDATE laudos_aterramento SET numero=?, cliente_id=?, endereco=?, telefone=?, celular=?, data_medicao=?,
             responsavel_tecnico=?, quantidade_hastes=?, voltagem_fase_neutro=?, voltagem_fase_terra_sem_carga=?,
             voltagem_fase_terra_com_carga=?, amperagem_com_carga=?, resistencia_aterramento=?, observacao=? WHERE id=?`,
          [...Object.values(registro), id]);
      } else {
        const cols = Object.keys(registro).join(', ');
        const placeholders = Object.keys(registro).map(() => '?').join(', ');
        run(`INSERT INTO laudos_aterramento (${cols}) VALUES (${placeholders})`, Object.values(registro));
      }

      await persist();
      formWrap.innerHTML = '';
      renderLista();
    });
  }

  container.querySelector('#btn-novo-aterramento').addEventListener('click', () => renderForm(null));
  renderLista();
}

// ---------- Exportação em PDF (papel timbrado, uma página) ----------

async function gerarPdf(r) {
  const logo = await carregarLogoBase64();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const larguraPagina = doc.internal.pageSize.getWidth();
  const larguraUtil = larguraPagina - 2 * MARGEM;
  let y = desenharCabecalho(doc, logo, 'LAUDO DE ATERRAMENTO');

  doc.setFontSize(15);
  doc.setFont(undefined, 'bold');
  doc.text('Laudo de Aterramento', MARGEM, y);
  doc.setFontSize(12);
  doc.text(r.numero ? `Nº ${r.numero}` : '', larguraPagina - MARGEM, y, { align: 'right' });
  doc.setFont(undefined, 'normal');
  y += 6;

  const rotulo = { fontStyle: 'bold', fillColor: [230, 230, 230], cellWidth: 38 };
  const estiloBase = { textColor: [0, 0, 0], lineColor: COR_LINHA, lineWidth: 0.2, fontSize: 10, cellPadding: 2.2 };
  const margens = { left: MARGEM, right: MARGEM, bottom: 24 };

  function titulo(texto) {
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text(texto, MARGEM, y);
    doc.setFont(undefined, 'normal');
    y += 2;
  }

  // ---- Cliente e serviço ----
  titulo('Dados do cliente');
  doc.autoTable({
    startY: y,
    theme: 'grid',
    styles: estiloBase,
    margin: margens,
    columnStyles: { 0: rotulo, 1: { cellWidth: 'auto' }, 2: rotulo, 3: { cellWidth: 46 } },
    body: [
      ['Cliente', { content: r.cliente_nome || '—', colSpan: 3 }],
      ['Endereço', { content: r.endereco || '—', colSpan: 3 }],
      ['Telefone', r.telefone || '—', 'Celular', r.celular || '—'],
      ['Data da medição', formatarData(r.data_medicao) || '—', 'Responsável técnico', r.responsavel_tecnico || '—'],
    ],
  });
  y = doc.lastAutoTable.finalY + 8;

  // ---- Medições ----
  titulo('Medições');
  const num = (v, un) => (v === null || v === undefined || v === '' ? '—' : `${formatarNumero(v)} ${un}`);
  doc.autoTable({
    startY: y,
    theme: 'grid',
    styles: estiloBase,
    margin: margens,
    columnStyles: { 0: { fontStyle: 'bold', fillColor: [230, 230, 230] }, 1: { cellWidth: 50, halign: 'right' } },
    body: [
      ['Quantidade de hastes', String(r.quantidade_hastes || 1)],
      ['Voltagem entre fase e neutro', num(r.voltagem_fase_neutro, 'V')],
      ['Voltagem entre fase e terra — sem carga', num(r.voltagem_fase_terra_sem_carga, 'V')],
      ['Voltagem entre fase e terra — com carga', num(r.voltagem_fase_terra_com_carga, 'V')],
      ['Amperagem com carga', num(r.amperagem_com_carga, 'A')],
      [
        { content: 'Resistência do aterramento (calculada)', styles: { fontStyle: 'bold' } },
        { content: num(r.resistencia_aterramento, 'ohms'), styles: { fontStyle: 'bold', fontSize: 11 } },
      ],
    ],
  });
  y = doc.lastAutoTable.finalY + 4;
  doc.setFontSize(8.5);
  doc.setTextColor(90, 90, 90);
  const nota = doc.splitTextToSize(
    'Resistência = voltagem fase-terra (com carga) ÷ amperagem com carga. Referência prática de mercado: até 10 ohms.',
    larguraUtil,
  );
  doc.text(nota, MARGEM, y);
  y += nota.length * 4 + 6;
  doc.setTextColor(0, 0, 0);

  // ---- Observações ----
  if (r.observacao) {
    titulo('Observações');
    doc.autoTable({
      startY: y,
      theme: 'grid',
      styles: estiloBase,
      margin: margens,
      body: [[r.observacao]],
    });
    y = doc.lastAutoTable.finalY + 6;
  }

  desenharRodape(doc);
  const nomeArquivo = `laudo-aterramento-${r.numero || 'novo'}-${(r.cliente_nome || 'cliente').replace(/[^a-z0-9]+/gi, '-')}.pdf`;
  entregarPdf(doc, nomeArquivo, {
    mensagem: `Laudo de Aterramento${r.numero ? ` ${r.numero}` : ''} — RR Elétrica`,
    telefone: r.celular || r.telefone,
  });
}

// ---------- Helpers ----------

function val(v) { return v === undefined || v === null ? '' : String(v).replace(/"/g, '&quot;'); }
function numOuNull(v) { return v === '' || v === undefined || v === null ? null : Number(v); }
function formatarNumero(v) { return Number(v).toFixed(2).replace('.', ','); }
function formatarData(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = String(iso).split('-');
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
