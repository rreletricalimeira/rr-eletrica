// dialogo.js — balão de confirmação no padrão visual do app (substitui o
// confirm() nativo do navegador, que não combina com o resto da interface).
//
// Uso:
//   const sair = await confirmarApp('Deseja sair?', { textoSim: 'Sair', textoNao: 'Ficar' });
//   if (!sair) return;

export function confirmarApp(mensagem, opcoes = {}) {
  const { titulo = '', textoSim = 'Sim', textoNao = 'Não' } = opcoes;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay-exportar';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="painel-exportar painel-confirmacao">
        <div class="painel-confirmacao-icone" aria-hidden="true">⚠</div>
        ${titulo ? `<h3 class="painel-confirmacao-titulo">${escapeHtml(titulo)}</h3>` : ''}
        <p>${escapeHtml(mensagem)}</p>
        <div class="painel-exportar-botoes">
          <button type="button" class="btn-dialogo-nao">${escapeHtml(textoNao)}</button>
          <button type="button" class="btn-dialogo-sim">${escapeHtml(textoSim)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    function fechar(resposta) {
      document.removeEventListener('keydown', aoTeclar, true);
      overlay.remove();
      resolve(resposta);
    }
    function aoTeclar(e) {
      if (e.key === 'Escape') { e.preventDefault(); fechar(false); }
    }

    document.addEventListener('keydown', aoTeclar, true);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(false); });
    overlay.querySelector('.btn-dialogo-nao').addEventListener('click', () => fechar(false));
    overlay.querySelector('.btn-dialogo-sim').addEventListener('click', () => fechar(true));

    // O foco começa no botão "seguro" (o de não perder os dados).
    overlay.querySelector('.btn-dialogo-nao').focus();
  });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
