import { all, run, persist } from '../db/db.js';

export function renderVeiculos(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Veículos</h2>
      <button id="btn-novo-veiculo">+ Novo veículo</button>
      <ul id="lista-veiculos" class="lista"></ul>
      <div id="form-veiculo-wrap"></div>
    </div>
  `;

  const listaEl = container.querySelector('#lista-veiculos');
  const formWrap = container.querySelector('#form-veiculo-wrap');

  function renderLista() {
    const itens = all('SELECT id, veiculo, placa, status FROM veiculos ORDER BY veiculo');
    listaEl.innerHTML = itens.map((v) => `
      <li data-id="${v.id}">
        <div class="item-principal">
          <strong>${escapeHtml(v.veiculo)}</strong>
          <span class="item-sub">${v.placa || '-'} · ${v.status}</span>
        </div>
        <button class="btn-editar" data-id="${v.id}">Editar</button>
      </li>
    `).join('') || '<li><em>Nenhum veículo cadastrado</em></li>';

    listaEl.querySelectorAll('.btn-editar').forEach((btn) => {
      btn.addEventListener('click', () => renderForm(Number(btn.dataset.id)));
    });
  }

  function renderForm(id = null) {
    const v = id ? all('SELECT * FROM veiculos WHERE id = ?', [id])[0] : {};

    formWrap.innerHTML = `
      <div class="card form-card">
        <h3>${id ? 'Editar veículo' : 'Novo veículo'}</h3>

        <label>Veículo (marca e modelo) *</label>
        <input id="f-veiculo" value="${val(v.veiculo)}" placeholder="Ex: Fiat Strada" />

        <label>Placa</label>
        <input id="f-placa" value="${val(v.placa)}" />

        <label>Ano</label>
        <input id="f-ano" type="number" value="${val(v.ano)}" />

        <label>Cor</label>
        <input id="f-cor" value="${val(v.cor)}" />

        <label>KM Inicial (na aquisição)</label>
        <input id="f-km-inicial" type="number" step="0.1" value="${val(v.km_inicial)}" />

        <label>Data Aquisição</label>
        <input id="f-data-aquisicao" type="date" value="${val(v.data_aquisicao)}" />

        <label>Data Venda</label>
        <input id="f-data-venda" type="date" value="${val(v.data_venda)}" />

        <label>Status</label>
        <select id="f-status">
          <option ${v.status === 'Ativo' || !v.status ? 'selected' : ''}>Ativo</option>
          <option ${v.status === 'Vendido' ? 'selected' : ''}>Vendido</option>
        </select>

        <button id="btn-salvar-veiculo">Salvar</button>
        <button id="btn-cancelar-veiculo" class="secondary">Cancelar</button>
        ${id ? '<button id="btn-excluir-veiculo" class="danger">Excluir</button>' : ''}
        <p id="form-erro" class="pin-erro"></p>
      </div>
    `;

    formWrap.querySelector('#btn-cancelar-veiculo').addEventListener('click', () => { formWrap.innerHTML = ''; });

    formWrap.querySelector('#btn-salvar-veiculo').addEventListener('click', async () => {
      const veiculo = formWrap.querySelector('#f-veiculo').value.trim();
      if (!veiculo) {
        formWrap.querySelector('#form-erro').textContent = 'Veículo é obrigatório.';
        return;
      }

      const dados = {
        veiculo,
        placa: formWrap.querySelector('#f-placa').value.trim(),
        ano: numOuNull(formWrap.querySelector('#f-ano').value),
        cor: formWrap.querySelector('#f-cor').value.trim(),
        km_inicial: numOuNull(formWrap.querySelector('#f-km-inicial').value),
        data_aquisicao: formWrap.querySelector('#f-data-aquisicao').value || null,
        data_venda: formWrap.querySelector('#f-data-venda').value || null,
        status: formWrap.querySelector('#f-status').value,
      };

      if (id) {
        run(`UPDATE veiculos SET veiculo=?, placa=?, ano=?, cor=?, km_inicial=?, data_aquisicao=?, data_venda=?, status=? WHERE id=?`,
          [...Object.values(dados), id]);
      } else {
        const cols = Object.keys(dados).join(', ');
        const placeholders = Object.keys(dados).map(() => '?').join(', ');
        run(`INSERT INTO veiculos (${cols}) VALUES (${placeholders})`, Object.values(dados));
      }

      await persist();
      formWrap.innerHTML = '';
      renderLista();
    });

    if (id) {
      formWrap.querySelector('#btn-excluir-veiculo').addEventListener('click', async () => {
        if (!confirm('Excluir este veículo? Os lançamentos de manutenção vinculados a ele não serão apagados.')) return;
        run('DELETE FROM veiculos WHERE id = ?', [id]);
        await persist();
        formWrap.innerHTML = '';
        renderLista();
      });
    }
  }

  container.querySelector('#btn-novo-veiculo').addEventListener('click', () => renderForm());
  renderLista();
}

function val(v) { return v === undefined || v === null ? '' : String(v).replace(/"/g, '&quot;'); }
function numOuNull(v) { return v === '' || v === undefined || v === null ? null : Number(v); }
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
