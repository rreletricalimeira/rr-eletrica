// image.js — Comprime uma foto antes de salvar como base64 no banco.
// Alvo: máx 400px no lado maior, JPEG ~50% de qualidade — banco leve,
// foto ainda nítida o suficiente para identificar o produto.

export function comprimirFoto(file, maxSize = 400, qualidade = 0.5) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', qualidade));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
