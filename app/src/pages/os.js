import { all, run, persist } from '../db/db.js';

export function renderOS(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Ordens de Serviço</h2>
      <button id="btn-nova-os">+ Nova OS</button>
      <ul id="lista-os" class="lista"></ul>
      <div id="form-os-wrap"></div>
    </div>
  `;

  const listaEl = container.querySelector('#lista-os');
  const formWrap = container.querySelector('#form-os-wrap');

  function renderLista() {
    const itens = all(`
      SELECT os.id, os.tipo_registro, os.status_andamento, os.status_pagamento, os.valor_total, c.nome as cliente_nome
      FROM os LEFT JOIN clientes c ON c.id = os.cliente_id
      ORDER BY os.id DESC
    `);
    listaEl.innerHTML = itens.map((o) => {
      const tipo = o.tipo_registro || 'OS';
      return `
      <li data-id="${o.id}">
        <div class="item-principal">
          <strong>${tipo} #${o.id} — ${escapeHtml(o.cliente_nome || 'Sem cliente')}</strong>
          <span class="item-sub">${o.status_andamento}${tipo === 'OS' ? ` · ${o.status_pagamento}` : ''} · ${formatarMoeda(o.valor_total)}</span>
        </div>
        <button class="btn-editar" data-id="${o.id}">Abrir</button>
      </li>
    `;
    }).join('') || '<li><em>Nenhuma OS cadastrada</em></li>';

    listaEl.querySelectorAll('.btn-editar').forEach((btn) => {
      btn.addEventListener('click', () => renderForm(Number(btn.dataset.id)));
    });
  }

  function renderForm(id = null) {
    const os = id ? all('SELECT * FROM os WHERE id = ?', [id])[0] : {};
    // Registro novo ainda não tem tipo_registro salvo; o <select> abaixo cai
    // na primeira opção (OS) por padrão, então usamos o mesmo valor aqui.
    const tipoAtual = os.tipo_registro || 'OS';

    formWrap.innerHTML = `
      <div class="card form-card">
        <h3>${id ? `${tipoAtual} #${id}` : 'Novo registro'}</h3>

        <label>Tipo</label>
        <select id="f-tipo-registro">
          <option value="OS" ${tipoAtual === 'OS' ? 'selected' : ''}>O.S.</option>
          <option value="Orçamento" ${tipoAtual === 'Orçamento' ? 'selected' : ''}>Orçamento</option>
        </select>

        <label>Cliente *</label>
        <select id="f-cliente">
          <option value="">Selecione</option>
          ${all('SELECT id, nome FROM clientes ORDER BY nome').map((c) =>
            `<option value="${c.id}" ${os.cliente_id === c.id ? 'selected' : ''}>${c.nome}</option>`
          ).join('')}
        </select>

        <label>Status de andamento</label>
        <select id="f-status-andamento">
          ${['Aberta', 'Em andamento', 'Concluída', 'Cancelada'].map((s) =>
            `<option ${os.status_andamento === s ? 'selected' : ''}>${s}</option>`
          ).join('')}
        </select>

        <label>Descrição do serviço</label>
        <textarea id="f-descricao">${val(os.descricao)}</textarea>

        <div id="bloco-status-pagamento" style="display:${tipoAtual === 'OS' ? 'block' : 'none'}">
          <label>Status de pagamento</label>
          <select id="f-status-pagamento">
            ${['Pendente', 'Pago', 'Parcial'].map((s) =>
              `<option ${os.status_pagamento === s ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
        </div>

        <div id="bloco-resumo-orcamento" class="card">
          <p class="item-sub">Valor de serviços: <strong id="resumo-valor-servicos">${formatarMoeda(os.valor_mao_obra)}</strong></p>
          <p class="item-sub">Valor de produtos: <strong id="resumo-valor-produtos">${formatarMoeda(os.valor_produtos)}</strong></p>
          <p class="item-sub">Juros: <strong id="resumo-valor-juros">${formatarMoeda(os.valor_juros)}</strong></p>
          <p class="item-sub">Valor total geral: <strong id="resumo-valor-total-geral">${formatarMoeda((os.valor_total || 0) + (os.valor_juros || 0))}</strong></p>
          ${!id ? '<p class="item-sub"><em>Salve o registro para começar a adicionar serviços.</em></p>' : ''}
        </div>

        <label>Forma de Pagamento</label>
        <select id="f-forma-pagamento">
          <option value="">Selecione</option>
          ${['Dinheiro', 'Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Boleto'].map((f) =>
            `<option ${os.forma_pagamento === f ? 'selected' : ''}>${f}</option>`
          ).join('')}
        </select>

        <div id="bloco-parcelas" style="display:${os.forma_pagamento === 'Cartão de Crédito' ? 'block' : 'none'}">
          <label>Parcelas</label>
          <select id="f-parcelas">
            <option value="">Selecione</option>
            ${all('SELECT parcelas FROM taxas_cartao ORDER BY parcelas').map((t) =>
              `<option value="${t.parcelas}" ${os.parcelas === t.parcelas ? 'selected' : ''}>${t.parcelas}x</option>`
            ).join('')}
          </select>
        </div>

        <label>Caixa de destino</label>
        <select id="f-conta-caixa">
          <option value="">Selecione</option>
          ${all('SELECT id, nome FROM contas_caixa ORDER BY nome').map((c) =>
            `<option value="${c.id}" ${os.conta_caixa_id === c.id ? 'selected' : ''}>${c.nome}</option>`
          ).join('')}
        </select>

        <label>Observação</label>
        <textarea id="f-obs">${val(os.observacao)}</textarea>

        ${!id ? `
          <button id="btn-salvar-os">Salvar</button>
          <button id="btn-cancelar-os" class="secondary">Cancelar</button>
          <p id="form-erro" class="pin-erro"></p>
        ` : ''}
      </div>

      ${id ? '<div id="secao-itens" class="card"></div>' : ''}

      ${id ? `
        <div class="card">
          <button id="btn-salvar-os">Salvar</button>
          <button id="btn-cancelar-os" class="secondary">Cancelar</button>
          <button id="btn-excluir-os" class="danger">Excluir</button>
          <button id="btn-exportar-pdf" class="secondary">Exportar PDF</button>
          <p id="form-erro" class="pin-erro"></p>
        </div>
      ` : ''}

      ${id ? '<div id="secao-resumo" class="card"></div>' : ''}
    `;

    formWrap.querySelector('#f-forma-pagamento').addEventListener('change', (e) => {
      formWrap.querySelector('#bloco-parcelas').style.display = e.target.value === 'Cartão de Crédito' ? 'block' : 'none';
    });

    // Orçamento não gera pagamento, então o campo de status de pagamento
    // some enquanto o tipo estiver como Orçamento e reaparece ao virar OS.
    formWrap.querySelector('#f-tipo-registro').addEventListener('change', (e) => {
      const ehOS = e.target.value === 'OS';
      formWrap.querySelector('#bloco-status-pagamento').style.display = ehOS ? 'block' : 'none';
    });

    formWrap.querySelector('#btn-cancelar-os').addEventListener('click', () => { formWrap.innerHTML = ''; });

    formWrap.querySelector('#btn-salvar-os').addEventListener('click', async () => {
      const cliente_id = Number(formWrap.querySelector('#f-cliente').value) || null;
      if (!cliente_id) {
        formWrap.querySelector('#form-erro').textContent = 'Selecione um cliente.';
        return;
      }

      const tipo_registro = formWrap.querySelector('#f-tipo-registro').value;
      // Orçamento não tem status de pagamento (o campo fica oculto); nesse
      // caso guardamos sempre "Pendente" até o registro virar OS de fato.
      const status_pagamento = tipo_registro === 'OS' ? formWrap.querySelector('#f-status-pagamento').value : 'Pendente';
      const forma_pagamento = formWrap.querySelector('#f-forma-pagamento').value;
      const parcelas = numOuNull(formWrap.querySelector('#f-parcelas')?.value);
      const conta_caixa_id = numOuNull(formWrap.querySelector('#f-conta-caixa').value);

      // valor_mao_obra e valor_produtos vêm sempre da soma das tabelas
      // filhas (os_servicos / os_servico_itens) — vale tanto para OS quanto
      // para Orçamento, já que os dois usam a mesma seção de Serviços agora.
      const valor_mao_obra = id ? all('SELECT COALESCE(SUM(valor_servico),0) as soma FROM os_servicos WHERE os_id = ?', [id])[0].soma : 0;
      const valor_produtos = id ? all(`
        SELECT COALESCE(SUM(si.valor_venda_total),0) as soma
        FROM os_servico_itens si JOIN os_servicos s ON s.id = si.servico_id
        WHERE s.os_id = ?
      `, [id])[0].soma : 0;

      let valor_juros = 0;
      if (forma_pagamento === 'Cartão de Crédito' && parcelas) {
        const taxa = all('SELECT taxa_percentual FROM taxas_cartao WHERE parcelas = ?', [parcelas])[0];
        if (taxa) valor_juros = (valor_mao_obra + valor_produtos) * (taxa.taxa_percentual / 100);
      }

      const valor_total = valor_mao_obra + valor_produtos;

      const dados = {
        cliente_id,
        descricao: formWrap.querySelector('#f-descricao').value.trim(),
        tipo_registro,
        status_andamento: formWrap.querySelector('#f-status-andamento').value,
        status_pagamento,
        valor_mao_obra,
        valor_produtos,
        valor_total,
        forma_pagamento: forma_pagamento || null,
        parcelas,
        valor_juros,
        conta_caixa_id,
        observacao: formWrap.querySelector('#f-obs').value.trim(),
      };

      let osId = id;
      if (id) {
        run(`UPDATE os SET cliente_id=?, descricao=?, tipo_registro=?, status_andamento=?, status_pagamento=?, valor_mao_obra=?,
             valor_produtos=?, valor_total=?, forma_pagamento=?, parcelas=?, valor_juros=?, conta_caixa_id=?,
             observacao=? WHERE id=?`,
          [...Object.values(dados), id]);
      } else {
        const cols = Object.keys(dados).join(', ');
        const placeholders = Object.keys(dados).map(() => '?').join(', ');
        run(`INSERT INTO os (${cols}) VALUES (${placeholders})`, Object.values(dados));
        osId = all('SELECT last_insert_rowid() as id')[0].id;
      }

      // Gera lançamento automático no Financeiro quando o registro é uma OS
      // (não Orçamento) e o status de pagamento está "Pago" — cobre tanto o
      // caso de status virar Pago numa OS já existente quanto o de um
      // Orçamento já pago ser convertido em OS (e ainda não tinha lançamento).
      if (tipo_registro === 'OS' && status_pagamento === 'Pago') {
        const jaTemLancamento = all('SELECT id FROM financeiro WHERE os_id = ?', [osId]);
        if (!jaTemLancamento.length) {
          run(`INSERT INTO financeiro (tipo, valor_servico, valor_produtos, valor_total, categoria, descricao, os_id, origem, conta_caixa_id)
               VALUES ('Entrada', ?, ?, ?, 'Mão de obra+Produtos', ?, ?, 'automatico', ?)`,
            [valor_mao_obra, valor_produtos, valor_total, `OS #${osId}`, osId, conta_caixa_id]);
        }
      }

      await persist();
      renderForm(osId);
      renderLista();
    });

    if (id) {
      formWrap.querySelector('#btn-excluir-os').addEventListener('click', async () => {
        if (!confirm('Excluir este registro? Os itens/serviços vinculados também serão removidos (o estoque não é devolvido automaticamente).')) return;
        run('DELETE FROM os_itens WHERE os_id = ?', [id]);
        run('DELETE FROM os_servico_itens WHERE servico_id IN (SELECT id FROM os_servicos WHERE os_id = ?)', [id]);
        run('DELETE FROM os_servicos WHERE os_id = ?', [id]);
        run('DELETE FROM os WHERE id = ?', [id]);
        await persist();
        formWrap.innerHTML = '';
        renderLista();
      });

      formWrap.querySelector('#btn-exportar-pdf').addEventListener('click', () => exportarPdf(id));

      migrarLegadoParaServicos(id);
      renderSecaoServicos(id);
      renderSecaoResumo(id);
    }
  }

  // ---------- Migração de registros antigos (Valor Mão de Obra digitado
  // direto + produtos em os_itens) para a estrutura de Serviços ----------
  // Roda toda vez que uma OS/Orçamento existente é aberta, mas só migra de
  // fato na primeira vez (se já existe algum os_servicos, não faz nada).
  function migrarLegadoParaServicos(osId) {
    const jaTemServicos = all('SELECT COUNT(*) as c FROM os_servicos WHERE os_id = ?', [osId])[0].c;
    if (jaTemServicos > 0) return;

    const osAtual = all('SELECT valor_mao_obra FROM os WHERE id = ?', [osId])[0];
    const itensAntigos = all('SELECT * FROM os_itens WHERE os_id = ?', [osId]);
    const valorMaoObraAntigo = (osAtual && osAtual.valor_mao_obra) || 0;
    if (valorMaoObraAntigo === 0 && itensAntigos.length === 0) return; // nada pra migrar

    run('INSERT INTO os_servicos (os_id, descricao, valor_servico, ordem) VALUES (?, ?, ?, 0)',
      [osId, 'Serviço', valorMaoObraAntigo]);
    const novoServicoId = all('SELECT last_insert_rowid() as id')[0].id;

    itensAntigos.forEach((it) => {
      run(`INSERT INTO os_servico_itens (servico_id, produto_id, quantidade, valor_custo_unit, valor_venda_unit, valor_venda_total)
           VALUES (?, ?, ?, ?, ?, ?)`,
        [novoServicoId, it.produto_id, it.quantidade, it.valor_custo_unit, it.valor_venda_unit, it.valor_venda_total]);
      run('DELETE FROM os_itens WHERE id = ?', [it.id]);
    });

    recalcularOrcamento(osId);
    persist();
  }

  // ---------- Serviços (cada serviço com seus próprios produtos) — vale tanto para OS quanto para Orçamento ----------

  function renderSecaoServicos(osId) {
    const secao = formWrap.querySelector('#secao-itens');
    const servicos = all('SELECT * FROM os_servicos WHERE os_id = ? ORDER BY ordem, id', [osId]);

    secao.innerHTML = `
      <h3>Serviços</h3>
      ${servicos.map((s) => renderServicoCardHtml(s)).join('') || '<p class="item-sub"><em>Nenhum serviço adicionado</em></p>'}
      <div class="novo-servico-form">
        <input id="novo-servico-desc" placeholder="Descrição do serviço" />
        <div class="linha-valor-botao">
          <input id="novo-servico-valor" type="number" step="0.01" min="0" placeholder="Valor (R$)" />
          <button id="btn-add-servico">+ Adicionar Serviço</button>
        </div>
      </div>
      <p id="servico-erro" class="pin-erro"></p>
    `;

    secao.querySelectorAll('.card-servico').forEach((card) => {
      const servicoId = Number(card.dataset.id);

      card.querySelector('.btn-add-produto-servico').addEventListener('click', async () => {
        const produtoId = Number(card.querySelector('.novo-produto-select').value);
        const qtd = Number(card.querySelector('.novo-produto-qtd').value);
        if (!produtoId || !qtd || qtd <= 0) {
          card.querySelector('.produto-erro').textContent = 'Selecione um produto e uma quantidade válida.';
          return;
        }
        const produto = all('SELECT * FROM produtos WHERE id = ?', [produtoId])[0];
        const valor_custo_unit = produto.valor_custo || 0;
        const valor_venda_unit = produto.valor_venda || 0;
        const valor_venda_total = valor_venda_unit * qtd;

        run(`INSERT INTO os_servico_itens (servico_id, produto_id, quantidade, valor_custo_unit, valor_venda_unit, valor_venda_total)
             VALUES (?, ?, ?, ?, ?, ?)`,
          [servicoId, produtoId, qtd, valor_custo_unit, valor_venda_unit, valor_venda_total]);

        if (produto.controle_estoque) {
          run('UPDATE produtos SET estoque_atual = COALESCE(estoque_atual,0) - ? WHERE id = ?', [qtd, produtoId]);
        }

        recalcularOrcamento(osId);
        await persist();
        renderSecaoServicos(osId);
        renderSecaoResumo(osId);
        atualizarResumoTopoOrcamento(osId);
        renderLista();
      });

      card.querySelectorAll('.btn-remover-produto-servico').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const itemId = Number(btn.dataset.id);
          const item = all('SELECT * FROM os_servico_itens WHERE id = ?', [itemId])[0];
          if (item.produto_id) {
            const produto = all('SELECT id, controle_estoque, estoque_atual FROM produtos WHERE id = ?', [item.produto_id])[0];
            if (produto && produto.controle_estoque) {
              run('UPDATE produtos SET estoque_atual = COALESCE(estoque_atual,0) + ? WHERE id = ?', [item.quantidade, produto.id]);
            }
          }
          run('DELETE FROM os_servico_itens WHERE id = ?', [itemId]);
          recalcularOrcamento(osId);
          await persist();
          renderSecaoServicos(osId);
          renderSecaoResumo(osId);
          atualizarResumoTopoOrcamento(osId);
          renderLista();
        });
      });

      card.querySelector('.btn-remover-servico').addEventListener('click', async () => {
        if (!confirm('Remover este serviço e todos os produtos vinculados a ele?')) return;
        const itens = all('SELECT * FROM os_servico_itens WHERE servico_id = ?', [servicoId]);
        itens.forEach((item) => {
          if (item.produto_id) {
            const produto = all('SELECT id, controle_estoque FROM produtos WHERE id = ?', [item.produto_id])[0];
            if (produto && produto.controle_estoque) {
              run('UPDATE produtos SET estoque_atual = COALESCE(estoque_atual,0) + ? WHERE id = ?', [item.quantidade, produto.id]);
            }
          }
        });
        run('DELETE FROM os_servico_itens WHERE servico_id = ?', [servicoId]);
        run('DELETE FROM os_servicos WHERE id = ?', [servicoId]);
        recalcularOrcamento(osId);
        await persist();
        renderSecaoServicos(osId);
        renderSecaoResumo(osId);
        atualizarResumoTopoOrcamento(osId);
        renderLista();
      });
    });

    secao.querySelector('#btn-add-servico').addEventListener('click', async () => {
      const descricao = secao.querySelector('#novo-servico-desc').value.trim();
      const valor = Number(secao.querySelector('#novo-servico-valor').value) || 0;
      if (!descricao) {
        secao.querySelector('#servico-erro').textContent = 'Informe uma descrição para o serviço.';
        return;
      }
      run('INSERT INTO os_servicos (os_id, descricao, valor_servico, ordem) VALUES (?, ?, ?, ?)', [osId, descricao, valor, servicos.length]);
      recalcularOrcamento(osId);
      await persist();
      renderSecaoServicos(osId);
      renderSecaoResumo(osId);
      atualizarResumoTopoOrcamento(osId);
      renderLista();
    });
  }

  function renderServicoCardHtml(s) {
    const itens = all(`
      SELECT si.id, si.quantidade, si.valor_venda_unit, si.valor_venda_total, p.descricao
      FROM os_servico_itens si LEFT JOIN produtos p ON p.id = si.produto_id
      WHERE si.servico_id = ?
    `, [s.id]);
    const subtotalProdutos = itens.reduce((acc, it) => acc + (it.valor_venda_total || 0), 0);

    return `
      <div class="card card-servico" data-id="${s.id}" style="margin-bottom:12px">
        <div class="item-principal">
          <strong>${escapeHtml(s.descricao || 'Serviço')}</strong>
          <span class="item-sub">Mão de obra: ${formatarMoeda(s.valor_servico)} · Produtos: ${formatarMoeda(subtotalProdutos)}</span>
        </div>
        <button class="btn-remover-servico secondary">Remover serviço</button>

        <ul class="lista">
          ${itens.map((it) => `
            <li data-id="${it.id}">
              <div class="item-principal">
                <strong>${escapeHtml(it.descricao || 'Produto')}</strong>
                <span class="item-sub">Qtd: ${it.quantidade} · Unit: ${formatarMoeda(it.valor_venda_unit)} · Total: ${formatarMoeda(it.valor_venda_total)}</span>
              </div>
              <button class="btn-remover-produto-servico" data-id="${it.id}">Remover</button>
            </li>
          `).join('') || '<li><em>Nenhum produto neste serviço</em></li>'}
        </ul>

        <div class="linha-dupla">
          <select class="novo-produto-select">
            <option value="">Selecione um produto</option>
            ${all('SELECT id, descricao FROM produtos WHERE descontinuado = 0 ORDER BY descricao').map((p) =>
              `<option value="${p.id}">${escapeHtml(p.descricao)}</option>`
            ).join('')}
          </select>
          <input class="novo-produto-qtd" type="number" step="0.01" min="0.01" value="1" style="max-width:90px" />
          <button class="btn-add-produto-servico">+ Adicionar Produto</button>
        </div>
        <p class="produto-erro pin-erro"></p>
      </div>
    `;
  }

  // Recalcula valor_mao_obra (soma dos serviços), valor_produtos (soma dos
  // produtos de todos os serviços) e valor_juros (com base na forma de
  // pagamento/parcelas já salvas na OS) sempre que um serviço ou produto
  // filho é adicionado/removido — mantém a OS e o PDF sempre corretos, sem
  // precisar reabrir/salvar o formulário principal.
  function recalcularOrcamento(osId) {
    const somaServicos = all('SELECT COALESCE(SUM(valor_servico),0) as soma FROM os_servicos WHERE os_id = ?', [osId])[0].soma;
    const somaProdutos = all(`
      SELECT COALESCE(SUM(si.valor_venda_total),0) as soma
      FROM os_servico_itens si JOIN os_servicos s ON s.id = si.servico_id
      WHERE s.os_id = ?
    `, [osId])[0].soma;

    const osAtual = all('SELECT forma_pagamento, parcelas FROM os WHERE id = ?', [osId])[0];
    let valor_juros = 0;
    if (osAtual.forma_pagamento === 'Cartão de Crédito' && osAtual.parcelas) {
      const taxa = all('SELECT taxa_percentual FROM taxas_cartao WHERE parcelas = ?', [osAtual.parcelas])[0];
      if (taxa) valor_juros = (somaServicos + somaProdutos) * (taxa.taxa_percentual / 100);
    }

    const valor_total = somaServicos + somaProdutos;
    run('UPDATE os SET valor_mao_obra = ?, valor_produtos = ?, valor_total = ?, valor_juros = ? WHERE id = ?',
      [somaServicos, somaProdutos, valor_total, valor_juros, osId]);
  }

  function atualizarResumoTopoOrcamento(osId) {
    const bloco = formWrap.querySelector('#bloco-resumo-orcamento');
    if (!bloco) return;
    const os = all('SELECT valor_mao_obra, valor_produtos, valor_juros, valor_total FROM os WHERE id = ?', [osId])[0];
    bloco.querySelector('#resumo-valor-servicos').textContent = formatarMoeda(os.valor_mao_obra);
    bloco.querySelector('#resumo-valor-produtos').textContent = formatarMoeda(os.valor_produtos);
    bloco.querySelector('#resumo-valor-juros').textContent = formatarMoeda(os.valor_juros);
    bloco.querySelector('#resumo-valor-total-geral').textContent = formatarMoeda((os.valor_total || 0) + (os.valor_juros || 0));
  }

  // ---------- Resumo financeiro interno (nunca vai pro PDF do cliente) ----------

  function renderSecaoResumo(osId) {
    const secao = formWrap.querySelector('#secao-resumo');
    const os = all('SELECT * FROM os WHERE id = ?', [osId])[0];
    const itens = all(`
      SELECT si.quantidade, si.valor_custo_unit, si.valor_venda_unit
      FROM os_servico_itens si JOIN os_servicos s ON s.id = si.servico_id
      WHERE s.os_id = ?
    `, [osId]);

    const gastosProdutos = itens.reduce((acc, it) => acc + (it.valor_custo_unit || 0) * it.quantidade, 0);
    const lucroProdutos = itens.reduce((acc, it) => acc + ((it.valor_venda_unit || 0) - (it.valor_custo_unit || 0)) * it.quantidade, 0);
    const lucroServico = os.valor_mao_obra || 0;
    const totalLucro = lucroProdutos + lucroServico;

    secao.innerHTML = `
      <h3>Resumo Financeiro (interno — não vai no PDF do cliente)</h3>
      <p class="item-sub">Gastos com produtos: <strong>${formatarMoeda(gastosProdutos)}</strong></p>
      <p class="item-sub">Lucro dos produtos: <strong>${formatarMoeda(lucroProdutos)}</strong></p>
      <p class="item-sub">Lucro do serviço: <strong>${formatarMoeda(lucroServico)}</strong></p>
      <p class="item-sub">Total lucro/déficit: <strong style="color:${totalLucro >= 0 ? '#22c55e' : '#ef4444'}">${formatarMoeda(totalLucro)}</strong></p>
      ${os.valor_juros ? `<p class="item-sub">Juros do cartão (cobrado do cliente): <strong>${formatarMoeda(os.valor_juros)}</strong></p>` : ''}
    `;
  }

  // ---------- Exportação em PDF ----------

  const TELEFONE_EMPRESA = '(19) 98160-5606';
  const SLOGAN_EMPRESA = 'INSTALAÇÃO ELÉTRICA QUE AGUENTA A CARGA DA SUA OPERAÇÃO';
  const COR_FUNDO_PAINEL = '#1e293b';
  const COR_TEXTO_PAINEL = '#6298b8';

  let logoBase64Cache = null;
  async function carregarLogoBase64() {
    if (logoBase64Cache) return logoBase64Cache;
    try {
      const resp = await fetch('./icons/icon-512.png');
      const blob = await resp.blob();
      logoBase64Cache = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      logoBase64Cache = null; // segue sem logo se não conseguir carregar
    }
    return logoBase64Cache;
  }

  // Painel de confirmação próprio do app (substitui o confirm()/prompt() do
  // navegador) perguntando se o PDF sai Detalhado (cada produto na tabela)
  // ou Resumido (um único item com nome editável).
  function abrirPainelExportacao(onEscolher) {
    const overlay = document.createElement('div');
    overlay.className = 'overlay-exportar';
    overlay.innerHTML = `
      <div class="painel-exportar">
        <button type="button" class="painel-exportar-fechar" aria-label="Cancelar">×</button>
        <p>Como deseja exportar o PDF?</p>
        <div class="painel-exportar-botoes">
          <button type="button" id="btn-exportar-detalhado">Detalhado</button>
          <button type="button" id="btn-exportar-resumido">Resumido</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const fechar = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });
    overlay.querySelector('.painel-exportar-fechar').addEventListener('click', fechar);
    overlay.querySelector('#btn-exportar-detalhado').addEventListener('click', () => { fechar(); onEscolher('detalhado'); });
    overlay.querySelector('#btn-exportar-resumido').addEventListener('click', () => { fechar(); onEscolher('resumido'); });
  }

  function exportarPdf(osId) {
    abrirPainelExportacao(async (modo) => {
      await gerarPdf(osId, modo);
    });
  }

  async function gerarPdf(osId, modo) {
    const os = all(`
      SELECT os.*, c.nome as cliente_nome, c.endereco, c.bairro, c.cidade, c.uf, c.cep, c.fone1, c.celular1
      FROM os LEFT JOIN clientes c ON c.id = os.cliente_id WHERE os.id = ?
    `, [osId])[0];

    const tipoLabel = (os.tipo_registro || 'OS') === 'Orçamento' ? 'Orçamento' : 'O.S.';
    const logo = await carregarLogoBase64();

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const larguraPagina = doc.internal.pageSize.getWidth();

    // ---------- Cabeçalho ----------
    const alturaCabecalho = 34;
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, larguraPagina, alturaCabecalho, 'F');

    if (logo) {
      try { doc.addImage(logo, 'PNG', 14, 6, 22, 22); } catch (e) { /* segue sem logo */ }
    }

    const xTexto = logo ? 40 : 14;
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(16);
    doc.text('RR ELÉTRICA', xTexto, 15);

    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text(TELEFONE_EMPRESA, xTexto, 21);

    doc.setFontSize(7.5);
    const linhasSlogan = doc.splitTextToSize(SLOGAN_EMPRESA, larguraPagina - xTexto - 14);
    doc.text(linhasSlogan, xTexto, 27);

    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');

    // ---------- Título ----------
    let y = alturaCabecalho + 10;
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(`${tipoLabel} #${os.id}`, 14, y);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text(new Date().toLocaleDateString('pt-BR'), larguraPagina - 14, y, { align: 'right' });
    y += 9;

    // ---------- Dados do cliente ----------
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('Cliente', 14, y);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    y += 6;
    doc.text(`Nome: ${os.cliente_nome || '-'}`, 14, y); y += 5.5;
    doc.text(`Endereço: ${os.endereco || '-'}`, 14, y); y += 5.5;
    doc.text(`Bairro: ${os.bairro || '-'}`, 14, y);
    doc.text(`Cidade: ${os.cidade || '-'}`, 90, y);
    doc.text(`UF: ${os.uf || '-'}`, 160, y); y += 5.5;
    doc.text(`CEP: ${os.cep || '-'}`, 14, y);
    doc.text(`Fone: ${os.fone1 || '-'}`, 90, y);
    doc.text(`Celular: ${os.celular1 || '-'}`, 160, y); y += 9;

    if (os.descricao) {
      doc.setFont(undefined, 'bold');
      doc.text('Descrição do serviço', 14, y); y += 5.5;
      doc.setFont(undefined, 'normal');
      const linhas = doc.splitTextToSize(os.descricao, larguraPagina - 28);
      doc.text(linhas, 14, y); y += linhas.length * 5.5 + 4;
    }

    // ---------- Tabela de serviços e produtos ----------
    const servicos = all('SELECT * FROM os_servicos WHERE os_id = ? ORDER BY ordem, id', [osId]);
    servicos.forEach((s, idx) => {
      const itensServico = all(`
        SELECT si.quantidade, si.valor_venda_unit, si.valor_venda_total, p.descricao
        FROM os_servico_itens si LEFT JOIN produtos p ON p.id = si.produto_id
        WHERE si.servico_id = ?
      `, [s.id]);
      const subtotalProdutosServico = itensServico.reduce((acc, it) => acc + (it.valor_venda_total || 0), 0);
      const subtotalServico = (s.valor_servico || 0) + subtotalProdutosServico;

      if (y > 250) { doc.addPage(); y = 20; }

      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.text(`${idx + 1}. ${s.descricao || 'Serviço'}`, 14, y);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(10);
      y += 6;

      if (modo === 'detalhado' && itensServico.length) {
        doc.autoTable({
          startY: y,
          head: [['Descrição', 'Qtd', 'Valor unit.', 'Valor total']],
          body: itensServico.map((it) => [
            it.descricao || '-',
            String(it.quantidade),
            formatarMoeda(it.valor_venda_unit),
            formatarMoeda(it.valor_venda_total),
          ]),
          theme: 'grid',
          headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
          margin: { left: 14, right: 14 },
        });
        y = doc.lastAutoTable.finalY + 4;
      }

      doc.setFont(undefined, 'bold');
      doc.text(`Subtotal do serviço: ${formatarMoeda(subtotalServico)}`, larguraPagina - 14, y, { align: 'right' });
      doc.setFont(undefined, 'normal');
      y += 9;
    });

    // ---------- Totais ----------
    const xTotalLabel = larguraPagina - 90;
    const xTotalValor = larguraPagina - 14;
    const valorSubtotal = os.valor_total || 0;
    const valorGeral = valorSubtotal + (os.valor_juros || 0);

    doc.setFontSize(10.5);
    doc.text('Valor do serviço:', xTotalLabel, y);
    doc.text(formatarMoeda(os.valor_mao_obra), xTotalValor, y, { align: 'right' }); y += 6;

    doc.text('Valor total:', xTotalLabel, y);
    doc.text(formatarMoeda(valorSubtotal), xTotalValor, y, { align: 'right' }); y += 6;

    if (os.valor_juros) {
      doc.text('Juros da maquininha:', xTotalLabel, y);
      doc.text(formatarMoeda(os.valor_juros), xTotalValor, y, { align: 'right' }); y += 6;
    }

    y += 2;
    doc.setFillColor(15, 23, 42);
    doc.rect(xTotalLabel - 6, y - 6, (xTotalValor - xTotalLabel) + 12, 11, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(13);
    doc.text('Valor total geral:', xTotalLabel, y + 2);
    doc.text(formatarMoeda(valorGeral), xTotalValor, y + 2, { align: 'right' });
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);

    doc.save(`${tipoLabel}-${os.id}-${(os.cliente_nome || 'cliente').replace(/\s+/g, '_')}.pdf`);
  }

  container.querySelector('#btn-nova-os').addEventListener('click', () => renderForm());
  renderLista();
}

function val(v) { return v === undefined || v === null ? '' : String(v).replace(/"/g, '&quot;'); }
function numOuNull(v) { return v === '' || v === undefined || v === null ? null : Number(v); }
function formatarMoeda(v) { return v === null || v === undefined ? 'R$ 0,00' : `R$ ${Number(v).toFixed(2)}`; }
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
