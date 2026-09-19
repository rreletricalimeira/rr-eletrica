import { all, run, persist } from '../db/db.js';

export function renderCategoriasFinanceiro(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Categoria do Financeiro</h2>
      <div class="linha-dupla">
        <input id="novo-categoria-fin" placeholder="Nova categoria (ex: Combustível)" />
        <button id="btn-add-categoria-fin">Adicionar</button>
      </div>
      <p id="categoria-fin-erro" class="pin-erro"></p>
      <ul id="lista-categoria-fin" class="lista"></ul>
    </div>
  `;

  const listaEl = container.querySelector('#lista-categoria-fin');
  const inputEl = container.querySelector('#novo-categoria-fin');
  const erroEl = container.querySelector('#categoria-fin-erro');

  function renderLista() {
    const itens = all('SELECT id, categoria FROM categorias_financeiro ORDER BY categoria');
    listaEl.innerHTML = itens.map((c) => `
      <li data-id="${c.id}">
        <span>${escapeHtml(c.categoria)}</span>
        <button class="btn-excluir-item" data-id="${c.id}">Excluir</button>
      </li>
    `).join('') || '<li><em>Nenhuma categoria cadastrada</em></li>';

    listaEl.querySelectorAll('.btn-excluir-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        const emUso = all('SELECT COUNT(*) as c FROM financeiro WHERE categoria_id = ?', [id])[0].c;
        if (emUso > 0) {
          erroEl.textContent = `Não dá para excluir: esta categoria está em uso em lançamentos do Financeiro (${emUso}).`;
          return;
        }
        if (!confirm('Excluir esta categoria?')) return;
        erroEl.textContent = '';
        run('DELETE FROM categorias_financeiro WHERE id = ?', [id]);
        await persist();
        renderLista();
      });
    });
  }

  container.querySelector('#btn-add-categoria-fin').addEventListener('click', async () => {
    const nome = inputEl.value.trim();
    if (!nome) return;
    const jaExiste = all('SELECT id FROM categorias_financeiro WHERE LOWER(categoria) = LOWER(?)', [nome]);
    if (jaExiste.length) {
      erroEl.textContent = 'Já existe um registro com esse nome.';
      return;
    }
    erroEl.textContent = '';
    run('INSERT INTO categorias_financeiro (categoria) VALUES (?)', [nome]);
    await persist();
    inputEl.value = '';
    renderLista();
  });

  renderLista();
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
