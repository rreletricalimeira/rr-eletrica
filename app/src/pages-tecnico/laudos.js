import { all, run, persist } from '../db/db.js';

// ============================================================
// Laudo Técnico de Diagnóstico — Casa de Máquinas
// Estrutura de checklist e blocos repetíveis já validados no preview
// (laudo-tecnico-preview.html). Aqui a mesma lógica passa a ler/gravar
// no banco compartilhado (tabela `laudos`, ver schema.sql).
// ============================================================

const PAINEL_ITEMS = [
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

const BOMBA_ITEMS = [
  ['placa', 'Placa de identificação legível (potência, corrente nominal)'],
  ['ruido', 'Ruído e vibração dentro do normal'],
  ['temp_carcaca', 'Temperatura de carcaça dentro do normal'],
  ['alinhamento', 'Alinhamento motor-bomba adequado'],
  ['vazamento', 'Ausência de vazamentos no selo mecânico'],
  ['corrente_nominal', 'Corrente medida compatível com nominal (±10%)'],
  ['aterramento_motor', 'Aterramento da carcaça do motor'],
];

const INVERSOR_ITEM_TRIGGER = ['inversor_instalado', 'Inversor já instalado no sistema'];
const INVERSOR_ITEMS_DEMAIS = [
  ['parametrizacao', 'Parametrização atual adequada à aplicação'],
  ['ventilacao_inversor', 'Ventilação/dissipação do inversor adequada'],
  ['compatibilidade', 'Compatibilidade do motor com acionamento por inversor'],
  ['oportunidade_inversor', 'Oportunidade identificada para instalação de inversor'],
];

const AMBIENTE_ITEMS = [
  ['ventilacao_ambiente', 'Ventilação adequada da casa de máquinas'],
  ['umidade', 'Ausência de umidade excessiva/infiltração'],
  ['zonas_protecao', 'Respeito às zonas de proteção (volumes 0/1/2 - NBR 10339)'],
  ['selv', 'Uso de equipamentos SELV em áreas molhadas quando exigido'],
  ['piso_drenagem', 'Piso e drenagem em condições seguras'],
  ['extintor', 'Extintor de incêndio presente e válido'],
];

function novaBomba(n) { return { nome: `Bomba/Motor ${n}`, itens: {}, inversor: {} }; }
function novoMotorMedicao(n) { return { nome: `Motor ${n}`, corrente: '', temperatura: '' }; }
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
      motores: [novoMotorMedicao(1)],
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
        <input id="f-numero" type="text" value="${val(laudo.numero)}" />

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
          <li>NR-10 – Segurança em Instalações e Serviços em Eletricidade</li>
          <li>NR-12 – Segurança no Trabalho em Máquinas e Equipamentos</li>
          <li>ABNT NBR 5410 – Instalações elétricas de baixa tensão</li>
          <li>ABNT NBR 10339 – Piscinas: Instalações elétricas e hidráulicas</li>
          <li>Classificação de zonas para áreas molhadas / piscinas (volumes 0, 1 e 2), exigências de SELV e grau de proteção IP</li>
          <li>ABNT NBR 5419 – Proteção contra descargas atmosféricas (quando aplicável)</li>
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
        <h3>Medições por Motor</h3>
        <p class="item-sub">Pode haver um ou mais motores — adicione um bloco de medição para cada um.</p>
        <div id="lista-motores"></div>
        <button type="button" id="btn-add-motor" class="secondary">+ Adicionar motor</button>
      </div>

      <div class="card">
        <h3>Não Conformidades Identificadas</h3>
        <div id="lista-nc"></div>
        <button type="button" id="btn-add-nc" class="secondary">+ Adicionar não conformidade</button>
      </div>

      <div class="card form-card">
        <h3>Oportunidades de Melhoria e Eficiência Energética</h3>
        <ul class="campo-full item-sub" style="margin-top:0; padding-left:18px;">
          <li>Instalação de inversores de frequência para controle de vazão e redução de consumo energético</li>
          <li>Substituição de contatores/disjuntores por modelos com maior vida útil</li>
          <li>Melhoria de aterramento e proteção contra surtos</li>
          <li>Atualização de sinalização e identificação conforme NR-10/NR-12</li>
          <li>Programa de manutenção preventiva periódica</li>
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
        <button id="btn-imprimir-laudo" class="secondary">Imprimir / Exportar PDF</button>
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
          ${renderChecklist(BOMBA_ITEMS, b.itens, `bomba-${i}`)}
          <h4 class="campo-full">Inversor de frequência</h4>
          ${renderInversorItens(b, i)}
        </div>
      `).join('');

      wrap.querySelectorAll('.subcard').forEach((sub) => {
        const idx = Number(sub.dataset.idx);
        sub.querySelector('.bomba-nome').addEventListener('input', (e) => { dados.bombas[idx].nome = e.target.value; });
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

      formWrap.querySelector('#btn-add-bomba').addEventListener('click', () => {
        dados.bombas.push(novaBomba(dados.bombas.length + 1));
        renderBombas();
      });
    }

    function renderInversorItens(bomba, idx) {
      const statusInstalado = bomba.inversor[INVERSOR_ITEM_TRIGGER[0]] || '';
      const gatilho = renderChecklist([INVERSOR_ITEM_TRIGGER], bomba.inversor, `bomba-${idx}-inv`);
      if (statusInstalado === 'Não conforme') {
        const oportunidade = INVERSOR_ITEMS_DEMAIS.filter(([itemId]) => itemId === 'oportunidade_inversor');
        return gatilho + renderChecklist(oportunidade, bomba.inversor, `bomba-${idx}-inv`);
      }
      return gatilho + renderChecklist(INVERSOR_ITEMS_DEMAIS, bomba.inversor, `bomba-${idx}-inv`);
    }

    // ---- Medição por motor ----
    function renderMotoresMedicao() {
      const wrap = formWrap.querySelector('#lista-motores');
      wrap.innerHTML = dados.medicoes.motores.map((m, i) => `
        <div class="subcard form-card" data-idx="${i}">
          <div class="subcard-titulo campo-full">
            <input type="text" class="motor-nome" value="${val(m.nome)}" style="max-width:220px" />
            ${dados.medicoes.motores.length > 1 ? '<button type="button" class="danger btn-remover-motor" style="margin:0">Remover</button>' : ''}
          </div>
          <label>Corrente medida (A)</label><input type="text" class="motor-corrente" value="${val(m.corrente)}" />
          <label>Temperatura de carcaça (°C)</label><input type="text" class="motor-temperatura" value="${val(m.temperatura)}" />
        </div>
      `).join('');

      wrap.querySelectorAll('.subcard').forEach((sub) => {
        const idx = Number(sub.dataset.idx);
        sub.querySelector('.motor-nome').addEventListener('input', (e) => { dados.medicoes.motores[idx].nome = e.target.value; });
        sub.querySelector('.motor-corrente').addEventListener('input', (e) => { dados.medicoes.motores[idx].corrente = e.target.value; });
        sub.querySelector('.motor-temperatura').addEventListener('input', (e) => { dados.medicoes.motores[idx].temperatura = e.target.value; });
        const btnRemover = sub.querySelector('.btn-remover-motor');
        if (btnRemover) btnRemover.addEventListener('click', () => { dados.medicoes.motores.splice(idx, 1); renderMotoresMedicao(); });
      });

      formWrap.querySelector('#btn-add-motor').addEventListener('click', () => {
        dados.medicoes.motores.push(novoMotorMedicao(dados.medicoes.motores.length + 1));
        renderMotoresMedicao();
      });
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
        ctx.strokeStyle = '#e2e8f0';
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
    renderMotoresMedicao();
    renderNaoConformidades();
    renderFotos();

    // ---- Ações ----
    formWrap.querySelector('#btn-cancelar-laudo').addEventListener('click', () => { formWrap.innerHTML = ''; });
    formWrap.querySelector('#btn-imprimir-laudo').addEventListener('click', () => window.print());

    if (id) {
      formWrap.querySelector('#btn-excluir-laudo').addEventListener('click', async () => {
        if (!confirm('Excluir este laudo definitivamente?')) return;
        run('DELETE FROM laudos WHERE id = ?', [id]);
        await persist();
        formWrap.innerHTML = '';
        renderLista();
      });
    }

    formWrap.querySelector('#btn-salvar-laudo').addEventListener('click', async () => {
      const cliente_id = Number(formWrap.querySelector('#f-cliente').value) || null;
      if (!cliente_id) {
        formWrap.querySelector('#form-erro').textContent = 'Selecione um cliente.';
        return;
      }

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

      const registro = {
        numero: formWrap.querySelector('#f-numero').value.trim() || null,
        cliente_id,
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

// ---------- Helpers ----------

function renderChecklist(items, valoresObj, dataGrupo) {
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
