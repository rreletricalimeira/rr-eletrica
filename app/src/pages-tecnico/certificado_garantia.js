import { all, run, persist } from '../db/db.js';
import { confirmarApp } from '../ui/dialogo.js';
import {
  carregarLogoBase64, desenharCabecalho, desenharRodape, MARGEM, COR_LINHA, COR_OURO,
} from '../ui/pdf_papel_timbrado.js';
import { entregarPdf } from '../ui/pdf_compartilhar.js';
import { carregarImagemDataUrl, assinaturaEscuraParaPdf, desenharImagemNaCaixa } from '../ui/pdf_imagens.js';

// ============================================================
// Certificado de Garantia (aba Documentos do Técnico)
//
// Escolhe-se a O.S. e o certificado se preenche sozinho: cliente,
// endereço, telefone (1º celular) e a lista de serviços (um por linha).
// Data de execução, local, data e responsável são editáveis.
//
// A assinatura da RR Elétrica é uma imagem do próprio app:
//   app/icons/assinatura-rr.png
// Se o arquivo não existir, o PDF sai com a linha de assinatura em branco.
// ============================================================

const URL_ASSINATURA_RR = './icons/assinatura-rr.png';
const RESPONSAVEL_PADRAO = 'Robinson Aguilera';
const SERVICO_MATERIAIS = 'Materiais e Equipamentos'; // linha criada pela conversão de Proposta em O.S.

const TEXTO_GARANTIA = [
  'A RR Elétrica oferece 90 (noventa) dias de garantia sobre a mão de obra dos serviços executados, contados a partir da data de conclusão do serviço indicada neste certificado.',
  'A garantia cobre falhas comprovadamente relacionadas à execução do serviço realizado pela RR Elétrica. Quando constatado que o problema decorre da mão de obra executada, o reparo correspondente será realizado sem cobrança adicional de mão de obra dentro do período de garantia.',
];
const TEXTO_MATERIAIS = [
  'Os materiais e equipamentos fornecidos pelo cliente possuem garantia conforme as condições estabelecidas pelo respectivo fabricante ou fornecedor.',
  'Defeitos de fabricação, queima ou falha desses produtos não fazem parte da garantia de 90 dias da mão de obra. Caso seja necessária a substituição ou reinstalação de um produto defeituoso, a eventual nova mão de obra poderá ser cobrada separadamente.',
];
const CONDICOES_INTRO = 'A garantia não se aplica a problemas decorrentes de:';
const CONDICOES_LISTA = [
  'Mau uso ou utilização inadequada;',
  'Intervenções, alterações ou reparos realizados por terceiros;',
  'Sobrecargas, curtos-circuitos ou condições anormais da rede elétrica;',
  'Oscilações ou surtos de tensão;',
  'Descargas atmosféricas;',
  'Acidentes, infiltrações, umidade ou outros fatores externos;',
  'Desgaste natural de componentes;',
  'Alterações realizadas na instalação após a execução do serviço;',
  'Falhas ou defeitos preexistentes que não façam parte do serviço contratado.',
];
const CONDICOES_FIM = [
  'A garantia será analisada mediante avaliação técnica da RR Elétrica, a fim de identificar a origem do problema e verificar sua relação com o serviço executado.',
  'Este certificado refere-se ao serviço descrito neste documento.',
];
const TEXTO_DECLARACAO = 'Ao receber este certificado, o cliente declara estar ciente das condições de garantia aqui estabelecidas.';

// ---------- Dados vindos da O.S. ----------

function listarOrdensDeServico() {
  return all(`
    SELECT os.id, os.data_abertura, c.nome as cliente_nome
    FROM os LEFT JOIN clientes c ON c.id = os.cliente_id
    WHERE COALESCE(os.tipo_registro, 'OS') = 'OS'
    ORDER BY os.id DESC
  `);
}

function primeiroNumero(texto) {
  return String(texto || '').split(/[\/,;]| e /)[0].trim();
}

function dadosDaOs(osId) {
  const os = all(`
    SELECT os.*, c.nome as cliente_nome, c.endereco as cli_endereco, c.bairro, c.cidade, c.uf,
           c.celular1, c.fone1
    FROM os LEFT JOIN clientes c ON c.id = os.cliente_id WHERE os.id = ?
  `, [osId])[0];
  if (!os) return null;

  const enderecoCliente = [os.cli_endereco, os.bairro, os.cidade, os.uf].filter(Boolean).join(', ');
  const servicos = all('SELECT descricao, valor_servico FROM os_servicos WHERE os_id = ? ORDER BY ordem, id', [osId])
    .filter((s) => !((s.descricao || '').trim() === SERVICO_MATERIAIS && !s.valor_servico))
    .map((s) => (s.descricao || '').trim())
    .filter(Boolean);
  // OS antiga, sem serviços cadastrados: usa o texto de descrição da própria OS.
  const linhasServico = servicos.length
    ? servicos
    : String(os.descricao || '').split('\n').map((l) => l.trim()).filter(Boolean);

  return {
    cliente_id: os.cliente_id,
    cliente_nome: os.cliente_nome || '',
    endereco: os.endereco || enderecoCliente,
    telefone: os.celular1 || primeiroNumero(os.telefone) || os.fone1 || '',
    data_execucao: os.data_conclusao ? String(os.data_conclusao).slice(0, 10) : '',
    servicos_texto: linhasServico.join('\n'),
  };
}

// ---------- Página ----------

export function renderCertificadosGarantia(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Certificado de Garantia</h2>
      <button id="btn-novo-certificado">+ Novo certificado</button>
      <ul id="lista-certificados" class="lista"></ul>
      <div id="form-certificado-wrap"></div>
    </div>
  `;

  const listaEl = container.querySelector('#lista-certificados');
  const formWrap = container.querySelector('#form-certificado-wrap');

  function renderLista() {
    const itens = all(`
      SELECT g.id, g.os_id, g.data_execucao, c.nome as cliente_nome
      FROM certificados_garantia g LEFT JOIN clientes c ON c.id = g.cliente_id
      ORDER BY g.id DESC
    `);
    listaEl.innerHTML = itens.map((g) => `
      <li data-id="${g.id}">
        <div class="item-principal">
          <strong>Garantia — ${escapeHtml(g.cliente_nome || 'Sem cliente')}</strong>
          <span class="item-sub">${g.os_id ? `O.S. ${g.os_id}` : 'Sem O.S.'}${g.data_execucao ? ` · executado em ${formatarData(g.data_execucao)}` : ''}</span>
        </div>
        <button class="btn-editar" data-id="${g.id}">Abrir</button>
      </li>
    `).join('') || '<li><em>Nenhum certificado emitido</em></li>';

    listaEl.querySelectorAll('.btn-editar').forEach((btn) => {
      btn.addEventListener('click', () => renderForm(Number(btn.dataset.id)));
    });
  }

  function renderForm(id = null) {
    const cert = id ? all('SELECT * FROM certificados_garantia WHERE id = ?', [id])[0] : {};
    let assinaturaCliente = (id && cert.assinatura_cliente_base64) || null;
    const ordens = listarOrdensDeServico();

    formWrap.innerHTML = `
      <div class="card form-card">
        <h3>${id ? 'Certificado de Garantia' : 'Novo Certificado de Garantia'}</h3>

        <label>Ordem de serviço / Nº *</label>
        <select id="f-os">
          <option value="">Selecione a O.S.</option>
          ${ordens.map((o) => `<option value="${o.id}" ${cert.os_id === o.id ? 'selected' : ''}>O.S. ${o.id} — ${escapeHtml(o.cliente_nome || 'Sem cliente')}${o.data_abertura ? ` — ${formatarData(String(o.data_abertura).slice(0, 10))}` : ''}</option>`).join('')}
        </select>

        <label>Cliente</label>
        <input id="f-cliente" type="text" class="auto-preenchido" readonly value="${val(id ? nomeCliente(cert.cliente_id) : '')}" />

        <label>Endereço do serviço</label>
        <input id="f-endereco" type="text" class="auto-preenchido" readonly value="${val(cert.endereco_servico)}" />

        <label>Telefone</label>
        <input id="f-telefone" type="text" class="auto-preenchido" readonly value="${val(cert.telefone)}" />

        <label>Data de execução *</label>
        <input id="f-data-execucao" type="date" value="${val(cert.data_execucao)}" />

        <label class="campo-full">Descrição do serviço</label>
        <textarea id="f-servicos" class="campo-full auto-preenchido" readonly>${escapeHtml(cert.servicos_texto || '')}</textarea>
      </div>

      <div class="card form-card">
        <h3>Declaração e assinaturas</h3>
        <label>Local</label>
        <input id="f-local" type="text" value="${val(id ? cert.local_emissao : '')}" />

        <label>Data</label>
        <input id="f-data-emissao" type="date" value="${val(id ? cert.data_emissao : hojeLocal())}" />

        <label>Responsável pelo serviço (RR Elétrica)</label>
        <input id="f-responsavel" type="text" value="${val(id ? cert.responsavel_nome : RESPONSAVEL_PADRAO)}" />

        <label class="campo-full">Assinatura do cliente</label>
        <div class="campo-full">
          <canvas class="assinatura-canvas" id="ass-cliente"></canvas>
          <button type="button" class="secondary" id="btn-limpar-ass-cliente">Limpar assinatura</button>
        </div>
      </div>

      <div class="card">
        <button id="btn-salvar-certificado">Salvar certificado</button>
        <button id="btn-cancelar-certificado" class="secondary">Cancelar</button>
        <button id="btn-exportar-certificado" class="secondary">Exportar PDF</button>
        ${id ? '<button id="btn-excluir-certificado" class="danger">Excluir</button>' : ''}
        <p id="form-erro" class="pin-erro"></p>
      </div>
    `;

    // Local: em certificado novo, acompanha o endereço enquanto a pessoa não digitou nada nele.
    let localEditadoNaMao = !!(id && cert.local_emissao);
    const localEl = formWrap.querySelector('#f-local');
    localEl.addEventListener('input', () => { localEditadoNaMao = true; });

    // ---- Escolha da O.S.: preenche tudo ----
    let clienteIdAtual = id ? cert.cliente_id : null;
    formWrap.querySelector('#f-os').addEventListener('change', (e) => {
      const osId = Number(e.target.value) || null;
      const d = osId ? dadosDaOs(osId) : null;
      clienteIdAtual = d ? d.cliente_id : null;
      formWrap.querySelector('#f-cliente').value = d ? d.cliente_nome : '';
      formWrap.querySelector('#f-endereco').value = d ? d.endereco : '';
      formWrap.querySelector('#f-telefone').value = d ? d.telefone : '';
      formWrap.querySelector('#f-servicos').value = d ? d.servicos_texto : '';
      if (d && d.data_execucao) formWrap.querySelector('#f-data-execucao').value = d.data_execucao;
      if (!localEditadoNaMao) localEl.value = d ? d.endereco : '';
    });

    // ---- Assinatura do cliente (canvas) ----
    const ctrlAss = configurarAssinatura(formWrap.querySelector('#ass-cliente'), assinaturaCliente, (v) => { assinaturaCliente = v; });
    formWrap.querySelector('#btn-limpar-ass-cliente').addEventListener('click', () => ctrlAss.limpar());

    function coletarRegistro() {
      return {
        os_id: Number(formWrap.querySelector('#f-os').value) || null,
        cliente_id: clienteIdAtual,
        endereco_servico: formWrap.querySelector('#f-endereco').value.trim(),
        telefone: formWrap.querySelector('#f-telefone').value.trim(),
        data_execucao: formWrap.querySelector('#f-data-execucao').value || null,
        servicos_texto: formWrap.querySelector('#f-servicos').value,
        local_emissao: localEl.value.trim(),
        data_emissao: formWrap.querySelector('#f-data-emissao').value || null,
        responsavel_nome: formWrap.querySelector('#f-responsavel').value.trim(),
        assinatura_cliente_base64: assinaturaCliente,
      };
    }

    function validar(registro) {
      if (!registro.os_id) return 'Escolha a ordem de serviço.';
      if (!registro.data_execucao) return 'Informe a data de execução do serviço.';
      return '';
    }

    formWrap.querySelector('#btn-cancelar-certificado').addEventListener('click', () => { formWrap.innerHTML = ''; });

    formWrap.querySelector('#btn-exportar-certificado').addEventListener('click', async () => {
      const erroEl = formWrap.querySelector('#form-erro');
      const registro = coletarRegistro();
      const erro = validar(registro);
      erroEl.textContent = erro;
      if (erro) return;
      const btn = formWrap.querySelector('#btn-exportar-certificado');
      btn.disabled = true;
      btn.textContent = 'Gerando PDF...';
      try {
        await gerarPdf({ registro, clienteNome: formWrap.querySelector('#f-cliente').value });
      } catch (e) {
        erroEl.textContent = 'Não foi possível gerar o PDF: ' + e.message;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Exportar PDF';
      }
    });

    if (id) {
      formWrap.querySelector('#btn-excluir-certificado').addEventListener('click', async () => {
        if (!(await confirmarApp('Excluir este certificado definitivamente?', { titulo: 'Excluir certificado', textoSim: 'Excluir', textoNao: 'Manter' }))) return;
        run('DELETE FROM certificados_garantia WHERE id = ?', [id]);
        await persist();
        formWrap.innerHTML = '';
        renderLista();
      });
    }

    formWrap.querySelector('#btn-salvar-certificado').addEventListener('click', async () => {
      const registro = coletarRegistro();
      const erro = validar(registro);
      formWrap.querySelector('#form-erro').textContent = erro;
      if (erro) return;
      if (id) {
        run(`UPDATE certificados_garantia SET os_id=?, cliente_id=?, endereco_servico=?, telefone=?, data_execucao=?,
             servicos_texto=?, local_emissao=?, data_emissao=?, responsavel_nome=?, assinatura_cliente_base64=? WHERE id=?`,
          [...Object.values(registro), id]);
      } else {
        const cols = Object.keys(registro).join(', ');
        const placeholders = Object.keys(registro).map(() => '?').join(', ');
        run(`INSERT INTO certificados_garantia (${cols}) VALUES (${placeholders})`, Object.values(registro));
      }
      await persist();
      formWrap.innerHTML = '';
      renderLista();
    });
  }

  container.querySelector('#btn-novo-certificado').addEventListener('click', () => renderForm(null));
  renderLista();
}

// ---------- Assinatura (canvas) ----------

function configurarAssinatura(canvas, valorInicial, aoMudar) {
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  if (valorInicial) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
    img.src = valorInicial;
  }
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
    if (desenhando) aoMudar(canvas.toDataURL('image/png'));
    desenhando = false;
  }));
  return { limpar: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); aoMudar(null); } };
}

// ---------- Exportação em PDF ----------

async function gerarPdf({ registro, clienteNome }) {
  const logo = await carregarLogoBase64();
  const assinaturaRR = await carregarImagemDataUrl(URL_ASSINATURA_RR);
  const assinaturaCli = await assinaturaEscuraParaPdf(registro.assinatura_cliente_base64);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const LIMITE_Y = H - 24;
  const larguraUtil = W - 2 * MARGEM;
  let y = desenharCabecalho(doc, logo, 'CERTIFICADO DE GARANTIA');
  y -= 3;

  const TAM = 8.6;
  const ALT_LINHA = 3.9;

  function garantirEspaco(altura) {
    if (y + altura > LIMITE_Y) { doc.addPage(); y = 16; }
  }
  function secao(texto) {
    garantirEspaco(16);
    y += 1.5;
    doc.setFont(undefined, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text(texto, MARGEM, y);
    doc.setDrawColor(...COR_OURO);
    doc.setLineWidth(0.4);
    doc.line(MARGEM, y + 1.4, W - MARGEM, y + 1.4);
    doc.setFont(undefined, 'normal');
    y += 5;
  }
  function paragrafo(texto, recuo = 0) {
    doc.setFontSize(TAM);
    doc.splitTextToSize(texto, larguraUtil - recuo).forEach((linha) => {
      garantirEspaco(ALT_LINHA + 1);
      doc.text(linha, MARGEM + recuo, y);
      y += ALT_LINHA;
    });
    y += 1.6;
  }
  function item(texto) {
    doc.setFontSize(TAM);
    const linhas = doc.splitTextToSize(texto, larguraUtil - 8);
    linhas.forEach((linha, i) => {
      garantirEspaco(ALT_LINHA + 1);
      if (i === 0) doc.text('•', MARGEM + 3, y);
      doc.text(linha, MARGEM + 7, y);
      y += ALT_LINHA;
    });
    y += 0.5;
  }

  // ---- Título ----
  doc.setFont(undefined, 'bold');
  doc.setFontSize(15);
  doc.text('CERTIFICADO DE GARANTIA', W / 2, y, { align: 'center' });
  doc.setFont(undefined, 'normal');
  y += 6;

  // ---- Dados do cliente ----
  secao('DADOS DO CLIENTE');
  const rotulo = { fontStyle: 'bold', fillColor: [230, 230, 230], cellWidth: 40 };
  doc.autoTable({
    startY: y,
    theme: 'grid',
    styles: { textColor: [0, 0, 0], lineColor: COR_LINHA, lineWidth: 0.2, fontSize: TAM, cellPadding: 1.4 },
    margin: { left: MARGEM, right: MARGEM, bottom: 24 },
    columnStyles: { 0: rotulo, 1: { cellWidth: 'auto' }, 2: { ...rotulo, cellWidth: 34 }, 3: { cellWidth: 36 } },
    body: [
      ['Cliente', { content: clienteNome || '—', colSpan: 3 }],
      ['Endereço do serviço', { content: registro.endereco_servico || '—', colSpan: 3 }],
      ['Telefone', registro.telefone || '—', 'Data de execução', formatarData(registro.data_execucao) || '—'],
      ['Ordem de serviço / Nº', { content: registro.os_id ? `O.S. ${registro.os_id}` : '—', colSpan: 3 }],
    ],
  });
  y = doc.lastAutoTable.finalY + 3;

  // ---- Descrição do serviço (um serviço por linha) ----
  secao('DESCRIÇÃO DO SERVIÇO');
  const linhasServico = String(registro.servicos_texto || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (linhasServico.length) linhasServico.forEach((l) => item(l));
  else paragrafo('—');

  // ---- Textos fixos ----
  secao('GARANTIA');
  TEXTO_GARANTIA.forEach((t) => paragrafo(t));

  secao('MATERIAIS E EQUIPAMENTOS');
  TEXTO_MATERIAIS.forEach((t) => paragrafo(t));

  secao('CONDIÇÕES DA GARANTIA');
  paragrafo(CONDICOES_INTRO);
  CONDICOES_LISTA.forEach((c) => item(c));
  y += 1;
  CONDICOES_FIM.forEach((t) => paragrafo(t));

  secao('DECLARAÇÃO');
  paragrafo(TEXTO_DECLARACAO);

  // ---- Local e data ----
  garantirEspaco(58);
  doc.setFontSize(TAM + 0.4);
  const local = registro.local_emissao || registro.endereco_servico || '';
  const dataTxt = formatarData(registro.data_emissao);
  const linhasLocal = doc.splitTextToSize(`Local: ${local || '—'}`, larguraUtil - 52);
  doc.text(linhasLocal, MARGEM, y);
  doc.text(`Data: ${dataTxt || '—'}`, W - MARGEM, y, { align: 'right' });
  y += linhasLocal.length * ALT_LINHA + 4;

  // ---- Assinaturas ----
  const larguraAss = (larguraUtil - 16) / 2;
  const alturaAss = 20;
  const colunas = [
    { x: MARGEM, imagem: assinaturaRR, linhas: [['RR ELÉTRICA', true], ['Responsável pelo serviço', false], [registro.responsavel_nome || '', false]] },
    { x: MARGEM + larguraAss + 16, imagem: assinaturaCli, linhas: [['CLIENTE', true], ['Assinatura', false]] },
  ];
  colunas.forEach((c) => {
    if (c.imagem) desenharImagemNaCaixa(doc, c.imagem, c.x, y, larguraAss, alturaAss, 'centro');
    doc.setDrawColor(80, 80, 80);
    doc.setLineWidth(0.3);
    doc.line(c.x, y + alturaAss + 1, c.x + larguraAss, y + alturaAss + 1);
    let yt = y + alturaAss + 5.5;
    c.linhas.forEach(([texto, negrito]) => {
      if (!texto) return;
      doc.setFont(undefined, negrito ? 'bold' : 'normal');
      doc.setFontSize(TAM + 0.4);
      doc.text(texto, c.x + larguraAss / 2, yt, { align: 'center' });
      yt += 4.2;
    });
  });
  doc.setFont(undefined, 'normal');

  desenharRodape(doc);
  entregarPdf(doc, `certificado-garantia-${registro.os_id ? `OS${registro.os_id}-` : ''}${(clienteNome || 'cliente').replace(/[^a-z0-9]+/gi, '-')}.pdf`, {
    mensagem: 'Certificado de Garantia — RR Elétrica',
    telefone: registro.telefone,
  });
}

// ---------- Helpers ----------

function nomeCliente(clienteId) {
  if (!clienteId) return '';
  const c = all('SELECT nome FROM clientes WHERE id = ?', [clienteId])[0];
  return c ? c.nome : '';
}
function hojeLocal() {
  const d = new Date();
  const dois = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}
function val(v) { return v === undefined || v === null ? '' : String(v).replace(/"/g, '&quot;'); }
function formatarData(iso) {
  if (!iso) return '';
  const [ano, mes, dia] = String(iso).split('-');
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
