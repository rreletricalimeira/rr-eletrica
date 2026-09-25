import { all, run, persist } from '../db/db.js';
import {
  carregarLogoBase64, desenharCabecalho, desenharRodape, MARGEM, COR_LINHA, COR_OURO,
} from '../ui/pdf_papel_timbrado.js';
import { entregarPdf } from '../ui/pdf_compartilhar.js';
import { reduzirFotoParaPdf, assinaturaEscuraParaPdf, desenharImagemNaCaixa } from '../ui/pdf_imagens.js';

// ============================================================
// Laudo Técnico de Diagnóstico — Casa de Máquinas
// Estrutura de checklist e blocos repetíveis já validados no preview
// (laudo-tecnico-preview.html). Aqui a mesma lógica passa a ler/gravar
// no banco compartilhado (tabela `laudos`, ver schema.sql).
// ============================================================

export const PAINEL_ITEMS = [
  ['identificacao_circuitos', 'Identificação/etiquetagem dos circuitos'],
  ['disjuntores', 'Disjuntores dimensionados corretamente'],
  ['dr30ma', 'Presença e funcionamento de DR 30mA'],
  ['contatores', 'Contatores em bom estado (sem oxidação/queima)'],
  ['aterramento_quadro', 'Aterramento do quadro (continuidade)'],
  ['grau_protecao', 'Grau de proteção IP compatível com o ambiente'],
  ['sinalizacao', 'Sinalização de segurança e bloqueio (NR-10/NR-12)'],
  ['fiacao', 'Fiação sem emendas expostas ou improvisos'],
  ['aquecimento', 'Ausência de aquecimento anormal (termografia visual)'],
];

export const BOMBA_ITEMS = [
  ['placa', 'Placa de identificação legível (potência, corrente nominal)'],
  ['ruido', 'Ruído e vibração dentro do normal'],
  ['temp_carcaca', 'Temperatura de carcaça dentro do normal'],
  ['alinhamento', 'Alinhamento motor-bomba adequado'],
  ['vazamento', 'Ausência de vazamentos no selo mecânico'],
  ['corrente_nominal', 'Corrente medida compatível com nominal (±10%)'],
  ['aterramento_motor', 'Aterramento da carcaça do motor'],
];

export const INVERSOR_ITEM_TRIGGER = ['inversor_instalado', 'Inversor já instalado no sistema'];
export const INVERSOR_ITEMS_DEMAIS = [
  ['parametrizacao', 'Parametrização atual adequada à aplicação'],
  ['ventilacao_inversor', 'Ventilação/dissipação do inversor adequada'],
  ['compatibilidade', 'Compatibilidade do motor com acionamento por inversor'],
  ['oportunidade_inversor', 'Oportunidade identificada para instalação de inversor'],
];

export const AMBIENTE_ITEMS = [
  ['ventilacao_ambiente', 'Ventilação adequada da casa de máquinas'],
  ['umidade', 'Ausência de umidade excessiva/infiltração'],
  ['zonas_protecao', 'Respeito às zonas de proteção (volumes 0/1/2 - NBR 10339)'],
  ['selv', 'Uso de equipamentos SELV em áreas molhadas quando exigido'],
  ['piso_drenagem', 'Piso e drenagem em condições seguras'],
  ['extintor', 'Extintor de incêndio presente e válido'],
];

const NORMAS_LAUDO = [
  'NR-10 – Segurança em Instalações e Serviços em Eletricidade',
  'NR-12 – Segurança no Trabalho em Máquinas e Equipamentos',
  'ABNT NBR 5410 – Instalações elétricas de baixa tensão',
  'ABNT NBR 10339 – Piscinas: Instalações elétricas e hidráulicas',
  'Classificação de zonas para áreas molhadas / piscinas (volumes 0, 1 e 2), exigências de SELV e grau de proteção IP',
  'ABNT NBR 5419 – Proteção contra descargas atmosféricas (quando aplicável)',
];

const OPORTUNIDADES_LAUDO = [
  'Instalação de inversores de frequência para controle de vazão e redução de consumo energético',
  'Substituição de contatores/disjuntores por modelos com maior vida útil',
  'Melhoria de aterramento e proteção contra surtos',
  'Atualização de sinalização e identificação conforme NR-10/NR-12',
  'Programa de manutenção preventiva periódica',
];

// Próximo número automático do laudo, no formato LC0001 (4 dígitos).
function gerarProximoNumeroLaudo() {
  const registros = all(`SELECT numero FROM laudos WHERE numero LIKE 'LC%'`);
  let maior = 0;
  registros.forEach((r) => {
    const m = /^LC(\d{4,})$/.exec((r.numero || '').trim());
    if (m) maior = Math.max(maior, Number(m[1]));
  });
  return `LC${String(maior + 1).padStart(4, '0')}`;
}

function novaBomba(n) {
  return { nome: `Bomba/Motor ${n}`, itens: {}, inversor: {}, tensaoMotor: '', correnteNominal: '', correnteMedida: '' };
}

const OPCOES_TENSAO_MOTOR = ['220V Trifásico', '220V Bifásico/Monofásico', '110V Monofásico'];
function novaNaoConformidade() { return { descricao: '', norma: '', risco: 'Baixo', recomendacao: '' }; }
function novaFoto() { return { dataUrl: null, legenda: '' }; }

function dadosPadrao() {
  return {
    painel: {},
    bombas: [novaBomba(1)],
    ambiente: {},
    obsInversorEficiencia: '',
    medicoes: {
      tensaoF12: '', tensaoF23: '', tensaoF31: '',
      tensaoFN1: '', tensaoFN2: '', tensaoFN3: '',
      resistenciaAterramento: '', tempoDR: '',
    },
    naoConformidades: [novaNaoConformidade()],
  };
}

export function renderLaudos(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Laudos Técnicos</h2>
      <button id="btn-novo-laudo">+ Novo laudo</button>
      <ul id="lista-laudos" class="lista"></ul>
      <div id="form-laudo-wrap"></div>
    </div>
  `;

  const listaEl = container.querySelector('#lista-laudos');
  const formWrap = container.querySelector('#form-laudo-wrap');

  function renderLista() {
    const itens = all(`
      SELECT laudos.id, laudos.numero, laudos.status, laudos.data_visita, c.nome as cliente_nome
      FROM laudos LEFT JOIN clientes c ON c.id = laudos.cliente_id
      ORDER BY laudos.id DESC
    `);
    listaEl.innerHTML = itens.map((l) => `
      <li data-id="${l.id}">
        <div class="item-principal">
          <strong>${l.numero ? `Laudo ${escapeHtml(l.numero)}` : `Laudo #${l.id}`} — ${escapeHtml(l.cliente_nome || 'Sem cliente')}</strong>
          <span class="item-sub">${l.status}${l.data_visita ? ` · ${formatarData(l.data_visita)}` : ''}</span>
        </div>
        <button class="btn-editar" data-id="${l.id}">Abrir</button>
      </li>
    `).join('') || '<li><em>Nenhum laudo cadastrado</em></li>';

    listaEl.querySelectorAll('.btn-editar').forEach((btn) => {
      btn.addEventListener('click', () => renderForm(Number(btn.dataset.id)));
    });
  }

  function renderForm(id = null) {
    const laudo = id ? all('SELECT * FROM laudos WHERE id = ?', [id])[0] : {};
    const dados = id && laudo.dados_json ? JSON.parse(laudo.dados_json) : dadosPadrao();
    const fotos = id && laudo.fotos_json ? JSON.parse(laudo.fotos_json) : [novaFoto()];
    let assinaturaResponsavel = (id && laudo.assinatura_responsavel_base64) || null;
    let assinaturaCliente = (id && laudo.assinatura_cliente_base64) || null;
    let mostrarNormas = false;

    formWrap.innerHTML = `
      <div class="card form-card">
        <h3>${id ? `Laudo ${laudo.numero ? `${laudo.numero} ` : ''}#${id}` : 'Novo laudo'}</h3>

        <label>Nº do Laudo</label>
        <input id="f-numero" type="text" value="${val(id ? laudo.numero : gerarProximoNumeroLaudo())}" readonly />

        <label>Cliente *</label>
        <select id="f-cliente">
          <option value="">Selecione</option>
          ${all('SELECT id, nome FROM clientes ORDER BY nome').map((c) =>
            `<option value="${c.id}" ${laudo.cliente_id === c.id ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`
          ).join('')}
        </select>

        <label>Endereço completo</label>
        <input id="f-endereco" type="text" value="${val(laudo.endereco)}" />

        <label>Telefone</label>
        <input id="f-telefone" type="text" value="${val(laudo.telefone)}" />

        <label>Celular</label>
        <input id="f-celular" type="text" value="${val(laudo.celular)}" />

        <label>Data da visita</label>
        <input id="f-data-visita" type="date" value="${val(laudo.data_visita)}" />

        <label>Horário da visita</label>
        <input id="f-hora-visita" type="time" value="${val(laudo.hora_visita)}" />

        <label>Responsável técnico presente</label>
        <input id="f-resp-tecnico" type="text" value="${val(laudo.responsavel_tecnico)}" />

        <label>Acompanhante do cliente</label>
        <input id="f-acompanhante" type="text" value="${val(laudo.acompanhante)}" />

        <label>Tipo de instalação</label>
        <select id="f-tipo-instalacao">
          ${['Residencial', 'Comercial', 'Industrial', 'Piscina / Aquático'].map((t) =>
            `<option ${(laudo.tipo_instalacao || 'Residencial') === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>

      <div class="card">
        <div class="linha-checkbox">
          <input type="checkbox" id="chk-normas" />
          <label style="margin:0" for="chk-normas">Mostrar normas e referências técnicas aplicadas</label>
        </div>
        <ul id="lista-normas" style="display:none; margin-top:10px; padding-left:18px; font-size:0.9rem;">
          ${NORMAS_LAUDO.map((n) => `<li>${n}</li>`).join('')}
        </ul>
      </div>

      <div class="card form-card">
        <h3>Checklist de Inspeção Técnica</h3>
        <p class="item-sub campo-full">Quadro Elétrico / Painel de Comando</p>
        ${renderChecklist(PAINEL_ITEMS, dados.painel, 'painel')}
      </div>

      <div class="card">
        <h3>Motores, Bombas e Inversores de Frequência</h3>
        <p class="item-sub">A casa de máquinas pode ter uma ou mais bombas — adicione um bloco para cada conjunto motor-bomba (com seu respectivo inversor, se houver).</p>
        <div id="lista-bombas"></div>
        <button type="button" id="btn-add-bomba" class="secondary">+ Adicionar bomba</button>
      </div>

      <div class="card form-card">
        <h3>Ambiente, Ventilação e Classificação de Área (Piscinas)</h3>
        ${renderChecklist(AMBIENTE_ITEMS, dados.ambiente, 'ambiente')}
        <label class="campo-full">Observações sobre inversor de frequência / oportunidade de eficiência energética</label>
        <textarea id="f-obs-inversor" class="campo-full">${val(dados.obsInversorEficiencia)}</textarea>
      </div>

      <div class="card form-card">
        <h3>Medições Técnicas Realizadas</h3>
        <h4 class="campo-full" style="margin-top:0">Tensão entre fases (V) — ref. 380V</h4>
        <label>Fase 1-2</label><input id="m-f12" type="text" value="${val(dados.medicoes.tensaoF12)}" />
        <label>Fase 2-3</label><input id="m-f23" type="text" value="${val(dados.medicoes.tensaoF23)}" />
        <label>Fase 3-1</label><input id="m-f31" type="text" value="${val(dados.medicoes.tensaoF31)}" />
        <h4 class="campo-full">Tensão fase-neutro (V) — ref. 220V</h4>
        <label>Fase 1</label><input id="m-fn1" type="text" value="${val(dados.medicoes.tensaoFN1)}" />
        <label>Fase 2</label><input id="m-fn2" type="text" value="${val(dados.medicoes.tensaoFN2)}" />
        <label>Fase 3</label><input id="m-fn3" type="text" value="${val(dados.medicoes.tensaoFN3)}" />
        <label>Resistência de aterramento (Ω) — ref. ≤ 10Ω</label>
        <input id="m-aterramento" type="text" value="${val(dados.medicoes.resistenciaAterramento)}" />
        <label>Tempo de atuação DR (ms) — ref. ≤ 300ms</label>
        <input id="m-dr" type="text" value="${val(dados.medicoes.tempoDR)}" />
      </div>

      <div class="card">
        <h3>Não Conformidades Identificadas</h3>
        <div id="lista-nc"></div>
        <button type="button" id="btn-add-nc" class="secondary">+ Adicionar não conformidade</button>
      </div>

      <div class="card form-card">
        <h3>Oportunidades de Melhoria e Eficiência Energética</h3>
        <ul class="campo-full item-sub" style="margin-top:0; padding-left:18px;">
          ${OPORTUNIDADES_LAUDO.map((o) => `<li>${o}</li>`).join('')}
        </ul>
        <label class="campo-full">Estimativa preliminar de economia (se aplicável)</label>
        <textarea id="f-estimativa" class="campo-full">${val(laudo.estimativa_economia)}</textarea>
      </div>

      <div class="card">
        <h3>Registro Fotográfico</h3>
        <div id="lista-fotos"></div>
        <button type="button" id="btn-add-foto" class="secondary">+ Adicionar foto</button>
      </div>

      <div class="card form-card">
        <h3>Parecer Técnico e Conclusão</h3>
        <label>Classificação do sistema</label>
        <select id="f-parecer-classificacao">
          ${['', 'Conforme — sem restrições de uso', 'Conforme com ressalvas', 'Não conforme — intervenção imediata'].map((o) =>
            `<option value="${o}" ${laudo.parecer_classificacao === o ? 'selected' : ''}>${o || 'Selecione'}</option>`).join('')}
        </select>
        <label class="campo-full">Parecer descritivo</label>
        <textarea id="f-parecer-descricao" class="campo-full">${val(laudo.parecer_descricao)}</textarea>
      </div>

      <div class="card form-card">
        <h3>Encerramento e Assinaturas</h3>
        <label class="campo-full">Assinatura do responsável técnico</label>
        <div class="campo-full">
          <canvas class="assinatura-canvas" id="ass-responsavel"></canvas>
          <button type="button" class="secondary" id="btn-limpar-ass-responsavel">Limpar assinatura</button>
        </div>
        <label>Data</label>
        <input id="f-data-ass-resp" type="date" value="${val(laudo.data_assinatura_responsavel)}" />
        <label class="campo-full">Assinatura do cliente / representante</label>
        <div class="campo-full">
          <canvas class="assinatura-canvas" id="ass-cliente"></canvas>
          <button type="button" class="secondary" id="btn-limpar-ass-cliente">Limpar assinatura</button>
        </div>
        <label>Data</label>
        <input id="f-data-ass-cli" type="date" value="${val(laudo.data_assinatura_cliente)}" />
      </div>

      <div class="card">
        <button id="btn-salvar-laudo">Salvar laudo</button>
        <button id="btn-cancelar-laudo" class="secondary">Cancelar</button>
        <button id="btn-imprimir-laudo" class="secondary">Exportar PDF</button>
        ${id ? '<button id="btn-excluir-laudo" class="danger">Excluir</button>' : ''}
        <p id="form-erro" class="pin-erro"></p>
      </div>
    `;

    // ---- Cliente: ao escolher, sugere endereço/telefone se ainda vazios ----
    formWrap.querySelector('#f-cliente').addEventListener('change', (e) => {
      const clienteId = Number(e.target.value) || null;
      if (!clienteId) return;
      const c = all('SELECT * FROM clientes WHERE id = ?', [clienteId])[0];
      if (!c) return;
      const endEl = formWrap.querySelector('#f-endereco');
      const telEl = formWrap.querySelector('#f-telefone');
      const celEl = formWrap.querySelector('#f-celular');
      if (!endEl.value) endEl.value = [c.endereco, c.bairro, c.cidade, c.uf].filter(Boolean).join(', ');
      if (!telEl.value) telEl.value = c.fone1 || '';
      if (!celEl.value) celEl.value = c.celular1 || '';
    });

    // ---- Normas (mostrar/esconder sem re-renderizar a página) ----
    formWrap.querySelector('#chk-normas').addEventListener('change', (e) => {
      mostrarNormas = e.target.checked;
      formWrap.querySelector('#lista-normas').style.display = mostrarNormas ? 'block' : 'none';
    });

    // ---- Bombas / motores / inversor ----
    function renderBombas() {
      const wrap = formWrap.querySelector('#lista-bombas');
      wrap.innerHTML = dados.bombas.map((b, i) => `
        <div class="subcard form-card" data-idx="${i}">
          <div class="subcard-titulo campo-full">
            <input type="text" class="bomba-nome" value="${val(b.nome)}" style="max-width:260px" />
            ${dados.bombas.length > 1 ? '<button type="button" class="danger btn-remover-bomba" style="margin:0">Remover</button>' : ''}
          </div>
          <h4 class="campo-full">Motor e bomba</h4>
          <div class="campo">
            <label>Tensão do motor</label>
            <select class="bomba-tensao">
              <option value="">Selecione...</option>
              ${OPCOES_TENSAO_MOTOR.map((op) => `<option value="${op}" ${b.tensaoMotor === op ? 'selected' : ''}>${op}</option>`).join('')}
            </select>
          </div>
          <div class="campo">
            <label>Corrente nominal do motor (A)</label>
            <input type="number" step="0.01" class="bomba-corrente-nominal" value="${val(b.correnteNominal)}" />
          </div>
          <div class="campo">
            <label>Corrente medida (A)</label>
            <input type="number" step="0.01" class="bomba-corrente-medida" value="${val(b.correnteMedida)}" />
          </div>
          ${renderChecklist(BOMBA_ITEMS, b.itens, `bomba-${i}`)}
          <h4 class="campo-full">Inversor de frequência</h4>
          ${renderInversorItens(b, i)}
        </div>
      `).join('');

      wrap.querySelectorAll('.subcard').forEach((sub) => {
        const idx = Number(sub.dataset.idx);
        sub.querySelector('.bomba-nome').addEventListener('input', (e) => { dados.bombas[idx].nome = e.target.value; });
        sub.querySelector('.bomba-tensao').addEventListener('change', (e) => { dados.bombas[idx].tensaoMotor = e.target.value; });
        sub.querySelector('.bomba-corrente-nominal').addEventListener('input', (e) => { dados.bombas[idx].correnteNominal = e.target.value; });
        sub.querySelector('.bomba-corrente-medida').addEventListener('input', (e) => { dados.bombas[idx].correnteMedida = e.target.value; });
        sub.querySelectorAll('.js-status').forEach((sel) => {
          sel.addEventListener('change', (e) => {
            const item = e.target.dataset.item;
            if (e.target.dataset.grupo === `bomba-${idx}`) dados.bombas[idx].itens[item] = e.target.value;
            if (e.target.dataset.grupo === `bomba-${idx}-inv`) {
              dados.bombas[idx].inversor[item] = e.target.value;
              if (item === INVERSOR_ITEM_TRIGGER[0]) renderBombas();
            }
          });
        });
        const btnRemover = sub.querySelector('.btn-remover-bomba');
        if (btnRemover) btnRemover.addEventListener('click', () => { dados.bombas.splice(idx, 1); renderBombas(); });
      });
    }

    // Corrigido: o listener do "+ Adicionar bomba" é fixo (o botão nunca é
    // recriado), então fica fora de renderBombas() — senão cada vez que a
    // lista era redesenhada (ex.: ao marcar o inversor como "Não conforme")
    // um novo listener se somava ao anterior, multiplicando as bombas a
    // cada clique.
    formWrap.querySelector('#btn-add-bomba').addEventListener('click', () => {
      dados.bombas.push(novaBomba(dados.bombas.length + 1));
      renderBombas();
    });

    function renderInversorItens(bomba, idx) {
      const statusInstalado = bomba.inversor[INVERSOR_ITEM_TRIGGER[0]] || '';
      const gatilho = renderChecklist([INVERSOR_ITEM_TRIGGER], bomba.inversor, `bomba-${idx}-inv`);
      if (statusInstalado === 'Não conforme') {
        const oportunidade = INVERSOR_ITEMS_DEMAIS.filter(([itemId]) => itemId === 'oportunidade_inversor');
        return gatilho + renderChecklist(oportunidade, bomba.inversor, `bomba-${idx}-inv`);
      }
      return gatilho + renderChecklist(INVERSOR_ITEMS_DEMAIS, bomba.inversor, `bomba-${idx}-inv`);
    }


    // ---- Não conformidades ----
    function renderNaoConformidades() {
      const wrap = formWrap.querySelector('#lista-nc');
      wrap.innerHTML = dados.naoConformidades.map((nc, i) => `
        <div class="subcard form-card" data-idx="${i}">
          <div class="subcard-titulo campo-full">
            <strong>Não conformidade ${i + 1}</strong>
            ${dados.naoConformidades.length > 1 ? '<button type="button" class="danger btn-remover-nc" style="margin:0">Remover</button>' : ''}
          </div>
          <label class="campo-full">Descrição</label>
          <textarea class="nc-descricao campo-full">${val(nc.descricao)}</textarea>
          <label>Norma / Referência</label><input type="text" class="nc-norma" value="${val(nc.norma)}" />
          <label>Risco</label>
          <select class="nc-risco">
            ${['Baixo', 'Médio', 'Alto'].map((r) => `<option ${nc.risco === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>
          <label class="campo-full">Recomendação</label>
          <textarea class="nc-recomendacao campo-full">${val(nc.recomendacao)}</textarea>
        </div>
      `).join('');

      wrap.querySelectorAll('.subcard').forEach((sub) => {
        const idx = Number(sub.dataset.idx);
        sub.querySelector('.nc-descricao').addEventListener('input', (e) => { dados.naoConformidades[idx].descricao = e.target.value; });
        sub.querySelector('.nc-norma').addEventListener('input', (e) => { dados.naoConformidades[idx].norma = e.target.value; });
        sub.querySelector('.nc-risco').addEventListener('change', (e) => { dados.naoConformidades[idx].risco = e.target.value; });
        sub.querySelector('.nc-recomendacao').addEventListener('input', (e) => { dados.naoConformidades[idx].recomendacao = e.target.value; });
        const btnRemover = sub.querySelector('.btn-remover-nc');
        if (btnRemover) btnRemover.addEventListener('click', () => { dados.naoConformidades.splice(idx, 1); renderNaoConformidades(); });
      });

      formWrap.querySelector('#btn-add-nc').addEventListener('click', () => {
        dados.naoConformidades.push(novaNaoConformidade());
        renderNaoConformidades();
      });
    }

    // ---- Fotos ----
    function renderFotos() {
      const wrap = formWrap.querySelector('#lista-fotos');
      wrap.innerHTML = fotos.map((f, i) => `
        <div class="subcard" data-idx="${i}">
          <div class="subcard-titulo">
            <strong>Foto ${i + 1}</strong>
            ${fotos.length > 1 ? '<button type="button" class="danger btn-remover-foto" style="margin:0">Remover</button>' : ''}
          </div>
          <div class="linha-foto-botoes">
            <input type="file" accept="image/*" class="foto-input-escolher" style="display:none" />
            <button type="button" class="secondary btn-escolher-foto">Escolher foto</button>
            <input type="file" accept="image/*" capture="environment" class="foto-input-tirar" style="display:none" />
            <button type="button" class="secondary btn-tirar-foto">Tirar foto</button>
          </div>
          ${f.dataUrl ? `<img src="${f.dataUrl}" class="foto-preview-img" />` : ''}
          <label>Legenda</label>
          <input type="text" class="foto-legenda" value="${val(f.legenda)}" placeholder="Ex.: Quadro elétrico geral" />
        </div>
      `).join('');

      wrap.querySelectorAll('.subcard').forEach((sub) => {
        const idx = Number(sub.dataset.idx);
        function carregarArquivo(input) {
          input.addEventListener('change', () => {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => { fotos[idx].dataUrl = reader.result; renderFotos(); };
            reader.readAsDataURL(file);
          });
        }
        const inputEscolher = sub.querySelector('.foto-input-escolher');
        const inputTirar = sub.querySelector('.foto-input-tirar');
        carregarArquivo(inputEscolher);
        carregarArquivo(inputTirar);
        sub.querySelector('.btn-escolher-foto').addEventListener('click', () => inputEscolher.click());
        sub.querySelector('.btn-tirar-foto').addEventListener('click', () => inputTirar.click());
        sub.querySelector('.foto-legenda').addEventListener('input', (e) => { fotos[idx].legenda = e.target.value; });
        const btnRemover = sub.querySelector('.btn-remover-foto');
        if (btnRemover) btnRemover.addEventListener('click', () => { fotos.splice(idx, 1); renderFotos(); });
      });

      formWrap.querySelector('#btn-add-foto').addEventListener('click', () => { fotos.push(novaFoto()); renderFotos(); });
    }

    // ---- Assinaturas (canvas) ----
    function configurarAssinatura(canvasId, valorInicial, aoDesenhar) {
      const canvas = formWrap.querySelector(`#${canvasId}`);
      const ctx = canvas.getContext('2d');
      const ajustar = () => {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * devicePixelRatio;
        canvas.height = rect.height * devicePixelRatio;
        ctx.scale(devicePixelRatio, devicePixelRatio);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        if (valorInicial) {
          const img = new Image();
          img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
          img.src = valorInicial;
        }
      };
      ajustar();
      let desenhando = false;
      canvas.addEventListener('pointerdown', (e) => {
        desenhando = true;
        const r = canvas.getBoundingClientRect();
        ctx.beginPath();
        ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!desenhando) return;
        const r = canvas.getBoundingClientRect();
        ctx.lineTo(e.clientX - r.left, e.clientY - r.top);
        ctx.stroke();
      });
      ['pointerup', 'pointerleave'].forEach((ev) => canvas.addEventListener(ev, () => {
        if (desenhando) aoDesenhar(canvas.toDataURL('image/png'));
        desenhando = false;
      }));
      return { limpar: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); aoDesenhar(null); } };
    }

    const ctrlAssResp = configurarAssinatura('ass-responsavel', assinaturaResponsavel, (v) => { assinaturaResponsavel = v; });
    const ctrlAssCli = configurarAssinatura('ass-cliente', assinaturaCliente, (v) => { assinaturaCliente = v; });
    formWrap.querySelector('#btn-limpar-ass-responsavel').addEventListener('click', () => ctrlAssResp.limpar());
    formWrap.querySelector('#btn-limpar-ass-cliente').addEventListener('click', () => ctrlAssCli.limpar());

    renderBombas();
    renderNaoConformidades();
    renderFotos();

    // ---- Ações ----
    formWrap.querySelector('#btn-cancelar-laudo').addEventListener('click', () => { formWrap.innerHTML = ''; });
    formWrap.querySelector('#btn-imprimir-laudo').addEventListener('click', async () => {
      const btn = formWrap.querySelector('#btn-imprimir-laudo');
      const erroEl = formWrap.querySelector('#form-erro');
      erroEl.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Gerando PDF...';
      try {
        const registro = coletarRegistro();
        const opt = formWrap.querySelector('#f-cliente').selectedOptions[0];
        await gerarPdf({
          registro,
          dados,
          fotos,
          assinaturas: { responsavel: assinaturaResponsavel, cliente: assinaturaCliente },
          mostrarNormas,
          clienteNome: registro.cliente_id && opt ? opt.textContent : '',
        });
      } catch (e) {
        erroEl.textContent = 'Não foi possível gerar o PDF: ' + e.message;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Exportar PDF';
      }
    });

    if (id) {
      formWrap.querySelector('#btn-excluir-laudo').addEventListener('click', async () => {
        if (!confirm('Excluir este laudo definitivamente?')) return;
        run('DELETE FROM laudos WHERE id = ?', [id]);
        await persist();
        formWrap.innerHTML = '';
        renderLista();
      });
    }

    // Lê o formulário inteiro para dentro de `dados` e devolve o registro. Usado
    // tanto para salvar quanto para gerar o PDF (que sai igual ao que está na
    // tela, mesmo antes de salvar).
    function coletarRegistro() {
      // Lê os checklists simples (painel/ambiente) direto do DOM.
      formWrap.querySelectorAll('.js-status').forEach((sel) => {
        const grupo = sel.dataset.grupo;
        const item = sel.dataset.item;
        if (grupo === 'painel') dados.painel[item] = sel.value;
        if (grupo === 'ambiente') dados.ambiente[item] = sel.value;
      });

      dados.medicoes.tensaoF12 = formWrap.querySelector('#m-f12').value;
      dados.medicoes.tensaoF23 = formWrap.querySelector('#m-f23').value;
      dados.medicoes.tensaoF31 = formWrap.querySelector('#m-f31').value;
      dados.medicoes.tensaoFN1 = formWrap.querySelector('#m-fn1').value;
      dados.medicoes.tensaoFN2 = formWrap.querySelector('#m-fn2').value;
      dados.medicoes.tensaoFN3 = formWrap.querySelector('#m-fn3').value;
      dados.medicoes.resistenciaAterramento = formWrap.querySelector('#m-aterramento').value;
      dados.medicoes.tempoDR = formWrap.querySelector('#m-dr').value;
      dados.obsInversorEficiencia = formWrap.querySelector('#f-obs-inversor').value;

      return {
        numero: formWrap.querySelector('#f-numero').value.trim() || null,
        cliente_id: Number(formWrap.querySelector('#f-cliente').value) || null,
        endereco: formWrap.querySelector('#f-endereco').value.trim(),
        telefone: formWrap.querySelector('#f-telefone').value.trim(),
        celular: formWrap.querySelector('#f-celular').value.trim(),
        data_visita: formWrap.querySelector('#f-data-visita').value || null,
        hora_visita: formWrap.querySelector('#f-hora-visita').value || null,
        responsavel_tecnico: formWrap.querySelector('#f-resp-tecnico').value.trim(),
        acompanhante: formWrap.querySelector('#f-acompanhante').value.trim(),
        tipo_instalacao: formWrap.querySelector('#f-tipo-instalacao').value,
        dados_json: JSON.stringify(dados),
        estimativa_economia: formWrap.querySelector('#f-estimativa').value.trim(),
        parecer_classificacao: formWrap.querySelector('#f-parecer-classificacao').value,
        parecer_descricao: formWrap.querySelector('#f-parecer-descricao').value.trim(),
        fotos_json: JSON.stringify(fotos),
        assinatura_responsavel_base64: assinaturaResponsavel,
        data_assinatura_responsavel: formWrap.querySelector('#f-data-ass-resp').value || null,
        assinatura_cliente_base64: assinaturaCliente,
        data_assinatura_cliente: formWrap.querySelector('#f-data-ass-cli').value || null,
      };
    }

    formWrap.querySelector('#btn-salvar-laudo').addEventListener('click', async () => {
      const cliente_id = Number(formWrap.querySelector('#f-cliente').value) || null;
      if (!cliente_id) {
        formWrap.querySelector('#form-erro').textContent = 'Selecione um cliente.';
        return;
      }

      const registro = coletarRegistro();

      if (id) {
        run(`UPDATE laudos SET numero=?, cliente_id=?, endereco=?, telefone=?, celular=?, data_visita=?, hora_visita=?,
             responsavel_tecnico=?, acompanhante=?, tipo_instalacao=?, dados_json=?, estimativa_economia=?,
             parecer_classificacao=?, parecer_descricao=?, fotos_json=?, assinatura_responsavel_base64=?,
             data_assinatura_responsavel=?, assinatura_cliente_base64=?, data_assinatura_cliente=? WHERE id=?`,
          [...Object.values(registro), id]);
      } else {
        const cols = Object.keys(registro).join(', ');
        const placeholders = Object.keys(registro).map(() => '?').join(', ');
        run(`INSERT INTO laudos (${cols}) VALUES (${placeholders})`, Object.values(registro));
      }

      await persist();
      formWrap.innerHTML = '';
      renderLista();
    });
  }

  container.querySelector('#btn-novo-laudo').addEventListener('click', () => renderForm(null));
  renderLista();
}

// ---------- Exportação em PDF (papel timbrado, compacto) ----------
// Mesmo padrão dos demais PDFs do app: cabeçalho e rodapé da RR Elétrica e
// todo o conteúdo do laudo no meio. Os checklists saem em duas colunas
// (item/status | item/status) e as fotos em grade de 3 por linha, para o
// laudo ocupar o mínimo de páginas.

async function gerarPdf({ registro, dados, fotos, assinaturas, mostrarNormas, clienteNome }) {
  const logo = await carregarLogoBase64();
  const fotosValidas = (fotos || []).filter((f) => f && f.dataUrl);
  const fotosPdf = await Promise.all(fotosValidas.map(async (f) => ({
    dataUrl: await reduzirFotoParaPdf(f.dataUrl),
    legenda: f.legenda || '',
  })));
  const assinResp = await assinaturaEscuraParaPdf(assinaturas.responsavel);
  const assinCli = await assinaturaEscuraParaPdf(assinaturas.cliente);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const LIMITE_Y = H - 24; // reserva o rodapé
  const larguraUtil = W - 2 * MARGEM;
  let y = desenharCabecalho(doc, logo, 'LAUDO TÉCNICO DE DIAGNÓSTICO');

  const base = { textColor: [0, 0, 0], lineColor: COR_LINHA, lineWidth: 0.2, fontSize: 8, cellPadding: 1.3 };
  const margens = { left: MARGEM, right: MARGEM, top: 14, bottom: 24 };
  const rotulo = { fontStyle: 'bold', fillColor: [230, 230, 230] };
  const vazio = (v) => (v === undefined || v === null || v === '' ? '—' : String(v));

  function garantirEspaco(altura) {
    if (y + altura > LIMITE_Y) { doc.addPage(); y = 16; }
  }
  function titulo(texto) {
    garantirEspaco(22);
    doc.setFont(undefined, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(texto, MARGEM, y);
    doc.setDrawColor(...COR_OURO);
    doc.setLineWidth(0.4);
    doc.line(MARGEM, y + 1.5, W - MARGEM, y + 1.5);
    doc.setFont(undefined, 'normal');
    y += 4;
  }
  function tabela(opcoes) {
    doc.autoTable({ startY: y, theme: 'grid', styles: base, margin: margens, ...opcoes });
    y = doc.lastAutoTable.finalY + 5;
  }
  function paragrafo(texto, tamanho = 8.5) {
    doc.setFontSize(tamanho);
    const linhas = doc.splitTextToSize(texto, larguraUtil);
    linhas.forEach((linha) => { garantirEspaco(5); doc.text(linha, MARGEM, y); y += 4; });
    y += 1.5;
  }
  function tabelaChecklist(items, valores) {
    const pares = items.map(([id, label]) => [label, (valores && valores[id]) || '—']);
    const linhas = [];
    for (let i = 0; i < pares.length; i += 2) linhas.push([...pares[i], ...(pares[i + 1] || ['', ''])]);
    tabela({
      head: [['Item', 'Status', 'Item', 'Status']],
      body: linhas,
      headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0], fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 'auto' }, 1: { cellWidth: 21, halign: 'center' },
        2: { cellWidth: 'auto' }, 3: { cellWidth: 21, halign: 'center' },
      },
      didParseCell: (d) => {
        if (d.section !== 'body' || (d.column.index !== 1 && d.column.index !== 3)) return;
        if (d.cell.raw === 'Não conforme') { d.cell.styles.textColor = [176, 32, 32]; d.cell.styles.fontStyle = 'bold'; }
        else if (d.cell.raw === 'Conforme') d.cell.styles.textColor = [30, 110, 50];
      },
    });
  }

  // ---- Título ----
  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.text('Laudo Técnico de Diagnóstico — Casa de Máquinas', MARGEM, y);
  if (registro.numero) doc.text(`Nº ${registro.numero}`, W - MARGEM, y, { align: 'right' });
  doc.setFont(undefined, 'normal');
  y += 6;

  // ---- Identificação ----
  tabela({
    columnStyles: { 0: { ...rotulo, cellWidth: 34 }, 1: { cellWidth: 'auto' }, 2: { ...rotulo, cellWidth: 38 }, 3: { cellWidth: 'auto' } },
    body: [
      ['Cliente', { content: vazio(clienteNome), colSpan: 3 }],
      ['Endereço', { content: vazio(registro.endereco), colSpan: 3 }],
      ['Telefone', vazio(registro.telefone), 'Celular', vazio(registro.celular)],
      ['Data da visita', vazio(formatarData(registro.data_visita)), 'Horário', vazio(registro.hora_visita)],
      ['Responsável técnico presente', vazio(registro.responsavel_tecnico), 'Acompanhante do cliente', vazio(registro.acompanhante)],
      ['Tipo de instalação', { content: vazio(registro.tipo_instalacao), colSpan: 3 }],
    ],
  });

  // ---- Normas (só se marcado no formulário) ----
  if (mostrarNormas) {
    titulo('Normas e referências técnicas aplicadas');
    doc.setFontSize(8);
    NORMAS_LAUDO.forEach((n) => {
      const linhas = doc.splitTextToSize(`• ${n}`, larguraUtil - 4);
      linhas.forEach((l, i) => { garantirEspaco(5); doc.text(l, MARGEM + (i ? 3 : 0), y); y += 3.8; });
    });
    y += 3;
  }

  // ---- Checklist: painel ----
  titulo('Quadro Elétrico / Painel de Comando');
  tabelaChecklist(PAINEL_ITEMS, dados.painel);

  // ---- Motores, bombas e inversores ----
  (dados.bombas || []).forEach((b, i) => {
    titulo(`${b.nome || `Bomba/Motor ${i + 1}`} — motor, bomba e inversor`);
    tabela({
      columnStyles: { 0: { ...rotulo, cellWidth: 34 }, 1: { cellWidth: 'auto' }, 2: { ...rotulo, cellWidth: 38 }, 3: { cellWidth: 'auto' } },
      body: [[
        'Tensão do motor', vazio(b.tensaoMotor),
        'Corrente nominal / medida',
        `${b.correnteNominal !== '' && b.correnteNominal != null ? `${b.correnteNominal} A` : '—'}  /  ${b.correnteMedida !== '' && b.correnteMedida != null ? `${b.correnteMedida} A` : '—'}`,
      ]],
    });
    y -= 3;
    tabelaChecklist(BOMBA_ITEMS, b.itens);
    y -= 2;
    const inv = b.inversor || {};
    const itensInversor = inv[INVERSOR_ITEM_TRIGGER[0]] === 'Não conforme'
      ? [INVERSOR_ITEM_TRIGGER, ...INVERSOR_ITEMS_DEMAIS.filter(([itemId]) => itemId === 'oportunidade_inversor')]
      : [INVERSOR_ITEM_TRIGGER, ...INVERSOR_ITEMS_DEMAIS];
    tabelaChecklist(itensInversor, inv);
  });

  // ---- Ambiente ----
  titulo('Ambiente, Ventilação e Classificação de Área (Piscinas)');
  tabelaChecklist(AMBIENTE_ITEMS, dados.ambiente);
  if (dados.obsInversorEficiencia) {
    doc.setFont(undefined, 'bold'); doc.setFontSize(8.5);
    garantirEspaco(10);
    doc.text('Observações sobre inversor de frequência / eficiência energética:', MARGEM, y); y += 4.5;
    doc.setFont(undefined, 'normal');
    paragrafo(dados.obsInversorEficiencia);
  }

  // ---- Medições ----
  titulo('Medições Técnicas Realizadas');
  const m = dados.medicoes || {};
  tabela({
    columnStyles: { 0: { ...rotulo, cellWidth: 62 } },
    body: [
      ['Tensão entre fases (V) — ref. 380V', `Fase 1-2: ${vazio(m.tensaoF12)}`, `Fase 2-3: ${vazio(m.tensaoF23)}`, `Fase 3-1: ${vazio(m.tensaoF31)}`],
      ['Tensão fase-neutro (V) — ref. 220V', `Fase 1: ${vazio(m.tensaoFN1)}`, `Fase 2: ${vazio(m.tensaoFN2)}`, `Fase 3: ${vazio(m.tensaoFN3)}`],
      ['Resistência de aterramento (ohms) — ref. máx. 10 ohms', { content: vazio(m.resistenciaAterramento), colSpan: 3 }],
      ['Tempo de atuação do DR (ms) — ref. máx. 300 ms', { content: vazio(m.tempoDR), colSpan: 3 }],
    ],
  });

  // ---- Não conformidades ----
  titulo('Não Conformidades Identificadas');
  const ncs = (dados.naoConformidades || []).filter((n) => n.descricao || n.norma || n.recomendacao);
  if (!ncs.length) {
    paragrafo('Nenhuma não conformidade registrada neste laudo.');
  } else {
    tabela({
      head: [['#', 'Descrição', 'Norma / Referência', 'Risco', 'Recomendação']],
      body: ncs.map((n, i) => [String(i + 1), vazio(n.descricao), vazio(n.norma), n.risco || '—', vazio(n.recomendacao)]),
      headStyles: { fillColor: [230, 230, 230], textColor: [0, 0, 0] },
      columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 2: { cellWidth: 32 }, 3: { cellWidth: 16, halign: 'center' } },
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 3 && d.cell.raw === 'Alto') { d.cell.styles.textColor = [176, 32, 32]; d.cell.styles.fontStyle = 'bold'; }
      },
    });
  }

  // ---- Oportunidades ----
  titulo('Oportunidades de Melhoria e Eficiência Energética');
  doc.setFontSize(8);
  OPORTUNIDADES_LAUDO.forEach((o) => {
    const linhas = doc.splitTextToSize(`• ${o}`, larguraUtil - 4);
    linhas.forEach((l, i) => { garantirEspaco(5); doc.text(l, MARGEM + (i ? 3 : 0), y); y += 3.8; });
  });
  y += 1;
  if (registro.estimativa_economia) {
    doc.setFont(undefined, 'bold'); doc.setFontSize(8.5);
    garantirEspaco(10);
    doc.text('Estimativa preliminar de economia:', MARGEM, y); y += 4.5;
    doc.setFont(undefined, 'normal');
    paragrafo(registro.estimativa_economia);
  }
  y += 2;

  // ---- Registro fotográfico (3 por linha) ----
  if (fotosPdf.length) {
    titulo('Registro Fotográfico');
    const gap = 4;
    const larguraFoto = (larguraUtil - 2 * gap) / 3;
    const alturaFoto = 42;
    doc.setFontSize(7.5);
    for (let i = 0; i < fotosPdf.length; i += 3) {
      const linha = fotosPdf.slice(i, i + 3);
      const legendas = linha.map((f, k) => doc.splitTextToSize(`Foto ${i + k + 1}${f.legenda ? ` — ${f.legenda}` : ''}`, larguraFoto).slice(0, 3));
      const linhasLegenda = Math.max(...legendas.map((l) => l.length));
      garantirEspaco(alturaFoto + linhasLegenda * 3.4 + 6);
      linha.forEach((f, k) => {
        const x = MARGEM + k * (larguraFoto + gap);
        doc.setDrawColor(...COR_LINHA);
        doc.setLineWidth(0.2);
        doc.rect(x, y, larguraFoto, alturaFoto);
        desenharImagemNaCaixa(doc, f.dataUrl, x + 0.5, y + 0.5, larguraFoto - 1, alturaFoto - 1, 'centro');
        doc.text(legendas[k], x, y + alturaFoto + 3.5);
      });
      y += alturaFoto + linhasLegenda * 3.4 + 5;
    }
    y += 1;
  }

  // ---- Parecer ----
  titulo('Parecer Técnico e Conclusão');
  tabela({
    columnStyles: { 0: { ...rotulo, cellWidth: 38 } },
    body: [
      ['Classificação do sistema', vazio(registro.parecer_classificacao)],
      ['Parecer descritivo', vazio(registro.parecer_descricao)],
    ],
  });

  // ---- Assinaturas ----
  garantirEspaco(44);
  titulo('Encerramento e Assinaturas');
  const larguraAss = (larguraUtil - 14) / 2;
  const caixas = [
    { x: MARGEM, imagem: assinResp, rotuloAss: 'Responsável técnico', nome: registro.responsavel_tecnico, data: registro.data_assinatura_responsavel },
    { x: MARGEM + larguraAss + 14, imagem: assinCli, rotuloAss: 'Cliente / representante', nome: '', data: registro.data_assinatura_cliente },
  ];
  const alturaAss = 22;
  caixas.forEach((c) => {
    if (c.imagem) desenharImagemNaCaixa(doc, c.imagem, c.x, y, larguraAss, alturaAss, 'centro');
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.3);
    doc.line(c.x, y + alturaAss + 1, c.x + larguraAss, y + alturaAss + 1);
    doc.setFontSize(8.5);
    doc.setFont(undefined, 'bold');
    doc.text(c.rotuloAss, c.x + larguraAss / 2, y + alturaAss + 5.5, { align: 'center' });
    doc.setFont(undefined, 'normal');
    let yTexto = y + alturaAss + 9.5;
    if (c.nome) { doc.text(c.nome, c.x + larguraAss / 2, yTexto, { align: 'center' }); yTexto += 4; }
    if (c.data) doc.text(`Data: ${formatarData(c.data)}`, c.x + larguraAss / 2, yTexto, { align: 'center' });
  });

  desenharRodape(doc);
  const nomeArquivo = `laudo-${registro.numero || 'novo'}-${(clienteNome || 'cliente').replace(/[^a-z0-9]+/gi, '-')}.pdf`;
  entregarPdf(doc, nomeArquivo, {
    mensagem: `Laudo Técnico${registro.numero ? ` ${registro.numero}` : ''} — RR Elétrica`,
    telefone: registro.celular || registro.telefone,
  });
}

// ---------- Helpers ----------

export function renderChecklist(items, valoresObj, dataGrupo) {
  return items.map(([id, label]) => `
    <label>${label}</label>
    <select data-grupo="${dataGrupo}" data-item="${id}" class="js-status">
      ${['', 'Conforme', 'Não conforme', 'N/A'].map((o) =>
        `<option value="${o}" ${(valoresObj[id] || '') === o ? 'selected' : ''}>${o || 'Selecione'}</option>`).join('')}
    </select>
  `).join('');
}

function val(v) { return v === undefined || v === null ? '' : String(v).replace(/"/g, '&quot;'); }
function formatarData(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = iso.split('-');
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
