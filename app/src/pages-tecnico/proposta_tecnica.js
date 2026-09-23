import { all, run, persist } from '../db/db.js';
import {
  carregarLogoBase64, desenharCabecalho, desenharRodape, MARGEM, COR_LINHA,
} from '../ui/pdf_papel_timbrado.js';

// ============================================================
// Proposta Técnica Comercial — baseada no modelo em PDF fornecido
// (capa + introdução/diagnóstico + escopo de serviços + materiais +
// investimento + condições + prazo/garantia + oportunidades + aceite).
//
// 3 tabelas repetíveis:
//   - servicos:          descrição livre + qtd + valor unit. (mão de obra)
//   - materiais:         produto de verdade do catálogo (produtos) + qtd +
//                         valor unit. — assim, ao converter em O.S., viram
//                         os_servico_itens de verdade, com desconto de
//                         estoque, igual a quando você adiciona produto
//                         direto numa OS.
//   - produtosAdquirir:  só descrição + quantidade (lista de compras; NÃO
//                         entra na conversão para O.S.)
//
// "Converter em O.S." cria uma OS simples (tipo_registro='OS') com um
// os_servicos por linha de serviço da proposta, mais um os_servicos extra
// "Materiais e Equipamentos" com um os_servico_itens por material — só
// depois disso a OS passa a participar do Financeiro (quando for marcada
// como Paga lá na aba OS, do mesmo jeito que qualquer outra OS).
// ============================================================

const NORMAS_PADRAO = [
  'NR-10 – Segurança em Instalações e Serviços em Eletricidade',
  'NR-12 – Segurança no Trabalho em Máquinas e Equipamentos',
  'ABNT NBR 5410 – Instalações elétricas de baixa tensão',
  'ABNT NBR 10339 – Piscinas: Instalações elétricas e hidráulicas (quando aplicável)',
];

const OPCOES_PAGAMENTO = ['À vista, com desconto', 'Parcelado no cartão', 'Entrada + saldo na conclusão', 'Outro'];
const OPCOES_STATUS = ['Rascunho', 'Enviada', 'Aceita', 'Recusada'];

function gerarProximoNumeroProposta() {
  const registros = all(`SELECT numero FROM propostas_tecnicas WHERE numero LIKE 'PT%'`);
  let maior = 0;
  registros.forEach((r) => {
    const m = /^PT(\d{4,})$/.exec((r.numero || '').trim());
    if (m) maior = Math.max(maior, Number(m[1]));
  });
  return `PT${String(maior + 1).padStart(4, '0')}`;
}

function dadosPadrao() {
  return {
    servicos: [{ descricao: '', qtd: 1, valorUnit: 0 }],
    materiais: [],
    produtosAdquirir: [],
  };
}

export function renderPropostaTecnica(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Proposta Técnica Comercial</h2>
      <button id="btn-nova-proposta">+ Nova proposta</button>
      <ul id="lista-propostas" class="lista"></ul>
      <div id="form-proposta-wrap"></div>
    </div>
  `;

  const listaEl = container.querySelector('#lista-propostas');
  const formWrap = container.querySelector('#form-proposta-wrap');

  function renderLista() {
    const itens = all(`
      SELECT p.id, p.numero, p.status, p.data_emissao, p.os_id, c.nome as cliente_nome
      FROM propostas_tecnicas p LEFT JOIN clientes c ON c.id = p.cliente_id
      ORDER BY p.id DESC
    `);
    listaEl.innerHTML = itens.map((p) => `
      <li data-id="${p.id}">
        <div class="item-principal">
          <strong>${p.numero ? `Proposta ${escapeHtml(p.numero)}` : `Proposta #${p.id}`} — ${escapeHtml(p.cliente_nome || 'Sem cliente')}</strong>
          <span class="item-sub">${p.status}${p.data_emissao ? ` · ${formatarData(p.data_emissao)}` : ''}${p.os_id ? ` · convertida na O.S. #${p.os_id}` : ''}</span>
        </div>
        <button class="btn-editar" data-id="${p.id}">Abrir</button>
      </li>
    `).join('') || '<li><em>Nenhuma proposta cadastrada</em></li>';

    listaEl.querySelectorAll('.btn-editar').forEach((btn) => {
      btn.addEventListener('click', () => renderForm(Number(btn.dataset.id)));
    });
  }

  function renderForm(id = null) {
    const proposta = id ? all('SELECT * FROM propostas_tecnicas WHERE id = ?', [id])[0] : {};
    const dados = {
      servicos: (id && proposta.servicos_json) ? JSON.parse(proposta.servicos_json) : dadosPadrao().servicos,
      materiais: (id && proposta.materiais_json) ? JSON.parse(proposta.materiais_json) : [],
      produtosAdquirir: (id && proposta.produtos_adquirir_json) ? JSON.parse(proposta.produtos_adquirir_json) : [],
    };
    let mostrarNormas = false;
    const jaConvertida = !!(proposta && proposta.os_id);

    formWrap.innerHTML = `
      <div class="card form-card">
        <h3>${id ? `Proposta ${proposta.numero ? escapeHtml(proposta.numero) : `#${id}`}` : 'Nova Proposta Técnica Comercial'}</h3>

        <label>Nº da Proposta</label>
        <input id="f-numero" type="text" value="${val(id ? proposta.numero : gerarProximoNumeroProposta())}" readonly />

        <label>Cliente *</label>
        <select id="f-cliente" ${jaConvertida ? 'disabled' : ''}>
          <option value="">Selecione</option>
          ${all('SELECT id, nome FROM clientes ORDER BY nome').map((c) =>
            `<option value="${c.id}" ${proposta.cliente_id === c.id ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`
          ).join('')}
        </select>

        <label>Endereço / Local</label>
        <input id="f-endereco" type="text" value="${val(proposta.endereco_local)}" />

        <label>Data de emissão</label>
        <input id="f-data-emissao" type="date" value="${val(proposta.data_emissao || new Date().toISOString().slice(0, 10))}" />

        <label>Validade da proposta</label>
        <input id="f-validade" type="text" placeholder="Ex.: 15 dias" value="${val(proposta.validade_proposta)}" />

        <label>Responsável técnico</label>
        <input id="f-resp-tecnico" type="text" value="${val(proposta.responsavel_tecnico)}" />

        <label>Status</label>
        <select id="f-status">
          ${OPCOES_STATUS.map((o) => `<option ${(proposta.status || 'Rascunho') === o ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
        ${jaConvertida ? `<p class="item-sub campo-full">✔ Já convertida na O.S. #${proposta.os_id} — os dados do cliente e as tabelas ficam travados para não gerar inconsistência com a OS já criada.</p>` : ''}
      </div>

      <div class="card form-card">
        <h3 style="margin-top:0">1. Introdução e Diagnóstico</h3>
        <label class="campo-full">Diagnóstico resumido (situação encontrada na visita técnica)</label>
        <textarea id="f-diagnostico" class="campo-full">${val(proposta.diagnostico_resumo)}</textarea>
        <div class="linha-checkbox campo-full">
          <input type="checkbox" id="chk-normas" />
          <label style="margin:0" for="chk-normas">Mostrar normas e referências técnicas aplicadas</label>
        </div>
        <ul id="lista-normas" class="campo-full" style="display:none; margin-top:10px; padding-left:18px; font-size:0.9rem;">
          ${NORMAS_PADRAO.map((n) => `<li>${n}</li>`).join('')}
        </ul>
      </div>

      <div class="card">
        <h3>2. Escopo dos Serviços Propostos</h3>
        <div id="lista-servicos"></div>
        ${jaConvertida ? '' : '<button type="button" id="btn-add-servico" class="secondary">+ Adicionar serviço</button>'}
        <p class="item-sub">Total em serviços: <strong id="total-servicos">R$ 0,00</strong></p>
      </div>

      <div class="card">
        <h3>Materiais e Equipamentos Inclusos</h3>
        <p class="item-sub">Selecionados do seu catálogo de produtos — o preço vem do cadastro, mas pode ajustar para esta proposta.</p>
        <div id="lista-materiais"></div>
        ${jaConvertida ? '' : '<button type="button" id="btn-add-material" class="secondary">+ Adicionar material</button>'}
        <p class="item-sub">Total em materiais: <strong id="total-materiais">R$ 0,00</strong></p>
      </div>

      <div class="card">
        <h3>Produtos que a empresa deve adquirir</h3>
        <p class="item-sub">Lista de compras para executar o serviço — não entra na conversão para O.S.</p>
        <div id="lista-adquirir"></div>
        <button type="button" id="btn-add-adquirir" class="secondary">+ Adicionar produto a adquirir</button>
      </div>

      <div class="card form-card">
        <h3 style="margin-top:0">3. Investimento Total</h3>
        <label>Total em mão de obra / serviços</label>
        <input id="resumo-total-servicos" type="text" readonly />
        <label>Total em materiais e equipamentos</label>
        <input id="resumo-total-materiais" type="text" readonly />
        <label>Desconto (R$)</label>
        <input id="f-desconto" type="number" step="0.01" min="0" value="${val(proposta.desconto || 0)}" />
        <label>VALOR TOTAL GERAL</label>
        <input id="resumo-total-geral" type="text" readonly style="font-weight:bold" />

        <label class="campo-full">Condições de pagamento</label>
        <select id="f-condicao-pagamento" class="campo-full">
          <option value="">Selecione...</option>
          ${OPCOES_PAGAMENTO.map((o) => `<option value="${o}" ${proposta.condicao_pagamento === o ? 'selected' : ''}>${o}</option>`).join('')}
        </select>
        <label class="campo-full">Detalhamento do pagamento</label>
        <textarea id="f-detalhamento-pagamento" class="campo-full">${val(proposta.detalhamento_pagamento)}</textarea>
      </div>

      <div class="card form-card">
        <h3 style="margin-top:0">4. Prazo de Execução e Garantia</h3>
        <label>Prazo estimado de execução</label>
        <input id="f-prazo" type="text" value="${val(proposta.prazo_execucao)}" />
        <label>Garantia dos serviços prestados</label>
        <input id="f-garantia-servicos" type="text" value="${val(proposta.garantia_servicos)}" />
        <label>Garantia dos materiais (conforme fabricante)</label>
        <input id="f-garantia-materiais" type="text" value="${val(proposta.garantia_materiais)}" />

        <label class="campo-full">Oportunidades adicionais identificadas (ex.: inversor de frequência)</label>
        <textarea id="f-oportunidades" class="campo-full">${val(proposta.oportunidades)}</textarea>
      </div>

      <div class="card">
        <button id="btn-salvar-proposta">Salvar proposta</button>
        <button id="btn-cancelar-proposta" class="secondary">Cancelar</button>
        <button id="btn-exportar-proposta" class="secondary">Exportar PDF</button>
        ${!jaConvertida ? '<button id="btn-converter-os" class="secondary">Converter em O.S.</button>' : ''}
        ${id ? '<button id="btn-excluir-proposta" class="danger">Excluir</button>' : ''}
        <p id="form-erro" class="pin-erro"></p>
      </div>
    `;

    // ---- Cliente: ao escolher, sugere endereço ----
    formWrap.querySelector('#f-cliente').addEventListener('change', (e) => {
      const clienteId = Number(e.target.value) || null;
      if (!clienteId) return;
      const c = all('SELECT * FROM clientes WHERE id = ?', [clienteId])[0];
      if (!c) return;
      const endEl = formWrap.querySelector('#f-endereco');
      if (!endEl.value) endEl.value = [c.endereco, c.bairro, c.cidade, c.uf].filter(Boolean).join(', ');
    });

    formWrap.querySelector('#chk-normas').addEventListener('change', (e) => {
      mostrarNormas = e.target.checked;
      formWrap.querySelector('#lista-normas').style.display = mostrarNormas ? 'block' : 'none';
    });

    // ---- Tabela: Serviços ----
    function renderServicos() {
      const wrap = formWrap.querySelector('#lista-servicos');
      wrap.innerHTML = dados.servicos.map((s, i) => `
        <div class="subcard" data-idx="${i}" style="display:flex; gap:8px; flex-wrap:wrap; align-items:end; margin-bottom:8px">
          <div style="flex:2; min-width:180px">
            <label>Descrição do serviço</label>
            <input type="text" class="sv-descricao" value="${val(s.descricao)}" ${jaConvertida ? 'readonly' : ''} />
          </div>
          <div style="width:80px">
            <label>Qtd</label>
            <input type="number" step="0.01" class="sv-qtd" value="${val(s.qtd)}" ${jaConvertida ? 'readonly' : ''} />
          </div>
          <div style="width:120px">
            <label>Valor unit. (R$)</label>
            <input type="number" step="0.01" class="sv-valor-unit" value="${val(s.valorUnit)}" ${jaConvertida ? 'readonly' : ''} />
          </div>
          <div style="width:120px">
            <label>Valor total (R$)</label>
            <input type="text" class="sv-valor-total" value="${formatarMoeda((s.qtd || 0) * (s.valorUnit || 0))}" readonly />
          </div>
          ${(!jaConvertida && dados.servicos.length > 1) ? '<button type="button" class="danger btn-remover-servico">Remover</button>' : ''}
        </div>
      `).join('') || '<p class="item-sub"><em>Nenhum serviço adicionado</em></p>';

      wrap.querySelectorAll('.subcard').forEach((sub) => {
        const idx = Number(sub.dataset.idx);
        sub.querySelector('.sv-descricao').addEventListener('input', (e) => { dados.servicos[idx].descricao = e.target.value; });
        sub.querySelector('.sv-qtd').addEventListener('input', (e) => { dados.servicos[idx].qtd = Number(e.target.value) || 0; atualizarLinhaServico(idx); recalcularTotais(); });
        sub.querySelector('.sv-valor-unit').addEventListener('input', (e) => { dados.servicos[idx].valorUnit = Number(e.target.value) || 0; atualizarLinhaServico(idx); recalcularTotais(); });
        const btnRem = sub.querySelector('.btn-remover-servico');
        if (btnRem) btnRem.addEventListener('click', () => { dados.servicos.splice(idx, 1); renderServicos(); recalcularTotais(); });
      });
    }
    function atualizarLinhaServico(idx) {
      const sub = formWrap.querySelector(`#lista-servicos .subcard[data-idx="${idx}"]`);
      if (!sub) return;
      const s = dados.servicos[idx];
      sub.querySelector('.sv-valor-total').value = formatarMoeda((s.qtd || 0) * (s.valorUnit || 0));
    }
    const btnAddServico = formWrap.querySelector('#btn-add-servico');
    if (btnAddServico) btnAddServico.addEventListener('click', () => { dados.servicos.push({ descricao: '', qtd: 1, valorUnit: 0 }); renderServicos(); recalcularTotais(); });

    // ---- Tabela: Materiais (ligados ao catálogo de produtos) ----
    const catalogoProdutos = all('SELECT id, descricao, valor_venda FROM produtos WHERE descontinuado = 0 ORDER BY descricao');
    function renderMateriais() {
      const wrap = formWrap.querySelector('#lista-materiais');
      wrap.innerHTML = dados.materiais.map((m, i) => `
        <div class="subcard" data-idx="${i}" style="display:flex; gap:8px; flex-wrap:wrap; align-items:end; margin-bottom:8px">
          <div style="flex:2; min-width:180px">
            <label>Produto</label>
            <select class="mt-produto" ${jaConvertida ? 'disabled' : ''}>
              <option value="">Selecione um produto</option>
              ${catalogoProdutos.map((p) => `<option value="${p.id}" ${m.produtoId === p.id ? 'selected' : ''}>${escapeHtml(p.descricao)}</option>`).join('')}
            </select>
          </div>
          <div style="width:80px">
            <label>Qtd</label>
            <input type="number" step="0.01" class="mt-qtd" value="${val(m.qtd)}" ${jaConvertida ? 'readonly' : ''} />
          </div>
          <div style="width:120px">
            <label>Valor unit. (R$)</label>
            <input type="number" step="0.01" class="mt-valor-unit" value="${val(m.valorUnit)}" ${jaConvertida ? 'readonly' : ''} />
          </div>
          <div style="width:120px">
            <label>Valor total (R$)</label>
            <input type="text" class="mt-valor-total" value="${formatarMoeda((m.qtd || 0) * (m.valorUnit || 0))}" readonly />
          </div>
          ${(!jaConvertida) ? '<button type="button" class="danger btn-remover-material">Remover</button>' : ''}
        </div>
      `).join('') || '<p class="item-sub"><em>Nenhum material adicionado</em></p>';

      wrap.querySelectorAll('.subcard').forEach((sub) => {
        const idx = Number(sub.dataset.idx);
        sub.querySelector('.mt-produto').addEventListener('change', (e) => {
          const produtoId = Number(e.target.value) || null;
          dados.materiais[idx].produtoId = produtoId;
          const p = catalogoProdutos.find((x) => x.id === produtoId);
          dados.materiais[idx].descricao = p ? p.descricao : '';
          if (p && !dados.materiais[idx].valorUnit) dados.materiais[idx].valorUnit = p.valor_venda || 0;
          renderMateriais();
          recalcularTotais();
        });
        sub.querySelector('.mt-qtd').addEventListener('input', (e) => { dados.materiais[idx].qtd = Number(e.target.value) || 0; atualizarLinhaMaterial(idx); recalcularTotais(); });
        sub.querySelector('.mt-valor-unit').addEventListener('input', (e) => { dados.materiais[idx].valorUnit = Number(e.target.value) || 0; atualizarLinhaMaterial(idx); recalcularTotais(); });
        const btnRem = sub.querySelector('.btn-remover-material');
        if (btnRem) btnRem.addEventListener('click', () => { dados.materiais.splice(idx, 1); renderMateriais(); recalcularTotais(); });
      });
    }
    function atualizarLinhaMaterial(idx) {
      const sub = formWrap.querySelector(`#lista-materiais .subcard[data-idx="${idx}"]`);
      if (!sub) return;
      const m = dados.materiais[idx];
      sub.querySelector('.mt-valor-total').value = formatarMoeda((m.qtd || 0) * (m.valorUnit || 0));
    }
    const btnAddMaterial = formWrap.querySelector('#btn-add-material');
    if (btnAddMaterial) btnAddMaterial.addEventListener('click', () => { dados.materiais.push({ produtoId: null, descricao: '', qtd: 1, valorUnit: 0 }); renderMateriais(); recalcularTotais(); });

    // ---- Tabela: Produtos que a empresa deve adquirir (só descrição + qtd) ----
    function renderAdquirir() {
      const wrap = formWrap.querySelector('#lista-adquirir');
      wrap.innerHTML = dados.produtosAdquirir.map((p, i) => `
        <div class="subcard" data-idx="${i}" style="display:flex; gap:8px; flex-wrap:wrap; align-items:end; margin-bottom:8px">
          <div style="flex:2; min-width:180px">
            <label>Descrição</label>
            <input type="text" class="pa-descricao" value="${val(p.descricao)}" />
          </div>
          <div style="width:100px">
            <label>Quantidade</label>
            <input type="number" step="0.01" class="pa-quantidade" value="${val(p.quantidade)}" />
          </div>
          <button type="button" class="danger btn-remover-adquirir">Remover</button>
        </div>
      `).join('') || '<p class="item-sub"><em>Nenhum item nesta lista</em></p>';

      wrap.querySelectorAll('.subcard').forEach((sub) => {
        const idx = Number(sub.dataset.idx);
        sub.querySelector('.pa-descricao').addEventListener('input', (e) => { dados.produtosAdquirir[idx].descricao = e.target.value; });
        sub.querySelector('.pa-quantidade').addEventListener('input', (e) => { dados.produtosAdquirir[idx].quantidade = Number(e.target.value) || 0; });
        sub.querySelector('.btn-remover-adquirir').addEventListener('click', () => { dados.produtosAdquirir.splice(idx, 1); renderAdquirir(); });
      });
    }
    formWrap.querySelector('#btn-add-adquirir').addEventListener('click', () => { dados.produtosAdquirir.push({ descricao: '', quantidade: 1 }); renderAdquirir(); });

    // ---- Totais ao vivo ----
    function recalcularTotais() {
      const totalServicos = dados.servicos.reduce((acc, s) => acc + (s.qtd || 0) * (s.valorUnit || 0), 0);
      const totalMateriais = dados.materiais.reduce((acc, m) => acc + (m.qtd || 0) * (m.valorUnit || 0), 0);
      const desconto = Number(formWrap.querySelector('#f-desconto').value) || 0;
      const totalGeral = Math.max(totalServicos + totalMateriais - desconto, 0);
      formWrap.querySelector('#total-servicos').textContent = formatarMoeda(totalServicos);
      formWrap.querySelector('#total-materiais').textContent = formatarMoeda(totalMateriais);
      formWrap.querySelector('#resumo-total-servicos').value = formatarMoeda(totalServicos);
      formWrap.querySelector('#resumo-total-materiais').value = formatarMoeda(totalMateriais);
      formWrap.querySelector('#resumo-total-geral').value = formatarMoeda(totalGeral);
      return { totalServicos, totalMateriais, desconto, totalGeral };
    }
    formWrap.querySelector('#f-desconto').addEventListener('input', recalcularTotais);

    renderServicos();
    renderMateriais();
    renderAdquirir();
    recalcularTotais();

    // ---- Ações ----
    formWrap.querySelector('#btn-cancelar-proposta').addEventListener('click', () => { formWrap.innerHTML = ''; });
    formWrap.querySelector('#btn-exportar-proposta').addEventListener('click', () => gerarPdf(id, dados));

    if (id) {
      const btnExcluir = formWrap.querySelector('#btn-excluir-proposta');
      if (btnExcluir) btnExcluir.addEventListener('click', async () => {
        if (!confirm('Excluir esta proposta definitivamente? (Isso não desfaz uma O.S. já criada a partir dela.)')) return;
        run('DELETE FROM propostas_tecnicas WHERE id = ?', [id]);
        await persist();
        formWrap.innerHTML = '';
        renderLista();
      });
    }

    function coletarRegistro() {
      return {
        numero: formWrap.querySelector('#f-numero').value.trim() || null,
        cliente_id: Number(formWrap.querySelector('#f-cliente').value) || null,
        endereco_local: formWrap.querySelector('#f-endereco').value.trim(),
        data_emissao: formWrap.querySelector('#f-data-emissao').value || null,
        validade_proposta: formWrap.querySelector('#f-validade').value.trim(),
        responsavel_tecnico: formWrap.querySelector('#f-resp-tecnico').value.trim(),
        diagnostico_resumo: formWrap.querySelector('#f-diagnostico').value.trim(),
        servicos_json: JSON.stringify(dados.servicos),
        materiais_json: JSON.stringify(dados.materiais),
        produtos_adquirir_json: JSON.stringify(dados.produtosAdquirir),
        desconto: Number(formWrap.querySelector('#f-desconto').value) || 0,
        condicao_pagamento: formWrap.querySelector('#f-condicao-pagamento').value,
        detalhamento_pagamento: formWrap.querySelector('#f-detalhamento-pagamento').value.trim(),
        prazo_execucao: formWrap.querySelector('#f-prazo').value.trim(),
        garantia_servicos: formWrap.querySelector('#f-garantia-servicos').value.trim(),
        garantia_materiais: formWrap.querySelector('#f-garantia-materiais').value.trim(),
        oportunidades: formWrap.querySelector('#f-oportunidades').value.trim(),
        status: formWrap.querySelector('#f-status').value,
      };
    }

    formWrap.querySelector('#btn-salvar-proposta').addEventListener('click', async () => {
      const registro = coletarRegistro();
      if (!registro.cliente_id) {
        formWrap.querySelector('#form-erro').textContent = 'Selecione um cliente.';
        return;
      }
      if (id) {
        run(`UPDATE propostas_tecnicas SET numero=?, cliente_id=?, endereco_local=?, data_emissao=?, validade_proposta=?,
             responsavel_tecnico=?, diagnostico_resumo=?, servicos_json=?, materiais_json=?, produtos_adquirir_json=?,
             desconto=?, condicao_pagamento=?, detalhamento_pagamento=?, prazo_execucao=?, garantia_servicos=?,
             garantia_materiais=?, oportunidades=?, status=? WHERE id=?`,
          [...Object.values(registro), id]);
      } else {
        const cols = Object.keys(registro).join(', ');
        const placeholders = Object.keys(registro).map(() => '?').join(', ');
        run(`INSERT INTO propostas_tecnicas (${cols}) VALUES (${placeholders})`, Object.values(registro));
      }
      await persist();
      formWrap.innerHTML = '';
      renderLista();
    });

    const btnConverter = formWrap.querySelector('#btn-converter-os');
    if (btnConverter) {
      btnConverter.addEventListener('click', async () => {
        const registro = coletarRegistro();
        if (!registro.cliente_id) {
          formWrap.querySelector('#form-erro').textContent = 'Selecione um cliente.';
          return;
        }
        if (!dados.servicos.some((s) => s.descricao) && !dados.materiais.some((m) => m.produtoId)) {
          formWrap.querySelector('#form-erro').textContent = 'Adicione ao menos um serviço ou material antes de converter em O.S.';
          return;
        }
        if (!confirm('Converter esta proposta em uma O.S.? Os serviços e materiais informados serão lançados na OS (com baixa de estoque dos materiais com controle de estoque).')) return;

        // 1) Salva a proposta primeiro (garante que id/servicos/materiais estão persistidos).
        let propostaId = id;
        if (propostaId) {
          run(`UPDATE propostas_tecnicas SET numero=?, cliente_id=?, endereco_local=?, data_emissao=?, validade_proposta=?,
               responsavel_tecnico=?, diagnostico_resumo=?, servicos_json=?, materiais_json=?, produtos_adquirir_json=?,
               desconto=?, condicao_pagamento=?, detalhamento_pagamento=?, prazo_execucao=?, garantia_servicos=?,
               garantia_materiais=?, oportunidades=?, status=? WHERE id=?`,
            [...Object.values(registro), propostaId]);
        } else {
          const cols = Object.keys(registro).join(', ');
          const placeholders = Object.keys(registro).map(() => '?').join(', ');
          run(`INSERT INTO propostas_tecnicas (${cols}) VALUES (${placeholders})`, Object.values(registro));
          propostaId = all('SELECT last_insert_rowid() as id')[0].id;
        }

        // 2) Cria a OS.
        const descricaoOs = dados.servicos.filter((s) => s.descricao).map((s) => s.descricao).join('\n')
          || `Convertido da Proposta ${registro.numero || propostaId}`;
        run(`INSERT INTO os (cliente_id, descricao, tipo_registro, status_andamento, status_pagamento, endereco, desconto, data_abertura)
             VALUES (?, ?, 'OS', 'Aberta', 'Pendente', ?, ?, datetime('now'))`,
          [registro.cliente_id, descricaoOs, registro.endereco_local, registro.desconto]);
        const osId = all('SELECT last_insert_rowid() as id')[0].id;

        // 3) Um os_servicos por linha de serviço da proposta.
        let ordem = 0;
        dados.servicos.filter((s) => s.descricao).forEach((s) => {
          run('INSERT INTO os_servicos (os_id, descricao, valor_servico, ordem) VALUES (?, ?, ?, ?)',
            [osId, s.descricao, (s.qtd || 0) * (s.valorUnit || 0), ordem++]);
        });

        // 4) Materiais viram os_servico_itens dentro de um os_servicos "Materiais e Equipamentos".
        const materiaisValidos = dados.materiais.filter((m) => m.produtoId);
        if (materiaisValidos.length) {
          run('INSERT INTO os_servicos (os_id, descricao, valor_servico, ordem) VALUES (?, ?, 0, ?)',
            [osId, 'Materiais e Equipamentos', ordem++]);
          const servicoMateriaisId = all('SELECT last_insert_rowid() as id')[0].id;
          materiaisValidos.forEach((m) => {
            const produto = all('SELECT * FROM produtos WHERE id = ?', [m.produtoId])[0];
            const valorCustoUnit = produto ? (produto.valor_custo || 0) : 0;
            run(`INSERT INTO os_servico_itens (servico_id, produto_id, quantidade, valor_custo_unit, valor_venda_unit, valor_venda_total)
                 VALUES (?, ?, ?, ?, ?, ?)`,
              [servicoMateriaisId, m.produtoId, m.qtd || 0, valorCustoUnit, m.valorUnit || 0, (m.qtd || 0) * (m.valorUnit || 0)]);
            if (produto && produto.controle_estoque) {
              run('UPDATE produtos SET estoque_atual = COALESCE(estoque_atual,0) - ? WHERE id = ?', [m.qtd || 0, m.produtoId]);
            }
          });
        }

        // 5) Recalcula e grava os totais da OS (mesma fórmula usada em pages/os.js).
        const somaServicos = all('SELECT COALESCE(SUM(valor_servico),0) as s FROM os_servicos WHERE os_id = ?', [osId])[0].s;
        const somaProdutos = all(`
          SELECT COALESCE(SUM(si.valor_venda_total),0) as s FROM os_servico_itens si
          JOIN os_servicos sv ON sv.id = si.servico_id WHERE sv.os_id = ?`, [osId])[0].s;
        const descontoAplicado = Math.min(Math.max(registro.desconto || 0, 0), somaServicos + somaProdutos);
        const valorTotal = somaServicos + somaProdutos - descontoAplicado;
        run('UPDATE os SET valor_mao_obra=?, valor_produtos=?, valor_total=?, desconto=? WHERE id=?',
          [somaServicos, somaProdutos, valorTotal, descontoAplicado, osId]);

        // 6) Marca a proposta como convertida.
        run(`UPDATE propostas_tecnicas SET status='Aceita', os_id=? WHERE id=?`, [osId, propostaId]);

        await persist();
        formWrap.innerHTML = '';
        renderLista();
        alert(`Proposta convertida na O.S. #${osId}. Abra a aba OS para conferir/enviar ao cliente.`);
      });
    }
  }

  container.querySelector('#btn-nova-proposta').addEventListener('click', () => renderForm(null));
  renderLista();
}

// ---------- Exportação em PDF ----------

async function gerarPdf(id, dados) {
  const proposta = id ? all('SELECT p.*, c.nome as cliente_nome FROM propostas_tecnicas p LEFT JOIN clientes c ON c.id=p.cliente_id WHERE p.id = ?', [id])[0] : {};
  const logo = await carregarLogoBase64();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const larguraPagina = doc.internal.pageSize.getWidth();
  let y = desenharCabecalho(doc, logo, 'PROPOSTA TÉCNICA COMERCIAL');

  doc.setFontSize(15);
  doc.setFont(undefined, 'bold');
  doc.text(`Proposta Técnica Comercial ${proposta.numero ? `Nº ${proposta.numero}` : ''}`, MARGEM, y);
  y += 8;
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  const linhaInfo = [
    proposta.cliente_nome ? `Cliente: ${proposta.cliente_nome}` : null,
    proposta.endereco_local ? `Local: ${proposta.endereco_local}` : null,
    proposta.data_emissao ? `Emissão: ${formatarData(proposta.data_emissao)}` : null,
    proposta.validade_proposta ? `Validade: ${proposta.validade_proposta}` : null,
    proposta.responsavel_tecnico ? `Responsável técnico: ${proposta.responsavel_tecnico}` : null,
  ].filter(Boolean);
  linhaInfo.forEach((l) => { doc.text(l, MARGEM, y); y += 5.5; });
  y += 3;

  if (proposta.diagnostico_resumo) {
    doc.setFont(undefined, 'bold');
    doc.text('Diagnóstico resumido', MARGEM, y); y += 5.5;
    doc.setFont(undefined, 'normal');
    const linhas = doc.splitTextToSize(proposta.diagnostico_resumo, larguraPagina - 2 * MARGEM);
    doc.text(linhas, MARGEM, y); y += linhas.length * 5.5 + 3;
  }

  function tabela(titulo, head, body) {
    if (!body.length) return;
    doc.setFont(undefined, 'bold');
    doc.setFontSize(11);
    doc.text(titulo, MARGEM, y);
    y += 2;
    doc.autoTable({
      startY: y,
      head: [head],
      body,
      theme: 'grid',
      styles: { textColor: [0, 0, 0], lineColor: COR_LINHA, lineWidth: 0.2, fontSize: 9 },
      headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0] },
      margin: { left: MARGEM, right: MARGEM, bottom: 24 },
    });
    y = doc.lastAutoTable.finalY + 6;
    doc.setFont(undefined, 'normal');
  }

  const totalServicos = dados.servicos.reduce((acc, s) => acc + (s.qtd || 0) * (s.valorUnit || 0), 0);
  const totalMateriais = dados.materiais.reduce((acc, m) => acc + (m.qtd || 0) * (m.valorUnit || 0), 0);

  tabela('Escopo dos Serviços Propostos', ['Descrição do serviço', 'Qtd', 'Valor unit.', 'Valor total'],
    dados.servicos.filter((s) => s.descricao).map((s) => [s.descricao, String(s.qtd), formatarMoeda(s.valorUnit), formatarMoeda((s.qtd || 0) * (s.valorUnit || 0))]));

  tabela('Materiais e Equipamentos Inclusos', ['Item / Material', 'Qtd', 'Valor unit.', 'Valor total'],
    dados.materiais.filter((m) => m.descricao).map((m) => [m.descricao, String(m.qtd), formatarMoeda(m.valorUnit), formatarMoeda((m.qtd || 0) * (m.valorUnit || 0))]));

  tabela('Produtos que a empresa deve adquirir', ['Item', 'Quantidade'],
    dados.produtosAdquirir.filter((p) => p.descricao).map((p) => [p.descricao, String(p.quantidade)]));

  // Investimento total
  if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = MARGEM + 10; }
  doc.setFont(undefined, 'bold');
  doc.setFontSize(12);
  doc.text('Investimento Total', MARGEM, y); y += 7;
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  doc.text(`Total em mão de obra / serviços: ${formatarMoeda(totalServicos)}`, MARGEM, y); y += 5.5;
  doc.text(`Total em materiais e equipamentos: ${formatarMoeda(totalMateriais)}`, MARGEM, y); y += 5.5;
  doc.text(`Desconto: ${formatarMoeda(proposta.desconto || 0)}`, MARGEM, y); y += 5.5;
  doc.setFont(undefined, 'bold');
  doc.text(`VALOR TOTAL GERAL: ${formatarMoeda(Math.max(totalServicos + totalMateriais - (proposta.desconto || 0), 0))}`, MARGEM, y); y += 8;
  doc.setFont(undefined, 'normal');

  if (proposta.condicao_pagamento) { doc.text(`Condição de pagamento: ${proposta.condicao_pagamento}`, MARGEM, y); y += 5.5; }
  if (proposta.detalhamento_pagamento) {
    const linhas = doc.splitTextToSize(proposta.detalhamento_pagamento, larguraPagina - 2 * MARGEM);
    doc.text(linhas, MARGEM, y); y += linhas.length * 5.5;
  }
  y += 3;

  if (proposta.prazo_execucao) { doc.text(`Prazo estimado de execução: ${proposta.prazo_execucao}`, MARGEM, y); y += 5.5; }
  if (proposta.garantia_servicos) { doc.text(`Garantia dos serviços: ${proposta.garantia_servicos}`, MARGEM, y); y += 5.5; }
  if (proposta.garantia_materiais) { doc.text(`Garantia dos materiais: ${proposta.garantia_materiais}`, MARGEM, y); y += 5.5; }

  if (proposta.oportunidades) {
    y += 3;
    doc.setFont(undefined, 'bold');
    doc.text('Oportunidades adicionais identificadas', MARGEM, y); y += 5.5;
    doc.setFont(undefined, 'normal');
    const linhas = doc.splitTextToSize(proposta.oportunidades, larguraPagina - 2 * MARGEM);
    doc.text(linhas, MARGEM, y); y += linhas.length * 5.5;
  }

  desenharRodape(doc);
  doc.save(`proposta-${(proposta.numero || id || 'nova')}.pdf`);
}

function val(v) { return v === undefined || v === null ? '' : String(v).replace(/"/g, '&quot;'); }
function formatarMoeda(v) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function formatarData(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = String(iso).split('-');
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
