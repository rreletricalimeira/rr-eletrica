import { initDb } from './db/db.js';
import {
  initAuth, signIn, isSignedIn, backupNow, restoreFromDrive, trySilentSignIn,
  getLastBackupTime, setStatusListener, enableAutoBackup, NotConnectedError,
} from './db/backup.js';
import { hasPinConfigured, isUnlockedThisSession, renderLockScreen } from './auth-pin.js';
import { confirmarApp } from './ui/dialogo.js';
import { produtosAbaixoDoEstoque, abrirAlertaEstoque } from './ui/estoque_alerta.js';

// ---------- Páginas do ERP ----------
import { renderClientes } from './pages/clientes.js';
import { renderFornecedores } from './pages/fornecedores.js';
import { renderProdutos } from './pages/produtos.js';
import { renderCategorias } from './pages/categorias.js';
import { renderUnidades } from './pages/unidades.js';
import { renderColaboradores } from './pages/colaboradores.js';
import { renderOS } from './pages/os.js';
import { renderCompras } from './pages/compras.js';
import { renderAgenda } from './pages/agenda.js';
import { renderSegmentos } from './pages/segmentos.js';
import { renderCategoriasFinanceiro } from './pages/categorias_financeiro.js';
import { renderFinanceiro } from './pages/financeiro.js';
import { renderTaxasCartao } from './pages/taxas_cartao.js';
import { renderContasCaixa } from './pages/contas_caixa.js';
import { renderVeiculos } from './pages/veiculos.js';
import { renderManutencaoVeiculo } from './pages/manutencao_veiculo.js';

// ---------- Páginas do Técnico ----------
import { renderLaudos } from './pages-tecnico/laudos.js';
import { renderLaudoAterramento } from './pages-tecnico/laudo_aterramento.js';
import { renderPropostaTecnica } from './pages-tecnico/proposta_tecnica.js';
import { renderManuais } from './pages-tecnico/manuais.js';
import { renderVisitas } from './pages-tecnico/visitas.js';
import { renderDocumentos } from './pages-tecnico/documentos.js';

const appEl = document.getElementById('app');

// ---------- 1. Tela de bloqueio (PIN) sempre primeiro ----------

function boot() {
  if (!isUnlockedThisSession()) {
    renderLockScreen(appEl, iniciarApp);
  } else {
    iniciarApp();
  }
}

// ---------- 2. App principal ----------

async function iniciarApp() {
  appEl.innerHTML = `
    <div class="app-shell">
      <div class="topbar">
        <h1 id="titulo-app">RR Elétrica</h1>
        <div>
          <div id="status-line" class="status-line">Inicializando...</div>
        </div>
      </div>
      <nav class="tabs" id="nav-tabs"></nav>
      <main id="conteudo"></main>
    </div>
  `;

  const tituloApp = document.getElementById('titulo-app');
  const statusLine = document.getElementById('status-line');
  const navTabs = document.getElementById('nav-tabs');
  const conteudo = document.getElementById('conteudo');

  // No grid multi-coluna do desktop (ver style.css), cada <label> e cada
  // campo viram células separadas da grade — então o label de um campo pode
  // acabar ao lado do campo anterior, em vez de ficar preso em cima do seu
  // próprio campo. Para consertar sem reescrever cada formulário, agrupamos
  // automaticamente cada <label> com o campo que vem logo em seguida dentro
  // de uma <div class="campo">, que passa a ser a célula da grade. Isso roda
  // toda vez que uma página/formulário é renderizado dentro de #conteudo —
  // tanto do ERP quanto do Técnico, já que os dois usam o mesmo #conteudo.
  agruparCampos(conteudo);
  new MutationObserver(() => agruparCampos(conteudo))
    .observe(conteudo, { childList: true, subtree: true });

  // ---------- Aviso de dados não salvos ao trocar de página ----------
  // Marca a página atual como "suja" (tem digitação não salva) sempre que o
  // usuário mexe em qualquer campo dentro de #conteudo — funciona para
  // qualquer formulário do ERP ou do Técnico, sem precisar mexer em cada
  // página. A marca é limpa quando os dados são realmente salvos (evento
  // disparado pelo persist() em db.js) ou quando o próprio formulário é
  // cancelado (botões "btn-cancelar..."). irPara() é o único lugar que troca
  // de rota no app, então é ali que perguntamos antes de descartar.
  let paginaSuja = false;
  conteudo.addEventListener('input', () => { paginaSuja = true; });
  conteudo.addEventListener('change', () => { paginaSuja = true; });
  conteudo.addEventListener('click', (e) => {
    const id = e.target && e.target.id;
    if (id && id.startsWith('btn-cancelar')) paginaSuja = false;
  });
  window.addEventListener('rr-dados-salvos', () => { paginaSuja = false; });
  window.addEventListener('beforeunload', (e) => {
    if (!paginaSuja) return;
    e.preventDefault();
    e.returnValue = '';
  });

  // Balão de confirmação no padrão do app (ver ui/dialogo.js), em vez do
  // confirm() nativo do navegador.
  async function confirmarSairSemSalvar() {
    if (!paginaSuja) return true;
    return confirmarApp(
      'Você preencheu dados nesta página e ainda não salvou. Se sair agora, eles serão perdidos. Deseja sair mesmo assim?',
      { titulo: 'Dados não salvos', textoSim: 'Sair mesmo assim', textoNao: 'Continuar editando' },
    );
  }

  await initDb();
  statusLine.textContent = 'Banco local pronto.';

  await initAuth().catch((e) => { statusLine.textContent = e.message; });
  trySilentSignIn(); // login automático no Drive/Agenda, se já conectou antes
  enableAutoBackup();

  // ---------- 3. Roteador de topo: tela inicial / ERP / Técnico ----------
  // A URL usa #/erp/<aba> e #/tecnico/<aba>, o que permite os atalhos do
  // manifest.json (shortcuts) abrirem direto numa das duas verticais.

  async function irPara(rota) {
    if (!(await confirmarSairSemSalvar())) return;
    paginaSuja = false;
    location.hash = rota;
  }

  function renderRota() {
    const hash = location.hash.replace(/^#\/?/, '');
    if (hash.startsWith('erp')) {
      montarERP(hash.split('/')[1]);
    } else if (hash.startsWith('tecnico')) {
      montarTecnico(hash.split('/')[1]);
    } else {
      montarHome();
    }
  }

  function montarHome() {
    tituloApp.textContent = 'RR Elétrica';
    navTabs.style.display = 'none';
    navTabs.innerHTML = '';
    conteudo.innerHTML = `
      <div class="home-verticais">
        <button type="button" class="card-vertical" id="btn-ir-erp">
          <span class="home-icone">🗂️</span>
          <span class="home-titulo">ERP</span>
          <span class="home-desc">Clientes, ordens de serviço, financeiro, estoque e veículos</span>
        </button>
        <button type="button" class="card-vertical" id="btn-ir-tecnico">
          <span class="home-icone">🛠️</span>
          <span class="home-titulo">Técnico</span>
          <span class="home-desc">Laudos técnicos, visitas e documentos em campo</span>
        </button>
      </div>
    `;
    conteudo.querySelector('#btn-ir-erp').addEventListener('click', () => irPara('#/erp/clientes'));
    conteudo.querySelector('#btn-ir-tecnico').addEventListener('click', () => irPara('#/tecnico/laudos'));
  }

  function ativarAba(aba) {
    navTabs.querySelectorAll('button[data-tab]').forEach((b) => {
      b.classList.toggle('ativo', b.dataset.tab === aba);
    });
  }

  const paginasErp = {
    clientes: renderClientes,
    fornecedores: renderFornecedores,
    produtos: renderProdutos,
    agenda: renderAgenda,
    compras: renderCompras,
    os: renderOS,
    financeiro: renderFinanceiro,
    categorias: renderCategorias,
    segmentos: renderSegmentos,
    categorias_financeiro: renderCategoriasFinanceiro,
    unidades: renderUnidades,
    colaboradores: renderColaboradores,
    taxas_cartao: renderTaxasCartao,
    contas_caixa: renderContasCaixa,
    veiculos: renderVeiculos,
    manutencao: renderManutencaoVeiculo,
    backup: renderBackupPage,
  };

  function montarERP(aba) {
    tituloApp.textContent = 'RR Elétrica · ERP';
    const abaAtual = aba && paginasErp[aba] ? aba : 'clientes';
    navTabs.style.display = '';
    navTabs.innerHTML = `
      <button data-tab="voltar" class="nav-voltar">← Início</button>
      <button data-tab="clientes">Clientes</button>
      <button data-tab="fornecedores">Fornecedores</button>
      <button data-tab="produtos">Produtos</button>
      <button data-tab="compras">Compras</button>
      <button data-tab="os">OS</button>
      <button data-tab="agenda">Agenda</button>
      <button data-tab="financeiro">Financeiro</button>
      <button data-tab="categorias">Categoria de Produtos</button>
      <button data-tab="segmentos">Segmentos</button>
      <button data-tab="categorias_financeiro">Categoria do Financeiro</button>
      <button data-tab="unidades">Unidades</button>
      <button data-tab="colaboradores">Colaboradores</button>
      <button data-tab="taxas_cartao">Taxas Cartão</button>
      <button data-tab="contas_caixa">Contas/Caixa</button>
      <button data-tab="veiculos">Veículos</button>
      <button data-tab="manutencao">Manutenção</button>
      <button data-tab="backup">Backup</button>
    `;
    ativarAba(abaAtual);
    navTabs.querySelectorAll('button[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tab === 'voltar') { irPara(''); return; }
        irPara(`#/erp/${btn.dataset.tab}`);
      });
    });
    paginasErp[abaAtual](conteudo);

    // Alerta de produtos abaixo do estoque mínimo: selo na aba Produtos e,
    // uma vez por sessão, a janela com a tabela dos produtos.
    const abaixo = produtosAbaixoDoEstoque();
    if (abaixo.length) {
      const abaProdutos = navTabs.querySelector('button[data-tab="produtos"]');
      abaProdutos.innerHTML = `Produtos <span class="badge-alerta" title="Produtos abaixo do estoque mínimo">⚠ ${abaixo.length}</span>`;
      if (!sessionStorage.getItem('rr-alerta-estoque-visto')) {
        sessionStorage.setItem('rr-alerta-estoque-visto', '1');
        abrirAlertaEstoque({ onVerProdutos: () => irPara('#/erp/produtos') });
      }
    }
  }

  const paginasTecnico = {
    laudos: renderLaudos,
    aterramento: renderLaudoAterramento,
    proposta: renderPropostaTecnica,
    visitas: renderVisitas,
    manuais: renderManuais,
    documentos: renderDocumentos,
  };

  function montarTecnico(aba) {
    tituloApp.textContent = 'RR Elétrica · Técnico';
    const abaAtual = aba && paginasTecnico[aba] ? aba : 'laudos';
    navTabs.style.display = '';
    navTabs.innerHTML = `
      <button data-tab="voltar" class="nav-voltar">← Início</button>
      <button data-tab="laudos">Laudos</button>
      <button data-tab="aterramento">Aterramento</button>
      <button data-tab="proposta">Proposta</button>
      <button data-tab="visitas">Visitas</button>
      <button data-tab="manuais">Manuais</button>
      <button data-tab="documentos">Documentos</button>
    `;
    ativarAba(abaAtual);
    navTabs.querySelectorAll('button[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tab === 'voltar') { irPara(''); return; }
        irPara(`#/tecnico/${btn.dataset.tab}`);
      });
    });
    paginasTecnico[abaAtual](conteudo);
  }

  window.addEventListener('hashchange', renderRota);
  renderRota();

  // ---------- 4. Página de Backup, com avisos claros de conexão ----------

  function renderBackupPage(container) {
    container.innerHTML = `
      <div class="page">
        <h2>Backup no Google Drive</h2>
        <div class="card">
          <p id="backup-conexao" class="status-line"></p>
          <p id="backup-ultimo" class="status-line"></p>
          <button id="btn-login-backup" class="secondary">Conectar ao Google</button>
          <button id="btn-fazer-backup">Fazer backup agora</button>
          <button id="btn-restaurar-backup" class="secondary">Restaurar último backup</button>
          <p id="backup-aviso" class="pin-erro"></p>
        </div>
      </div>
    `;

    function atualizarStatusConexao() {
      container.querySelector('#backup-conexao').textContent = isSignedIn()
        ? 'Conectado ao Google ✔'
        : '⚠ Não conectado ao Google — backup e restauração não vão funcionar até conectar.';
      const t = getLastBackupTime();
      container.querySelector('#backup-ultimo').textContent = t
        ? `Último backup: ${new Date(t).toLocaleString('pt-BR')}`
        : 'Nenhum backup feito ainda.';
    }
    atualizarStatusConexao();

    container.querySelector('#btn-login-backup').addEventListener('click', () => signIn());

    container.querySelector('#btn-fazer-backup').addEventListener('click', async () => {
      const avisoEl = container.querySelector('#backup-aviso');
      avisoEl.style.color = '';
      try {
        await backupNow();
        avisoEl.style.color = '#22c55e';
        avisoEl.textContent = 'Backup salvo no Drive com sucesso ✔';
      } catch (e) {
        if (e instanceof NotConnectedError) {
          avisoEl.textContent = e.message;
        } else {
          avisoEl.textContent = 'Erro ao fazer backup: ' + e.message;
        }
      }
      atualizarStatusConexao();
    });

    container.querySelector('#btn-restaurar-backup').addEventListener('click', async () => {
      const avisoEl = container.querySelector('#backup-aviso');
      avisoEl.style.color = '';
      if (!isSignedIn()) {
        avisoEl.textContent = 'Você não está conectado ao Google. Toque em "Conectar ao Google" antes de restaurar — sem isso, nada é restaurado.';
        return;
      }
      if (!confirm('Isso vai substituir os dados locais pelos do último backup no Drive. Continuar?')) return;
      try {
        await restoreFromDrive();
        avisoEl.style.color = '#22c55e';
        avisoEl.textContent = 'Restaurado com sucesso ✔ Recarregando...';
        setTimeout(() => location.reload(), 1200);
      } catch (e) {
        if (e instanceof NotConnectedError) {
          avisoEl.textContent = e.message;
        } else {
          avisoEl.textContent = 'Erro ao restaurar: ' + e.message;
        }
      }
      atualizarStatusConexao();
    });

    setStatusListener((event) => {
      atualizarStatusConexao();
    });
  }
}

// ---------- 5. Agrupa cada <label> com o campo seguinte (ver comentário acima) ----------

function agruparCampos(root) {
  root.querySelectorAll('.form-card, .filtros-financeiro').forEach((form) => {
    Array.from(form.children).forEach((label) => {
      // Só mexe em <label> "soltos"; os que já têm classe linha-checkbox
      // (ex.: "Tanque cheio") já envolvem o próprio input e ficam intactos.
      if (label.tagName !== 'LABEL' || label.classList.contains('linha-checkbox')) return;

      const campo = document.createElement('div');
      campo.className = 'campo';
      form.insertBefore(campo, label);
      campo.appendChild(label);

      const proximo = campo.nextElementSibling;
      if (proximo && ['INPUT', 'SELECT', 'TEXTAREA'].includes(proximo.tagName)) {
        if (proximo.tagName === 'TEXTAREA') campo.classList.add('campo-full');
        campo.appendChild(proximo);
      } else if (proximo && proximo.tagName === 'DIV') {
        // Ex.: label "Foto do produto" seguida da div com os botões de foto —
        // não é um campo de formulário comum, mas ainda assim precisa ficar
        // colado no label, ocupando a linha inteira (senão sobra um espaço
        // vazio ao lado do label na grade do desktop).
        campo.classList.add('campo-full');
        campo.appendChild(proximo);
      }
    });
  });
}

boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
