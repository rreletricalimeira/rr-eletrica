import { all, run, persist } from '../db/db.js';
import { ligarAutoPreenchimentoCep } from '../ui/cep.js';

const MASK_CEP = (v) => v.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2').slice(0, 9);
const MASK_FONE = (v) => v.replace(/\D/g, '').replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4,5})(\d{4})$/, '$1-$2').slice(0, 15);
const MASK_CPF = (v) => v.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2').slice(0, 14);
const MASK_CNPJ = (v) => v.replace(/\D/g, '').replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2}\.\d{3})(\d)/, '$1.$2').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d{2})$/, '$1-$2').slice(0, 18);

function aplicarMascara(input, fn) {
  input.addEventListener('input', () => {
    const pos = input.selectionStart;
    input.value = fn(input.value);
  });
}

export function renderClientes(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Clientes</h2>
      <button id="btn-novo-cliente">+ Novo cliente</button>
      <ul id="lista-clientes" class="lista"></ul>
      <div id="form-cliente-wrap"></div>
    </div>
  `;

  const listaEl = container.querySelector('#lista-clientes');
  const formWrap = container.querySelector('#form-cliente-wrap');

  function renderLista() {
    const clientes = all('SELECT id, nome, tipo_cliente, cidade, celular1 FROM clientes ORDER BY nome');
    listaEl.innerHTML = clientes.map((c) => `
      <li data-id="${c.id}">
        <div class="item-principal">
          <strong>${escapeHtml(c.nome)}</strong>
          <span class="item-sub">${c.tipo_cliente || '-'} · ${c.cidade || '-'} · ${c.celular1 || '-'}</span>
        </div>
        <button class="btn-editar" data-id="${c.id}">Editar</button>
      </li>
    `).join('') || '<li><em>Nenhum cliente cadastrado</em></li>';

    listaEl.querySelectorAll('.btn-editar').forEach((btn) => {
      btn.addEventListener('click', () => renderForm(Number(btn.dataset.id)));
    });
  }

  function renderForm(id = null) {
    const cliente = id ? all('SELECT * FROM clientes WHERE id = ?', [id])[0] : {};

    formWrap.innerHTML = `
      <div class="card form-card">
        <h3>${id ? 'Editar cliente' : 'Novo cliente'}</h3>

        <label>Nome *</label>
        <input id="f-nome" value="${val(cliente.nome)}" />

        <label>Tipo de Cliente</label>
        <select id="f-tipo">
          ${['', 'Residencial', 'Comercial', 'Industrial', 'Condomínio'].map((t) =>
            `<option value="${t}" ${cliente.tipo_cliente === t ? 'selected' : ''}>${t || 'Selecione'}</option>`
          ).join('')}
        </select>

        <label>Apelido</label>
        <input id="f-apelido" value="${val(cliente.apelido)}" />

        <label>CEP</label>
        <input id="f-cep" value="${val(cliente.cep)}" placeholder="00000-000" />

        <label>Endereço</label>
        <input id="f-endereco" value="${val(cliente.endereco)}" />

        <label>Bairro</label>
        <input id="f-bairro" value="${val(cliente.bairro)}" />

        <label>Cidade</label>
        <input id="f-cidade" value="${val(cliente.cidade)}" />

        <label>UF</label>
        <input id="f-uf" value="${val(cliente.uf)}" maxlength="2" />

        <label>Fone</label>
        <input id="f-fone1" value="${val(cliente.fone1)}" placeholder="(99) 9999-9999" />

        <label>Celular 1</label>
        <input id="f-celular1" value="${val(cliente.celular1)}" placeholder="(99) 99999-9999" />

        <label>Celular 2</label>
        <input id="f-celular2" value="${val(cliente.celular2)}" placeholder="(99) 99999-9999" />

        <label>Email</label>
        <input id="f-email" type="email" value="${val(cliente.email)}" />

        <label>CPF</label>
        <input id="f-cpf" value="${val(cliente.cpf)}" placeholder="999.999.999-99" />

        <label>RG</label>
        <input id="f-rg" value="${val(cliente.rg)}" />

        <label>CNPJ</label>
        <input id="f-cnpj" value="${val(cliente.cnpj)}" placeholder="99.999.999/9999-99" />

        <label>Inscrição Estadual</label>
        <input id="f-ie" value="${val(cliente.inscricao_estadual)}" />

        <label>Inscrição Municipal</label>
        <input id="f-im" value="${val(cliente.inscricao_municipal)}" />

        <label>Situação do Cadastro</label>
        <select id="f-situacao">
          ${['Liberado', 'Restrição', 'Bloqueado'].map((s) =>
            `<option value="${s}" ${cliente.situacao_cadastro === s ? 'selected' : ''}>${s}</option>`
          ).join('')}
        </select>

        <label>Sexo</label>
        <select id="f-sexo">
          <option value="">Selecione</option>
          <option value="M" ${cliente.sexo === 'M' ? 'selected' : ''}>Masculino</option>
          <option value="F" ${cliente.sexo === 'F' ? 'selected' : ''}>Feminino</option>
        </select>

        <label>Data de Nascimento</label>
        <input id="f-nascimento" type="date" value="${val(cliente.data_nascimento)}" />

        <label>Colaborador</label>
        <select id="f-colaborador">
          <option value="">Selecione</option>
          ${all('SELECT id, nome FROM colaboradores ORDER BY nome').map((c) =>
            `<option value="${c.id}" ${cliente.colaborador_id === c.id ? 'selected' : ''}>${c.nome}</option>`
          ).join('')}
        </select>

        <label>Observação</label>
        <textarea id="f-obs">${val(cliente.observacao)}</textarea>

        <button id="btn-salvar-cliente">Salvar</button>
        <button id="btn-cancelar-cliente" class="secondary">Cancelar</button>
        ${id ? '<button id="btn-excluir-cliente" class="danger">Excluir</button>' : ''}
        <p id="form-erro" class="pin-erro"></p>
      </div>
    `;

    aplicarMascara(formWrap.querySelector('#f-cep'), MASK_CEP);
    aplicarMascara(formWrap.querySelector('#f-fone1'), MASK_FONE);
    aplicarMascara(formWrap.querySelector('#f-celular1'), MASK_FONE);
    aplicarMascara(formWrap.querySelector('#f-celular2'), MASK_FONE);
    aplicarMascara(formWrap.querySelector('#f-cpf'), MASK_CPF);
    aplicarMascara(formWrap.querySelector('#f-cnpj'), MASK_CNPJ);

    ligarAutoPreenchimentoCep(formWrap.querySelector('#f-cep'), {
      endereco: formWrap.querySelector('#f-endereco'),
      bairro: formWrap.querySelector('#f-bairro'),
      cidade: formWrap.querySelector('#f-cidade'),
      uf: formWrap.querySelector('#f-uf'),
    });

    formWrap.querySelector('#btn-cancelar-cliente').addEventListener('click', () => {
      formWrap.innerHTML = '';
    });

    formWrap.querySelector('#btn-salvar-cliente').addEventListener('click', async () => {
      const nome = formWrap.querySelector('#f-nome').value.trim();
      if (!nome) {
        formWrap.querySelector('#form-erro').textContent = 'Nome é obrigatório.';
        return;
      }

      const dados = {
        nome,
        tipo_cliente: formWrap.querySelector('#f-tipo').value,
        apelido: formWrap.querySelector('#f-apelido').value.trim(),
        cep: formWrap.querySelector('#f-cep').value.trim(),
        endereco: formWrap.querySelector('#f-endereco').value.trim(),
        bairro: formWrap.querySelector('#f-bairro').value.trim(),
        cidade: formWrap.querySelector('#f-cidade').value.trim(),
        uf: formWrap.querySelector('#f-uf').value.trim().toUpperCase(),
        fone1: formWrap.querySelector('#f-fone1').value.trim(),
        celular1: formWrap.querySelector('#f-celular1').value.trim(),
        celular2: formWrap.querySelector('#f-celular2').value.trim(),
        email: formWrap.querySelector('#f-email').value.trim(),
        cpf: formWrap.querySelector('#f-cpf').value.trim(),
        rg: formWrap.querySelector('#f-rg').value.trim(),
        cnpj: formWrap.querySelector('#f-cnpj').value.trim(),
        inscricao_estadual: formWrap.querySelector('#f-ie').value.trim(),
        inscricao_municipal: formWrap.querySelector('#f-im').value.trim(),
        situacao_cadastro: formWrap.querySelector('#f-situacao').value,
        sexo: formWrap.querySelector('#f-sexo').value,
        data_nascimento: formWrap.querySelector('#f-nascimento').value,
        observacao: formWrap.querySelector('#f-obs').value.trim(),
        colaborador_id: numOuNull(formWrap.querySelector('#f-colaborador').value),
      };

      if (id) {
        run(`UPDATE clientes SET nome=?, tipo_cliente=?, apelido=?, cep=?, endereco=?, bairro=?, cidade=?, uf=?,
             fone1=?, celular1=?, celular2=?, email=?, cpf=?, rg=?, cnpj=?, inscricao_estadual=?, inscricao_municipal=?,
             situacao_cadastro=?, sexo=?, data_nascimento=?, observacao=?, colaborador_id=? WHERE id=?`,
          [...Object.values(dados), id]);
      } else {
        const cols = Object.keys(dados).join(', ');
        const placeholders = Object.keys(dados).map(() => '?').join(', ');
        run(`INSERT INTO clientes (${cols}) VALUES (${placeholders})`, Object.values(dados));
      }

      await persist();
      formWrap.innerHTML = '';
      renderLista();
    });

    if (id) {
      formWrap.querySelector('#btn-excluir-cliente').addEventListener('click', async () => {
        if (!confirm('Excluir este cliente?')) return;
        run('DELETE FROM clientes WHERE id = ?', [id]);
        await persist();
        formWrap.innerHTML = '';
        renderLista();
      });
    }
  }

  container.querySelector('#btn-novo-cliente').addEventListener('click', () => renderForm());
  renderLista();
}

function val(v) {
  return v === undefined || v === null ? '' : String(v).replace(/"/g, '&quot;');
}

function numOuNull(v) {
  return v === '' || v === undefined || v === null ? null : Number(v);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
