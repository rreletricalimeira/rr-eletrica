import { all, run, persist } from '../db/db.js';
import { abrirChecklistTecnico, dadosChecklistPadrao } from './checklist_tecnico.js';

// ============================================================
// Roteiro de Visita Técnica — guia de conduta profissional, do
// agendamento ao pós-atendimento (7 seções, baseado no PDF fornecido).
// O ponto 4 (Execução da Inspeção Técnica) tem um botão que abre o
// Checklist Técnico Completo por cima desta tela; ao salvar e fechar,
// os dados do checklist voltam pra cá e ficam guardados dentro deste
// mesmo registro (dados.checklistTecnico).
// ============================================================

const SECOES = [
  {
    id: 'preparacao',
    titulo: '1. Antes de Sair para a Visita (Preparação)',
    itens: [
      ['confirmar_horario', 'Confirmar horário e endereço com o cliente (mensagem no dia anterior ou pela manhã)'],
      ['revisar_historico', 'Revisar histórico do cliente: visitas anteriores, pendências, observações'],
      ['conferir_instrumentos', 'Conferir instrumentos de medição (multímetro, alicate amperímetro, megômetro)'],
      ['conferir_epis', 'Conferir EPIs: luvas isolantes, óculos de proteção, calçado de segurança, capacete se aplicável'],
      ['materiais_impressos', 'Separar materiais impressos: cartão de visita, modelo de laudo técnico'],
      ['uniforme', 'Uniforme limpo e identificado com a marca RR Elétrica'],
      ['higiene', 'Higiene pessoal e apresentação adequada'],
    ],
  },
  {
    id: 'abertura',
    titulo: '2. Chegada e Abertura (Primeira Impressão)',
    itens: [
      ['chegar_horario', 'Chegar no horário combinado, ou avisar com antecedência em caso de atraso'],
      ['cumprimentar', 'Cumprimentar e se apresentar com nome completo e nome da empresa'],
      ['cartao_visita', 'Entregar cartão de visita ao cliente ou responsável'],
      ['explicar_tempo', 'Explicar brevemente o que será feito na visita e o tempo estimado'],
      ['perguntar_queixas', 'Perguntar sobre queixas, histórico do sistema e expectativas do cliente'],
      ['autorizacao_desligar', 'Solicitar autorização para desligar energia, se for necessário para a inspeção'],
    ],
  },
  {
    id: 'seguranca',
    titulo: '3. Segurança Antes de Iniciar',
    itens: [
      ['epis_vestidos', 'Verificar EPIs vestidos corretamente antes de qualquer contato com o quadro'],
      ['desenergizacao', 'Confirmar desenergização do circuito quando aplicável (conforme NR-10)'],
      ['sinalizar_area', 'Sinalizar a área de trabalho para evitar acesso de terceiros'],
      ['comunicar_riscos', 'Comunicar ao cliente sobre riscos e cuidados durante a inspeção'],
    ],
  },
  {
    id: 'execucao',
    titulo: '4. Execução da Inspeção Técnica',
    itens: [
      ['checklist_completo', 'Seguir o checklist técnico completo (quadro elétrico, motores, bombas, inversores, ambiente)', true],
      ['medicoes', 'Realizar as medições necessárias (tensão, corrente, aterramento, DR)'],
      ['fotografar', 'Fotografar pontos relevantes — tanto conformidades quanto não conformidades'],
      ['anotar_laudo', 'Anotar todas as observações diretamente no Laudo Técnico de Diagnóstico'],
    ],
  },
  {
    id: 'comunicacao',
    titulo: '5. Comunicação dos Achados ao Cliente',
    itens: [
      ['explicar_achados', 'Explicar os achados de forma simples e didática, evitando jargão técnico excessivo'],
      ['priorizar_riscos', 'Priorizar riscos de segurança em primeiro lugar, antes de qualquer outro ponto'],
      ['oportunidades', 'Apresentar oportunidades de melhoria e economia (ex.: inversor de frequência)'],
      ['transparencia', 'Ser transparente sobre o que é urgente e o que é apenas recomendável'],
    ],
  },
  {
    id: 'fechamento',
    titulo: '6. Fechamento da Visita',
    itens: [
      ['prazo_entrega', 'Informar o prazo de entrega do laudo técnico e/ou orçamento'],
      ['confirmar_contato', 'Confirmar o meio de contato preferido do cliente (WhatsApp, e-mail, telefone)'],
      ['agradecer', 'Agradecer a oportunidade e reforçar disponibilidade para dúvidas'],
      ['local_organizado', 'Deixar o local de trabalho organizado e limpo'],
    ],
  },
  {
    id: 'posVisita',
    titulo: '7. Pós-Visita (até 24–48h)',
    itens: [
      ['enviar_laudo', 'Elaborar e enviar o Laudo Técnico de Diagnóstico e/ou a Proposta comercial'],
      ['registrar_planilha', 'Registrar a visita na planilha de controle (cliente, data, status, valor)'],
      ['follow_up', 'Programar follow-up caso não haja retorno em alguns dias'],
      ['feedback', 'Solicitar feedback ou avaliação do cliente sobre o atendimento'],
    ],
  },
];

function dadosPadrao() {
  const d = { checklistTecnico: dadosChecklistPadrao() };
  SECOES.forEach((s) => { d[s.id] = {}; });
  return d;
}

export function renderVisitas(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Roteiro de Visita Técnica</h2>
      <button id="btn-novo-roteiro">+ Novo roteiro de visita</button>
      <ul id="lista-roteiros" class="lista"></ul>
      <div id="form-roteiro-wrap"></div>
    </div>
  `;

  const listaEl = container.querySelector('#lista-roteiros');
  const formWrap = container.querySelector('#form-roteiro-wrap');

  function renderLista() {
    const itens = all(`
      SELECT r.id, r.status, r.data_visita, c.nome as cliente_nome
      FROM roteiros_visita r LEFT JOIN clientes c ON c.id = r.cliente_id
      ORDER BY r.id DESC
    `);
    listaEl.innerHTML = itens.map((r) => `
      <li data-id="${r.id}">
        <div class="item-principal">
          <strong>Roteiro #${r.id} — ${escapeHtml(r.cliente_nome || 'Sem cliente')}</strong>
          <span class="item-sub">${r.status}${r.data_visita ? ` · ${formatarData(r.data_visita)}` : ''}</span>
        </div>
        <button class="btn-editar" data-id="${r.id}">Abrir</button>
      </li>
    `).join('') || '<li><em>Nenhum roteiro de visita cadastrado</em></li>';

    listaEl.querySelectorAll('.btn-editar').forEach((btn) => {
      btn.addEventListener('click', () => renderForm(Number(btn.dataset.id)));
    });
  }

  function renderForm(id = null) {
    const roteiro = id ? all('SELECT * FROM roteiros_visita WHERE id = ?', [id])[0] : {};
    const dados = id && roteiro.dados_json ? JSON.parse(roteiro.dados_json) : dadosPadrao();
    if (!dados.checklistTecnico) dados.checklistTecnico = dadosChecklistPadrao();

    formWrap.innerHTML = `
      <div class="card form-card">
        <h3>${id ? `Roteiro de Visita #${id}` : 'Novo Roteiro de Visita'}</h3>

        <label>Cliente *</label>
        <select id="f-cliente">
          <option value="">Selecione</option>
          ${all('SELECT id, nome FROM clientes ORDER BY nome').map((c) =>
            `<option value="${c.id}" ${roteiro.cliente_id === c.id ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`
          ).join('')}
        </select>

        <label>Endereço</label>
        <input id="f-endereco" type="text" value="${val(roteiro.endereco)}" />

        <label>Data da visita</label>
        <input id="f-data" type="date" value="${val(roteiro.data_visita)}" />
      </div>

      ${SECOES.map((s) => `
        <div class="card form-card">
          <h3 style="margin-top:0">${s.titulo}</h3>
          ${s.itens.map(([itemId, label, temBotaoChecklist]) => `
            <div class="linha-checkbox campo-full">
              <input type="checkbox" class="roteiro-item" data-secao="${s.id}" data-item="${itemId}"
                ${dados[s.id][itemId] ? 'checked' : ''} />
              <label style="margin:0">${label}</label>
              ${temBotaoChecklist ? '<button type="button" id="btn-abrir-checklist-tecnico" class="secondary" style="margin-left:auto">Abrir checklist completo</button>' : ''}
            </div>
          `).join('')}
        </div>
      `).join('')}

      <div class="card form-card">
        <h3>Observações gerais desta visita</h3>
        <textarea id="f-observacoes" class="campo-full">${val(roteiro.observacoes)}</textarea>
      </div>

      <div class="card">
        <button id="btn-salvar-roteiro">Salvar roteiro</button>
        <button id="btn-cancelar-roteiro" class="secondary">Cancelar</button>
        ${id ? '<button id="btn-excluir-roteiro" class="danger">Excluir</button>' : ''}
        <p id="form-erro" class="pin-erro"></p>
      </div>
    `;

    // ---- Cliente: ao escolher, sugere endereço se ainda vazio ----
    formWrap.querySelector('#f-cliente').addEventListener('change', (e) => {
      const clienteId = Number(e.target.value) || null;
      if (!clienteId) return;
      const c = all('SELECT * FROM clientes WHERE id = ?', [clienteId])[0];
      if (!c) return;
      const endEl = formWrap.querySelector('#f-endereco');
      if (!endEl.value) endEl.value = [c.endereco, c.bairro, c.cidade, c.uf].filter(Boolean).join(', ');
    });

    formWrap.querySelectorAll('.roteiro-item').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        dados[e.target.dataset.secao][e.target.dataset.item] = e.target.checked;
      });
    });

    // ---- Ponto 4: abre o Checklist Técnico Completo em overlay ----
    formWrap.querySelector('#btn-abrir-checklist-tecnico').addEventListener('click', () => {
      const cliente = all('SELECT nome FROM clientes WHERE id = ?', [Number(formWrap.querySelector('#f-cliente').value) || 0])[0];
      abrirChecklistTecnico({
        dadosIniciais: dados.checklistTecnico,
        contexto: {
          clienteNome: cliente ? cliente.nome : '',
          endereco: formWrap.querySelector('#f-endereco').value,
        },
        onSalvarFechar: (checklistAtualizado) => { dados.checklistTecnico = checklistAtualizado; },
      });
    });

    // ---- Ações ----
    formWrap.querySelector('#btn-cancelar-roteiro').addEventListener('click', () => { formWrap.innerHTML = ''; });

    if (id) {
      formWrap.querySelector('#btn-excluir-roteiro').addEventListener('click', async () => {
        if (!confirm('Excluir este roteiro de visita definitivamente?')) return;
        run('DELETE FROM roteiros_visita WHERE id = ?', [id]);
        await persist();
        formWrap.innerHTML = '';
        renderLista();
      });
    }

    formWrap.querySelector('#btn-salvar-roteiro').addEventListener('click', async () => {
      const cliente_id = Number(formWrap.querySelector('#f-cliente').value) || null;
      if (!cliente_id) {
        formWrap.querySelector('#form-erro').textContent = 'Selecione um cliente.';
        return;
      }

      const registro = {
        cliente_id,
        endereco: formWrap.querySelector('#f-endereco').value.trim(),
        data_visita: formWrap.querySelector('#f-data').value || null,
        dados_json: JSON.stringify(dados),
        observacoes: formWrap.querySelector('#f-observacoes').value.trim(),
      };

      if (id) {
        run(`UPDATE roteiros_visita SET cliente_id=?, endereco=?, data_visita=?, dados_json=?, observacoes=? WHERE id=?`,
          [...Object.values(registro), id]);
      } else {
        const cols = Object.keys(registro).join(', ');
        const placeholders = Object.keys(registro).map(() => '?').join(', ');
        run(`INSERT INTO roteiros_visita (${cols}) VALUES (${placeholders})`, Object.values(registro));
      }

      await persist();
      formWrap.innerHTML = '';
      renderLista();
    });
  }

  container.querySelector('#btn-novo-roteiro').addEventListener('click', () => renderForm(null));
  renderLista();
}

// ---------- Helpers ----------

function val(v) { return v === undefined || v === null ? '' : String(v).replace(/"/g, '&quot;'); }
function formatarData(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = String(iso).split('-');
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
