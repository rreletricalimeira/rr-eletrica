// auth-pin.js — Trava de acesso local simples (PIN numérico).
// Não é criptografia forte de dados, é uma barreira contra acesso
// casual caso alguém pegue o celular destravado. O PIN nunca é salvo
// em texto puro — só o hash (SHA-256) fica no localStorage.

const PIN_HASH_KEY = 'rr-eletrica-pin-hash';
const SESSION_KEY = 'rr-eletrica-sessao-liberada'; // sessionStorage: libera até fechar o app

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hasPinConfigured() {
  return !!localStorage.getItem(PIN_HASH_KEY);
}

export async function setPin(pin) {
  const hash = await sha256(pin);
  localStorage.setItem(PIN_HASH_KEY, hash);
}

export async function checkPin(pin) {
  const hash = await sha256(pin);
  return hash === localStorage.getItem(PIN_HASH_KEY);
}

export function isUnlockedThisSession() {
  return sessionStorage.getItem(SESSION_KEY) === '1';
}

export function unlockSession() {
  sessionStorage.setItem(SESSION_KEY, '1');
}

export function removePin() {
  localStorage.removeItem(PIN_HASH_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

// ---------- Tela de bloqueio (renderizada por cima de tudo) ----------
// onUnlock() é chamado quando o acesso é liberado (PIN certo, ou PIN
// configurado pela primeira vez).

export function renderLockScreen(container, onUnlock) {
  const primeiraVez = !hasPinConfigured();

  container.innerHTML = `
    <div class="lock-screen">
      <h1>RR Elétrica</h1>
      <p class="subtitle">${primeiraVez ? 'Crie um PIN de acesso (4 a 6 dígitos)' : 'Digite seu PIN'}</p>
      <input id="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="••••" autofocus />
      ${primeiraVez ? '<input id="pin-input-confirma" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="Confirme o PIN" />' : ''}
      <button id="pin-btn">${primeiraVez ? 'Criar PIN' : 'Entrar'}</button>
      <p id="pin-erro" class="pin-erro"></p>
    </div>
  `;

  const input = container.querySelector('#pin-input');
  const btn = container.querySelector('#pin-btn');
  const erroEl = container.querySelector('#pin-erro');

  async function tentar() {
    const valor = input.value.trim();
    if (valor.length < 4) {
      erroEl.textContent = 'PIN precisa ter pelo menos 4 dígitos.';
      return;
    }

    if (primeiraVez) {
      const confirma = container.querySelector('#pin-input-confirma').value.trim();
      if (valor !== confirma) {
        erroEl.textContent = 'Os PINs não coincidem.';
        return;
      }
      await setPin(valor);
      unlockSession();
      onUnlock();
      return;
    }

    const ok = await checkPin(valor);
    if (ok) {
      unlockSession();
      onUnlock();
    } else {
      erroEl.textContent = 'PIN incorreto.';
      input.value = '';
    }
  }

  btn.addEventListener('click', tentar);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tentar();
  });
}
