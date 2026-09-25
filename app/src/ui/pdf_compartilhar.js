// ============================================================
// Entrega do PDF já gerado: compartilhar (WhatsApp, e-mail, Drive...)
// ou baixar. Usado por todos os botões "Exportar PDF" do app.
//
// Como funciona:
//  - No celular (e em navegadores que suportam a Web Share API com
//    arquivos) aparece o botão "Compartilhar / WhatsApp": abre a lista de
//    aplicativos do aparelho com o PDF já anexado.
//  - Onde isso não existe (a maioria dos navegadores de PC), o PDF é
//    baixado na hora e o painel oferece "Abrir WhatsApp" — o WhatsApp Web
//    não aceita anexo automático, então basta anexar o arquivo baixado.
//
// Uso:
//   entregarPdf(doc, 'proposta-PT0001.pdf', { mensagem: '...', telefone: '(19) 98160-5606' });
// ============================================================

export function entregarPdf(doc, nomeArquivo, opcoes = {}) {
  const { mensagem = 'Segue o documento da RR Elétrica.', telefone = '' } = opcoes;
  const nome = /\.pdf$/i.test(nomeArquivo) ? nomeArquivo : `${nomeArquivo}.pdf`;
  const blob = doc.output('blob');

  let arquivo = null;
  let podeCompartilhar = false;
  try {
    arquivo = new File([blob], nome, { type: 'application/pdf' });
    podeCompartilhar = typeof navigator !== 'undefined'
      && typeof navigator.canShare === 'function'
      && typeof navigator.share === 'function'
      && navigator.canShare({ files: [arquivo] });
  } catch (e) {
    podeCompartilhar = false;
  }

  // Sem compartilhamento nativo: baixa direto (comportamento antigo do app).
  if (!podeCompartilhar) baixar(blob, nome);

  const overlay = document.createElement('div');
  overlay.className = 'overlay-exportar';
  overlay.innerHTML = `
    <div class="painel-exportar painel-pdf-pronto">
      <button type="button" class="painel-exportar-fechar" aria-label="Fechar">×</button>
      <p><strong>${podeCompartilhar ? 'PDF pronto' : 'PDF baixado'}</strong><br>
        <span class="item-sub">${escapeHtml(nome)}</span></p>
      <div class="painel-exportar-botoes">
        ${podeCompartilhar
          ? '<button type="button" id="pdf-compartilhar">Compartilhar / WhatsApp</button>'
          : '<button type="button" id="pdf-whatsapp">Abrir WhatsApp</button>'}
        <button type="button" id="pdf-baixar">${podeCompartilhar ? 'Baixar PDF' : 'Baixar de novo'}</button>
      </div>
      <p class="item-sub painel-pdf-aviso" id="pdf-aviso">${podeCompartilhar
        ? ''
        : 'Para enviar pelo WhatsApp, anexe o PDF baixado na conversa.'}</p>
    </div>
  `;
  document.body.appendChild(overlay);

  const fechar = () => overlay.remove();
  const avisoEl = overlay.querySelector('#pdf-aviso');
  overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });
  overlay.querySelector('.painel-exportar-fechar').addEventListener('click', fechar);
  overlay.querySelector('#pdf-baixar').addEventListener('click', () => baixar(blob, nome));

  const btnCompartilhar = overlay.querySelector('#pdf-compartilhar');
  if (btnCompartilhar) {
    btnCompartilhar.addEventListener('click', async () => {
      try {
        await navigator.share({ files: [arquivo], title: nome, text: mensagem });
        fechar();
      } catch (e) {
        // AbortError = a pessoa fechou a lista de apps; não é erro.
        if (e && e.name !== 'AbortError') avisoEl.textContent = 'Não foi possível compartilhar. Use "Baixar PDF" e anexe o arquivo.';
      }
    });
  }

  const btnWhats = overlay.querySelector('#pdf-whatsapp');
  if (btnWhats) {
    btnWhats.addEventListener('click', () => {
      const numero = normalizarTelefoneBr(telefone);
      const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
      window.open(url, '_blank', 'noopener');
    });
  }
}

function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

// Deixa só dígitos e acrescenta o 55 (Brasil) quando o número vier sem DDI.
// Sem telefone válido devolve '' e o wa.me abre com o seletor de contatos.
function normalizarTelefoneBr(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  return '';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
