import { all, run, persist } from '../db/db.js';

export function renderCategorias(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Categorias</h2>
      <div class="linha-dupla">
        <input id="nova-categoria" placeholder="Nova categoria" />
        <button id="btn-add-categoria">Adicionar</button>
      </div>
      <ul id="lista-categorias" class="lista"></ul>
    </div>
  `;

  const listaEl = container.querySelector('#lista-categorias');
  const inputEl = container.querySelector('#nova-categoria');

  function renderLista() {
    const itens = all('SELECT id, categoria FROM categorias ORDER BY categoria');
    listaEl.innerHTML = itens.map((c) => `
      <li data-id="${c.id}">
        <span>${c.categoria}</span>
        <button class="btn-excluir-item" data-id="${c.id}">Excluir</button>
      </li>
    `).join('') || '<li><em>Nenhuma categoria cadastrada</em></li>';

    listaEl.querySelectorAll('.btn-excluir-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Excluir esta categoria?')) return;
        run('DELETE FROM categorias WHERE id = ?', [Number(btn.dataset.id)]);
        await persist();
        renderLista();
      });
    });
  }

  container.querySelector('#btn-add-categoria').addEventListener('click', async () => {
    const nome = inputEl.value.trim();
    if (!nome) return;
    run('INSERT INTO categorias (categoria) VALUES (?)', [nome]);
    await persist();
    inputEl.value = '';
    renderLista();
  });

  renderLista();
}
