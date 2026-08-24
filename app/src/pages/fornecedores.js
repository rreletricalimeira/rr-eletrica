import { all, run, persist } from '../db/db.js';
import { ligarAutoPreenchimentoCep } from '../ui/cep.js';

const MASK_CEP = (v) => v.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2').slice(0, 9);
const MASK_FONE = (v) => v.replace(/\D/g, '').replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4,5})(\d{4})$/, '$1-$2').slice(0, 15);
const MASK_CPF = (v) => v.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2').slice(0, 14);
const MASK_CNPJ = (v) => v.replace(/\D/g, '').replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2}\.\d{3})(\d)/, '$1.$2').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d{2})$/, '$1-$2').slice(0, 18);

function aplicarMascara(input, fn) {
  input.addEventListener('input', () => { input.value = fn(input.value); });
}

export function renderFornecedores(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Fornecedores</h2>
      <button id="btn-novo-fornecedor">+ Novo fornecedor</button>
      <ul id="lista-fornecedores" class="lista"></ul>
      <div id="form-fornecedor-wrap"></div>
    </div>
  `;

  const listaEl = container.querySelector('#lista-fornecedores');
  const formWrap = container.querySelector('#form-fornecedor-wrap');

  function renderLista() {
    const fornecedores = all('SELECT id, nome, segmento, cidade, celular1 FROM fornecedores ORDER BY nome');
    listaEl.innerHTML = fornecedores.map((f) => `
      <li data-id="${f.id}">
        <div class="item-principal">
          <strong>${escapeHtml(f.nome)}</strong>
          <span class="item-sub">${f.segmento || '-'} · ${f.cidade || '-'} · ${f.celular1 || '-'}</span>
        </div>
        <button class="btn-editar" data-id="${f.id}">Editar</button>
      </li>
    `).join('') || '<li><em>Nenhum fornecedor cadastrado</em></li>';

    listaEl.querySelectorAll('.btn-editar').forEach((btn) => {
      btn.addEventListener('click', () => renderForm(Number(btn.dataset.id)));
    });
  }

  function renderForm(id = null) {
    const f = id ? all('SELECT * FROM fornecedores WHERE id = ?', [id])[0] : {};

    formWrap.innerHTML = `
      <div class="card form-card">
        <h3>${id ? 'Editar fornecedor' : 'Novo fornecedor'}</h3>

        <label>Nome *</label>
        <input id="f-nome" value="${val(f.nome)}" />

        <label>Contato</label>
        <input id="f-contato" value="${val(f.contato)}" />

        <label>Segmento</label>
        <input id="f-segmento" value="${val(f.segmento)}" />

        <label>CEP</label>
        <input id="f-cep" value="${val(f.cep)}" placeholder="00000-000" />

        <label>Endereço</label>
        <input id="f-endereco" value="${val(f.endereco)}" />

        <label>Bairro</label>
        <input id="f-bairro" value="${val(f.bairro)}" />

        <label>Cidade</label>
        <input id="f-cidade" value="${val(f.cidade)}" />

        <label>UF</label>
        <input id="f-uf" value="${val(f.uf)}" maxlength="2" />

        <label>Fone 1</label>
        <input id="f-fone1" value="${val(f.fone1)}" placeholder="(99) 9999-9999" />

        <label>Celular 1</label>
        <input id="f-celular1" value="${val(f.celular1)}" placeholder="(99) 99999-9999" />

        <label>Celular 2</label>
        <input id="f-celular2" value="${val(f.celular2)}" placeholder="(99) 99999-9999" />

        <label>Email</label>
        <input id="f-email" type="email" value="${val(f.email)}" />

        <label>CPF</label>
        <input id="f-cpf" value="${val(f.cpf)}" placeholder="999.999.999-99" />

        <label>RG</label>
        <input id="f-rg" value="${val(f.rg)}" />

        <label>CNPJ</label>
        <input id="f-cnpj" value="${val(f.cnpj)}" placeholder="99.999.999/9999-99" />

        <label>Inscrição Estadual</label>
        <input id="f-ie" value="${val(f.inscricao_estadual)}" />

        <label>Inscrição Municipal</label>
        <input id="f-im" value="${val(f.inscricao_municipal)}" />

        <label>Site/Rede Social</label>
        <input id="f-site" value="${val(f.site_rede_social)}" />

        <label>Observação</label>
        <textarea id="f-obs">${val(f.observacao)}</textarea>

        <button id="btn-salvar-fornecedor">Salvar</button>
        <button id="btn-cancelar-fornecedor" class="secondary">Cancelar</button>
        ${id ? '<button id="btn-excluir-fornecedor" class="danger">Excluir</button>' : ''}
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

    formWrap.querySelector('#btn-cancelar-fornecedor').addEventListener('click', () => {
      formWrap.innerHTML = '';
    });

    formWrap.querySelector('#btn-salvar-fornecedor').addEventListener('click', async () => {
      const nome = formWrap.querySelector('#f-nome').value.trim();
      if (!nome) {
        formWrap.querySelector('#form-erro').textContent = 'Nome é obrigatório.';
        return;
      }

      const dados = {
        nome,
        contato: formWrap.querySelector('#f-contato').value.trim(),
        segmento: formWrap.querySelector('#f-segmento').value.trim(),
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
        site_rede_social: formWrap.querySelector('#f-site').value.trim(),
        observacao: formWrap.querySelector('#f-obs').value.trim(),
      };

      if (id) {
        run(`UPDATE fornecedores SET nome=?, contato=?, segmento=?, cep=?, endereco=?, bairro=?, cidade=?, uf=?,
             fone1=?, celular1=?, celular2=?, email=?, cpf=?, rg=?, cnpj=?, inscricao_estadual=?, inscricao_municipal=?,
             site_rede_social=?, observacao=? WHERE id=?`,
          [...Object.values(dados), id]);
      } else {
        const cols = Object.keys(dados).join(', ');
        const placeholders = Object.keys(dados).map(() => '?').join(', ');
        run(`INSERT INTO fornecedores (${cols}) VALUES (${placeholders})`, Object.values(dados));
      }

      await persist();
      formWrap.innerHTML = '';
      renderLista();
    });

    if (id) {
      formWrap.querySelector('#btn-excluir-fornecedor').addEventListener('click', async () => {
        if (!confirm('Excluir este fornecedor?')) return;
        run('DELETE FROM fornecedores WHERE id = ?', [id]);
        await persist();
        formWrap.innerHTML = '';
        renderLista();
      });
    }
  }

  container.querySelector('#btn-novo-fornecedor').addEventListener('click', () => renderForm());
  renderLista();
}

function val(v) {
  return v === undefined || v === null ? '' : String(v).replace(/"/g, '&quot;');
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
