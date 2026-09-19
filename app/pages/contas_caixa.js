import { all, run, persist } from '../db/db.js';

export function renderContasCaixa(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Contas / Caixa</h2>
      <p class="item-sub">Ex: Banco 1, Banco 2, Em mãos, Maquininha de cartão...</p>
      <div class="linha-dupla">
        <input id="nova-conta" placeholder="Nome do caixa/conta" />
        <button id="btn-add-conta">Adicionar</button>
      </div>
      <ul id="lista-contas" class="lista"></ul>
    </div>
  `;

  const listaEl = container.querySelector('#lista-contas');
  const inputEl = container.querySelector('#nova-conta');

  function renderLista() {
    const itens = all('SELECT id, nome FROM contas_caixa ORDER BY nome');
    listaEl.innerHTML = itens.map((c) => `
      <li data-id="${c.id}">
        <span>${c.nome}</span>
        <button class="btn-excluir-item" data-id="${c.id}">Excluir</button>
      </li>
    `).join('') || '<li><em>Nenhum caixa cadastrado</em></li>';

    listaEl.querySelectorAll('.btn-excluir-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Excluir este caixa?')) return;
        run('DELETE FROM contas_caixa WHERE id = ?', [Number(btn.dataset.id)]);
        await persist();
        renderLista();
      });
    });
  }

  container.querySelector('#btn-add-conta').addEventListener('click', async () => {
    const nome = inputEl.value.trim();
    if (!nome) return;
    run('INSERT INTO contas_caixa (nome) VALUES (?)', [nome]);
    await persist();
    inputEl.value = '';
    renderLista();
  });

  renderLista();
}
