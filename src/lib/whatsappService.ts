import { ai, GEMINI_MODEL } from './gemini';
import { supabase } from './supabase';
import { WeeklyStudyMessage, ExtractedCampaign, WeeklyMessageStatus } from '../types';

export interface WhatsAppConfig {
  groupJid: string; // Ex: 120363028391823912@g.us (Grupo dos Líderes)
  serverUrl?: string; // Ex: https://api.meuservidor.com
  instanceName?: string; // Ex: lideres-sala
  apiKey?: string; // API Key da Evolution API
  simulateDispatch?: boolean; // Modo teste simulado
}

const LOCAL_STORAGE_KEY = 'algoapp_weekly_study_messages';
const CONFIG_STORAGE_KEY = 'algoapp_whatsapp_config';

export const DEFAULT_WHATSAPP_CONFIG: WhatsAppConfig = {
  groupJid: '120363028391823912@g.us',
  serverUrl: '',
  instanceName: 'quimica-lideres',
  apiKey: '',
  simulateDispatch: true
};

export const SQL_SCHEMA_SNIPPET = `-- Execute este comando no SQL Editor do Supabase se desejar criar a tabela agora:
CREATE TABLE IF NOT EXISTS weekly_study_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  semana_numero INTEGER NOT NULL,
  data_envio DATE NOT NULL,
  horario_envio TIME NOT NULL DEFAULT '08:00',
  mensagem_texto TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'agendado', -- 'rascunho', 'agendado', 'enviado', 'falha'
  campaign_title TEXT,
  whatsapp_group_jid TEXT,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS e permitir operações
ALTER TABLE weekly_study_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Acesso total weekly_study_messages" 
  ON weekly_study_messages FOR ALL 
  TO public 
  USING (true) 
  WITH CHECK (true);
`;

/**
 * Lê as configurações salvas do WhatsApp
 */
export function getSavedWhatsAppConfig(): WhatsAppConfig {
  if (typeof window === 'undefined') return DEFAULT_WHATSAPP_CONFIG;
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_WHATSAPP_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.warn('Erro ao ler config do WhatsApp:', e);
  }
  return DEFAULT_WHATSAPP_CONFIG;
}

/**
 * Salva as configurações do WhatsApp
 */
export function saveWhatsAppConfig(config: WhatsAppConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('Erro ao salvar config do WhatsApp:', e);
  }
}

/**
 * Converte um arquivo PDF para Base64 puro (sem prefixo data:application/pdf;base64,)
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove o prefixo se existir
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

/**
 * Extrai dinamicamente N semanas/mensagens do PDF via Gemini API
 */
export async function extractStudyScheduleFromPdf(file: File): Promise<ExtractedCampaign> {
  if (!ai) {
    throw new Error('Chave da API Gemini não configurada (VITE_GEMINI_API_KEY). Verifique as variáveis de ambiente.');
  }

  const base64Data = await fileToBase64(file);

  const prompt = `
Você é um especialista pedagógico em Química e rotinas de Repetição Espaçada (AlgoApp / Anki).
Sua missão é ler o arquivo PDF fornecido e extrair com rigor e completude TODAS as semanas ou blocos de mensagens de estudo contidos nele.

DIRETRIZES FUNDAMENTAIS:
1. QUANTIDADE DINÂMICA: O arquivo pode conter 1, 2, 3, 5, 8 ou qualquer quantidade de semanas/mensagens. Extraia TODAS as que estiverem presentes, sem limitar o número.
2. CONTEÚDO BRUTO DAS MENSAGENS:
   - O campo "mensagem_texto" deve conter o texto EXATO, rico e pronto para ser enviado via WhatsApp para os líderes de sala copiarem e os alunos colarem no AlgoApp / Anki.
   - Mantenha formatações em markdown do WhatsApp (*negrito*, _itálico_), equações químicas, fórmulas, links, perguntas de recordação ativa e resoluções.
3. DATAS E HORÁRIOS:
   - "data_envio": Data no formato YYYY-MM-DD. Se o documento trouxer apenas dia e mês (ex: 12/03), utilize o ano letivo corrente (2026-MM-DD). Se não trouxer datas explícitas, gere datas sequenciais com espaçamento semanal (a cada 7 dias) a partir da data de hoje.
   - "horario_envio": Horário previsto no formato HH:mm (ex: "08:00", "19:00"). Se não especificado no PDF, utilize "08:00".
4. ORDENAÇÃO:
   - "semana_numero": Numeração sequencial inteira (1, 2, 3, 4, ...).

Responda OBRIGATORIAMENTE em JSON válido com esta estrutura exata:
{
  "campaign_title": "Título ou Assunto do Cronograma de Estudos extraído do PDF",
  "messages": [
    {
      "semana_numero": 1,
      "data_envio": "YYYY-MM-DD",
      "horario_envio": "HH:mm",
      "mensagem_texto": "Texto integral da mensagem formatada para WhatsApp e AlgoApp..."
    }
  ]
}
`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64Data
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = response.text || '';
    if (!responseText) {
      throw new Error('A IA retornou uma resposta vazia.');
    }

    // Tentar localizar e parsear o bloco JSON
    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error('Não foi possível identificar o formato JSON na resposta da IA.');
      }
    }

    if (!parsed || !Array.isArray(parsed.messages)) {
      throw new Error('Estrutura de dados retornada não contém a lista de mensagens.');
    }

    // Normalização e sanitização
    const sanitizedMessages = parsed.messages.map((m: any, idx: number) => ({
      semana_numero: Number(m.semana_numero) || (idx + 1),
      data_envio: typeof m.data_envio === 'string' && m.data_envio.includes('-') 
        ? m.data_envio 
        : new Date(Date.now() + idx * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      horario_envio: typeof m.horario_envio === 'string' && m.horario_envio.includes(':') 
        ? m.horario_envio.substring(0, 5) 
        : '08:00',
      mensagem_texto: typeof m.mensagem_texto === 'string' && m.mensagem_texto.trim() 
        ? m.mensagem_texto.trim() 
        : `Mensagem de estudo - Semana ${idx + 1}`
    }));

    return {
      campaign_title: parsed.campaign_title || file.name.replace(/\.[^/.]+$/, ''),
      messages: sanitizedMessages
    };
  } catch (error: any) {
    console.error('Erro na extração de PDF via Gemini:', error);
    throw new Error(error.message || 'Falha ao processar o arquivo PDF com a IA.');
  }
}

/**
 * Busca todas as mensagens salvas (Supabase com fallback para LocalStorage)
 */
export async function fetchWeeklyStudyMessages(): Promise<{ data: WeeklyStudyMessage[]; source: 'supabase' | 'local' }> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('weekly_study_messages')
        .select('*')
        .order('semana_numero', { ascending: true });

      if (!error && data) {
        // Atualiza cache local
        if (typeof window !== 'undefined') {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
        }
        return { data: data as WeeklyStudyMessage[], source: 'supabase' };
      }
    } catch (e) {
      console.warn('Tabela weekly_study_messages indisponível no Supabase, usando cache local:', e);
    }
  }

  // Fallback LocalStorage
  if (typeof window !== 'undefined') {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return { data: parsed, source: 'local' };
      } catch (e) {
        console.error('Erro ao ler mensagens do localStorage:', e);
      }
    }
  }

  return { data: [], source: 'local' };
}

/**
 * Grava N mensagens agendadas na tabela weekly_study_messages
 */
export async function saveWeeklyStudyMessages(
  messages: Array<Omit<WeeklyStudyMessage, 'id' | 'created_at'>>,
  campaignTitle: string,
  groupJid: string
): Promise<{ count: number; source: 'supabase' | 'local' }> {
  const preparedRecords: WeeklyStudyMessage[] = messages.map(m => ({
    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    semana_numero: m.semana_numero,
    data_envio: m.data_envio,
    horario_envio: m.horario_envio,
    mensagem_texto: m.mensagem_texto,
    status: (m.status || 'agendado') as WeeklyMessageStatus,
    campaign_title: campaignTitle,
    whatsapp_group_jid: groupJid,
    sent_at: m.sent_at || null,
    last_error: m.last_error || null,
    created_at: new Date().toISOString()
  }));

  let savedInSupabase = false;

  if (supabase) {
    try {
      const { error } = await supabase
        .from('weekly_study_messages')
        .insert(preparedRecords);

      if (!error) {
        savedInSupabase = true;
      } else {
        console.warn('Erro ao inserir no Supabase (possível ausência da tabela):', error);
      }
    } catch (e) {
      console.warn('Falha na conexão com Supabase:', e);
    }
  }

  // Sempre sincroniza com LocalStorage para garantir persistência contínua
  if (typeof window !== 'undefined') {
    try {
      const existingRaw = localStorage.getItem(LOCAL_STORAGE_KEY);
      const existing: WeeklyStudyMessage[] = existingRaw ? JSON.parse(existingRaw) : [];
      const updated = [...existing, ...preparedRecords];
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Erro ao atualizar cache local:', e);
    }
  }

  return {
    count: preparedRecords.length,
    source: savedInSupabase ? 'supabase' : 'local'
  };
}

/**
 * Atualiza uma mensagem específica (ex: após edição manual ou alteração de status)
 */
export async function updateWeeklyStudyMessage(
  id: string,
  updates: Partial<WeeklyStudyMessage>
): Promise<boolean> {
  let updatedInSupabase = false;

  if (supabase) {
    try {
      const { error } = await supabase
        .from('weekly_study_messages')
        .update(updates)
        .eq('id', id);
      if (!error) updatedInSupabase = true;
    } catch (e) {
      console.warn('Não foi possível atualizar no Supabase:', e);
    }
  }

  // Atualiza LocalStorage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const list: WeeklyStudyMessage[] = JSON.parse(raw);
        const nextList = list.map(item => item.id === id ? { ...item, ...updates } : item);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextList));
      }
    } catch (e) {
      console.error('Erro ao atualizar cache local:', e);
    }
  }

  return updatedInSupabase;
}

/**
 * Deleta uma mensagem do cronograma
 */
export async function deleteWeeklyStudyMessage(id: string): Promise<boolean> {
  if (supabase) {
    try {
      await supabase.from('weekly_study_messages').delete().eq('id', id);
    } catch (e) {
      console.warn('Erro ao deletar no Supabase:', e);
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (raw) {
        const list: WeeklyStudyMessage[] = JSON.parse(raw);
        const nextList = list.filter(item => item.id !== id);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(nextList));
      }
    } catch (e) {
      console.error('Erro ao remover do cache local:', e);
    }
  }

  return true;
}

/**
 * Dispara uma mensagem imediatamente via WhatsApp Gateway (Evolution API / Baileys)
 * ou realiza um disparo simulado com registro de log
 */
export async function dispatchWhatsAppMessage(
  message: WeeklyStudyMessage,
  config: WhatsAppConfig
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const targetJid = message.whatsapp_group_jid || config.groupJid;

  if (!targetJid) {
    const err = 'JID do grupo do WhatsApp não configurado.';
    await updateWeeklyStudyMessage(message.id, { status: 'falha', last_error: err });
    return { success: false, error: err };
  }

  // Se estiver em modo simulado ou se a URL não tiver sido configurada
  if (config.simulateDispatch || !config.serverUrl) {
    await new Promise(res => setTimeout(res, 800)); // Pequeno delay realista
    const mockId = `WATP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const nowIso = new Date().toISOString();

    await updateWeeklyStudyMessage(message.id, {
      status: 'enviado',
      sent_at: nowIso,
      last_error: null
    });

    return {
      success: true,
      messageId: mockId
    };
  }

  // Disparo Real via Evolution API
  try {
    const cleanServerUrl = config.serverUrl.replace(/\/$/, '');
    const instance = config.instanceName || 'quimica-lideres';
    const endpoint = `${cleanServerUrl}/message/sendText/${instance}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) {
      headers['apikey'] = config.apiKey;
    }

    const payload = {
      number: targetJid,
      text: message.mensagem_texto,
      options: {
        delay: 1200,
        presence: 'composing',
        linkPreview: false
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Evolution API retornou status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const messageId = data?.key?.id || data?.id || `EVO-${Date.now()}`;
    const nowIso = new Date().toISOString();

    await updateWeeklyStudyMessage(message.id, {
      status: 'enviado',
      sent_at: nowIso,
      last_error: null
    });

    return { success: true, messageId };
  } catch (error: any) {
    console.error('Falha no envio da mensagem via WhatsApp:', error);
    const errorMsg = error.message || 'Erro desconhecido ao comunicar com a Evolution API.';

    await updateWeeklyStudyMessage(message.id, {
      status: 'falha',
      last_error: errorMsg
    });

    return { success: false, error: errorMsg };
  }
}
