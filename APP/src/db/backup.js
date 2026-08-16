// backup.js — Autenticação Google + backup/restore do banco no Drive.
//
// Usa o escopo "drive.file": o app só enxerga arquivos que ele mesmo
// criou. Você não precisa passar pelo processo pesado de verificação
// do Google, e o app nunca tem acesso ao resto do seu Drive.
//
// COMO CONFIGURAR (uma vez só):
// 1. Acesse https://console.cloud.google.com/apis/credentials
// 2. Crie um projeto (ou use um existente)
// 3. Tela de consentimento OAuth -> tipo "Externo" -> adicione seu
//    e-mail como usuário de teste (suficiente para uso pessoal)
// 4. Credenciais -> Criar credencial -> ID do cliente OAuth ->
//    tipo "Aplicativo da Web"
// 5. Em "Origens JavaScript autorizadas" adicione a URL do seu
//    GitHub Pages, ex: https://seuusuario.github.io
// 6. Copie o Client ID gerado e cole em src/config.js

import { CONFIG } from '../config.js';
import { exportBytes, importBytes } from './db.js';

const BACKUP_FILENAME = 'rr-eletrica-backup.db';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

let tokenClient = null;
let accessToken = null;
let onStatusChange = () => {};

export function setStatusListener(fn) {
  onStatusChange = fn;
}

// ---------- Autenticação (Google Identity Services) ----------

export function initAuth() {
  return new Promise((resolve, reject) => {
    if (!window.google || !window.google.accounts) {
      reject(new Error('Google Identity Services não carregou. Verifique a internet.'));
      return;
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (resp) => {
        if (resp.error) {
          onStatusChange('erro', resp.error);
          return;
        }
        accessToken = resp.access_token;
        onStatusChange('conectado');
      },
    });
    resolve();
  });
}

export function signIn() {
  if (!tokenClient) throw new Error('initAuth() precisa ser chamado antes.');
  tokenClient.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
}

export function isSignedIn() {
  return !!accessToken;
}

// ---------- Encontrar backup existente no Drive ----------

async function findBackupFileId() {
  const q = encodeURIComponent(`name='${BACKUP_FILENAME}' and trashed=false`);
  const resp = await fetch(`${DRIVE_FILES_URL}?q=${q}&spaces=drive&fields=files(id,modifiedTime)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await resp.json();
  return data.files && data.files.length > 0 ? data.files[0] : null;
}

// ---------- Backup manual/automático (upload) ----------

export async function backupNow() {
  if (!accessToken) throw new Error('Faça login no Google primeiro.');
  onStatusChange('enviando');

  const bytes = exportBytes();
  const blob = new Blob([bytes], { type: 'application/x-sqlite3' });
  const existing = await findBackupFileId();

  const metadata = { name: BACKUP_FILENAME };
  if (!existing) metadata.parents = undefined; // salva na raiz visível do app (drive.file)

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const url = existing
    ? `${DRIVE_UPLOAD_URL}/${existing.id}?uploadType=multipart`
    : `${DRIVE_UPLOAD_URL}?uploadType=multipart`;
  const method = existing ? 'PATCH' : 'POST';

  const resp = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });

  if (!resp.ok) {
    onStatusChange('erro', await resp.text());
    throw new Error('Falha no upload do backup.');
  }

  const now = new Date().toISOString();
  localStorage.setItem('rr-eletrica-ultimo-backup', now);
  onStatusChange('backup_ok', now);
  return now;
}

// ---------- Restore (download) ----------

export async function restoreFromDrive() {
  if (!accessToken) throw new Error('Faça login no Google primeiro.');
  const existing = await findBackupFileId();
  if (!existing) throw new Error('Nenhum backup encontrado no Drive ainda.');

  onStatusChange('restaurando');
  const resp = await fetch(`${DRIVE_FILES_URL}/${existing.id}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error('Falha ao baixar o backup.');

  const buf = await resp.arrayBuffer();
  await importBytes(new Uint8Array(buf));
  onStatusChange('restaurado');
}

export function getLastBackupTime() {
  return localStorage.getItem('rr-eletrica-ultimo-backup');
}

// ---------- Backup automático ----------
// Estratégia simples e robusta: dispara um backup quando o app vai para
// segundo plano (troca de aba/app) ou é fechado, e nunca mais que uma vez
// a cada N minutos para não gastar cota/bateria à toa.

const AUTO_BACKUP_MIN_INTERVAL_MS = 15 * 60 * 1000; // 15 minutos

export function enableAutoBackup() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      maybeAutoBackup();
    }
  });
}

function maybeAutoBackup() {
  if (!accessToken) return; // só faz backup automático se já estiver logado
  const last = getLastBackupTime();
  const elapsed = last ? Date.now() - new Date(last).getTime() : Infinity;
  if (elapsed >= AUTO_BACKUP_MIN_INTERVAL_MS) {
    backupNow().catch(() => {
      // falha silenciosa no automático — o botão manual continua disponível
    });
  }
}
