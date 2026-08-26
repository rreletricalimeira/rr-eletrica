import { all, run, persist } from '../db/db.js';

export function renderFinanceiro(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Financeiro</h2>

      <div class="card">
        <h3>Filtros</h3>
        <div class="linha-dupla">
          <div><label>De</label><input id="filtro-de" type="date" /></div>
          <div><label>Até</label><input id="filtro-ate" type="date" /></div>
        </div>
        <label>Caixa</label>
        <select id="filtro-caixa">
          <option value="">(Todos)</option>
          ${all('SELECT id, nome FROM contas_caixa ORDER BY nome').map((c) => `<option value="${c.id}">${c.nome}</option>`).join('')}
        </select>
        <button id="btn-filtrar">Filtrar</button>
      </div>

      <div class="card" id="resumo-totais"></div>

      <button id="btn-novo-lancamento">+ Novo lançamento manual</button>
      <div id="form-lancamento-wrap"></div>

      <ul id="lista-financeiro" class="lista"></ul>
    </div>
  `;

  const listaEl = container.querySelector('#lista-financeiro');
  const resumoEl = container.querySelector('#resumo-totais');
  const formWrap = container.querySelector('#form-lancamento-wrap');

  function buscarLancamentos() {
    const de = container.querySelector('#filtro-de').value;
    const ate = container.querySelector('#filtro-ate').value;
    const caixaId = container.querySelector('#filtro-caixa').value;

    let sql = `
      SELECT f.*, cc.nome as caixa_nome
      FROM financeiro f LEFT JOIN contas_caixa cc ON cc.id = f.conta_caixa_id
      WHERE 1=1
    `;
    const params = [];
    if (de) { sql += ' AND date(f.data) >= date(?)'; params.push(de); }
    if (ate) { sql += ' AND date(f.data) <= date(?)'; params.push(ate); }
    if (caixaId) { sql += ' AND f.conta_caixa_id = ?'; params.push(Number(caixaId)); }
    sql += ' ORDER BY f.data DESC, f.id DESC';

    return all(sql, params);
  }

  function renderTudo() {
    const lancamentos = buscarLancamentos();

    const totalEntradas = lancamentos.filter((l) => l.tipo === 'Entrada').reduce((a, l) => a + l.valor_total, 0);
    const totalSaidas = lancamentos.filter((l) => l.tipo === 'Saida').reduce((a, l) => a + l.valor_total, 0);
    const saldo = totalEntradas - totalSaidas;

    resumoEl.innerHTML = `
      <p class="item-sub">Entradas: <strong style="color:#22c55e">${formatarMoeda(totalEntradas)}</strong></p>
      <p class="item-sub">Saídas: <strong style="color:#ef4444">${formatarMoeda(totalSaidas)}</strong></p>
      <p class="item-sub">Saldo do período: <strong>${formatarMoeda(saldo)}</strong></p>
    `;

    listaEl.innerHTML = lancamentos.map((l) => `
      <li data-id="${l.id}">
        <div class="item-principal">
          <strong style="color:${l.tipo === 'Entrada' ? '#22c55e' : '#ef4444'}">${l.tipo === 'Entrada' ? '+ ' : '- '}${formatarMoeda(l.valor_total)}</strong>
          <span class="item-sub">${new Date(l.data).toLocaleDateString('pt-BR')} · ${l.categoria || '-'} · ${l.caixa_nome || 'Sem caixa definido'} · ${escapeHtml(l.descricao || '')}${l.origem === 'automatico' ? ' · (auto)' : ''}</span>
        </div>
        ${l.origem === 'manual' ? `<button class="btn-excluir-lanc" data-id="${l.id}">Excluir</button>` : ''}
      </li>
    `).join('') || '<li><em>Nenhum lançamento no período/filtro selecionado</em></li>';

    listaEl.querySelectorAll('.btn-excluir-lanc').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Excluir este lançamento?')) return;
        run('DELETE FROM financeiro WHERE id = ?', [Number(btn.dataset.id)]);
        await persist();
        renderTudo();
      });
    });
  }

  container.querySelector('#btn-filtrar').addEventListener('click', renderTudo);

  container.querySelector('#btn-novo-lancamento').addEventListener('click', () => {
    formWrap.innerHTML = `
      <div class="card form-card">
        <h3>Novo lançamento manual</h3>

        <label>Tipo</label>
        <select id="f-tipo">
          <option value="Entrada">Entrada</option>
          <option value="Saida">Saída</option>
        </select>

        <label>Data</label>
        <input id="f-data" type="date" value="${new Date().toISOString().slice(0, 10)}" />

        <label>Valor Total (R$)</label>
        <input id="f-valor" type="number" step="0.01" />

        <label>Categoria</label>
        <input id="f-categoria" placeholder="Ex: Despesa, Combustível..." />

        <label>Caixa</label>
        <select id="f-caixa">
          <option value="">Selecione</option>
          ${all('SELECT id, nome FROM contas_caixa ORDER BY nome').map((c) => `<option value="${c.id}">${c.nome}</option>`).join('')}
        </select>

        <label>Descrição</label>
        <input id="f-descricao" placeholder="Ex: Abastecimento combustível" />

        <button id="btn-salvar-lancamento">Salvar</button>
        <button id="btn-cancelar-lancamento" class="secondary">Cancelar</button>
        <p id="form-erro" class="pin-erro"></p>
      </div>
    `;

    formWrap.querySelector('#btn-cancelar-lancamento').addEventListener('click', () => { formWrap.innerHTML = ''; });

    formWrap.querySelector('#btn-salvar-lancamento').addEventListener('click', async () => {
      const valor = Number(formWrap.querySelector('#f-valor').value);
      if (!valor || valor <= 0) {
        formWrap.querySelector('#form-erro').textContent = 'Informe um valor válido.';
        return;
      }
      run(`INSERT INTO financeiro (tipo, data, valor_total, categoria, descricao, origem, conta_caixa_id)
           VALUES (?, ?, ?, ?, ?, 'manual', ?)`,
        [
          formWrap.querySelector('#f-tipo').value,
          formWrap.querySelector('#f-data').value,
          valor,
          formWrap.querySelector('#f-categoria').value.trim(),
          formWrap.querySelector('#f-descricao').value.trim(),
          numOuNull(formWrap.querySelector('#f-caixa').value),
        ]);
      await persist();
      formWrap.innerHTML = '';
      renderTudo();
    });
  });

  renderTudo();
}

function numOuNull(v) { return v === '' || v === undefined || v === null ? null : Number(v); }
function formatarMoeda(v) { return v === null || v === undefined ? 'R$ 0,00' : `R$ ${Number(v).toFixed(2)}`; }
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
