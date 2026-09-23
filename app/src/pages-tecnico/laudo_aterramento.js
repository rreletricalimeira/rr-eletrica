import { all, run, persist } from '../db/db.js';

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
      SELECT la.id, la.status, la.data_medicao, la.resistencia_aterramento, c.nome as cliente_nome
      FROM laudos_aterramento la LEFT JOIN clientes c ON c.id = la.cliente_id
      ORDER BY la.id DESC
    `);
    listaEl.innerHTML = itens.map((l) => `
      <li data-id="${l.id}">
        <div class="item-principal">
          <strong>Laudo de Aterramento #${l.id} — ${escapeHtml(l.cliente_nome || 'Sem cliente')}</strong>
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
        <h3>${id ? `Laudo de Aterramento #${id}` : 'Novo Laudo de Aterramento'}</h3>

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
        <button id="btn-imprimir-aterramento" class="secondary">Imprimir / Exportar PDF</button>
        ${id ? '<button id="btn-excluir-aterramento" class="danger">Excluir</button>' : ''}
        <p id="form-erro" class="pin-erro"></p>
      </div>
    `;

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
    formWrap.querySelector('#btn-imprimir-aterramento').addEventListener('click', () => window.print());

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

      const vComCarga = numOuNull(formWrap.querySelector('#f-v-ft-com').value);
      const amperagem = numOuNull(formWrap.querySelector('#f-amperagem').value);
      const resistencia = (vComCarga && amperagem) ? vComCarga / amperagem : null;

      const registro = {
        cliente_id,
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

      if (id) {
        run(`UPDATE laudos_aterramento SET cliente_id=?, endereco=?, telefone=?, celular=?, data_medicao=?,
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
