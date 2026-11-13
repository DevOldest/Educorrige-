/**
 * Otimizador de Imagens Client-side (Navegador)
 * Reduz fotos de câmeras de smartphones (4MB - 12MB) para imagens leves (~150KB - 250KB)
 * preservando nitidez máxima para leitura de gabaritos, marcações e textos.
 */

export interface CompressionResult {
  base64: string;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
  reductionPercentage: number;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Comprime um arquivo de imagem no próprio navegador usando HTML5 Canvas.
 * @param file Arquivo original (File ou Blob)
 * @param maxDimension Dimensão máxima de largura ou altura (padrão: 1600px, ideal para OCR/visão)
 * @param quality Qualidade do JPEG (0.82 produz textos super nítidos com tamanho mínimo)
 */
export async function compressImageForAI(
  file: File | Blob,
  maxDimension: number = 1600,
  quality: number = 0.82
): Promise<CompressionResult> {
  const originalSize = file.size;

  // Se não for imagem (ex: PDF ou desconhecido), faz fallback para FileReader direto
  if (file.type && !file.type.startsWith('image/')) {
    const rawBase64 = await fallbackRawBase64(file);
    return {
      base64: rawBase64,
      mimeType: file.type || 'application/octet-stream',
      originalSize,
      compressedSize: originalSize,
      reductionPercentage: 0
    };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo de imagem.'));

    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Falha ao decodificar imagem para compressão.'));

      img.onload = () => {
        try {
          let { width, height } = img;

          // Se a imagem for maior que a dimensão máxima, redimensiona proporcionalmente
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          // Cria canvas offscreen com interpolação bicúbica suave
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Não foi possível inicializar contexto 2D do Canvas.');
          }

          // Fundo branco para imagens com transparência
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);

          // Renderiza imagem com suavização de alta qualidade
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          // Exporta em JPEG otimizado
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const base64 = dataUrl.split(',')[1];
          
          // Estima o tamanho comprimido em bytes a partir da string base64
          const compressedSize = Math.round((base64.length * 3) / 4);
          const reduction = originalSize > 0 
            ? Math.round(((originalSize - compressedSize) / originalSize) * 100) 
            : 0;

          resolve({
            base64,
            mimeType: 'image/jpeg',
            originalSize,
            compressedSize,
            reductionPercentage: Math.max(0, reduction)
          });
        } catch (err) {
          console.warn('Erro na compressão via Canvas, usando fallback:', err);
          fallbackRawBase64(file).then(raw => {
            resolve({
              base64: raw,
              mimeType: file.type || 'image/jpeg',
              originalSize,
              compressedSize: originalSize,
              reductionPercentage: 0
            });
          }).catch(reject);
        }
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}

function fallbackRawBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const b64 = res.includes(',') ? res.split(',')[1] : res;
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
