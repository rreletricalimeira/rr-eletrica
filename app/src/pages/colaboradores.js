import { all, run, persist } from '../db/db.js';

const MASK_FONE = (v) => v.replace(/\D/g, '').replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4,5})(\d{4})$/, '$1-$2').slice(0, 15);

export function renderColaboradores(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Colaboradores</h2>
      <button id="btn-novo-colaborador">+ Novo colaborador</button>
      <ul id="lista-colaboradores" class="lista"></ul>
      <div id="form-colaborador-wrap"></div>
    </div>
  `;

  const listaEl = container.querySelector('#lista-colaboradores');
  const formWrap = container.querySelector('#form-colaborador-wrap');

  function renderLista() {
    const itens = all('SELECT id, nome, telefone FROM colaboradores ORDER BY nome');
    listaEl.innerHTML = itens.map((c) => `
      <li data-id="${c.id}">
        <div class="item-principal">
          <strong>${escapeHtml(c.nome)}</strong>
          <span class="item-sub">${c.telefone || '-'}</span>
        </div>
        <button class="btn-editar" data-id="${c.id}">Editar</button>
      </li>
    `).join('') || '<li><em>Nenhum colaborador cadastrado</em></li>';

    listaEl.querySelectorAll('.btn-editar').forEach((btn) => {
      btn.addEventListener('click', () => renderForm(Number(btn.dataset.id)));
    });
  }

  function renderForm(id = null) {
    const c = id ? all('SELECT * FROM colaboradores WHERE id = ?', [id])[0] : {};

    formWrap.innerHTML = `
      <div class="card form-card">
        <h3>${id ? 'Editar colaborador' : 'Novo colaborador'}</h3>

        <label>Nome *</label>
        <input id="f-nome" value="${val(c.nome)}" />

        <label>Telefone</label>
        <input id="f-telefone" value="${val(c.telefone)}" placeholder="(99) 99999-9999" />

        <button id="btn-salvar-colaborador">Salvar</button>
        <button id="btn-cancelar-colaborador" class="secondary">Cancelar</button>
        ${id ? '<button id="btn-excluir-colaborador" class="danger">Excluir</button>' : ''}
        <p id="form-erro" class="pin-erro"></p>
      </div>
    `;

    const inputTelefone = formWrap.querySelector('#f-telefone');
    inputTelefone.addEventListener('input', () => { inputTelefone.value = MASK_FONE(inputTelefone.value); });

    formWrap.querySelector('#btn-cancelar-colaborador').addEventListener('click', () => {
      formWrap.innerHTML = '';
    });

    formWrap.querySelector('#btn-salvar-colaborador').addEventListener('click', async () => {
      const nome = formWrap.querySelector('#f-nome').value.trim();
      if (!nome) {
        formWrap.querySelector('#form-erro').textContent = 'Nome é obrigatório.';
        return;
      }
      const telefone = inputTelefone.value.trim();

      if (id) {
        run('UPDATE colaboradores SET nome = ?, telefone = ? WHERE id = ?', [nome, telefone, id]);
      } else {
        run('INSERT INTO colaboradores (nome, telefone) VALUES (?, ?)', [nome, telefone]);
      }

      await persist();
      formWrap.innerHTML = '';
      renderLista();
    });

    if (id) {
      formWrap.querySelector('#btn-excluir-colaborador').addEventListener('click', async () => {
        if (!confirm('Excluir este colaborador? Clientes que apontam para ele ficarão sem colaborador vinculado.')) return;
        run('UPDATE clientes SET colaborador_id = NULL WHERE colaborador_id = ?', [id]);
        run('DELETE FROM colaboradores WHERE id = ?', [id]);
        await persist();
        formWrap.innerHTML = '';
        renderLista();
      });
    }
  }

  container.querySelector('#btn-novo-colaborador').addEventListener('click', () => renderForm());
  renderLista();
}

function val(v) { return v === undefined || v === null ? '' : String(v).replace(/"/g, '&quot;'); }
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
