import OpenAI from 'openai';

export const config = {
  maxDuration: 60,
};

export const AI_MODEL_MAIN = 'google/gemini-3.8-flash';
export const AI_MODEL_LITE = 'google/gemini-3.5-flash-lite';

export interface AiImageInput {
  mimeType?: string;
  data: string;
}

export interface AiPdfInput {
  filename?: string;
  base64: string;
}

export interface AiGatewayPayload {
  model?: string;
  prompt: string;
  images?: AiImageInput[];
  pdf?: AiPdfInput;
  responseFormat?:
    | { type: 'json_object' }
    | {
        type: 'json_schema';
        json_schema: {
          name: string;
          strict?: boolean;
          schema: Record<string, unknown>;
        };
      };
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  temperature?: number;
  seed?: number;
  maxTokens?: number;
}

export function getOpenRouterApiKey(): string | null {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const trimmed = key.trim();
  if (
    !trimmed ||
    trimmed === 'undefined' ||
    trimmed === 'null' ||
    trimmed === 'MY_OPENROUTER_API_KEY'
  ) {
    return null;
  }
  return trimmed;
}

function getAppReferer(): string {
  const url = process.env.APP_URL || process.env.VERCEL_URL || '';
  if (url && url.startsWith('http')) return url;
  if (url) return `https://${url}`;
  return 'https://educorrige.vercel.app';
}

function stripDataUrlPrefix(raw: string): string {
  const idx = raw.indexOf(',');
  if (raw.startsWith('data:') && idx !== -1) {
    return raw.slice(idx + 1);
  }
  return raw;
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      })
      .join('');
  }
  return '';
}

function getErrorStatus(err: any): number | undefined {
  return err?.status ?? err?.statusCode ?? err?.response?.status;
}

function isTransientError(err: any): boolean {
  const status = getErrorStatus(err);
  if (status === 429 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const msg = String(err?.message || '');
  return (
    msg.includes('429') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('overloaded') ||
    msg.includes('timeout') ||
    msg.includes('ECONNRESET')
  );
}

async function readJsonBody(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string') {
    return JSON.parse(req.body);
  }
  if (Buffer.isBuffer(req.body)) {
    return JSON.parse(req.body.toString('utf8'));
  }

  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: any, status: number, payload: Record<string, unknown>) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(status).json(payload);
  }
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export async function executeOpenRouterCall(body: AiGatewayPayload): Promise<{ text: string; model: string }> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    const err: any = new Error(
      'Chave OPENROUTER_API_KEY não configurada no servidor. Adicione OPENROUTER_API_KEY nas variáveis de ambiente.'
    );
    err.status = 500;
    throw err;
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    const err: any = new Error('O campo prompt é obrigatório.');
    err.status = 400;
    throw err;
  }

  const model =
    typeof body.model === 'string' && body.model.trim() ? body.model.trim() : AI_MODEL_LITE;

  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey,
    timeout: 55000,
    maxRetries: 0,
    defaultHeaders: {
      'HTTP-Referer': getAppReferer(),
      'X-Title': '3 em 1 Correcoes - Educorrige',
    },
  });

  const contentParts: any[] = [{ type: 'text', text: prompt }];

  if (Array.isArray(body.images)) {
    for (const img of body.images) {
      if (!img || !img.data) continue;
      const mime = img.mimeType || 'image/jpeg';
      const cleanData = stripDataUrlPrefix(img.data);
      contentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${mime};base64,${cleanData}`,
        },
      });
    }
  }

  const hasPdf = Boolean(body.pdf && body.pdf.base64);
  if (hasPdf && body.pdf) {
    const cleanPdf = stripDataUrlPrefix(body.pdf.base64);
    contentParts.push({
      type: 'file',
      file: {
        filename: body.pdf.filename || 'documento.pdf',
        file_data: `data:application/pdf;base64,${cleanPdf}`,
      },
    });
  }

  const buildPayload = (opts: { includeReasoning: boolean; schemaMode: 'as_requested' | 'json_object' | 'none' }) => {
    const payload: Record<string, any> = {
      model,
      messages: [
        {
          role: 'user',
          content: contentParts.length === 1 ? prompt : contentParts,
        },
      ],
      temperature: typeof body.temperature === 'number' ? body.temperature : 0,
    };

    if (typeof body.seed === 'number') {
      payload.seed = body.seed;
    }

    if (typeof body.maxTokens === 'number' && body.maxTokens > 0) {
      payload.max_tokens = body.maxTokens;
    }

    if (hasPdf) {
      payload.plugins = [
        {
          id: 'file-parser',
          pdf: {
            engine: 'native',
          },
        },
      ];
    }

    if (opts.includeReasoning && body.reasoningEffort) {
      payload.reasoning = {
        effort: body.reasoningEffort,
      };
    }

    if (opts.schemaMode === 'as_requested' && body.responseFormat) {
      payload.response_format = body.responseFormat;
    } else if (opts.schemaMode === 'json_object' && body.responseFormat) {
      payload.response_format = { type: 'json_object' };
    }

    return payload;
  };

  let includeReasoning = Boolean(body.reasoningEffort);
  let schemaMode: 'as_requested' | 'json_object' | 'none' = body.responseFormat
    ? 'as_requested'
    : 'none';

  const maxAttempts = 4;
  let lastError: any = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const requestPayload = buildPayload({ includeReasoning, schemaMode });
      const completion = await client.chat.completions.create(requestPayload as any);
      const rawContent = completion?.choices?.[0]?.message?.content;
      const text = extractMessageText(rawContent);
      return { text, model };
    } catch (err: any) {
      lastError = err;
      const status = getErrorStatus(err);
      const errMsg = String(err?.message || '').toLowerCase();

      // Fallback automático se um provedor do OpenRouter rejeitar parâmetros opcionais (ex: reasoning ou json_schema estrito)
      if (status === 400) {
        if (includeReasoning && (errMsg.includes('reasoning') || errMsg.includes('thinking'))) {
          includeReasoning = false;
          continue;
        }
        if (schemaMode === 'as_requested' && body.responseFormat?.type === 'json_schema') {
          schemaMode = 'json_object';
          continue;
        }
        if (schemaMode === 'json_object') {
          schemaMode = 'none';
          continue;
        }
      }

      if (isTransientError(err) && attempt < maxAttempts - 1) {
        const jitter = Math.floor(Math.random() * 500);
        const waitMs = Math.pow(1.6, attempt + 1) * 700 + jitter;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      throw err;
    }
  }

  throw lastError || new Error('Falha ao processar requisição no OpenRouter.');
}

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET') {
    const apiKey = getOpenRouterApiKey();
    return sendJson(res, 200, {
      ok: true,
      configured: Boolean(apiKey),
      provider: 'openrouter',
      models: {
        main: AI_MODEL_MAIN,
        lite: AI_MODEL_LITE,
      },
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return sendJson(res, 405, { error: 'Método não permitido.' });
  }

  try {
    const body = await readJsonBody(req);
    const result = await executeOpenRouterCall(body);
    return sendJson(res, 200, result);
  } catch (err: any) {
    const status = getErrorStatus(err) || 500;
    const message =
      err?.error?.message || err?.message || 'Erro interno ao consultar o OpenRouter.';
    console.error('Erro no endpoint /api/ai (OpenRouter):', message);
    return sendJson(res, status >= 400 && status < 600 ? status : 500, {
      error: message,
    });
  }
}
