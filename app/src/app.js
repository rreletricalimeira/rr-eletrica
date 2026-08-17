import { initDb, all, run, persist } from './db/db.js';
import { initAuth, signIn, isSignedIn, backupNow, restoreFromDrive, getLastBackupTime, setStatusListener, enableAutoBackup } from './db/backup.js';

const statusEl = document.getElementById('status');
const listEl = document.getElementById('clientes-lista');
const lastBackupEl = document.getElementById('ultimo-backup');

function setStatus(msg) {
  statusEl.textContent = msg;
}

setStatusListener((event, detail) => {
  const mensagens = {
    conectado: 'Conectado ao Google ✔',
    enviando: 'Enviando backup...',
    backup_ok: 'Backup salvo no Drive ✔',
    restaurando: 'Restaurando do Drive...',
    restaurado: 'Restaurado com sucesso ✔ — recarregando...',
    erro: `Erro: ${detail}`,
  };
  setStatus(mensagens[event] || event);
  atualizarUltimoBackup();
  if (event === 'restaurado') {
    setTimeout(() => location.reload(), 1200);
  }
});

function atualizarUltimoBackup() {
  const t = getLastBackupTime();
  lastBackupEl.textContent = t ? `Último backup: ${new Date(t).toLocaleString('pt-BR')}` : 'Nenhum backup ainda';
}

function renderClientes() {
  const clientes = all('SELECT id, nome, tipo_cliente, cidade FROM clientes ORDER BY id DESC');
  listEl.innerHTML = clientes
    .map((c) => `<li>#${c.id} — ${c.nome} (${c.tipo_cliente || '-'}) — ${c.cidade || '-'}</li>`)
    .join('') || '<li><em>Nenhum cliente cadastrado ainda</em></li>';
}

async function main() {
  setStatus('Inicializando banco local...');
  await initDb();
  renderClientes();
  setStatus('Pronto — banco local funcionando offline.');
  atualizarUltimoBackup();

  await initAuth().catch((e) => setStatus(e.message));
  enableAutoBackup();

  // ---- teste rápido: cadastrar cliente de exemplo ----
  document.getElementById('btn-add-teste').addEventListener('click', async () => {
    const nome = document.getElementById('input-nome').value.trim();
    if (!nome) return;
    run('INSERT INTO clientes (nome, tipo_cliente, cidade) VALUES (?, ?, ?)', [nome, 'Residencial', 'Limeira']);
    await persist();
    document.getElementById('input-nome').value = '';
    renderClientes();
  });

  document.getElementById('btn-login').addEventListener('click', () => signIn());

  document.getElementById('btn-backup').addEventListener('click', async () => {
    try {
      await backupNow();
    } catch (e) {
      setStatus(e.message);
    }
  });

  document.getElementById('btn-restore').addEventListener('click', async () => {
    if (!confirm('Isso vai substituir os dados locais pelo último backup do Drive. Continuar?')) return;
    try {
      await restoreFromDrive();
    } catch (e) {
      setStatus(e.message);
    }
  });
}

main();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  });
}
