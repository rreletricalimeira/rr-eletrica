import { all, run, persist } from '../db/db.js';

export function renderManutencaoVeiculo(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Manutenção / Abastecimento</h2>
      <label>Veículo</label>
      <select id="filtro-veiculo">
        <option value="">Selecione um veículo</option>
        ${all('SELECT id, veiculo FROM veiculos ORDER BY veiculo').map((v) => `<option value="${v.id}">${v.veiculo}</option>`).join('')}
      </select>
      <div id="conteudo-veiculo"></div>
    </div>
  `;

  const filtroVeiculo = container.querySelector('#filtro-veiculo');
  const conteudoEl = container.querySelector('#conteudo-veiculo');

  filtroVeiculo.addEventListener('change', () => {
    const veiculoId = Number(filtroVeiculo.value);
    if (veiculoId) renderConteudo(veiculoId);
    else conteudoEl.innerHTML = '';
  });

  function renderConteudo(veiculoId) {
    conteudoEl.innerHTML = `
      <button id="btn-novo-lancamento">+ Novo lançamento</button>
      <ul id="lista-lancamentos" class="lista"></ul>
      <div id="form-lancamento-wrap"></div>
    `;

    const listaEl = conteudoEl.querySelector('#lista-lancamentos');
    const formWrap = conteudoEl.querySelector('#form-lancamento-wrap');

    function renderLista() {
      const itens = all('SELECT * FROM manutencao_veiculo WHERE veiculo_id = ? ORDER BY km DESC, id DESC', [veiculoId]);

      // Consumo médio: entre um abastecimento com tanque_cheio e o anterior com tanque_cheio
      const abastecimentosCheios = itens
        .filter((i) => i.tipo === 'Abastecimento' && i.tanque_cheio)
        .sort((a, b) => a.km - b.km);

      const consumoPorId = {};
      for (let i = 1; i < abastecimentosCheios.length; i++) {
        const anterior = abastecimentosCheios[i - 1];
        const atual = abastecimentosCheios[i];
        const distancia = atual.km - anterior.km;
        if (distancia > 0 && atual.litros) {
          consumoPorId[atual.id] = (distancia / atual.litros).toFixed(2);
        }
      }

      listaEl.innerHTML = itens.map((i) => `
        <li data-id="${i.id}">
          <div class="item-principal">
            <strong>${i.tipo} · ${i.km} km</strong>
            <span class="item-sub">
              ${new Date(i.data).toLocaleDateString('pt-BR')} · ${formatarMoeda(i.valor)}
              ${i.litros ? ` · ${i.litros} L` : ''}
              ${consumoPorId[i.id] ? ` · ${consumoPorId[i.id]} km/l` : ''}
              ${i.descricao ? ` · ${escapeHtml(i.descricao)}` : ''}
            </span>
          </div>
          <button class="btn-editar" data-id="${i.id}">Editar</button>
        </li>
      `).join('') || '<li><em>Nenhum lançamento para este veículo</em></li>';

      listaEl.querySelectorAll('.btn-editar').forEach((btn) => {
        btn.addEventListener('click', () => renderForm(Number(btn.dataset.id)));
      });
    }

    function renderForm(id = null) {
      const i = id ? all('SELECT * FROM manutencao_veiculo WHERE id = ?', [id])[0] : {};

      formWrap.innerHTML = `
        <div class="card form-card">
          <h3>${id ? 'Editar lançamento' : 'Novo lançamento'}</h3>

          <label>Descrição</label>
          <input id="f-descricao" value="${val(i.descricao)}" />

          <label>KM</label>
          <input id="f-km" type="number" step="0.1" value="${val(i.km)}" />

          <label>Tipo</label>
          <select id="f-tipo">
            <option value="Abastecimento" ${i.tipo === 'Abastecimento' ? 'selected' : ''}>Abastecimento</option>
            <option value="Manutenção" ${i.tipo === 'Manutenção' ? 'selected' : ''}>Manutenção</option>
          </select>

          <div id="bloco-litros" style="display:${i.tipo === 'Abastecimento' ? 'block' : 'none'}">
            <label>Litros</label>
            <input id="f-litros" type="number" step="0.01" value="${val(i.litros)}" />

            <label class="linha-checkbox"><input id="f-tanque-cheio" type="checkbox" ${i.tanque_cheio ? 'checked' : ''} /> Tanque cheio (para cálculo de média)</label>
          </div>

          <label>Data</label>
          <input id="f-data" type="date" value="${i.data ? String(i.data).slice(0, 10) : new Date().toISOString().slice(0, 10)}" />

          <label>Valor (R$)</label>
          <input id="f-valor" type="number" step="0.01" value="${val(i.valor)}" />

          <label>Posto/Oficina</label>
          <input id="f-posto" value="${val(i.posto_oficina)}" />

          <label>Caixa (de onde saiu o dinheiro)</label>
          <select id="f-caixa">
            <option value="">Selecione</option>
            ${all('SELECT id, nome FROM contas_caixa ORDER BY nome').map((c) =>
              `<option value="${c.id}" ${i.conta_caixa_id === c.id ? 'selected' : ''}>${c.nome}</option>`
            ).join('')}
          </select>

          <label>Observação</label>
          <textarea id="f-obs">${val(i.observacao)}</textarea>

          <button id="btn-salvar">Salvar</button>
          <button id="btn-cancelar" class="secondary">Cancelar</button>
          ${id ? '<button id="btn-excluir" class="danger">Excluir</button>' : ''}
          <p id="form-erro" class="pin-erro"></p>
        </div>
      `;

      formWrap.querySelector('#f-tipo').addEventListener('change', (e) => {
        formWrap.querySelector('#bloco-litros').style.display = e.target.value === 'Abastecimento' ? 'block' : 'none';
      });

      formWrap.querySelector('#btn-cancelar').addEventListener('click', () => { formWrap.innerHTML = ''; });

      formWrap.querySelector('#btn-salvar').addEventListener('click', async () => {
        const km = numOuNull(formWrap.querySelector('#f-km').value);
        const tipo = formWrap.querySelector('#f-tipo').value;
        const valor = numOuNull(formWrap.querySelector('#f-valor').value);
        const data = formWrap.querySelector('#f-data').value;
        const conta_caixa_id = numOuNull(formWrap.querySelector('#f-caixa').value);
        const descricao = formWrap.querySelector('#f-descricao').value.trim();

        const dados = {
          veiculo_id: veiculoId,
          descricao,
          km,
          tipo,
          tanque_cheio: (tipo === 'Abastecimento' && formWrap.querySelector('#f-tanque-cheio')?.checked) ? 1 : 0,
          data,
          valor,
          litros: tipo === 'Abastecimento' ? numOuNull(formWrap.querySelector('#f-litros').value) : null,
          posto_oficina: formWrap.querySelector('#f-posto').value.trim(),
          observacao: formWrap.querySelector('#f-obs').value.trim(),
          conta_caixa_id,
        };

        let registroId = id;
        let financeiroId = i.financeiro_id || null;

        // Gera/atualiza o lançamento espelho no Financeiro (Saída)
        if (valor && valor > 0) {
          const nomeVeiculo = all('SELECT veiculo FROM veiculos WHERE id = ?', [veiculoId])[0]?.veiculo || '';
          const descFinanceiro = `${tipo} - ${nomeVeiculo}${descricao ? ' - ' + descricao : ''}`;
          if (financeiroId) {
            run('UPDATE financeiro SET data=?, valor_total=?, categoria=?, descricao=?, conta_caixa_id=? WHERE id=?',
              [data, valor, tipo, descFinanceiro, conta_caixa_id, financeiroId]);
          } else {
            run(`INSERT INTO financeiro (tipo, data, valor_total, categoria, descricao, origem, conta_caixa_id)
                 VALUES ('Saida', ?, ?, ?, ?, 'automatico', ?)`,
              [data, valor, tipo, descFinanceiro, conta_caixa_id]);
            financeiroId = all('SELECT last_insert_rowid() as id')[0].id;
          }
        }

        dados.financeiro_id = financeiroId;

        if (id) {
          run(`UPDATE manutencao_veiculo SET descricao=?, km=?, tipo=?, tanque_cheio=?, data=?, valor=?, litros=?,
               posto_oficina=?, observacao=?, conta_caixa_id=?, financeiro_id=? WHERE id=?`,
            [dados.descricao, dados.km, dados.tipo, dados.tanque_cheio, dados.data, dados.valor, dados.litros,
             dados.posto_oficina, dados.observacao, dados.conta_caixa_id, dados.financeiro_id, id]);
        } else {
          run(`INSERT INTO manutencao_veiculo (veiculo_id, descricao, km, tipo, tanque_cheio, data, valor, litros,
               posto_oficina, observacao, conta_caixa_id, financeiro_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [veiculoId, dados.descricao, dados.km, dados.tipo, dados.tanque_cheio, dados.data, dados.valor,
             dados.litros, dados.posto_oficina, dados.observacao, dados.conta_caixa_id, dados.financeiro_id]);
        }

        await persist();
        formWrap.innerHTML = '';
        renderLista();
      });

      if (id) {
        formWrap.querySelector('#btn-excluir').addEventListener('click', async () => {
          if (!confirm('Excluir este lançamento? O gasto correspondente no Financeiro também será removido.')) return;
          if (i.financeiro_id) run('DELETE FROM financeiro WHERE id = ?', [i.financeiro_id]);
          run('DELETE FROM manutencao_veiculo WHERE id = ?', [id]);
          await persist();
          formWrap.innerHTML = '';
          renderLista();
        });
      }
    }

    conteudoEl.querySelector('#btn-novo-lancamento').addEventListener('click', () => renderForm());
    renderLista();
  }
}

function val(v) { return v === undefined || v === null ? '' : String(v).replace(/"/g, '&quot;'); }
function numOuNull(v) { return v === '' || v === undefined || v === null ? null : Number(v); }
function formatarMoeda(v) { return v === null || v === undefined ? '-' : `R$ ${Number(v).toFixed(2)}`; }
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
