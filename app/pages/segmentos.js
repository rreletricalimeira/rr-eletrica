import { all, run, persist } from '../db/db.js';

export function renderSegmentos(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Segmentos</h2>
      <div class="linha-dupla">
        <input id="novo-segmento" placeholder="Novo segmento (ex: Elétrica)" />
        <button id="btn-add-segmento">Adicionar</button>
      </div>
      <p id="segmento-erro" class="pin-erro"></p>
      <ul id="lista-segmento" class="lista"></ul>
    </div>
  `;

  const listaEl = container.querySelector('#lista-segmento');
  const inputEl = container.querySelector('#novo-segmento');
  const erroEl = container.querySelector('#segmento-erro');

  function renderLista() {
    const itens = all('SELECT id, segmento FROM segmentos ORDER BY segmento');
    listaEl.innerHTML = itens.map((c) => `
      <li data-id="${c.id}">
        <span>${escapeHtml(c.segmento)}</span>
        <button class="btn-excluir-item" data-id="${c.id}">Excluir</button>
      </li>
    `).join('') || '<li><em>Nenhum segmento cadastrado</em></li>';

    listaEl.querySelectorAll('.btn-excluir-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.id);
        const emUso = all('SELECT COUNT(*) as c FROM fornecedores WHERE segmento_id = ?', [id])[0].c;
        if (emUso > 0) {
          erroEl.textContent = `Não dá para excluir: este segmento está em uso por fornecedores (${emUso}).`;
          return;
        }
        if (!confirm('Excluir este segmento?')) return;
        erroEl.textContent = '';
        run('DELETE FROM segmentos WHERE id = ?', [id]);
        await persist();
        renderLista();
      });
    });
  }

  container.querySelector('#btn-add-segmento').addEventListener('click', async () => {
    const nome = inputEl.value.trim();
    if (!nome) return;
    const jaExiste = all('SELECT id FROM segmentos WHERE LOWER(segmento) = LOWER(?)', [nome]);
    if (jaExiste.length) {
      erroEl.textContent = 'Já existe um registro com esse nome.';
      return;
    }
    erroEl.textContent = '';
    run('INSERT INTO segmentos (segmento) VALUES (?)', [nome]);
    await persist();
    inputEl.value = '';
    renderLista();
  });

  renderLista();
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
