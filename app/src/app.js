import { initDb } from './db/db.js';
import {
  initAuth, signIn, isSignedIn, backupNow, restoreFromDrive,
  getLastBackupTime, setStatusListener, enableAutoBackup, NotConnectedError,
} from './db/backup.js';
import { hasPinConfigured, isUnlockedThisSession, renderLockScreen } from './auth-pin.js';
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
        <h1>RR Elétrica</h1>
        <div>
          <div id="status-line" class="status-line">Inicializando...</div>
        </div>
      </div>
      <nav class="tabs">
        <button data-tab="clientes" class="ativo">Clientes</button>
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
      </nav>
      <main id="conteudo"></main>
    </div>
  `;

  const statusLine = document.getElementById('status-line');
  const conteudo = document.getElementById('conteudo');

  // No grid multi-coluna do desktop (ver style.css), cada <label> e cada
  // campo viram células separadas da grade — então o label de um campo pode
  // acabar ao lado do campo anterior, em vez de ficar preso em cima do seu
  // próprio campo. Para consertar sem reescrever cada formulário, agrupamos
  // automaticamente cada <label> com o campo que vem logo em seguida dentro
  // de uma <div class="campo">, que passa a ser a célula da grade. Isso roda
  // toda vez que uma página/formulário é renderizado dentro de #conteudo.
  agruparCampos(conteudo);
  new MutationObserver(() => agruparCampos(conteudo))
    .observe(conteudo, { childList: true, subtree: true });

  await initDb();
  statusLine.textContent = 'Banco local pronto.';

  await initAuth().catch((e) => { statusLine.textContent = e.message; });
  enableAutoBackup();

  const paginas = {
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

  document.querySelectorAll('nav.tabs button').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('nav.tabs button').forEach((b) => b.classList.remove('ativo'));
      btn.classList.add('ativo');
      paginas[btn.dataset.tab](conteudo);
    });
  });

  paginas.clientes(conteudo);

  // ---------- 3. Página de Backup, com avisos claros de conexão ----------

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

// ---------- 4. Agrupa cada <label> com o campo seguinte (ver comentário acima) ----------

function agruparCampos(root) {
  root.querySelectorAll('.form-card').forEach((form) => {
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
