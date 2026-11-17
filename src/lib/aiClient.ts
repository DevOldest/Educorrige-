import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

if (typeof window !== 'undefined' && pdfjsLib?.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export const AI_MODEL_MAIN = 'google/gemini-3.8-flash';
export const AI_MODEL_LITE = 'google/gemini-3.5-flash-lite';

// Mantém o payload bem abaixo do teto de 4,5 MB das Serverless Functions da Vercel
const MAX_DIRECT_PDF_BYTES = 2_800_000;

export interface AiImagePart {
  mimeType: string;
  data: string;
}

export type AiResponseFormat =
  | { type: 'json_object' }
  | {
      type: 'json_schema';
      json_schema: {
        name: string;
        strict?: boolean;
        schema: Record<string, unknown>;
      };
    };

export interface AiGatewayRequest {
  model?: string;
  prompt: string;
  images?: AiImagePart[];
  pdf?: {
    filename?: string;
    base64: string;
  };
  responseFormat?: AiResponseFormat;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  temperature?: number;
  seed?: number;
  maxTokens?: number;
}

export interface AiStatusResponse {
  ok: boolean;
  configured: boolean;
  provider: string;
  models: {
    main: string;
    lite: string;
  };
}

export async function checkAiStatus(): Promise<AiStatusResponse> {
  const res = await fetch('/api/ai', { method: 'GET' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Erro HTTP ${res.status} ao verificar API de IA.`);
  }
  return data as AiStatusResponse;
}

export async function callAiGateway(request: AiGatewayRequest): Promise<string> {
  const maxAttempts = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = data?.error || `Erro na API de IA (HTTP ${response.status}).`;
        const isRetryable =
          response.status === 429 ||
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504;

        if (isRetryable && attempt < maxAttempts - 1) {
          const waitMs = Math.pow(1.6, attempt + 1) * 750 + Math.floor(Math.random() * 400);
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
        throw new Error(message);
      }

      return typeof data?.text === 'string' ? data.text : '';
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err || 'Erro de rede na IA.'));
      const isNetworkError =
        lastError.message.includes('Failed to fetch') ||
        lastError.message.includes('NetworkError');

      if (isNetworkError && attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error('Não foi possível obter resposta da IA.');
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo PDF selecionado.'));
    reader.readAsDataURL(file);
  });
}

async function extractPdfFallbackViaPdfJs(
  file: File
): Promise<{ extractedText: string; pageImages: AiImagePart[] }> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;

  const textChunks: string[] = [];
  const totalPages = Math.min(pdf.numPages, 20);

  for (let p = 1; p <= totalPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => (typeof item?.str === 'string' ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (pageText) {
      textChunks.push(`--- PÁGINA ${p} ---\n${pageText}`);
    }
  }

  const combinedText = textChunks.join('\n\n').trim();
  if (combinedText.length >= 60) {
    return { extractedText: combinedText, pageImages: [] };
  }

  // Fallback para PDFs escaneados grandes sem camada de texto: renderiza até 6 páginas em JPEG comprimido
  const pageImages: AiImagePart[] = [];
  const pagesToRender = Math.min(pdf.numPages, 6);
  for (let p = 1; p <= pagesToRender; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      pageImages.push({ mimeType: 'image/jpeg', data: base64 });
    }
  }

  return { extractedText: '', pageImages };
}

export async function callAiWithPdf(options: {
  file: File;
  prompt: string;
  model?: string;
  responseFormat?: AiResponseFormat;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  temperature?: number;
}): Promise<string> {
  const { file, prompt, model = AI_MODEL_LITE, responseFormat, reasoningEffort, temperature = 0 } =
    options;

  if (file.size <= MAX_DIRECT_PDF_BYTES) {
    const base64 = await fileToBase64(file);
    try {
      return await callAiGateway({
        model,
        prompt,
        pdf: {
          filename: file.name || 'documento.pdf',
          base64,
        },
        responseFormat,
        reasoningEffort,
        temperature,
      });
    } catch (directErr) {
      // Se o parse nativo falhar por algum detalhe do arquivo, tenta extração local via pdfjs-dist
      try {
        const fallback = await extractPdfFallbackViaPdfJs(file);
        if (fallback.extractedText) {
          return await callAiGateway({
            model,
            prompt: `${prompt}\n\nCONTEÚDO EXTRAÍDO DO PDF:\n${fallback.extractedText}`,
            responseFormat,
            reasoningEffort,
            temperature,
          });
        }
        if (fallback.pageImages.length > 0) {
          return await callAiGateway({
            model,
            prompt,
            images: fallback.pageImages,
            responseFormat,
            reasoningEffort,
            temperature,
          });
        }
      } catch {
        // Propaga erro original caso o fallback também falhe
      }
      throw directErr;
    }
  }

  // PDF acima de ~2,8 MB: extrai texto ou páginas comprimidas localmente para não estourar o teto de 4,5 MB da Vercel
  const fallback = await extractPdfFallbackViaPdfJs(file);
  if (fallback.extractedText) {
    return await callAiGateway({
      model,
      prompt: `${prompt}\n\nCONTEÚDO EXTRAÍDO DO PDF:\n${fallback.extractedText}`,
      responseFormat,
      reasoningEffort,
      temperature,
    });
  }

  if (fallback.pageImages.length > 0) {
    return await callAiGateway({
      model,
      prompt,
      images: fallback.pageImages,
      responseFormat,
      reasoningEffort,
      temperature,
    });
  }

  throw new Error('Não foi possível extrair conteúdo legível deste arquivo PDF.');
}

export function extractJsonObject<T = any>(rawText: string): T {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    throw new Error('A IA retornou uma resposta vazia.');
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const cleaned = trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as T;
      }
      throw new Error('A IA não retornou um formato JSON válido.');
    }
  }
}
