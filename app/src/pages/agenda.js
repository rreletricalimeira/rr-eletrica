import { all, run, persist } from '../db/db.js';
import { obterOuCriarCategoriaFinanceiro, montarEnderecoEmLinha } from '../db/lookups.js';
import { isSignedIn, signIn, setStatusListener } from '../db/backup.js';
import { inserirEvento, atualizarEvento, removerEvento, GoogleNaoConectadoError } from '../db/google_calendar.js';
import { confirmarApp } from '../ui/dialogo.js';

// Agenda: compromissos (visitas, serviços, orçamentos) e contas a pagar/receber,
// com repetição diária, semanal ou mensal. Cada ocorrência vira um evento no
// Google Agenda (opcional) e, quando uma conta é marcada como paga/recebida,
// gera o lançamento no Financeiro.

const MAX_OCORRENCIAS = 60;

const ROTULOS = {
  'Compromisso': { feito: 'Concluído', acao: 'Concluir', desfazer: 'Reabrir' },
  'A pagar':     { feito: 'Pago',      acao: 'Marcar como pago', desfazer: 'Desfazer' },
  'A receber':   { feito: 'Recebido',  acao: 'Marcar como recebido', desfazer: 'Desfazer' },
};

export function renderAgenda(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Agenda</h2>

      <div class="card" id="agenda-google-barra">
        <p id="agenda-google-status" class="status-line"></p>
        <button id="btn-agenda-conectar" class="secondary">Conectar ao Google</button>
        <button id="btn-agenda-sincronizar" class="secondary">Enviar pendentes ao Google Agenda</button>
      </div>

      <button id="btn-novo-agenda">+ Novo compromisso / conta</button>
      <p id="agenda-aviso" class="pin-erro"></p>

      <div class="filtros-financeiro">
        <label>Tipo</label>
        <select id="filtro-agenda-tipo">
          <option value="">Todos</option>
          <option>Compromisso</option>
          <option>A pagar</option>
          <option>A receber</option>
        </select>
        <label>Período</label>
        <select id="filtro-agenda-periodo">
          <option value="tudo">Tudo</option>
          <option value="hoje">Hoje</option>
          <option value="7">Próximos 7 dias</option>
          <option value="30">Próximos 30 dias</option>
          <option value="atrasados">Atrasados</option>
        </select>
        <label class="linha-checkbox"><input id="filtro-agenda-concluidos" type="checkbox" /> Mostrar concluídos / pagos / recebidos</label>
      </div>

      <p id="agenda-resumo" class="item-sub"></p>
      <ul id="lista-agenda" class="lista"></ul>
      <div id="form-agenda-wrap"></div>
    </div>
  `;

  const listaEl = container.querySelector('#lista-agenda');
  const formWrap = container.querySelector('#form-agenda-wrap');
  const avisoEl = container.querySelector('#agenda-aviso');

  // ---------- Barra de conexão com o Google ----------

  function atualizarBarraGoogle() {
    const conectado = isSignedIn();
    const pendentes = pendentesGoogle().length;
    container.querySelector('#agenda-google-status').textContent = conectado
      ? '✔ Conectado ao Google — os eventos são enviados ao Google Agenda.'
      : '⚠ Não conectado ao Google — os lançamentos ficam só no app até você conectar.';
    container.querySelector('#btn-agenda-conectar').style.display = conectado ? 'none' : '';
    const btnSync = container.querySelector('#btn-agenda-sincronizar');
    btnSync.style.display = pendentes ? '' : 'none';
    btnSync.textContent = `Enviar pendentes ao Google Agenda (${pendentes})`;
  }

  function pendentesGoogle() {
    return all(`SELECT id FROM agenda WHERE sincronizar_google = 1 AND google_event_id IS NULL AND concluido = 0`);
  }

  setStatusListener(() => atualizarBarraGoogle());
  container.querySelector('#btn-agenda-conectar').addEventListener('click', () => {
    try { signIn(); } catch (e) { avisoEl.textContent = 'Não foi possível conectar ao Google agora: ' + e.message; }
  });

  container.querySelector('#btn-agenda-sincronizar').addEventListener('click', async () => {
    if (!isSignedIn()) { avisoEl.textContent = 'Conecte ao Google primeiro.'; return; }
    const ids = pendentesGoogle().map((r) => r.id);
    let ok = 0;
    let erro = '';
    for (const id of ids) {
      avisoEl.textContent = `Enviando ao Google Agenda… ${ok}/${ids.length}`;
      const r = await sincronizarRegistro(id);
      if (r === 'ok') ok++; else if (r !== 'ignorado') { erro = r; break; }
    }
    await persist();
    avisoEl.textContent = erro ? `Enviados ${ok} de ${ids.length}. Parou por erro: ${erro}` : `Enviados ${ok} evento(s) ao Google Agenda.`;
    renderLista();
  });

  // ---------- Sincronização de UM registro (devolve 'ok', 'ignorado' ou texto do erro) ----------

  async function sincronizarRegistro(id) {
    const ag = all('SELECT * FROM agenda WHERE id = ?', [id])[0];
    if (!ag) return 'ignorado';
    if (!isSignedIn()) return 'Não conectado ao Google.';
    try {
      if (!ag.sincronizar_google) {
        if (ag.google_event_id) {
          await removerEvento(ag.google_event_id);
          run('UPDATE agenda SET google_event_id = NULL WHERE id = ?', [id]);
        }
        return 'ignorado';
      }
      const eventId = ag.google_event_id
        ? await atualizarEvento(ag.google_event_id, ag)
        : await inserirEvento(ag);
      run('UPDATE agenda SET google_event_id = ? WHERE id = ?', [eventId, id]);
      return 'ok';
    } catch (e) {
      return e.message || 'Erro desconhecido';
    }
  }

  // ---------- Lista ----------

  function renderLista() {
    const hoje = isoHoje();
    const tipo = container.querySelector('#filtro-agenda-tipo').value;
    const periodo = container.querySelector('#filtro-agenda-periodo').value;
    const mostrarConcluidos = container.querySelector('#filtro-agenda-concluidos').checked;

    const cond = [];
    const params = [];
    if (tipo) { cond.push('tipo = ?'); params.push(tipo); }
    if (!mostrarConcluidos) cond.push('concluido = 0');
    if (periodo === 'hoje') { cond.push('data = ?'); params.push(hoje); }
    else if (periodo === '7' || periodo === '30') {
      cond.push('data >= ? AND data <= ?'); params.push(hoje, somarDias(hoje, Number(periodo)));
    } else if (periodo === 'atrasados') { cond.push('concluido = 0 AND data < ?'); params.push(hoje); }

    const itens = all(`SELECT * FROM agenda ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY data, COALESCE(hora, ''), id`, params);

    const somaPagar = itens.filter((a) => a.tipo === 'A pagar' && !a.concluido).reduce((t, a) => t + (a.valor || 0), 0);
    const somaReceber = itens.filter((a) => a.tipo === 'A receber' && !a.concluido).reduce((t, a) => t + (a.valor || 0), 0);
    container.querySelector('#agenda-resumo').textContent =
      `${itens.length} lançamento(s) · A pagar pendente: ${formatarMoeda(somaPagar)} · A receber pendente: ${formatarMoeda(somaReceber)}`;

    listaEl.innerHTML = itens.map((a) => {
      const atrasado = !a.concluido && a.data < hoje;
      const rot = ROTULOS[a.tipo] || ROTULOS['Compromisso'];
      const primeiraLinha = (a.descricao || '').split('\n')[0];
      const detalhes = [
        primeiraLinha,
        a.valor ? formatarMoeda(a.valor) : '',
        a.total_ocorrencias > 1 ? `Ocorrência ${a.ocorrencia}/${a.total_ocorrencias}` : '',
        a.concluido ? `✔ ${rot.feito}` : (atrasado ? 'Atrasado' : ''),
        a.sincronizar_google ? (a.google_event_id ? '📅 no Google Agenda' : '⚠ falta enviar ao Google') : '',
      ].filter(Boolean).join(' · ');
      return `
        <li data-id="${a.id}" class="agenda-item ${atrasado ? 'atrasado' : ''} ${a.concluido ? 'concluido' : ''}">
          <div class="item-principal">
            <strong><span class="etiqueta-tipo tipo-${classeTipo(a.tipo)}">${escapeHtml(a.tipo)}</span> ${formatarData(a.data)}${a.hora ? ' ' + a.hora : ''} — ${escapeHtml(a.nome || '(sem nome)')}</strong>
            <span class="item-sub">${escapeHtml(detalhes)}</span>
          </div>
          <button class="btn-concluir secondary" data-id="${a.id}">${a.concluido ? rot.desfazer : rot.acao}</button>
          <button class="btn-editar" data-id="${a.id}">Abrir</button>
        </li>
      `;
    }).join('') || '<li><em>Nada na agenda para esse filtro</em></li>';

    listaEl.querySelectorAll('.btn-editar').forEach((btn) => btn.addEventListener('click', () => renderForm(Number(btn.dataset.id))));
    listaEl.querySelectorAll('.btn-concluir').forEach((btn) => btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      const ag = all('SELECT concluido FROM agenda WHERE id = ?', [id])[0];
      const erro = await alternarConclusao(id, !ag.concluido);
      avisoEl.textContent = erro || '';
      renderLista();
    }));
    atualizarBarraGoogle();
  }

  // ---------- Concluir / pagar / receber ----------
  // Conta paga ou recebida gera o lançamento no Financeiro; desfazer remove o lançamento.

  async function alternarConclusao(id, concluir) {
    const ag = all('SELECT * FROM agenda WHERE id = ?', [id])[0];
    if (concluir && !ag.concluido) {
      let financeiroId = null;
      if (ag.tipo !== 'Compromisso') {
        if (!(ag.valor > 0)) return 'Informe o valor da conta (abra o lançamento) antes de marcar como paga/recebida.';
        const cat = ag.categoria_id ? all('SELECT categoria FROM categorias_financeiro WHERE id = ?', [ag.categoria_id])[0]?.categoria : null;
        run(`INSERT INTO financeiro (tipo, data, valor_total, categoria, categoria_id, descricao, origem, conta_caixa_id)
             VALUES (?, ?, ?, ?, ?, ?, 'automatico', ?)`,
          [ag.tipo === 'A pagar' ? 'Saida' : 'Entrada', isoHoje(), ag.valor, cat || null, ag.categoria_id || null,
           `Agenda ${id}: ${[ag.nome, (ag.descricao || '').split('\n')[0]].filter(Boolean).join(' - ')}`, ag.conta_caixa_id || null]);
        financeiroId = all('SELECT last_insert_rowid() as id')[0].id;
      }
      run('UPDATE agenda SET concluido = 1, financeiro_id = ? WHERE id = ?', [financeiroId, id]);
    } else if (!concluir && ag.concluido) {
      if (ag.financeiro_id) run('DELETE FROM financeiro WHERE id = ?', [ag.financeiro_id]);
      run('UPDATE agenda SET concluido = 0, financeiro_id = NULL WHERE id = ?', [id]);
    }
    await persist();
    // O título do evento ganha/perde o ✔.
    if (ag.google_event_id && isSignedIn()) {
      const r = await sincronizarRegistro(id);
      if (r !== 'ok' && r !== 'ignorado') { await persist(); return `Salvo, mas o Google Agenda não foi atualizado: ${r}`; }
      await persist();
    }
    return '';
  }

  // ---------- Formulário ----------

  function renderForm(id = null) {
    const a = id ? all('SELECT * FROM agenda WHERE id = ?', [id])[0] : {};
    const tipoInicial = a.tipo || 'Compromisso';
    const clientes = all('SELECT * FROM clientes ORDER BY nome');
    const fornecedores = all('SELECT * FROM fornecedores ORDER BY nome');
    let clienteId = a.cliente_id || null;
    let fornecedorId = a.fornecedor_id || null;
    let nomeCadastrado = null; // nome como está no cadastro, quando o digitado bate com um

    const ordens = all(`
      SELECT os.id, os.tipo_registro, os.descricao, os.status_andamento, c.nome AS cliente
      FROM os LEFT JOIN clientes c ON c.id = os.cliente_id
      ORDER BY os.id DESC LIMIT 300
    `);

    formWrap.innerHTML = `
      <div class="card form-card">
        <h3>${id ? `Agenda ${id}${a.total_ocorrencias > 1 ? ` — ocorrência ${a.ocorrencia} de ${a.total_ocorrencias}` : ''}` : 'Novo lançamento na agenda'}</h3>

        <div class="grid-campos grid-agenda-topo">
          <div class="campo">
            <label>Tipo</label>
            <select id="a-tipo">
              ${['Compromisso', 'A pagar', 'A receber'].map((t) => `<option ${tipoInicial === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </div>
          <div class="campo">
            <label id="a-nome-label">Cliente</label>
            <input id="a-nome" list="a-nome-lista" autocomplete="off" placeholder="Escolha da lista ou digite" value="${val(a.nome)}" />
            <datalist id="a-nome-lista"></datalist>
          </div>
          <div class="campo">
            <label>Data *</label>
            <input id="a-data" type="date" value="${val(a.data || isoHoje())}" />
          </div>
          <div class="campo">
            <label id="a-hora-label">Horário *</label>
            <input id="a-hora" type="time" value="${val(a.hora)}" />
          </div>
        </div>

        <div class="grid-campos grid-agenda-endereco">
          <div class="campo">
            <label>Endereço</label>
            <input id="a-endereco" value="${val(a.endereco)}" />
          </div>
          <div class="campo" id="bloco-os">
            <label>Serviço / orçamento cadastrado</label>
            <select id="a-os">
              <option value="">Nenhum (descrever abaixo)</option>
              ${ordens.map((o) => `<option value="${o.id}" ${a.os_id === o.id ? 'selected' : ''}>${o.tipo_registro === 'Orçamento' ? 'Orçamento' : 'O.S.'} ${o.id} — ${escapeHtml(o.cliente || 'sem cliente')} — ${escapeHtml(((o.descricao || '').split('\n')[0]).slice(0, 40))}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="campo campo-full">
          <label id="a-descricao-label">Serviço ou orçamento a ser executado</label>
          <textarea id="a-descricao">${val(a.descricao)}</textarea>
        </div>

        <div class="grid-campos grid-agenda-valores" id="bloco-financeiro">
          <div class="campo">
            <label>Valor (R$)</label>
            <input id="a-valor" type="number" step="0.01" min="0" value="${val(a.valor)}" />
          </div>
          <div class="campo">
            <label>Categoria do Financeiro</label>
            <select id="a-categoria">
              <option value="">Selecione</option>
              ${all('SELECT id, categoria FROM categorias_financeiro ORDER BY categoria').map((c) =>
                `<option value="${c.id}" ${a.categoria_id === c.id ? 'selected' : ''}>${escapeHtml(c.categoria)}</option>`).join('')}
            </select>
          </div>
          <div class="campo">
            <label>Caixa</label>
            <select id="a-caixa">
              <option value="">Selecione</option>
              ${all('SELECT id, nome FROM contas_caixa ORDER BY nome').map((c) =>
                `<option value="${c.id}" ${a.conta_caixa_id === c.id ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="grid-campos grid-agenda-rep">
          <div class="campo" id="bloco-duracao">
            <label>Duração (minutos)</label>
            <input id="a-duracao" type="number" min="15" step="15" value="${val(a.duracao_min || 60)}" />
          </div>
          ${!id ? `
            <div class="campo">
              <label>Repetição</label>
              <select id="a-repeticao">
                <option value="Nenhuma">Não repetir</option>
                <option value="Diária">Diária</option>
                <option value="Semanal">Semanal</option>
                <option value="Mensal">Mensal</option>
              </select>
            </div>
            <div class="campo" id="bloco-qtd" style="display:none">
              <label>Total de ocorrências (com a 1ª)</label>
              <input id="a-qtd" type="number" min="2" max="${MAX_OCORRENCIAS}" step="1" value="12" />
            </div>
          ` : ''}
        </div>
        ${!id ? '<p id="a-rep-previa" class="item-sub campo-full"></p>' : ''}

        <label class="linha-checkbox"><input id="a-google" type="checkbox" ${(id ? a.sincronizar_google : tipoInicial === 'Compromisso') ? 'checked' : ''} /> Colocar no Google Agenda</label>
        ${id ? `<label class="linha-checkbox"><input id="a-concluido" type="checkbox" ${a.concluido ? 'checked' : ''} /> <span id="a-concluido-rotulo"></span></label>` : ''}

        <div class="campo campo-full">
          <label>Observação</label>
          <textarea id="a-obs">${val(a.observacao)}</textarea>
        </div>

        <button id="btn-salvar-agenda">${id ? 'Salvar alterações' : 'Salvar'}</button>
        <button id="btn-cancelar-agenda" class="secondary">${id ? 'Fechar' : 'Cancelar'}</button>
        ${id ? '<button id="btn-excluir-agenda" class="danger">Excluir esta</button>' : ''}
        ${id && a.serie_id && a.total_ocorrencias > 1 ? '<button id="btn-excluir-serie" class="danger">Excluir a série (pendentes)</button>' : ''}
        <p id="form-erro" class="pin-erro"></p>
      </div>
    `;

    const q = (s) => formWrap.querySelector(s);

    // Mostra/oculta campos conforme o tipo
    function aplicarTipo(novoRegistro) {
      const tipo = q('#a-tipo').value;
      const ehConta = tipo !== 'Compromisso';
      q('#a-nome-label').textContent = tipo === 'A pagar' ? 'Fornecedor / favorecido' : 'Cliente';
      q('#a-descricao-label').textContent = ehConta ? 'Descrição da conta' : 'Serviço ou orçamento a ser executado';
      q('#a-hora-label').textContent = tipo === 'Compromisso' ? 'Horário *' : 'Horário (vazio = dia inteiro)';
      q('#bloco-financeiro').style.display = ehConta ? '' : 'none';
      q('#bloco-duracao').style.display = ehConta ? 'none' : '';
      q('#bloco-os').style.display = tipo === 'A pagar' ? 'none' : '';
      if (q('#a-concluido-rotulo')) q('#a-concluido-rotulo').textContent = ROTULOS[tipo].feito;
      const lista = tipo === 'A pagar' ? fornecedores : clientes;
      q('#a-nome-lista').innerHTML = lista.map((p) => `<option value="${val(p.nome)}"></option>`).join('');
      if (novoRegistro) q('#a-google').checked = tipo === 'Compromisso';
    }
    aplicarTipo(false);
    q('#a-tipo').addEventListener('change', () => aplicarTipo(!id));

    // Nome: escolhido da lista (traz o endereço) ou digitado livremente
    q('#a-nome').addEventListener('input', () => {
      const ehPagar = q('#a-tipo').value === 'A pagar';
      const nome = q('#a-nome').value.trim().toLowerCase();
      const p = (ehPagar ? fornecedores : clientes).find((x) => x.nome.toLowerCase() === nome);
      clienteId = !ehPagar && p ? p.id : null;
      fornecedorId = ehPagar && p ? p.id : null;
      nomeCadastrado = p ? p.nome : null;
      if (p) q('#a-endereco').value = montarEnderecoEmLinha(p);
    });

    // Serviço/orçamento cadastrado: traz cliente, endereço, descrição (e valor a receber)
    q('#a-os').addEventListener('change', () => {
      const osId = Number(q('#a-os').value);
      if (!osId) return;
      const o = all(`SELECT os.*, c.nome AS cliente_nome, c.endereco AS c_end, c.bairro, c.cidade, c.uf, c.cep
                     FROM os LEFT JOIN clientes c ON c.id = os.cliente_id WHERE os.id = ?`, [osId])[0];
      if (!o) return;
      clienteId = o.cliente_id || null;
      fornecedorId = null;
      q('#a-nome').value = o.cliente_nome || '';
      q('#a-endereco').value = o.endereco || montarEnderecoEmLinha({ endereco: o.c_end, bairro: o.bairro, cidade: o.cidade, uf: o.uf, cep: o.cep });
      const linhas = (o.descricao || '').split('\n').filter(Boolean).join('; ');
      q('#a-descricao').value = `${o.tipo_registro === 'Orçamento' ? 'Orçamento' : 'O.S.'} ${o.id}${linhas ? ': ' + linhas : ''}`;
      if (q('#a-tipo').value === 'A receber' && !q('#a-valor').value && o.valor_total) q('#a-valor').value = o.valor_total;
    });

    // Repetição (só em lançamentos novos)
    function atualizarPrevia() {
      const rep = q('#a-repeticao')?.value;
      if (!rep) return;
      q('#bloco-qtd').style.display = rep === 'Nenhuma' ? 'none' : '';
      const previa = q('#a-rep-previa');
      const qtd = Number(q('#a-qtd').value);
      const data = q('#a-data').value;
      if (rep === 'Nenhuma' || !data || !(qtd >= 2)) { previa.textContent = ''; return; }
      const datas = gerarDatas(data, rep, Math.min(qtd, MAX_OCORRENCIAS));
      previa.textContent = `Serão criados ${datas.length} lançamentos, de ${formatarData(datas[0])} até ${formatarData(datas[datas.length - 1])}.`;
    }
    if (!id) {
      ['#a-repeticao', '#a-qtd', '#a-data'].forEach((s) => { q(s).addEventListener('input', atualizarPrevia); q(s).addEventListener('change', atualizarPrevia); });
    }

    q('#btn-cancelar-agenda').addEventListener('click', () => { formWrap.innerHTML = ''; });

    q('#btn-salvar-agenda').addEventListener('click', async () => {
      const erroEl = q('#form-erro');
      erroEl.textContent = '';
      const tipo = q('#a-tipo').value;
      const ehConta = tipo !== 'Compromisso';
      const data = q('#a-data').value;
      const hora = q('#a-hora').value || null;
      const nome = nomeCadastrado || q('#a-nome').value.trim();
      const descricao = q('#a-descricao').value.trim();
      const valor = numOuNull(q('#a-valor').value);

      if (!data) { erroEl.textContent = 'Informe a data.'; return; }
      if (!nome && !descricao) { erroEl.textContent = 'Informe o nome ou a descrição.'; return; }
      if (tipo === 'Compromisso' && !hora) { erroEl.textContent = 'Informe o horário do compromisso.'; return; }
      if (ehConta && !(valor > 0)) { erroEl.textContent = 'Informe o valor da conta.'; return; }

      const base = {
        tipo, nome,
        cliente_id: tipo === 'A pagar' ? null : clienteId,
        fornecedor_id: tipo === 'A pagar' ? fornecedorId : null,
        endereco: q('#a-endereco').value.trim(),
        os_id: tipo === 'A pagar' ? null : numOuNull(q('#a-os').value),
        descricao, hora,
        duracao_min: ehConta ? 60 : (Number(q('#a-duracao').value) || 60),
        valor: ehConta ? valor : null,
        categoria_id: ehConta ? numOuNull(q('#a-categoria').value) : null,
        conta_caixa_id: ehConta ? numOuNull(q('#a-caixa').value) : null,
        sincronizar_google: q('#a-google').checked ? 1 : 0,
        observacao: q('#a-obs').value.trim(),
      };

      let idsParaSincronizar = [];

      if (id) {
        run(`UPDATE agenda SET tipo=?, nome=?, cliente_id=?, fornecedor_id=?, endereco=?, os_id=?, descricao=?, hora=?, duracao_min=?,
             valor=?, categoria_id=?, conta_caixa_id=?, sincronizar_google=?, observacao=?, data=? WHERE id=?`,
          [base.tipo, base.nome, base.cliente_id, base.fornecedor_id, base.endereco, base.os_id, base.descricao, base.hora, base.duracao_min,
           base.valor, base.categoria_id, base.conta_caixa_id, base.sincronizar_google, base.observacao, data, id]);
        const concluidoNovo = q('#a-concluido').checked;
        await persist();
        const erroConclusao = await alternarConclusao(id, concluidoNovo);
        if (erroConclusao) { erroEl.textContent = erroConclusao; renderLista(); return; }
        idsParaSincronizar = [id];
      } else {
        const rep = q('#a-repeticao').value;
        let datas = [data];
        if (rep !== 'Nenhuma') {
          const qtd = Number(q('#a-qtd').value);
          if (!Number.isInteger(qtd) || qtd < 2 || qtd > MAX_OCORRENCIAS) {
            erroEl.textContent = `Informe o total de ocorrências (de 2 a ${MAX_OCORRENCIAS}).`;
            return;
          }
          datas = gerarDatas(data, rep, qtd);
        }
        let serieId = null;
        datas.forEach((d, i) => {
          run(`INSERT INTO agenda (tipo, nome, cliente_id, fornecedor_id, endereco, os_id, descricao, data, hora, duracao_min,
               valor, categoria_id, conta_caixa_id, sincronizar_google, observacao, repeticao, serie_id, ocorrencia, total_ocorrencias)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [base.tipo, base.nome, base.cliente_id, base.fornecedor_id, base.endereco, base.os_id, base.descricao, d, base.hora, base.duracao_min,
             base.valor, base.categoria_id, base.conta_caixa_id, base.sincronizar_google, base.observacao, rep, serieId, i + 1, datas.length]);
          const novoId = all('SELECT last_insert_rowid() as id')[0].id;
          if (i === 0) { serieId = novoId; }
          run('UPDATE agenda SET serie_id = ? WHERE id = ?', [serieId, novoId]);
          idsParaSincronizar.push(novoId);
        });
        await persist();
      }

      // O que foi digitado já está salvo no app; agora tenta o Google Agenda.
      let mensagem = id ? 'Alterações salvas.' : `${idsParaSincronizar.length} lançamento(s) salvo(s).`;
      if (base.sincronizar_google) {
        if (!isSignedIn()) {
          mensagem += ' ⚠ Não conectado ao Google: nada foi enviado ao Google Agenda ainda (conecte e use "Enviar pendentes").';
        } else {
          let enviados = 0;
          let falha = '';
          for (const sid of idsParaSincronizar) {
            avisoEl.textContent = `Salvo. Enviando ao Google Agenda… ${enviados}/${idsParaSincronizar.length}`;
            const r = await sincronizarRegistro(sid);
            if (r === 'ok') enviados++; else if (r !== 'ignorado') { falha = r; break; }
          }
          await persist();
          mensagem += falha
            ? ` ⚠ Google Agenda: enviados ${enviados} de ${idsParaSincronizar.length}. Erro: ${falha}`
            : ` 📅 ${enviados} evento(s) no Google Agenda.`;
        }
      } else if (id) {
        const r = await sincronizarRegistro(id); // desmarcou o Google: remove o evento
        await persist();
        if (r !== 'ok' && r !== 'ignorado') mensagem += ` ⚠ Não consegui remover o evento do Google: ${r}`;
      }

      formWrap.innerHTML = '';
      avisoEl.textContent = mensagem;
      renderLista();
    });

    if (id) {
      // Apaga o evento do Google (se der) e depois o registro.
      async function apagarRegistros(ids) {
        let aviso = '';
        for (const rid of ids) {
          const r = all('SELECT google_event_id FROM agenda WHERE id = ?', [rid])[0];
          if (r?.google_event_id) {
            if (!isSignedIn()) { aviso = 'Alguns eventos continuam no Google Agenda (você não estava conectado).'; }
            else {
              try { await removerEvento(r.google_event_id); }
              catch (e) { aviso = `Não consegui remover um evento do Google Agenda: ${e.message}`; }
            }
          }
          run('DELETE FROM agenda WHERE id = ?', [rid]);
        }
        await persist();
        return aviso;
      }

      q('#btn-excluir-agenda').addEventListener('click', async () => {
        const ok = await confirmarApp(
          a.concluido && a.financeiro_id
            ? 'Excluir este lançamento da agenda? O lançamento que ele gerou no Financeiro será mantido.'
            : 'Excluir este lançamento da agenda?',
          { titulo: 'Excluir', textoSim: 'Excluir', textoNao: 'Cancelar' });
        if (!ok) return;
        const aviso = await apagarRegistros([id]);
        formWrap.innerHTML = '';
        avisoEl.textContent = aviso;
        renderLista();
      });

      q('#btn-excluir-serie')?.addEventListener('click', async () => {
        const ids = all('SELECT id FROM agenda WHERE serie_id = ? AND concluido = 0', [a.serie_id]).map((r) => r.id);
        const ok = await confirmarApp(
          `Excluir os ${ids.length} lançamentos pendentes desta série (inclusive do Google Agenda)? Os já pagos/concluídos são mantidos.`,
          { titulo: 'Excluir série', textoSim: 'Excluir série', textoNao: 'Cancelar' });
        if (!ok) return;
        const aviso = await apagarRegistros(ids);
        formWrap.innerHTML = '';
        avisoEl.textContent = aviso || `${ids.length} lançamento(s) excluído(s).`;
        renderLista();
      });
    }
  }

  ['#filtro-agenda-tipo', '#filtro-agenda-periodo', '#filtro-agenda-concluidos'].forEach((s) =>
    container.querySelector(s).addEventListener('change', renderLista));
  container.querySelector('#btn-novo-agenda').addEventListener('click', () => renderForm());
  renderLista();
}

// ---------- Datas ----------

function pad(n) { return String(n).padStart(2, '0'); }

export function isoHoje() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function somarDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Soma meses mantendo o dia do mês da data original (dia 31 vira 30/28 nos meses menores).
export function somarMeses(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = (m - 1) + n;
  const ano = y + Math.floor(total / 12);
  const mes = ((total % 12) + 12) % 12;
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return `${ano}-${pad(mes + 1)}-${pad(Math.min(d, ultimoDia))}`;
}

export function gerarDatas(inicio, repeticao, quantidade) {
  const datas = [];
  for (let i = 0; i < quantidade; i++) {
    if (repeticao === 'Diária') datas.push(somarDias(inicio, i));
    else if (repeticao === 'Semanal') datas.push(somarDias(inicio, i * 7));
    else if (repeticao === 'Mensal') datas.push(somarMeses(inicio, i));
    else datas.push(inicio);
  }
  return datas;
}

function classeTipo(t) { return t === 'A pagar' ? 'pagar' : t === 'A receber' ? 'receber' : 'compromisso'; }
function val(v) { return v === undefined || v === null ? '' : String(v).replace(/"/g, '&quot;'); }
function numOuNull(v) { return v === '' || v === undefined || v === null ? null : Number(v); }
function formatarMoeda(v) { return v === null || v === undefined ? 'R$ 0,00' : `R$ ${Number(v).toFixed(2)}`; }
function formatarData(d) { return d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '-'; }
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
