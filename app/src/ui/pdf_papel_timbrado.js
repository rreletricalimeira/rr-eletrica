// ============================================================
// Cabeçalho/rodapé de PDF com a identidade visual da RR Elétrica
// (mesmas cores/logo/rodapé já usados no PDF da O.S. em pages/os.js).
// Centralizado aqui para reaproveitar nos PDFs do módulo Técnico
// (Checklist Técnico Completo, Proposta Técnica Comercial etc.)
// sem duplicar o mesmo bloco de código em cada arquivo.
// ============================================================

export const TELEFONE_EMPRESA = '(19) 98160-5606';
export const SITE_EMPRESA = 'rreletrica.com.br';
export const CNPJ_EMPRESA = '24.727.143/0001-68';
export const SLOGAN_EMPRESA = 'INSTALAÇÃO ELÉTRICA QUE AGUENTA A CARGA DA SUA OPERAÇÃO';

export const COR_ESCURO = [13, 17, 21];    // #0d1115
export const COR_ESCURO_TOPO = [7, 9, 11]; // #07090b
export const COR_OURO = [215, 167, 43];    // #d7a72b
export const COR_PRATA = [199, 204, 209];  // #c7ccd1
export const COR_LINHA = [200, 204, 209];

export const MARGEM = 14;
const LOGO_URL = './icons/logo-rr-completo.png';
const LOGO_PROPORCAO = 323 / 900; // altura / largura do logo completo

let logoBase64Cache = null;
export async function carregarLogoBase64() {
  if (logoBase64Cache) return logoBase64Cache;
  try {
    const resp = await fetch(LOGO_URL);
    const blob = await resp.blob();
    logoBase64Cache = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    logoBase64Cache = null; // segue sem logo se não conseguir carregar
  }
  return logoBase64Cache;
}

// Desenha o cabeçalho no topo da página atual e devolve o Y onde o
// conteúdo pode começar. `subtitulo` aparece em destaque abaixo do
// site (ex.: "PROPOSTA TÉCNICA COMERCIAL", "CHECKLIST TÉCNICO").
export function desenharCabecalho(doc, logo, subtitulo) {
  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaCabecalho = 34;

  doc.setFillColor(...COR_ESCURO_TOPO);
  doc.rect(0, 0, larguraPagina, alturaCabecalho, 'F');
  doc.setFillColor(...COR_OURO);
  doc.rect(0, alturaCabecalho, larguraPagina, 1.2, 'F');

  if (logo) {
    const larguraLogo = 56;
    const alturaLogo = larguraLogo * LOGO_PROPORCAO;
    try { doc.addImage(logo, 'PNG', MARGEM, (alturaCabecalho - alturaLogo) / 2, larguraLogo, alturaLogo); } catch (e) { /* segue sem logo */ }
  }

  const xDireita = larguraPagina - MARGEM;
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(TELEFONE_EMPRESA, xDireita, 13, { align: 'right' });

  doc.setFont(undefined, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COR_OURO);
  doc.text(SITE_EMPRESA, xDireita, 19.5, { align: 'right' });

  doc.setFont(undefined, 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...COR_PRATA);
  doc.text(doc.splitTextToSize(subtitulo || SLOGAN_EMPRESA, 110), xDireita, 26, { align: 'right' });

  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'normal');
  return alturaCabecalho + 12;
}

// Desenha o rodapé (linha dourada + RR ELÉTRICA + CNPJ/site + nº de
// página) em todas as páginas já geradas no documento.
export function desenharRodape(doc) {
  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();
  const xDireita = larguraPagina - MARGEM;
  const totalPaginas = doc.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    const yRodape = alturaPagina - 12;
    doc.setDrawColor(...COR_OURO);
    doc.setLineWidth(0.5);
    doc.line(MARGEM, yRodape - 5, xDireita, yRodape - 5);
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(60, 60, 60);
    doc.text('RR ELÉTRICA', MARGEM, yRodape);
    doc.setFont(undefined, 'normal');
    doc.text(`CNPJ ${CNPJ_EMPRESA}  ·  ${SITE_EMPRESA}`, larguraPagina / 2, yRodape, { align: 'center' });
    doc.text(`Página ${p}/${totalPaginas}`, xDireita, yRodape, { align: 'right' });
  }
  doc.setTextColor(0, 0, 0);
}
