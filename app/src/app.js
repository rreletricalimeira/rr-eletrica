import { initDb } from './db/db.js';
import {
  initAuth, signIn, isSignedIn, backupNow, restoreFromDrive,
  getLastBackupTime, setStatusListener, enableAutoBackup, NotConnectedError,
} from './db/backup.js';
import { hasPinConfigured, isUnlockedThisSession, renderLockScreen } from './auth-pin.js';

// ---------- Páginas do ERP ----------
import { renderClientes } from './pages/clientes.js';
import { renderFornecedores } from './pages/fornecedores.js';
import { renderProdutos } from './pages/produtos.js';
import { renderCategorias } from './pages/categorias.js';
import { renderUnidades } from './pages/unidades.js';
import { renderColaboradores } from './pages/colaboradores.js';
import { renderOS } from './pages/os.js';
import { renderFinanceiro } from './pages/financeiro.js';
import { renderTaxasCartao } from './pages/taxas_cartao.js';
import { renderContasCaixa } from './pages/contas_caixa.js';
import { renderVeiculos } from './pages/veiculos.js';
import { renderManutencaoVeiculo } from './pages/manutencao_veiculo.js';

// ---------- Páginas do Técnico ----------
import { renderLaudos } from './pages-tecnico/laudos.js';
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

  await initDb();
  statusLine.textContent = 'Banco local pronto.';

  await initAuth().catch((e) => { statusLine.textContent = e.message; });
  enableAutoBackup();

  // ---------- 3. Roteador de topo: tela inicial / ERP / Técnico ----------
  // A URL usa #/erp/<aba> e #/tecnico/<aba>, o que permite os atalhos do
  // manifest.json (shortcuts) abrirem direto numa das duas verticais.

  function irPara(rota) {
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
    os: renderOS,
    financeiro: renderFinanceiro,
    categorias: renderCategorias,
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
      <button data-tab="os">OS</button>
      <button data-tab="financeiro">Financeiro</button>
      <button data-tab="categorias">Categorias</button>
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
  }

  const paginasTecnico = {
    laudos: renderLaudos,
    visitas: renderVisitas,
    documentos: renderDocumentos,
  };

  function montarTecnico(aba) {
    tituloApp.textContent = 'RR Elétrica · Técnico';
    const abaAtual = aba && paginasTecnico[aba] ? aba : 'laudos';
    navTabs.style.display = '';
    navTabs.innerHTML = `
      <button data-tab="voltar" class="nav-voltar">← Início</button>
      <button data-tab="laudos">Laudos</button>
      <button data-tab="visitas">Visitas</button>
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
