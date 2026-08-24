import { all, run, persist } from '../db/db.js';
import { comprimirFoto } from '../ui/image.js';

export function renderProdutos(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Produtos</h2>
      <div class="linha-dupla">
        <button id="btn-novo-produto">+ Novo produto</button>
        <button id="btn-importar-excel" class="secondary">Importar do Excel</button>
      </div>
      <input id="input-excel" type="file" accept=".xlsx,.xls" style="display:none" />
      <p id="import-status" class="pin-erro"></p>
      <ul id="lista-produtos" class="lista"></ul>
      <div id="form-produto-wrap"></div>
    </div>
  `;

  const listaEl = container.querySelector('#lista-produtos');
  const formWrap = container.querySelector('#form-produto-wrap');
  const inputExcel = container.querySelector('#input-excel');
  const importStatus = container.querySelector('#import-status');

  function categorias() { return all('SELECT id, categoria FROM categorias ORDER BY categoria'); }
  function unidades() { return all('SELECT id, unidade FROM unidades ORDER BY unidade'); }
  function fornecedores() { return all('SELECT id, nome FROM fornecedores ORDER BY nome'); }

  function renderLista() {
    const produtos = all(`
      SELECT p.id, p.descricao, p.tipo, p.valor_venda, p.descontinuado, u.unidade
      FROM produtos p
      LEFT JOIN unidades u ON u.id = p.unidade_id
      ORDER BY p.descricao
    `);
    listaEl.innerHTML = produtos.map((p) => `
      <li data-id="${p.id}" class="${p.descontinuado ? 'item-descontinuado' : ''}">
        <div class="item-principal">
          <strong>${escapeHtml(p.descricao)}</strong>
          <span class="item-sub">${p.tipo || '-'} · ${p.unidade || '-'} · ${formatarMoeda(p.valor_venda)}${p.descontinuado ? ' · Descontinuado' : ''}</span>
        </div>
        <button class="btn-editar" data-id="${p.id}">Editar</button>
      </li>
    `).join('') || '<li><em>Nenhum produto cadastrado</em></li>';

    listaEl.querySelectorAll('.btn-editar').forEach((btn) => {
      btn.addEventListener('click', () => renderForm(Number(btn.dataset.id)));
    });
  }

  function renderForm(id = null) {
    const p = id ? all('SELECT * FROM produtos WHERE id = ?', [id])[0] : {};

    formWrap.innerHTML = `
      <div class="card form-card">
        <h3>${id ? 'Editar produto' : 'Novo produto'}</h3>

        <label>Descrição *</label>
        <input id="f-descricao" value="${val(p.descricao)}" />

        <label>Tipo</label>
        <select id="f-tipo">
          <option value="">Selecione</option>
          <option value="Produto" ${p.tipo === 'Produto' ? 'selected' : ''}>Produto</option>
          <option value="Servico" ${p.tipo === 'Servico' ? 'selected' : ''}>Serviço</option>
        </select>

        <label>Categoria</label>
        <select id="f-categoria">
          <option value="">Selecione</option>
          ${categorias().map((c) => `<option value="${c.id}" ${p.categoria_id === c.id ? 'selected' : ''}>${c.categoria}</option>`).join('')}
        </select>

        <label>Unidade</label>
        <select id="f-unidade">
          <option value="">Selecione</option>
          ${unidades().map((u) => `<option value="${u.id}" ${p.unidade_id === u.id ? 'selected' : ''}>${u.unidade}</option>`).join('')}
        </select>

        <label class="linha-checkbox"><input id="f-controle-estoque" type="checkbox" ${p.controle_estoque ? 'checked' : ''} /> Controle de estoque</label>

        <label>Estoque Atual</label>
        <input id="f-estoque-atual" type="number" step="0.01" value="${val(p.estoque_atual)}" />

        <label>Estoque Mínimo</label>
        <input id="f-estoque-minimo" type="number" step="0.01" value="${val(p.estoque_minimo)}" />

        <label>Valor de Custo (R$)</label>
        <input id="f-valor-custo" type="number" step="0.01" value="${val(p.valor_custo)}" />

        <label>Margem de Lucro (%)</label>
        <input id="f-margem" type="number" step="0.01" value="${val(p.margem_lucro)}" />

        <label>Valor de Venda (R$)</label>
        <input id="f-valor-venda" type="number" step="0.01" value="${val(p.valor_venda)}" />

        <label>Fornecedor</label>
        <select id="f-fornecedor">
          <option value="">Selecione</option>
          ${fornecedores().map((f) => `<option value="${f.id}" ${p.fornecedor_id === f.id ? 'selected' : ''}>${f.nome}</option>`).join('')}
        </select>

        <label>Foto do produto (opcional)</label>
        <div class="linha-foto-botoes">
          <input id="f-foto" type="file" accept="image/*" />
          <input id="f-foto-camera" type="file" accept="image/*" capture="environment" style="display:none" />
          <button type="button" id="btn-tirar-foto" class="secondary">📷 Tirar foto</button>
        </div>
        <div id="foto-preview">${p.foto_base64 ? `<img src="${p.foto_base64}" class="foto-preview-img" />` : ''}</div>

        <label class="linha-checkbox"><input id="f-descontinuado" type="checkbox" ${p.descontinuado ? 'checked' : ''} /> Descontinuado</label>

        <button id="btn-salvar-produto">Salvar</button>
        <button id="btn-cancelar-produto" class="secondary">Cancelar</button>
        ${id ? '<button id="btn-excluir-produto" class="danger">Excluir</button>' : ''}
        <p id="form-erro" class="pin-erro"></p>
      </div>
    `;

    let fotoBase64Atual = p.foto_base64 || null;

    async function processarFoto(file) {
      if (!file) return;
      fotoBase64Atual = await comprimirFoto(file, 400, 0.5);
      formWrap.querySelector('#foto-preview').innerHTML = `<img src="${fotoBase64Atual}" class="foto-preview-img" />`;
    }

    formWrap.querySelector('#f-foto').addEventListener('change', (e) => processarFoto(e.target.files[0]));
    formWrap.querySelector('#f-foto-camera').addEventListener('change', (e) => processarFoto(e.target.files[0]));
    formWrap.querySelector('#btn-tirar-foto').addEventListener('click', () => {
      formWrap.querySelector('#f-foto-camera').click();
    });

    // Cálculo automático: se custo + margem preenchidos, sugere valor de venda
    const inputCusto = formWrap.querySelector('#f-valor-custo');
    const inputMargem = formWrap.querySelector('#f-margem');
    const inputVenda = formWrap.querySelector('#f-valor-venda');
    function recalcularVenda() {
      const custo = parseFloat(inputCusto.value);
      const margem = parseFloat(inputMargem.value);
      if (!isNaN(custo) && !isNaN(margem)) {
        inputVenda.value = (custo * (1 + margem / 100)).toFixed(2);
      }
    }
    inputCusto.addEventListener('input', recalcularVenda);
    inputMargem.addEventListener('input', recalcularVenda);

    formWrap.querySelector('#btn-cancelar-produto').addEventListener('click', () => {
      formWrap.innerHTML = '';
    });

    formWrap.querySelector('#btn-salvar-produto').addEventListener('click', async () => {
      const descricao = formWrap.querySelector('#f-descricao').value.trim();
      if (!descricao) {
        formWrap.querySelector('#form-erro').textContent = 'Descrição é obrigatória.';
        return;
      }

      const dados = {
        descricao,
        tipo: formWrap.querySelector('#f-tipo').value || null,
        categoria_id: numOuNull(formWrap.querySelector('#f-categoria').value),
        unidade_id: numOuNull(formWrap.querySelector('#f-unidade').value),
        controle_estoque: formWrap.querySelector('#f-controle-estoque').checked ? 1 : 0,
        estoque_atual: numOuNull(formWrap.querySelector('#f-estoque-atual').value),
        estoque_minimo: numOuNull(formWrap.querySelector('#f-estoque-minimo').value),
        valor_custo: numOuNull(formWrap.querySelector('#f-valor-custo').value),
        margem_lucro: numOuNull(formWrap.querySelector('#f-margem').value),
        valor_venda: numOuNull(formWrap.querySelector('#f-valor-venda').value),
        fornecedor_id: numOuNull(formWrap.querySelector('#f-fornecedor').value),
        foto_base64: fotoBase64Atual,
        descontinuado: formWrap.querySelector('#f-descontinuado').checked ? 1 : 0,
      };

      if (id) {
        run(`UPDATE produtos SET descricao=?, tipo=?, categoria_id=?, unidade_id=?, controle_estoque=?,
             estoque_atual=?, estoque_minimo=?, valor_custo=?, margem_lucro=?, valor_venda=?, fornecedor_id=?,
             foto_base64=?, descontinuado=? WHERE id=?`,
          [...Object.values(dados), id]);
      } else {
        const cols = Object.keys(dados).join(', ');
        const placeholders = Object.keys(dados).map(() => '?').join(', ');
        run(`INSERT INTO produtos (${cols}) VALUES (${placeholders})`, Object.values(dados));
      }

      await persist();
      formWrap.innerHTML = '';
      renderLista();
    });

    if (id) {
      formWrap.querySelector('#btn-excluir-produto').addEventListener('click', async () => {
        if (!confirm('Excluir este produto?')) return;
        run('DELETE FROM produtos WHERE id = ?', [id]);
        await persist();
        formWrap.innerHTML = '';
        renderLista();
      });
    }
  }

  container.querySelector('#btn-novo-produto').addEventListener('click', () => renderForm());

  // ---------- Importação de Excel ----------
  container.querySelector('#btn-importar-excel').addEventListener('click', () => inputExcel.click());

  inputExcel.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    importStatus.textContent = 'Lendo planilha...';

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const primeiraAba = wb.Sheets[wb.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(primeiraAba, { defval: '' });

      let importados = 0;
      for (const linha of linhas) {
        const descricao = pegar(linha, ['Descrição', 'Descricao', 'descricao']);
        if (!descricao) continue;

        const categoriaNome = pegar(linha, ['Categoria', 'categoria']);
        const unidadeNome = pegar(linha, ['Unidade', 'unidade']);
        const fornecedorNome = pegar(linha, ['Fornecedor', 'fornecedor']);

        const categoriaId = categoriaNome ? obterOuCriarId('categorias', 'categoria', categoriaNome) : null;
        const unidadeId = unidadeNome ? obterOuCriarId('unidades', 'unidade', unidadeNome) : null;
        const fornecedorId = fornecedorNome ? obterOuCriarFornecedor(fornecedorNome) : null;

        run(`INSERT INTO produtos (descricao, tipo, categoria_id, unidade_id, estoque_atual, estoque_minimo,
             valor_custo, margem_lucro, valor_venda, fornecedor_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            descricao,
            pegar(linha, ['Tipo', 'tipo']) || null,
            categoriaId,
            unidadeId,
            numOuNull(pegar(linha, ['Estoque Atual', 'estoque_atual'])),
            numOuNull(pegar(linha, ['Estoque Mínimo', 'Estoque Minimo', 'estoque_minimo'])),
            numOuNull(pegar(linha, ['Valor de Custo', 'valor_custo'])),
            numOuNull(pegar(linha, ['Margem de lucro', 'margem_lucro'])),
            numOuNull(pegar(linha, ['Valor de Venda', 'valor_venda'])),
            fornecedorId,
          ]);
        importados++;
      }

      await persist();
      importStatus.textContent = `${importados} produto(s) importado(s) com sucesso.`;
      renderLista();
    } catch (err) {
      importStatus.textContent = 'Erro ao ler a planilha. Confira o formato do arquivo.';
    }

    inputExcel.value = '';
  });

  function pegar(linha, chavesPossiveis) {
    for (const chave of chavesPossiveis) {
      if (linha[chave] !== undefined && linha[chave] !== '') return String(linha[chave]).trim();
    }
    return '';
  }

  function obterOuCriarId(tabela, coluna, nome) {
    const existente = all(`SELECT id FROM ${tabela} WHERE ${coluna} = ?`, [nome]);
    if (existente.length) return existente[0].id;
    run(`INSERT INTO ${tabela} (${coluna}) VALUES (?)`, [nome]);
    return all(`SELECT id FROM ${tabela} WHERE ${coluna} = ?`, [nome])[0].id;
  }

  function obterOuCriarFornecedor(nome) {
    const existente = all('SELECT id FROM fornecedores WHERE nome = ?', [nome]);
    if (existente.length) return existente[0].id;
    run('INSERT INTO fornecedores (nome) VALUES (?)', [nome]);
    return all('SELECT id FROM fornecedores WHERE nome = ?', [nome])[0].id;
  }

  renderLista();
}

function val(v) { return v === undefined || v === null ? '' : String(v).replace(/"/g, '&quot;'); }
function numOuNull(v) { return v === '' || v === undefined || v === null ? null : Number(v); }
function formatarMoeda(v) { return v === null || v === undefined ? '-' : `R$ ${Number(v).toFixed(2)}`; }
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
