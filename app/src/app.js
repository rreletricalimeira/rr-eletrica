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
        <button data-tab="categorias">Categorias</button>
        <button data-tab="unidades">Unidades</button>
        <button data-tab="colaboradores">Colaboradores</button>
        <button data-tab="backup">Backup</button>
      </nav>
      <main id="conteudo"></main>
    </div>
  `;

  const statusLine = document.getElementById('status-line');
  const conteudo = document.getElementById('conteudo');

  await initDb();
  statusLine.textContent = 'Banco local pronto.';

  await initAuth().catch((e) => { statusLine.textContent = e.message; });
  enableAutoBackup();

  const paginas = {
    clientes: renderClientes,
    fornecedores: renderFornecedores,
    produtos: renderProdutos,
    categorias: renderCategorias,
    unidades: renderUnidades,
    colaboradores: renderColaboradores,
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

boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
