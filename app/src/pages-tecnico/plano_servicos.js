import { all, run, persist } from '../db/db.js';
import { confirmarApp } from '../ui/dialogo.js';

// ============================================================
// Plano Geral de Serviços — rascunho dos serviços e produtos de um
// cliente, para depois montar um orçamento mais exato e completo.
//
// Estrutura: dados do cliente + "Escopo Geral de Serviços e Produtos".
// Cada serviço tem uma descrição livre e uma lista de materiais
// (descrição + quantidade). Sem valores, de propósito: é só o rascunho.
// Guardado em `planos_servicos` (itens_json).
// ============================================================

function novoMaterial() { return { descricao: '', qtd: '' }; }
function novoServico() { return { descricao: '', materiais: [] }; }

export function renderPlanoServicos(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Plano Geral de Serviços</h2>
      <button id="btn-novo-plano">+ Novo plano</button>
      <ul id="lista-planos" class="lista"></ul>
      <div id="form-plano-wrap"></div>
    </div>
  `;

  const listaEl = container.querySelector('#lista-planos');
  const formWrap = container.querySelector('#form-plano-wrap');

  function renderLista() {
    const itens = all(`
      SELECT p.id, p.data_plano, p.itens_json, c.nome as cliente_nome
      FROM planos_servicos p LEFT JOIN clientes c ON c.id = p.cliente_id
      ORDER BY p.id DESC
    `);
    listaEl.innerHTML = itens.map((p) => {
      let qtdServicos = 0;
      try { qtdServicos = JSON.parse(p.itens_json || '[]').length; } catch (e) { qtdServicos = 0; }
      return `
        <li data-id="${p.id}">
          <div class="item-principal">
            <strong>Plano #${p.id} — ${escapeHtml(p.cliente_nome || 'Sem cliente')}</strong>
            <span class="item-sub">${p.data_plano ? `${formatarData(p.data_plano)} · ` : ''}${qtdServicos} serviço(s)</span>
          </div>
          <button class="btn-editar" data-id="${p.id}">Abrir</button>
        </li>
      `;
    }).join('') || '<li><em>Nenhum plano cadastrado</em></li>';

    listaEl.querySelectorAll('.btn-editar').forEach((btn) => {
      btn.addEventListener('click', () => renderForm(Number(btn.dataset.id)));
    });
  }

  function renderForm(id = null) {
    const plano = id ? all('SELECT * FROM planos_servicos WHERE id = ?', [id])[0] : {};
    let servicos;
    try { servicos = (id && plano.itens_json) ? JSON.parse(plano.itens_json) : [novoServico()]; } catch (e) { servicos = [novoServico()]; }
    if (!servicos.length) servicos = [novoServico()];

    const catalogo = all('SELECT descricao FROM produtos WHERE descontinuado = 0 ORDER BY descricao');

    formWrap.innerHTML = `
      <div class="card form-card">
        <h3>${id ? `Plano Geral #${id}` : 'Novo Plano Geral de Serviços'}</h3>

        <label>Cliente *</label>
        <select id="f-cliente">
          <option value="">Selecione</option>
          ${all('SELECT id, nome FROM clientes ORDER BY nome').map((c) =>
            `<option value="${c.id}" ${plano.cliente_id === c.id ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`
          ).join('')}
        </select>

        <label>Endereço do serviço</label>
        <input id="f-endereco" type="text" value="${val(plano.endereco)}" />

        <label>Telefone</label>
        <input id="f-telefone" type="text" value="${val(plano.telefone)}" />

        <label>Data</label>
        <input id="f-data" type="date" value="${val(id ? plano.data_plano : hoje())}" />
      </div>

      <div class="card">
        <h3>Escopo Geral de Serviços e Produtos</h3>
        <datalist id="ps-lista-produtos">
          ${catalogo.map((p) => `<option value="${val(p.descricao)}"></option>`).join('')}
        </datalist>
        <div id="lista-servicos"></div>
        <button type="button" id="btn-add-servico" class="secondary">+ Adicionar Serviço</button>
      </div>

      <div class="card">
        <button id="btn-salvar-plano">Salvar plano</button>
        <button id="btn-cancelar-plano" class="secondary">Cancelar</button>
        ${id ? '<button id="btn-excluir-plano" class="danger">Excluir</button>' : ''}
        <p id="form-erro" class="pin-erro"></p>
      </div>
    `;

    // ---- Cliente: endereço e telefone vêm do cadastro (continuam editáveis) ----
    formWrap.querySelector('#f-cliente').addEventListener('change', (e) => {
      const c = all('SELECT * FROM clientes WHERE id = ?', [Number(e.target.value)])[0];
      formWrap.querySelector('#f-endereco').value = c ? [c.endereco, c.bairro, c.cidade, c.uf].filter(Boolean).join(', ') : '';
      formWrap.querySelector('#f-telefone').value = c ? (c.celular1 || c.fone1 || '') : '';
    });

    // ---- Serviços e materiais ----
    const listaServicosEl = formWrap.querySelector('#lista-servicos');

    function htmlMateriais(mats) {
      return mats.map((m, j) => `
        <div class="linha-item" data-mat="${j}">
          <div class="li-desc">
            <label>Produto / material</label>
            <input type="text" class="pm-descricao" list="ps-lista-produtos" value="${val(m.descricao)}" />
          </div>
          <div class="li-qtd">
            <label>Qtd</label>
            <input type="number" step="0.01" min="0" class="pm-qtd" value="${val(m.qtd)}" />
          </div>
          <div class="li-remover"><button type="button" class="danger btn-remover-linha btn-remover-material">Remover</button></div>
        </div>
      `).join('');
    }

    function ligarMateriais(blocoEl, idxServico) {
      blocoEl.querySelectorAll('.linha-item').forEach((linha) => {
        const j = Number(linha.dataset.mat);
        const m = servicos[idxServico].materiais[j];
        linha.querySelector('.pm-descricao').addEventListener('input', (e) => { m.descricao = e.target.value; });
        linha.querySelector('.pm-qtd').addEventListener('input', (e) => { m.qtd = e.target.value === '' ? '' : (Number(e.target.value) || 0); });
        linha.querySelector('.btn-remover-material').addEventListener('click', () => {
          servicos[idxServico].materiais.splice(j, 1);
          renderMateriais(idxServico);
        });
      });
    }

    // Redesenha só os materiais de um serviço (os outros campos não perdem o foco).
    function renderMateriais(idxServico) {
      const bloco = listaServicosEl.querySelector(`.subcard[data-idx="${idxServico}"] .ps-materiais`);
      bloco.innerHTML = htmlMateriais(servicos[idxServico].materiais);
      ligarMateriais(bloco, idxServico);
    }

    function renderServicos() {
      listaServicosEl.innerHTML = servicos.map((sv, i) => `
        <div class="subcard" data-idx="${i}">
          <div class="subcard-titulo">
            <strong>Serviço ${i + 1}</strong>
            ${servicos.length > 1 ? '<button type="button" class="danger btn-remover-servico" style="margin:0">Remover serviço</button>' : ''}
          </div>
          <label>Descrição do serviço</label>
          <textarea class="ps-descricao">${escapeHtml(sv.descricao)}</textarea>
          <div class="ps-materiais">${htmlMateriais(sv.materiais)}</div>
          <div class="linha-acao">
            <button type="button" class="secondary btn-add-material">+ Adicionar Material</button>
          </div>
        </div>
      `).join('');

      listaServicosEl.querySelectorAll('.subcard').forEach((sub) => {
        const idx = Number(sub.dataset.idx);
        sub.querySelector('.ps-descricao').addEventListener('input', (e) => { servicos[idx].descricao = e.target.value; });
        sub.querySelector('.btn-add-material').addEventListener('click', () => {
          servicos[idx].materiais.push(novoMaterial());
          renderMateriais(idx);
          const inputs = sub.querySelectorAll('.pm-descricao');
          if (inputs.length) inputs[inputs.length - 1].focus();
        });
        ligarMateriais(sub.querySelector('.ps-materiais'), idx);

        const btnRem = sub.querySelector('.btn-remover-servico');
        if (btnRem) btnRem.addEventListener('click', async () => {
          const temConteudo = servicos[idx].descricao.trim() || servicos[idx].materiais.some((m) => m.descricao.trim());
          if (temConteudo && !(await confirmarApp(`Remover o serviço ${idx + 1} e seus materiais?`, { titulo: 'Remover serviço', textoSim: 'Remover', textoNao: 'Manter' }))) return;
          servicos.splice(idx, 1);
          renderServicos();
        });
      });
    }

    formWrap.querySelector('#btn-add-servico').addEventListener('click', () => {
      servicos.push(novoServico());
      renderServicos();
      const areas = listaServicosEl.querySelectorAll('.ps-descricao');
      if (areas.length) areas[areas.length - 1].focus();
    });
    renderServicos();

    // ---- Ações ----
    formWrap.querySelector('#btn-cancelar-plano').addEventListener('click', () => { formWrap.innerHTML = ''; });

    if (id) {
      formWrap.querySelector('#btn-excluir-plano').addEventListener('click', async () => {
        if (!(await confirmarApp('Excluir este plano definitivamente?', { titulo: 'Excluir plano', textoSim: 'Excluir', textoNao: 'Manter' }))) return;
        run('DELETE FROM planos_servicos WHERE id = ?', [id]);
        await persist();
        formWrap.innerHTML = '';
        renderLista();
      });
    }

    formWrap.querySelector('#btn-salvar-plano').addEventListener('click', async () => {
      const cliente_id = Number(formWrap.querySelector('#f-cliente').value) || null;
      if (!cliente_id) {
        formWrap.querySelector('#form-erro').textContent = 'Selecione um cliente.';
        return;
      }
      const registro = {
        cliente_id,
        endereco: formWrap.querySelector('#f-endereco').value.trim(),
        telefone: formWrap.querySelector('#f-telefone').value.trim(),
        data_plano: formWrap.querySelector('#f-data').value || null,
        itens_json: JSON.stringify(servicos),
      };
      if (id) {
        run('UPDATE planos_servicos SET cliente_id=?, endereco=?, telefone=?, data_plano=?, itens_json=? WHERE id=?',
          [...Object.values(registro), id]);
      } else {
        const cols = Object.keys(registro).join(', ');
        const placeholders = Object.keys(registro).map(() => '?').join(', ');
        run(`INSERT INTO planos_servicos (${cols}) VALUES (${placeholders})`, Object.values(registro));
      }
      await persist();
      formWrap.innerHTML = '';
      renderLista();
    });
  }

  container.querySelector('#btn-novo-plano').addEventListener('click', () => renderForm(null));
  renderLista();
}

// ---------- Helpers ----------

function hoje() {
  const d = new Date();
  const dois = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}
function val(v) { return v === undefined || v === null ? '' : String(v).replace(/"/g, '&quot;'); }
function formatarData(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = String(iso).split('-');
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
