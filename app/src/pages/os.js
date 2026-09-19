import { all, run, persist } from '../db/db.js';
import { obterOuCriarCategoriaFinanceiro } from '../db/lookups.js';

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
      const rotulo = tipo === 'OS' ? 'O.S.' : tipo;
      return `
      <li data-id="${o.id}">
        <div class="item-principal">
          <strong>${rotulo} ${o.id} — ${escapeHtml(o.cliente_nome || 'Sem cliente')}</strong>
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

  // ---------- Cálculo dos valores ----------
  // Fonte única do cálculo: total = serviços + produtos - desconto; os juros
  // do cartão incidem sobre o total já com desconto; total geral = total + juros.
  function calcularTotais({ servicos, produtos, desconto, forma, parcelas }) {
    const subtotal = servicos + produtos;
    const descontoAplicado = Math.min(Math.max(desconto || 0, 0), subtotal);
    const valor_total = subtotal - descontoAplicado;
    let valor_juros = 0;
    if (forma === 'Cartão de Crédito' && parcelas) {
      const taxa = all('SELECT taxa_percentual FROM taxas_cartao WHERE parcelas = ?', [parcelas])[0];
      if (taxa) valor_juros = valor_total * (taxa.taxa_percentual / 100);
    }
    return { servicos, produtos, desconto: descontoAplicado, valor_total, valor_juros, total_geral: valor_total + valor_juros };
  }

  function somasDaOs(osId) {
    if (!osId) return { servicos: 0, produtos: 0 };
    const servicos = all('SELECT COALESCE(SUM(valor_servico),0) as soma FROM os_servicos WHERE os_id = ?', [osId])[0].soma;
    const produtos = all(`
      SELECT COALESCE(SUM(si.valor_venda_total),0) as soma
      FROM os_servico_itens si JOIN os_servicos s ON s.id = si.servico_id
      WHERE s.os_id = ?
    `, [osId])[0].soma;
    return { servicos, produtos };
  }

  // Valores "ao vivo": serviços/produtos vêm do banco; desconto, forma de
  // pagamento e parcelas vêm do que está digitado no formulário agora.
  function calcularValoresDoFormulario(osId) {
    const { servicos, produtos } = somasDaOs(osId);
    return calcularTotais({
      servicos,
      produtos,
      desconto: Number(formWrap.querySelector('#f-desconto')?.value) || 0,
      forma: formWrap.querySelector('#f-forma-pagamento')?.value,
      parcelas: numOuNull(formWrap.querySelector('#f-parcelas')?.value),
    });
  }

  // "Descrição do serviço" da OS = todos os serviços da tabela filha, um por linha.
  function listaDescricoesServicos(osId) {
    if (!osId) return [];
    return all('SELECT descricao FROM os_servicos WHERE os_id = ? ORDER BY ordem, id', [osId])
      .map((s) => (s.descricao || '').trim() || 'Serviço');
  }

  function htmlDescricaoServicos(osId) {
    if (!osId) return '<em class="item-sub">Salve o registro para começar a adicionar serviços.</em>';
    const linhas = listaDescricoesServicos(osId);
    if (!linhas.length) return '<em class="item-sub">Nenhum serviço adicionado.</em>';
    return linhas.map((l) => `<div class="desc-linha">${escapeHtml(l)}</div>`).join('');
  }

  function montarEnderecoCliente(c) {
    return [
      c.endereco,
      c.bairro,
      [c.cidade, c.uf].filter(Boolean).join('/'),
      c.cep ? `CEP ${c.cep}` : '',
    ].filter(Boolean).join(' - ');
  }

  function renderForm(id = null) {
    const os = id ? all('SELECT * FROM os WHERE id = ?', [id])[0] : {};
    // Registro novo ainda não tem tipo_registro salvo; o <select> abaixo cai
    // na primeira opção (OS) por padrão, então usamos o mesmo valor aqui.
    const tipoAtual = os.tipo_registro || 'OS';
    const rotuloTipo = tipoAtual === 'OS' ? 'O.S.' : tipoAtual;
    const v0 = calcularTotais({
      servicos: os.valor_mao_obra || 0,
      produtos: os.valor_produtos || 0,
      desconto: os.desconto || 0,
      forma: os.forma_pagamento,
      parcelas: os.parcelas,
    });

    formWrap.innerHTML = `
      <div class="card form-card">
        <h3>${id ? `${rotuloTipo} ${id}` : 'Novo registro'}</h3>

        <!-- Linha 1: Tipo, Cliente e os dois status lado a lado (Pagamento logo depois de Andamento) -->
        <div class="grid-campos grid-os-topo">
          <div class="campo">
            <label>Tipo</label>
            <select id="f-tipo-registro">
              <option value="OS" ${tipoAtual === 'OS' ? 'selected' : ''}>O.S.</option>
              <option value="Orçamento" ${tipoAtual === 'Orçamento' ? 'selected' : ''}>Orçamento</option>
            </select>
          </div>

          <div class="campo">
            <label>Cliente *</label>
            <select id="f-cliente">
              <option value="">Selecione</option>
              ${all('SELECT id, nome FROM clientes ORDER BY nome').map((c) =>
                `<option value="${c.id}" ${os.cliente_id === c.id ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`
              ).join('')}
            </select>
          </div>

          <div class="campo">
            <label>Status de andamento</label>
            <select id="f-status-andamento">
              ${['Aberta', 'Em andamento', 'Concluída', 'Cancelada'].map((s) =>
                `<option ${os.status_andamento === s ? 'selected' : ''}>${s}</option>`
              ).join('')}
            </select>
          </div>

          <div class="campo" id="bloco-status-pagamento" style="display:${tipoAtual === 'OS' ? 'block' : 'none'}">
            <label>Status de pagamento</label>
            <select id="f-status-pagamento">
              ${['Pendente', 'Pago', 'Parcial'].map((s) =>
                `<option ${os.status_pagamento === s ? 'selected' : ''}>${s}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <!-- Endereço e telefone do serviço (preenchidos com os do cliente, mas editáveis) -->
        <div class="grid-campos grid-os-contato">
          <div class="campo">
            <label>Endereço</label>
            <input id="f-endereco" value="${val(os.endereco)}" />
          </div>
          <div class="campo">
            <label>Telefone</label>
            <input id="f-telefone" value="${val(os.telefone)}" />
          </div>
        </div>

        <!-- Descrição (lista dos serviços, só leitura) ao lado do quadro de Valores -->
        <div class="grid-campos grid-os-valores">
          <div class="campo">
            <label>Descrição do serviço</label>
            <div id="f-descricao" class="descricao-servicos" aria-readonly="true">${htmlDescricaoServicos(id)}</div>
          </div>

          <div class="campo">
            <label>Valores</label>
            <div id="bloco-resumo-orcamento" class="quadro-valores">
              <div class="linha-valor"><span>Valor de serviços</span><input id="resumo-valor-servicos" class="valor-readonly" readonly tabindex="-1" value="${formatarMoeda(v0.servicos)}" /></div>
              <div class="linha-valor"><span>Valor de produtos</span><input id="resumo-valor-produtos" class="valor-readonly" readonly tabindex="-1" value="${formatarMoeda(v0.produtos)}" /></div>
              <div class="linha-valor"><span>Juros</span><input id="resumo-valor-juros" class="valor-readonly" readonly tabindex="-1" value="${formatarMoeda(v0.valor_juros)}" /></div>
              <div class="linha-valor"><span>Desconto (R$)</span><input id="f-desconto" class="valor-editavel" type="number" step="0.01" min="0" value="${val(os.desconto || '')}" placeholder="0,00" aria-label="Desconto" /></div>
              <div class="linha-valor linha-valor-total"><span>Valor total geral</span><input id="resumo-valor-total-geral" class="valor-readonly" readonly tabindex="-1" value="${formatarMoeda(v0.total_geral)}" /></div>
            </div>
          </div>
        </div>

        <div class="grid-campos grid-os-pagamento">
          <div class="campo">
            <label>Forma de Pagamento</label>
            <select id="f-forma-pagamento">
              <option value="">Selecione</option>
              ${['Dinheiro', 'Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Boleto'].map((f) =>
                `<option ${os.forma_pagamento === f ? 'selected' : ''}>${f}</option>`
              ).join('')}
            </select>
          </div>

          <div class="campo" id="bloco-parcelas" style="display:${os.forma_pagamento === 'Cartão de Crédito' ? 'block' : 'none'}">
            <label>Parcelas</label>
            <select id="f-parcelas">
              <option value="">Selecione</option>
              ${all('SELECT parcelas FROM taxas_cartao ORDER BY parcelas').map((t) =>
                `<option value="${t.parcelas}" ${os.parcelas === t.parcelas ? 'selected' : ''}>${t.parcelas}x</option>`
              ).join('')}
            </select>
          </div>

          <div class="campo">
            <label>Caixa de destino</label>
            <select id="f-conta-caixa">
              <option value="">Selecione</option>
              ${all('SELECT id, nome FROM contas_caixa ORDER BY nome').map((c) =>
                `<option value="${c.id}" ${os.conta_caixa_id === c.id ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`
              ).join('')}
            </select>
          </div>
        </div>

        <div class="campo campo-full">
          <label>Observação</label>
          <textarea id="f-obs">${val(os.observacao)}</textarea>
        </div>

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

    const atualizarQuadro = () => atualizarResumoTopoOrcamento(id);

    formWrap.querySelector('#f-forma-pagamento').addEventListener('change', (e) => {
      formWrap.querySelector('#bloco-parcelas').style.display = e.target.value === 'Cartão de Crédito' ? 'block' : 'none';
      atualizarQuadro();
    });
    formWrap.querySelector('#f-parcelas').addEventListener('change', atualizarQuadro);
    formWrap.querySelector('#f-desconto').addEventListener('input', atualizarQuadro);

    // Ao trocar o cliente, endereço e telefone do serviço vêm dos dados dele
    // (continuam editáveis, o serviço pode ser em outro local).
    formWrap.querySelector('#f-cliente').addEventListener('change', (e) => {
      const c = all('SELECT * FROM clientes WHERE id = ?', [Number(e.target.value)])[0];
      formWrap.querySelector('#f-endereco').value = c ? montarEnderecoCliente(c) : '';
      formWrap.querySelector('#f-telefone').value = c ? (c.celular1 || c.fone1 || '') : '';
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
      const parcelas = forma_pagamento === 'Cartão de Crédito' ? numOuNull(formWrap.querySelector('#f-parcelas').value) : null;
      const conta_caixa_id = numOuNull(formWrap.querySelector('#f-conta-caixa').value);

      // valor_mao_obra e valor_produtos vêm sempre da soma das tabelas
      // filhas (os_servicos / os_servico_itens); descrição = lista dos serviços.
      const v = calcularValoresDoFormulario(id);

      const dados = {
        cliente_id,
        descricao: listaDescricoesServicos(id).join('\n'),
        tipo_registro,
        status_andamento: formWrap.querySelector('#f-status-andamento').value,
        status_pagamento,
        valor_mao_obra: v.servicos,
        valor_produtos: v.produtos,
        valor_total: v.valor_total,
        forma_pagamento: forma_pagamento || null,
        parcelas,
        valor_juros: v.valor_juros,
        desconto: v.desconto,
        endereco: formWrap.querySelector('#f-endereco').value.trim(),
        telefone: formWrap.querySelector('#f-telefone').value.trim(),
        conta_caixa_id,
        observacao: formWrap.querySelector('#f-obs').value.trim(),
      };

      let osId = id;
      if (id) {
        run(`UPDATE os SET cliente_id=?, descricao=?, tipo_registro=?, status_andamento=?, status_pagamento=?, valor_mao_obra=?,
             valor_produtos=?, valor_total=?, forma_pagamento=?, parcelas=?, valor_juros=?, desconto=?, endereco=?, telefone=?,
             conta_caixa_id=?, observacao=? WHERE id=?`,
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
      // O valor lançado já tem o desconto abatido.
      if (tipo_registro === 'OS' && status_pagamento === 'Pago') {
        const jaTemLancamento = all('SELECT id FROM financeiro WHERE os_id = ?', [osId]);
        if (!jaTemLancamento.length) {
          run(`INSERT INTO financeiro (tipo, valor_servico, valor_produtos, valor_total, categoria, categoria_id, descricao, os_id, origem, conta_caixa_id)
               VALUES ('Entrada', ?, ?, ?, 'Mão de obra+Produtos', ?, ?, ?, 'automatico', ?)`,
            [v.servicos, v.produtos, v.valor_total, obterOuCriarCategoriaFinanceiro('Mão de obra+Produtos'), `OS ${osId}`, osId, conta_caixa_id]);
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
      atualizarResumoTopoOrcamento(id);
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

        <div class="linha-add-produto">
          <select class="novo-produto-select">
            <option value="">Selecione um produto</option>
            ${all('SELECT id, descricao FROM produtos WHERE descontinuado = 0 ORDER BY descricao').map((p) =>
              `<option value="${p.id}">${escapeHtml(p.descricao)}</option>`
            ).join('')}
          </select>
          <input class="novo-produto-qtd" type="number" step="0.01" min="0.01" value="1" aria-label="Quantidade" />
          <button class="btn-add-produto-servico">+ Adicionar Produto</button>
        </div>
        <p class="produto-erro pin-erro"></p>
      </div>
    `;
  }

  // Recalcula valor_mao_obra (soma dos serviços), valor_produtos (soma dos
  // produtos de todos os serviços), desconto/juros/total (com base no que já
  // está salvo na OS) e a descrição (lista dos serviços) sempre que um serviço
  // ou produto filho é adicionado/removido — mantém a OS e o PDF sempre
  // corretos, sem precisar reabrir/salvar o formulário principal.
  function recalcularOrcamento(osId) {
    const { servicos, produtos } = somasDaOs(osId);
    const osAtual = all('SELECT forma_pagamento, parcelas, desconto FROM os WHERE id = ?', [osId])[0];
    const v = calcularTotais({
      servicos,
      produtos,
      desconto: osAtual.desconto || 0,
      forma: osAtual.forma_pagamento,
      parcelas: osAtual.parcelas,
    });

    run('UPDATE os SET valor_mao_obra = ?, valor_produtos = ?, valor_total = ?, valor_juros = ?, desconto = ?, descricao = ? WHERE id = ?',
      [v.servicos, v.produtos, v.valor_total, v.valor_juros, v.desconto, listaDescricoesServicos(osId).join('\n'), osId]);
  }

  // Atualiza a lista de serviços (Descrição) e o quadro de Valores do formulário.
  function atualizarResumoTopoOrcamento(osId) {
    const bloco = formWrap.querySelector('#bloco-resumo-orcamento');
    if (!bloco) return;
    const v = calcularValoresDoFormulario(osId);
    bloco.querySelector('#resumo-valor-servicos').value = formatarMoeda(v.servicos);
    bloco.querySelector('#resumo-valor-produtos').value = formatarMoeda(v.produtos);
    bloco.querySelector('#resumo-valor-juros').value = formatarMoeda(v.valor_juros);
    bloco.querySelector('#resumo-valor-total-geral').value = formatarMoeda(v.total_geral);
    const desc = formWrap.querySelector('#f-descricao');
    if (desc) desc.innerHTML = htmlDescricaoServicos(osId);
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
    const desconto = os.desconto || 0;
    const totalLucro = lucroProdutos + lucroServico - desconto;

    secao.innerHTML = `
      <h3>Resumo Financeiro (interno — não vai no PDF do cliente)</h3>
      <p class="item-sub">Gastos com produtos: <strong>${formatarMoeda(gastosProdutos)}</strong></p>
      <p class="item-sub">Lucro dos produtos: <strong>${formatarMoeda(lucroProdutos)}</strong></p>
      <p class="item-sub">Lucro do serviço: <strong>${formatarMoeda(lucroServico)}</strong></p>
      ${desconto ? `<p class="item-sub">Desconto concedido: <strong>- ${formatarMoeda(desconto)}</strong></p>` : ''}
      <p class="item-sub">Total lucro/déficit: <strong style="color:${totalLucro >= 0 ? '#22c55e' : '#ef4444'}">${formatarMoeda(totalLucro)}</strong></p>
      ${os.valor_juros ? `<p class="item-sub">Juros do cartão (cobrado do cliente): <strong>${formatarMoeda(os.valor_juros)}</strong></p>` : ''}
    `;
  }

  // ---------- Exportação em PDF ----------

  const TELEFONE_EMPRESA = '(19) 98160-5606';
  const SITE_EMPRESA = 'rreletrica.com.br';
  const CNPJ_EMPRESA = '24.727.143/0001-68';
  const SLOGAN_EMPRESA = 'INSTALAÇÃO ELÉTRICA QUE AGUENTA A CARGA DA SUA OPERAÇÃO';

  // Cores do site rreletrica.com.br (fundo grafite + dourado + prata)
  const COR_ESCURO = [13, 17, 21];   // #0d1115
  const COR_ESCURO_TOPO = [7, 9, 11]; // #07090b
  const COR_OURO = [215, 167, 43];   // #d7a72b
  const COR_PRATA = [199, 204, 209]; // #c7ccd1
  const COR_LINHA = [200, 204, 209];

  const LOGO_URL = './icons/logo-rr-completo.png';
  const LOGO_PROPORCAO = 323 / 900; // altura / largura do logo completo

  let logoBase64Cache = null;
  async function carregarLogoBase64() {
    if (logoBase64Cache) return logoBase64Cache;
    try {
      const resp = await fetch(LOGO_URL);
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
  // ou Resumido (cada serviço em uma linha com o valor).
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
      SELECT os.*, c.nome as cliente_nome, c.endereco as cli_endereco, c.bairro, c.cidade, c.uf, c.cep, c.fone1, c.celular1
      FROM os LEFT JOIN clientes c ON c.id = os.cliente_id WHERE os.id = ?
    `, [osId])[0];

    const tipoLabel = (os.tipo_registro || 'OS') === 'Orçamento' ? 'Orçamento' : 'O.S.';
    const logo = await carregarLogoBase64();

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const larguraPagina = doc.internal.pageSize.getWidth();
    const alturaPagina = doc.internal.pageSize.getHeight();
    const MARGEM = 14;
    const LIMITE_Y = alturaPagina - 24; // reserva o rodapé

    // ---------- Cabeçalho (cores do site) ----------
    const alturaCabecalho = 34;
    doc.setFillColor(...COR_ESCURO_TOPO);
    doc.rect(0, 0, larguraPagina, alturaCabecalho, 'F');
    doc.setFillColor(...COR_OURO);
    doc.rect(0, alturaCabecalho, larguraPagina, 1.2, 'F');

    if (logo) {
      const larguraLogo = 56;
      const alturaLogo = larguraLogo * LOGO_PROPORCAO;
      try { doc.addImage(logo, 'PNG', MARGEM, (alturaCabecalho - alturaLogo) / 2, larguraLogo, alturaLogo); } catch (e) { /* segue sem logo */ }
    }

    const xDireita = larguraPagina - MARGEM;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(TELEFONE_EMPRESA, xDireita, 13, { align: 'right' });

    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COR_OURO);
    doc.text(SITE_EMPRESA, xDireita, 19.5, { align: 'right' });

    doc.setFont(undefined, 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...COR_PRATA);
    doc.text(doc.splitTextToSize(SLOGAN_EMPRESA, 110), xDireita, 26, { align: 'right' });

    doc.setTextColor(0, 0, 0);

    // ---------- Título (sem o símbolo # no número) ----------
    let y = alturaCabecalho + 11;
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(`${tipoLabel} ${os.id}`, MARGEM, y);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text(new Date().toLocaleDateString('pt-BR'), xDireita, y, { align: 'right' });
    y += 9;

    // ---------- Dados do cliente ----------
    // Endereço e telefone da própria OS (campos do formulário) têm prioridade;
    // em registros antigos, sem eles, usa os dados do cadastro do cliente.
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('Cliente', MARGEM, y);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    y += 6;
    doc.text(`Nome: ${os.cliente_nome || '-'}`, MARGEM, y); y += 5.5;
    if (os.endereco) {
      const linhasEnd = doc.splitTextToSize(`Endereço: ${os.endereco}`, larguraPagina - 2 * MARGEM);
      doc.text(linhasEnd, MARGEM, y); y += linhasEnd.length * 5.5;
    } else {
      doc.text(`Endereço: ${os.cli_endereco || '-'}`, MARGEM, y); y += 5.5;
      doc.text(`Bairro: ${os.bairro || '-'}`, MARGEM, y);
      doc.text(`Cidade: ${os.cidade || '-'}`, 90, y);
      doc.text(`UF: ${os.uf || '-'}`, 160, y); y += 5.5;
      doc.text(`CEP: ${os.cep || '-'}`, MARGEM, y); y += 5.5;
    }
    if (os.telefone) {
      doc.text(`Telefone: ${os.telefone}`, MARGEM, y); y += 5.5;
    } else {
      doc.text(`Fone: ${os.fone1 || '-'}`, MARGEM, y);
      doc.text(`Celular: ${os.celular1 || '-'}`, 90, y); y += 5.5;
    }
    y += 4;

    // ---------- Serviços ----------
    const servicos = all('SELECT * FROM os_servicos WHERE os_id = ? ORDER BY ordem, id', [osId]);
    const dadosServicos = servicos.map((s) => {
      const itens = all(`
        SELECT si.quantidade, si.valor_venda_unit, si.valor_venda_total, p.descricao
        FROM os_servico_itens si LEFT JOIN produtos p ON p.id = si.produto_id
        WHERE si.servico_id = ?
      `, [s.id]);
      const subtotalProdutos = itens.reduce((acc, it) => acc + (it.valor_venda_total || 0), 0);
      return { s, itens, subtotal: (s.valor_servico || 0) + subtotalProdutos };
    });

    const estiloCabecalhoTabela = { fillColor: COR_ESCURO, textColor: COR_OURO, fontStyle: 'bold' };
    // Colunas de valores/quantidade: título alinhado à direita, como os números
    const alinharCabecalhoDireita = (dados) => {
      if (dados.section === 'head' && dados.column.index >= 1) dados.cell.styles.halign = 'right';
    };

    if (modo === 'resumido') {
      // Cada serviço numa linha só: descrição à esquerda, valor à direita, sem negrito.
      doc.autoTable({
        startY: y,
        head: [['Descrição do serviço', 'Valor']],
        body: dadosServicos.map((d, idx) => [`${idx + 1}. ${d.s.descricao || 'Serviço'}`, formatarMoeda(d.subtotal)]),
        theme: 'grid',
        styles: { fontStyle: 'normal', textColor: [0, 0, 0], lineColor: COR_LINHA, lineWidth: 0.2 },
        didParseCell: alinharCabecalhoDireita,
        headStyles: estiloCabecalhoTabela,
        columnStyles: { 1: { halign: 'right', cellWidth: 38 } },
        margin: { left: MARGEM, right: MARGEM, bottom: 24 },
      });
      y = doc.lastAutoTable.finalY + 8;
    } else {
      dadosServicos.forEach((d, idx) => {
        if (y > LIMITE_Y - 30) { doc.addPage(); y = 20; }

        // Descrição do serviço: só texto, sem fundo colorido
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text(`${idx + 1}. ${d.s.descricao || 'Serviço'}`, MARGEM, y);
        doc.setFont(undefined, 'normal');
        doc.setFontSize(10);
        y += 6;

        if (d.itens.length) {
          doc.autoTable({
            startY: y,
            head: [['Descrição', 'Qtd', 'Valor unit.', 'Valor total']],
            body: d.itens.map((it) => [
              it.descricao || '-',
              String(it.quantidade),
              formatarMoeda(it.valor_venda_unit),
              formatarMoeda(it.valor_venda_total),
            ]),
            theme: 'grid',
            styles: { textColor: [0, 0, 0], lineColor: COR_LINHA, lineWidth: 0.2 },
            didParseCell: alinharCabecalhoDireita,
            headStyles: estiloCabecalhoTabela,
            columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
            margin: { left: MARGEM, right: MARGEM, bottom: 24 },
          });
          y = doc.lastAutoTable.finalY + 4;
        }

        doc.setFont(undefined, 'bold');
        doc.text(`Subtotal do serviço: ${formatarMoeda(d.subtotal)}`, xDireita, y, { align: 'right' });
        doc.setFont(undefined, 'normal');
        y += 9;
      });
    }

    // ---------- Totais ----------
    if (y > LIMITE_Y - 55) { doc.addPage(); y = 20; }

    const xTotalLabel = larguraPagina - 84;
    const linhaTotal = (rotulo, valor) => {
      doc.text(rotulo, xTotalLabel, y);
      doc.text(valor, xDireita, y, { align: 'right' });
      y += 6;
    };

    doc.setFontSize(10.5);
    if (modo === 'detalhado') {
      linhaTotal('Valor do serviço:', formatarMoeda(os.valor_mao_obra));
      linhaTotal('Valor dos produtos:', formatarMoeda(os.valor_produtos)); // total de todos os produtos
    }
    if (os.desconto) linhaTotal('Desconto:', `- ${formatarMoeda(os.desconto)}`);
    linhaTotal('Valor total:', formatarMoeda(os.valor_total));
    if (os.valor_juros) linhaTotal('Juros da maquininha:', formatarMoeda(os.valor_juros));

    // Valor total geral: caixa no padrão do site (grafite + dourado), menor que antes
    y += 2;
    const valorGeral = (os.valor_total || 0) + (os.valor_juros || 0);
    doc.setFillColor(...COR_ESCURO);
    doc.rect(xTotalLabel - 4, y - 5.5, (xDireita - xTotalLabel) + 4, 9, 'F');
    doc.setFillColor(...COR_OURO);
    doc.rect(xTotalLabel - 4, y - 5.5, 1.2, 9, 'F');
    doc.setTextColor(...COR_OURO);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(10.5);
    doc.text('Valor total geral:', xTotalLabel, y + 0.6);
    doc.text(formatarMoeda(valorGeral), xDireita - 2, y + 0.6, { align: 'right' });
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);

    // ---------- Rodapé em todas as páginas ----------
    const totalPaginas = doc.getNumberOfPages();
    for (let p = 1; p <= totalPaginas; p++) {
      doc.setPage(p);
      const yRodape = alturaPagina - 12;
      doc.setDrawColor(...COR_OURO);
      doc.setLineWidth(0.5);
      doc.line(MARGEM, yRodape - 5, xDireita, yRodape - 5);
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(60, 60, 60);
      doc.text('RR ELÉTRICA', MARGEM, yRodape);
      doc.setFont(undefined, 'normal');
      doc.text(`CNPJ ${CNPJ_EMPRESA}  ·  ${SITE_EMPRESA}`, larguraPagina / 2, yRodape, { align: 'center' });
      doc.text(`Página ${p}/${totalPaginas}`, xDireita, yRodape, { align: 'right' });
    }
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
