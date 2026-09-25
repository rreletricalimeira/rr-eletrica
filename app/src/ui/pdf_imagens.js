// ============================================================
// Ajudantes para colocar imagens (fotos, assinaturas) dentro dos PDFs.
// ============================================================

// Lê uma imagem do próprio app (ex.: ./icons/assinatura-rr.png) e devolve
// como data URL. Se o arquivo não existir devolve null — o PDF simplesmente
// sai sem a imagem, em vez de dar erro.
export async function carregarImagemDataUrl(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    if (!blob.type || !blob.type.startsWith('image/')) return null;
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return null;
  }
}

function carregarElementoImagem(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Fotos da câmera chegam com vários MB; para o PDF ficar leve e ainda
// nítido, redimensiona para no máximo `maxLado` px e recomprime em JPEG.
// Se algo falhar, devolve a imagem original.
export async function reduzirFotoParaPdf(dataUrl, maxLado = 1100, qualidade = 0.78) {
  if (!dataUrl) return null;
  try {
    const img = await carregarElementoImagem(dataUrl);
    let { width, height } = img;
    const maior = Math.max(width, height);
    if (maior > maxLado) {
      const fator = maxLado / maior;
      width = Math.round(width * fator);
      height = Math.round(height * fator);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', qualidade);
  } catch (e) {
    return dataUrl;
  }
}

// As assinaturas desenhadas no app antes eram gravadas em cinza-claro (o
// tema antigo era escuro) — em papel branco ficariam quase invisíveis.
// Pinta todos os traços de azul-marinho escuro, mantendo o fundo transparente.
export async function assinaturaEscuraParaPdf(dataUrl) {
  if (!dataUrl) return null;
  try {
    const img = await carregarElementoImagem(dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch (e) {
    return dataUrl;
  }
}

function formatoDaImagem(dataUrl) {
  return /^data:image\/png/i.test(dataUrl) ? 'PNG' : 'JPEG';
}

// Desenha a imagem dentro da caixa (larguraMax x alturaMax) mantendo a
// proporção. `alinhar`: 'esquerda' | 'centro'. Devolve { largura, altura }
// realmente usadas (0 se a imagem não pôde ser desenhada).
export function desenharImagemNaCaixa(doc, dataUrl, x, y, larguraMax, alturaMax, alinhar = 'centro') {
  if (!dataUrl) return { largura: 0, altura: 0 };
  try {
    const props = doc.getImageProperties(dataUrl);
    const escala = Math.min(larguraMax / props.width, alturaMax / props.height);
    const largura = props.width * escala;
    const altura = props.height * escala;
    const xImg = alinhar === 'centro' ? x + (larguraMax - largura) / 2 : x;
    doc.addImage(dataUrl, formatoDaImagem(dataUrl), xImg, y, largura, altura);
    return { largura, altura };
  } catch (e) {
    return { largura: 0, altura: 0 };
  }
}
