import { all, run, persist } from '../db/db.js';
import { montarEnderecoEmLinha, obterOuCriarCategoriaFinanceiro } from '../db/lookups.js';
import { montarFormProduto } from './produtos.js';

// Compras: cabeçalho (data, fornecedor, endereço, telefone) + tabela filha de
// produtos. Cada produto comprado mostra os campos do cadastro de produtos
// (menos "descontinuado") para conferir/ajustar custo, margem, venda etc.
// Ao salvar a compra, o cadastro de produtos é atualizado com esses dados e a
// quantidade comprada é somada ao estoque (nos produtos com controle de estoque).

export function renderCompras(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Compras</h2>
      <button id="btn-nova-compra">+ Nova compra</button>
      <ul id="lista-compras" class="lista"></ul>
      <div id="form-compra-wrap"></div>
    </div>
  `;

  const listaEl = container.querySelector('#lista-compras');
  const formWrap = container.querySelector('#form-compra-wrap');

  function renderLista() {
    const compras = all(`
      SELECT id, data, fornecedor_nome, valor_total FROM compras ORDER BY data DESC, id DESC
    `);
    listaEl.innerHTML = compras.map((c) => `
      <li data-id="${c.id}">
        <div class="item-principal">
          <strong>Compra ${c.id} — ${escapeHtml(c.fornecedor_nome || 'Sem fornecedor')}</strong>
          <span class="item-sub">${formatarData(c.data)} · ${formatarMoeda(c.valor_total)}</span>
        </div>
        <button class="btn-editar" data-id="${c.id}">Abrir</button>
      </li>
    `).join('') || '<li><em>Nenhuma compra cadastrada</em></li>';

    listaEl.querySelectorAll('.btn-editar').forEach((btn) => {
      btn.addEventListener('click', () => renderForm(Number(btn.dataset.id)));
    });
  }

  function renderForm(id = null) {
    const c = id ? all('SELECT * FROM compras WHERE id = ?', [id])[0] : {};
    const fornecedores = all('SELECT * FROM fornecedores ORDER BY nome');
    let fornecedorIdAtual = c.fornecedor_id || null;

    formWrap.innerHTML = `
      <div class="card form-card" id="compra-cabecalho">
        <h3>${id ? `Compra ${id}` : 'Nova compra'}</h3>

        <div class="grid-campos grid-compra-topo">
          <div class="campo">
            <label>Data</label>
            <input id="c-data" type="date" value="${val(c.data ? String(c.data).slice(0, 10) : new Date().toISOString().slice(0, 10))}" />
          </div>
          <div class="campo">
            <label>Fornecedor *</label>
            <input id="c-fornecedor" list="lista-fornecedores-compra" autocomplete="off"
                   placeholder="Escolha da lista ou digite outro" value="${val(c.fornecedor_nome)}" />
            <datalist id="lista-fornecedores-compra">
              ${fornecedores.map((f) => `<option value="${val(f.nome)}"></option>`).join('')}
            </datalist>
          </div>
          <div class="campo">
            <label>Telefone</label>
            <input id="c-telefone" value="${val(c.telefone)}" />
          </div>
        </div>

        <div class="grid-campos grid-compra-endereco">
          <div class="campo">
            <label>Endereço</label>
            <input id="c-endereco" value="${val(c.endereco)}" />
          </div>
          <div class="campo">
            <label>Caixa (de onde saiu o pagamento)</label>
            <select id="c-caixa">
              <option value="">Selecione</option>
              ${all('SELECT id, nome FROM contas_caixa ORDER BY nome').map((cx) =>
                `<option value="${cx.id}" ${c.conta_caixa_id === cx.id ? 'selected' : ''}>${escapeHtml(cx.nome)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="campo campo-full">
          <label>Observação</label>
          <textarea id="c-obs">${val(c.observacao)}</textarea>
        </div>
      </div>

      <div class="card" id="compra-itens"></div>

      <div class="card">
        <button id="btn-salvar-compra">${id ? 'Salvar alterações' : 'Salvar compra'}</button>
        <button id="btn-cancelar-compra" class="secondary">${id ? 'Fechar' : 'Cancelar'}</button>
        ${id ? '<button id="btn-excluir-compra" class="danger">Excluir</button>' : ''}
        <p id="form-erro" class="pin-erro"></p>
      </div>
    `;

    // Fornecedor: escolhido da lista (liga ao cadastro e traz endereço/telefone)
    // ou digitado livremente (compra de quem não está cadastrado).
    const inputForn = formWrap.querySelector('#c-fornecedor');
    inputForn.addEventListener('input', () => {
      const f = fornecedores.find((x) => x.nome.toLowerCase() === inputForn.value.trim().toLowerCase());
      fornecedorIdAtual = f ? f.id : null;
      if (f) {
        formWrap.querySelector('#c-endereco').value = montarEnderecoEmLinha(f);
        formWrap.querySelector('#c-telefone').value = f.celular1 || f.fone1 || '';
      }
    });

    formWrap.querySelector('#btn-cancelar-compra').addEventListener('click', () => { formWrap.innerHTML = ''; });

    const secaoItens = formWrap.querySelector('#compra-itens');
    const lerItens = id ? montarItensSomenteLeitura(secaoItens, id) : montarItensEditaveis(secaoItens, formWrap, container);

    formWrap.querySelector('#btn-salvar-compra').addEventListener('click', async () => {
      const erroEl = formWrap.querySelector('#form-erro');
      erroEl.textContent = '';

      const data = formWrap.querySelector('#c-data').value;
      // Se bate com um fornecedor cadastrado, grava o nome como está no cadastro.
      const fornecedorCadastrado = fornecedores.find((x) => x.id === fornecedorIdAtual);
      const fornecedor_nome = fornecedorCadastrado ? fornecedorCadastrado.nome : inputForn.value.trim();
      if (!data) { erroEl.textContent = 'Informe a data da compra.'; return; }
      if (!fornecedor_nome) { erroEl.textContent = 'Informe o fornecedor.'; return; }

      const cabecalho = {
        data,
        fornecedor_id: fornecedorIdAtual,
        fornecedor_nome,
        endereco: formWrap.querySelector('#c-endereco').value.trim(),
        telefone: formWrap.querySelector('#c-telefone').value.trim(),
        conta_caixa_id: numOuNull(formWrap.querySelector('#c-caixa').value),
        observacao: formWrap.querySelector('#c-obs').value.trim(),
      };

      // Compra já salva: só o cabeçalho muda (os itens já atualizaram produtos e estoque).
      if (id) {
        run('UPDATE compras SET data=?, fornecedor_id=?, fornecedor_nome=?, endereco=?, telefone=?, conta_caixa_id=?, observacao=? WHERE id=?',
          [cabecalho.data, cabecalho.fornecedor_id, cabecalho.fornecedor_nome, cabecalho.endereco, cabecalho.telefone, cabecalho.conta_caixa_id, cabecalho.observacao, id]);
        // Mantém a saída do Financeiro em sincronia com data, caixa e fornecedor.
        if (c.financeiro_id) {
          run('UPDATE financeiro SET data=?, descricao=?, conta_caixa_id=? WHERE id=?',
            [cabecalho.data, `Compra ${id} - ${cabecalho.fornecedor_nome}`, cabecalho.conta_caixa_id, c.financeiro_id]);
        }
        await persist();
        renderForm(id);
        renderLista();
        return;
      }

      const itens = lerItens();
      if (!itens.length) { erroEl.textContent = 'Adicione pelo menos um produto à compra.'; return; }
      for (const it of itens) {
        if (!it.descricao) { erroEl.textContent = 'Todo produto precisa de descrição.'; return; }
        if (!it.quantidade || it.quantidade <= 0) { erroEl.textContent = `Informe a quantidade comprada de "${it.descricao}".`; return; }
      }

      const valor_total = itens.reduce((a, it) => a + it.quantidade * (it.valor_custo || 0), 0);
      run(`INSERT INTO compras (data, fornecedor_id, fornecedor_nome, endereco, telefone, conta_caixa_id, valor_total, observacao)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [cabecalho.data, cabecalho.fornecedor_id, cabecalho.fornecedor_nome, cabecalho.endereco, cabecalho.telefone, cabecalho.conta_caixa_id, valor_total, cabecalho.observacao]);
      const compraId = all('SELECT last_insert_rowid() as id')[0].id;

      // Saída automática no Financeiro (categoria "Compras")
      if (valor_total > 0) {
        run(`INSERT INTO financeiro (tipo, data, valor_total, categoria, categoria_id, descricao, origem, conta_caixa_id)
             VALUES ('Saida', ?, ?, 'Compras', ?, ?, 'automatico', ?)`,
          [cabecalho.data, valor_total, obterOuCriarCategoriaFinanceiro('Compras'), `Compra ${compraId} - ${cabecalho.fornecedor_nome}`, cabecalho.conta_caixa_id]);
        run('UPDATE compras SET financeiro_id = ? WHERE id = ?', [all('SELECT last_insert_rowid() as id')[0].id, compraId]);
      }

      for (const it of itens) {
        // Atualiza o cadastro do produto com o que foi conferido/ajustado aqui e
        // soma a quantidade ao estoque (o estoque atual é lido do banco, não da tela).
        run(`UPDATE produtos SET descricao=?, tipo=?, categoria_id=?, unidade_id=?, fornecedor_id=?, controle_estoque=?,
             estoque_minimo=?, valor_custo=?, margem_lucro=?, valor_venda=?,
             estoque_atual = CASE WHEN ? = 1 THEN COALESCE(estoque_atual, 0) + ? ELSE estoque_atual END
             WHERE id=?`,
          [it.descricao, it.tipo, it.categoria_id, it.unidade_id, it.fornecedor_id, it.controle_estoque,
           it.estoque_minimo, it.valor_custo, it.margem_lucro, it.valor_venda,
           it.controle_estoque, it.quantidade, it.produto_id]);
        run(`INSERT INTO compra_itens (compra_id, produto_id, quantidade, valor_custo_unit, valor_total)
             VALUES (?, ?, ?, ?, ?)`,
          [compraId, it.produto_id, it.quantidade, it.valor_custo || 0, it.quantidade * (it.valor_custo || 0)]);
      }

      await persist();
      renderForm(compraId);
      renderLista();
    });

    if (id) {
      formWrap.querySelector('#btn-excluir-compra').addEventListener('click', async () => {
        if (!confirm('Excluir esta compra? A saída correspondente no Financeiro será removida e a quantidade comprada será descontada do estoque dos produtos com controle de estoque (custo e preço de venda não voltam ao valor anterior).')) return;
        all('SELECT ci.produto_id, ci.quantidade FROM compra_itens ci WHERE ci.compra_id = ?', [id]).forEach((it) => {
          run('UPDATE produtos SET estoque_atual = COALESCE(estoque_atual, 0) - ? WHERE id = ? AND controle_estoque = 1', [it.quantidade, it.produto_id]);
        });
        run('DELETE FROM compra_itens WHERE compra_id = ?', [id]);
        run('DELETE FROM compras WHERE id = ?', [id]);
        if (c.financeiro_id) run('DELETE FROM financeiro WHERE id = ?', [c.financeiro_id]);
        await persist();
        formWrap.innerHTML = '';
        renderLista();
      });
    }
  }

  container.querySelector('#btn-nova-compra').addEventListener('click', () => renderForm());
  renderLista();
}

// ---------- Itens de uma compra já salva (somente leitura) ----------

function montarItensSomenteLeitura(secao, compraId) {
  const itens = all(`
    SELECT ci.quantidade, ci.valor_custo_unit, ci.valor_total, p.descricao, u.unidade
    FROM compra_itens ci
    LEFT JOIN produtos p ON p.id = ci.produto_id
    LEFT JOIN unidades u ON u.id = p.unidade_id
    WHERE ci.compra_id = ? ORDER BY ci.id
  `, [compraId]);
  const total = itens.reduce((a, it) => a + (it.valor_total || 0), 0);

  secao.innerHTML = `
    <h3>Produtos comprados</h3>
    <ul class="lista">
      ${itens.map((it) => `
        <li>
          <div class="item-principal">
            <strong>${escapeHtml(it.descricao || 'Produto')}</strong>
            <span class="item-sub">Qtd: ${it.quantidade}${it.unidade ? ' ' + escapeHtml(it.unidade) : ''} · Custo unit.: ${formatarMoeda(it.valor_custo_unit)} · Total: ${formatarMoeda(it.valor_total)}</span>
          </div>
        </li>
      `).join('') || '<li><em>Sem itens</em></li>'}
    </ul>
    <p class="total-compra">Total da compra: <strong>${formatarMoeda(total)}</strong></p>
    <p class="item-sub">Os itens de uma compra salva não podem ser alterados (o estoque já foi atualizado). Para corrigir, exclua a compra e lance de novo.</p>
  `;
  return () => [];
}

// ---------- Itens de uma compra nova (editáveis) ----------

function montarItensEditaveis(secao, formWrap, container) {
  secao.innerHTML = `
    <h3>Produtos comprados</h3>
    <div id="itens-compra"></div>
    <p class="item-sub" id="itens-vazio"><em>Nenhum produto adicionado.</em></p>

    <div class="linha-add-produto">
      <select id="novo-item-produto"></select>
      <button type="button" id="btn-add-item">+ Adicionar produto</button>
      <button type="button" id="btn-novo-produto" class="secondary">Novo produto</button>
    </div>
    <p id="item-erro" class="pin-erro"></p>
    <p class="total-compra">Total da compra: <strong id="total-compra">${formatarMoeda(0)}</strong></p>
  `;

  const itensEl = secao.querySelector('#itens-compra');
  const vazioEl = secao.querySelector('#itens-vazio');
  const selectEl = secao.querySelector('#novo-item-produto');
  const erroEl = secao.querySelector('#item-erro');

  function recarregarCombo() {
    selectEl.innerHTML = '<option value="">Selecione um produto</option>' +
      all('SELECT id, descricao FROM produtos WHERE COALESCE(descontinuado, 0) = 0 ORDER BY descricao')
        .map((p) => `<option value="${p.id}">${escapeHtml(p.descricao)}</option>`).join('');
  }
  recarregarCombo();

  function marcarComoAlterado() {
    // Salvar um produto grava no banco e o app entende que "está tudo salvo";
    // avisamos de novo que a compra ainda tem dados não salvos.
    formWrap.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function atualizarTotal() {
    let total = 0;
    itensEl.querySelectorAll('.item-compra').forEach((card) => {
      const qtd = Number(card.querySelector('.i-qtd').value) || 0;
      const custo = Number(card.querySelector('.i-custo').value) || 0;
      const totalItem = qtd * custo;
      card.querySelector('.i-total').value = formatarMoeda(totalItem);
      total += totalItem;
    });
    secao.querySelector('#total-compra').textContent = formatarMoeda(total);
    vazioEl.style.display = itensEl.children.length ? 'none' : '';
  }

  function adicionarItem(produtoId) {
    if (itensEl.querySelector(`.item-compra[data-produto-id="${produtoId}"]`)) {
      erroEl.textContent = 'Esse produto já está na compra — ajuste a quantidade nele.';
      return;
    }
    const p = all('SELECT * FROM produtos WHERE id = ?', [produtoId])[0];
    if (!p) return;
    erroEl.textContent = '';

    itensEl.insertAdjacentHTML('beforeend', htmlItem(p));
    const card = itensEl.lastElementChild;

    const custo = card.querySelector('.i-custo');
    const margem = card.querySelector('.i-margem');
    const venda = card.querySelector('.i-venda');
    function recalcularVenda() {
      const c = parseFloat(custo.value);
      const m = parseFloat(margem.value);
      if (!isNaN(c) && !isNaN(m)) venda.value = (c * (1 + m / 100)).toFixed(2);
    }
    custo.addEventListener('input', () => { recalcularVenda(); atualizarTotal(); });
    margem.addEventListener('input', recalcularVenda);
    card.querySelector('.i-qtd').addEventListener('input', atualizarTotal);
    card.querySelector('.btn-remover-item').addEventListener('click', () => { card.remove(); atualizarTotal(); });

    atualizarTotal();
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  secao.querySelector('#btn-add-item').addEventListener('click', () => {
    const produtoId = Number(selectEl.value);
    if (!produtoId) { erroEl.textContent = 'Selecione um produto para adicionar.'; return; }
    adicionarItem(produtoId);
    selectEl.value = '';
  });

  // "Novo produto": abre o mesmo formulário do cadastro de Produtos por cima
  // da tela de compras, sem mexer no que já foi preenchido aqui.
  secao.querySelector('#btn-novo-produto').addEventListener('click', () => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay-exportar';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="painel-exportar painel-modal">
        <div id="modal-produto-wrap"></div>
      </div>
    `;
    container.appendChild(overlay);

    montarFormProduto(overlay.querySelector('#modal-produto-wrap'), null, {
      estoqueInicial: 0,
      nota: 'Ao salvar, o produto entra nesta compra. Deixe o estoque atual em 0: a quantidade comprada será somada ao estoque.',
      onSalvo: (produtoId) => {
        overlay.remove();
        recarregarCombo();
        adicionarItem(produtoId);
        marcarComoAlterado();
      },
      onCancelar: () => overlay.remove(),
    });
  });

  // Lê os cards para gravar a compra
  return function lerItens() {
    return Array.from(itensEl.querySelectorAll('.item-compra')).map((card) => ({
      produto_id: Number(card.dataset.produtoId),
      descricao: card.querySelector('.i-descricao').value.trim(),
      tipo: card.querySelector('.i-tipo').value || null,
      categoria_id: numOuNull(card.querySelector('.i-categoria').value),
      unidade_id: numOuNull(card.querySelector('.i-unidade').value),
      fornecedor_id: numOuNull(card.querySelector('.i-fornecedor').value),
      controle_estoque: card.querySelector('.i-controle').checked ? 1 : 0,
      estoque_minimo: numOuNull(card.querySelector('.i-estoque-minimo').value),
      valor_custo: numOuNull(card.querySelector('.i-custo').value),
      margem_lucro: numOuNull(card.querySelector('.i-margem').value),
      valor_venda: numOuNull(card.querySelector('.i-venda').value),
      quantidade: Number(card.querySelector('.i-qtd').value) || 0,
    }));
  };
}

function htmlItem(p) {
  const opcoes = (linhas, campoId, campoTexto, selecionado) => linhas.map((l) =>
    `<option value="${l[campoId]}" ${selecionado === l[campoId] ? 'selected' : ''}>${escapeHtml(l[campoTexto])}</option>`).join('');

  return `
    <div class="subcard item-compra" data-produto-id="${p.id}">
      <div class="subcard-titulo">
        <strong>${escapeHtml(p.descricao)}</strong>
        <button type="button" class="secondary btn-remover-item">Remover</button>
      </div>

      <div class="grid-campos grid-item-compra">
        <div class="campo campo-largo">
          <label>Descrição *</label>
          <input class="i-descricao" value="${val(p.descricao)}" />
        </div>
        <div class="campo">
          <label>Tipo</label>
          <select class="i-tipo">
            <option value="">Selecione</option>
            <option value="Produto" ${p.tipo === 'Produto' ? 'selected' : ''}>Produto</option>
            <option value="Servico" ${p.tipo === 'Servico' ? 'selected' : ''}>Serviço</option>
          </select>
        </div>
        <div class="campo">
          <label>Categoria de Produtos</label>
          <select class="i-categoria">
            <option value="">Selecione</option>
            ${opcoes(all('SELECT id, categoria FROM categorias ORDER BY categoria'), 'id', 'categoria', p.categoria_id)}
          </select>
        </div>
        <div class="campo">
          <label>Unidade</label>
          <select class="i-unidade">
            <option value="">Selecione</option>
            ${opcoes(all('SELECT id, unidade FROM unidades ORDER BY unidade'), 'id', 'unidade', p.unidade_id)}
          </select>
        </div>
        <div class="campo">
          <label>Fornecedor</label>
          <select class="i-fornecedor">
            <option value="">Selecione</option>
            ${opcoes(all('SELECT id, nome FROM fornecedores ORDER BY nome'), 'id', 'nome', p.fornecedor_id)}
          </select>
        </div>
        <div class="campo">
          <label>Controle de estoque</label>
          <label class="linha-checkbox campo-check"><input class="i-controle" type="checkbox" ${p.controle_estoque ? 'checked' : ''} /> Controlar estoque</label>
        </div>
        <div class="campo">
          <label>Estoque atual</label>
          <input class="i-estoque-atual valor-readonly" readonly tabindex="-1" value="${val(p.estoque_atual ?? 0)}" />
        </div>
        <div class="campo">
          <label>Estoque mínimo</label>
          <input class="i-estoque-minimo" type="number" step="0.01" value="${val(p.estoque_minimo)}" />
        </div>
        <div class="campo">
          <label>Valor de custo (R$)</label>
          <input class="i-custo" type="number" step="0.01" min="0" value="${val(p.valor_custo)}" />
        </div>
        <div class="campo">
          <label>Margem de lucro (%)</label>
          <input class="i-margem" type="number" step="0.01" value="${val(p.margem_lucro)}" />
        </div>
        <div class="campo">
          <label>Valor de venda (R$)</label>
          <input class="i-venda" type="number" step="0.01" min="0" value="${val(p.valor_venda)}" />
        </div>
        <div class="campo campo-destaque">
          <label>Quantidade comprada *</label>
          <input class="i-qtd" type="number" step="0.01" min="0.01" value="1" />
        </div>
        <div class="campo">
          <label>Total do item</label>
          <input class="i-total valor-readonly" readonly tabindex="-1" value="${formatarMoeda(0)}" />
        </div>
      </div>
    </div>
  `;
}

function val(v) { return v === undefined || v === null ? '' : String(v).replace(/"/g, '&quot;'); }
function numOuNull(v) { return v === '' || v === undefined || v === null ? null : Number(v); }
function formatarMoeda(v) { return v === null || v === undefined ? 'R$ 0,00' : `R$ ${Number(v).toFixed(2)}`; }
function formatarData(d) { return d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '-'; }
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
