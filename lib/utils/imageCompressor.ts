/**
 * Utilitário para compressão e redimensionamento client-side de imagens
 * Reduz fotos pesadas de celulares (5MB-15MB) para ~200-400KB em canvas,
 * evitando estouro do limite de 4.5MB da Vercel e acelerando o upload.
 */
export async function compressImageFile(
  file: File,
  maxDimension: number = 1600,
  quality: number = 0.85,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (!result) {
        reject(new Error('Falha ao ler o arquivo de imagem.'));
        return;
      }

      // Se estiver rodando em ambiente sem Window/Image, devolve direto
      if (typeof window === 'undefined' || typeof Image === 'undefined') {
        resolve(result);
        return;
      }

      const img = new Image();

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Redimensiona proporcionalmente mantendo a legibilidade
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(result);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Exporta como JPEG otimizado
        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };

      img.onerror = () => {
        // Fallback para o base64 original se o canvas falhar
        resolve(result);
      };

      img.src = result;
    };

    reader.onerror = (error) => {
      reject(error);
    };

    reader.readAsDataURL(file);
  });
}
