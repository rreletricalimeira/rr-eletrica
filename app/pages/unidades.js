import { all, run, persist } from '../db/db.js';

export function renderUnidades(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Unidades</h2>
      <div class="linha-dupla">
        <input id="nova-unidade" placeholder="Nova unidade (ex: PÇ, CX)" />
        <button id="btn-add-unidade">Adicionar</button>
      </div>
      <ul id="lista-unidades" class="lista"></ul>
    </div>
  `;

  const listaEl = container.querySelector('#lista-unidades');
  const inputEl = container.querySelector('#nova-unidade');

  function renderLista() {
    const itens = all('SELECT id, unidade FROM unidades ORDER BY unidade');
    listaEl.innerHTML = itens.map((u) => `
      <li data-id="${u.id}">
        <span>${u.unidade}</span>
        <button class="btn-excluir-item" data-id="${u.id}">Excluir</button>
      </li>
    `).join('') || '<li><em>Nenhuma unidade cadastrada</em></li>';

    listaEl.querySelectorAll('.btn-excluir-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Excluir esta unidade?')) return;
        run('DELETE FROM unidades WHERE id = ?', [Number(btn.dataset.id)]);
        await persist();
        renderLista();
      });
    });
  }

  container.querySelector('#btn-add-unidade').addEventListener('click', async () => {
    const nome = inputEl.value.trim();
    if (!nome) return;
    run('INSERT INTO unidades (unidade) VALUES (?)', [nome]);
    await persist();
    inputEl.value = '';
    renderLista();
  });

  renderLista();
}
