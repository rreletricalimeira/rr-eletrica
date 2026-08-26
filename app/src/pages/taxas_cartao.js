import { all, run, persist } from '../db/db.js';

export function renderTaxasCartao(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Taxas de Cartão</h2>
      <p class="item-sub">Cadastre a taxa da maquininha para cada quantidade de parcelas.</p>
      <div class="linha-dupla">
        <input id="nova-parcelas" type="number" min="1" placeholder="Nº de parcelas" />
        <input id="nova-taxa" type="number" step="0.01" placeholder="Taxa (%)" />
        <button id="btn-add-taxa">Adicionar</button>
      </div>
      <ul id="lista-taxas" class="lista"></ul>
    </div>
  `;

  const listaEl = container.querySelector('#lista-taxas');
  const inputParcelas = container.querySelector('#nova-parcelas');
  const inputTaxa = container.querySelector('#nova-taxa');

  function renderLista() {
    const itens = all('SELECT id, parcelas, taxa_percentual FROM taxas_cartao ORDER BY parcelas');
    listaEl.innerHTML = itens.map((t) => `
      <li data-id="${t.id}">
        <span>${t.parcelas}x — ${t.taxa_percentual}%</span>
        <button class="btn-excluir-item" data-id="${t.id}">Excluir</button>
      </li>
    `).join('') || '<li><em>Nenhuma taxa cadastrada</em></li>';

    listaEl.querySelectorAll('.btn-excluir-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Excluir esta taxa?')) return;
        run('DELETE FROM taxas_cartao WHERE id = ?', [Number(btn.dataset.id)]);
        await persist();
        renderLista();
      });
    });
  }

  container.querySelector('#btn-add-taxa').addEventListener('click', async () => {
    const parcelas = Number(inputParcelas.value);
    const taxa = Number(inputTaxa.value);
    if (!parcelas || isNaN(taxa)) return;

    const existente = all('SELECT id FROM taxas_cartao WHERE parcelas = ?', [parcelas]);
    if (existente.length) {
      run('UPDATE taxas_cartao SET taxa_percentual = ? WHERE id = ?', [taxa, existente[0].id]);
    } else {
      run('INSERT INTO taxas_cartao (parcelas, taxa_percentual) VALUES (?, ?)', [parcelas, taxa]);
    }
    await persist();
    inputParcelas.value = '';
    inputTaxa.value = '';
    renderLista();
  });

  renderLista();
}
