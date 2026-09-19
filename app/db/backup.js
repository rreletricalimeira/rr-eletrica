// backup.js — Autenticação Google + backup/restore no Drive.
// Escopo drive.file: o app só enxerga arquivos que ele mesmo criou.

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

async function findBackupFileId() {
  const q = encodeURIComponent(`name='${BACKUP_FILENAME}' and trashed=false`);
  const resp = await fetch(`${DRIVE_FILES_URL}?q=${q}&spaces=drive&fields=files(id,modifiedTime)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await resp.json();
  return data.files && data.files.length > 0 ? data.files[0] : null;
}

// ---------- Guarda de segurança: nunca fingir que backup/restore rodou ----------
// Toda chamada de backupNow/restoreFromDrive passa por aqui primeiro.
// Se não estiver conectado, dispara um aviso claro em vez de falhar em silêncio.

export class NotConnectedError extends Error {}

function requireConnection() {
  if (!accessToken) {
    onStatusChange('nao_conectado');
    throw new NotConnectedError(
      'Você não está conectado ao Google. Toque em "Conectar ao Google" antes de fazer backup ou restaurar — sem isso, nada é salvo nem restaurado.'
    );
  }
}

export async function backupNow() {
  requireConnection();
  onStatusChange('enviando');

  const bytes = exportBytes();
  const blob = new Blob([bytes], { type: 'application/x-sqlite3' });
  const existing = await findBackupFileId();

  const metadata = { name: BACKUP_FILENAME };
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

export async function restoreFromDrive() {
  requireConnection();
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

const AUTO_BACKUP_MIN_INTERVAL_MS = 15 * 60 * 1000;

export function enableAutoBackup() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') maybeAutoBackup();
  });
}

function maybeAutoBackup() {
  if (!accessToken) return; // automático só roda se já estava conectado; não força login
  const last = getLastBackupTime();
  const elapsed = last ? Date.now() - new Date(last).getTime() : Infinity;
  if (elapsed >= AUTO_BACKUP_MIN_INTERVAL_MS) {
    backupNow().catch(() => {});
  }
}
