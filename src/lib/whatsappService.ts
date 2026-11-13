import { ThinkingLevel } from '@google/genai';
import { ai, GEMINI_LITE_MODEL } from './gemini';
import { supabase } from './supabase';
import { WeeklyStudyMessage, ExtractedCampaign, WeeklyMessageStatus } from '../types';

const LOCAL_STORAGE_KEY = 'algoapp_weekly_study_messages';
const CLASS_LEADERS_KEY = 'algoapp_class_leaders';
const STUDENT_GUARDIANS_KEY = 'algoapp_student_guardians';
const SENT_HISTORY_KEY = 'algoapp_whatsapp_sent_history';

/**
 * Normaliza e sanitiza número de telefone para o padrão WhatsApp internacional.
 * Ex: "(11) 98765-4321" -> "5511987654321"
 */
export function cleanPhoneNumber(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';

  // Se tem 10 ou 11 dígitos (DDD + número brasileiro sem DDI), adiciona 55
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  // Se já tem 12 ou 13 dígitos e começa com 55
  return digits;
}

/**
 * Formata um número para exibição amigável em inputs e cartões
 * Ex: "5511987654321" ou "11987654321" -> "(11) 98765-4321"
 */
export function formatPhoneDisplay(phone: string): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2);
  }

  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
}

/**
 * Gera o link direto oficial do WhatsApp (Click-to-Chat wa.me)
 */
export function generateWhatsAppUrl(phone: string, text: string): string {
  const clean = cleanPhoneNumber(phone);
  const encoded = encodeURIComponent(text);
  if (!clean) {
    return `https://wa.me/?text=${encoded}`;
  }
  return `https://wa.me/${clean}?text=${encoded}`;
}

/**
 * Abre o WhatsApp em nova aba ou aplicativo nativo do celular
 */
export function openWhatsAppChat(phone: string, text: string): boolean {
  if (typeof window === 'undefined') return false;
  const url = generateWhatsAppUrl(phone, text);
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/**
 * Obtém dados do líder da turma (LocalStorage com fallback para campos da turma)
 */
export function getClassLeader(classId: string, fallback?: { leader_name?: string; leader_phone?: string }): { leaderName: string; leaderPhone: string } {
  if (typeof window === 'undefined') {
    return {
      leaderName: fallback?.leader_name || '',
      leaderPhone: fallback?.leader_phone || ''
    };
  }

  try {
    const raw = localStorage.getItem(CLASS_LEADERS_KEY);
    if (raw) {
      const map = JSON.parse(raw);
      if (map && map[classId]) {
        return {
          leaderName: map[classId].leaderName || fallback?.leader_name || '',
          leaderPhone: map[classId].leaderPhone || fallback?.leader_phone || ''
        };
      }
    }
  } catch (e) {
    console.warn('Erro ao ler líder do localStorage:', e);
  }

  return {
    leaderName: fallback?.leader_name || '',
    leaderPhone: fallback?.leader_phone || ''
  };
}

/**
 * Salva informações do líder da turma (no LocalStorage e tenta sincronizar no Supabase)
 */
export async function saveClassLeader(classId: string, leaderName: string, leaderPhone: string): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(CLASS_LEADERS_KEY);
      const map = raw ? JSON.parse(raw) : {};
      map[classId] = { leaderName: leaderName.trim(), leaderPhone: leaderPhone.trim() };
      localStorage.setItem(CLASS_LEADERS_KEY, JSON.stringify(map));
    } catch (e) {
      console.error('Erro ao salvar líder localmente:', e);
    }
  }

  // Tenta sincronizar com o Supabase de forma segura
  if (supabase) {
    try {
      await supabase
        .from('classes')
        .update({
          leader_name: leaderName.trim(),
          leader_phone: leaderPhone.trim()
        } as any)
        .eq('id', classId);
    } catch (e) {
      // Ignora se as colunas ainda não existirem no schema do banco
    }
  }
}

/**
 * Obtém contato do responsável pelo aluno
 */
export function getStudentGuardian(studentId: string, fallback?: { guardian_name?: string; guardian_phone?: string }): { guardianName: string; guardianPhone: string } {
  if (typeof window === 'undefined') {
    return {
      guardianName: fallback?.guardian_name || '',
      guardianPhone: fallback?.guardian_phone || ''
    };
  }

  try {
    const raw = localStorage.getItem(STUDENT_GUARDIANS_KEY);
    if (raw) {
      const map = JSON.parse(raw);
      if (map && map[studentId]) {
        return {
          guardianName: map[studentId].guardianName || fallback?.guardian_name || '',
          guardianPhone: map[studentId].guardianPhone || fallback?.guardian_phone || ''
        };
      }
    }
  } catch (e) {
    console.warn('Erro ao ler responsável do localStorage:', e);
  }

  return {
    guardianName: fallback?.guardian_name || '',
    guardianPhone: fallback?.guardian_phone || ''
  };
}

/**
 * Salva contato do responsável pelo aluno
 */
export async function saveStudentGuardian(studentId: string, guardianName: string, guardianPhone: string): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STUDENT_GUARDIANS_KEY);
      const map = raw ? JSON.parse(raw) : {};
      map[studentId] = { guardianName: guardianName.trim(), guardianPhone: guardianPhone.trim() };
      localStorage.setItem(STUDENT_GUARDIANS_KEY, JSON.stringify(map));
    } catch (e) {
      console.error('Erro ao salvar responsável localmente:', e);
    }
  }

  // Tenta sincronizar com o Supabase de forma segura
  if (supabase) {
    try {
      await supabase
        .from('students')
        .update({
          guardian_name: guardianName.trim(),
          guardian_phone: guardianPhone.trim()
        } as any)
        .eq('id', studentId);
    } catch (e) {
      // Ignora se as colunas ainda não existirem no schema
    }
  }
}

/**
 * Registra histórico de envio para controle visual do professor
 */
export function recordMessageSent(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(SENT_HISTORY_KEY);
    const history = raw ? JSON.parse(raw) : {};
    history[key] = new Date().toISOString();
    localStorage.setItem(SENT_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.warn('Erro ao gravar histórico de envio:', e);
  }
}

/**
 * Verifica quando uma mensagem foi enviada (ou null se nunca enviada)
 */
export function getMessageSentDate(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SENT_HISTORY_KEY);
    if (raw) {
      const history = JSON.parse(raw);
      return history[key] || null;
    }
  } catch (e) {
    return null;
  }
  return null;
}

// ==========================================
// FORMATAÇÃO DE MENSAGENS PARA WHATSAPP
// ==========================================

export function formatLeaderStudyMessage(options: {
  className: string;
  leaderName?: string;
  semanaNumero?: number;
  dataEnvio?: string;
  horarioEnvio?: string;
  studyText: string;
  teacherName?: string;
}): string {
  const leaderGreeting = options.leaderName?.trim() 
    ? `Olá, *${options.leaderName.trim()}*! 👋` 
    : `Olá, *Líder da Turma*! 👋`;

  let formattedDate = '';
  if (options.dataEnvio) {
    try {
      const parts = options.dataEnvio.split('-');
      if (parts.length === 3) {
        formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    } catch {
      formattedDate = options.dataEnvio;
    }
  }

  return [
    `*📚 ROTEIRO PEDAGÓGICO DE QUÍMICA*`,
    `*Turma:* ${options.className}`,
    options.semanaNumero ? `*Semana:* ${options.semanaNumero}` : '',
    formattedDate ? `*Previsão de Envio:* ${formattedDate}${options.horarioEnvio ? ` às ${options.horarioEnvio}` : ''}` : '',
    ``,
    leaderGreeting,
    `Por favor, compartilhe com todos os colegas no *grupo oficial da turma* o roteiro de estudos e repetição espaçada desta semana:`,
    ``,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    options.studyText.trim(),
    `━━━━━━━━━━━━━━━━━━━━━━`,
    ``,
    `💡 *Dica importante para os alunos:*`,
    `Copiem o bloco de texto acima e colem diretamente no aplicativo *AlgoApp / Anki* para praticar suas repetições espaçadas e fixar os conteúdos!`,
    ``,
    `_Bons estudos a todos!_ 🧪`,
    options.teacherName ? `_${options.teacherName}_` : `_Professor(a) de Química_`
  ].filter(line => line !== null && line !== undefined).join('\n');
}

export function formatStudentReportMessage(options: {
  studentName: string;
  className: string;
  periodName: string;
  guardianName?: string;
  grades?: {
    notebookScore?: number | null;
    ankiScore?: number | null;
    listsAverage?: number | null;
    examScore?: number | null;
    recoveryScore?: number | null;
    unitAverage?: number | null;
  };
  customNote?: string;
  teacherName?: string;
}): string {
  const greeting = options.guardianName?.trim()
    ? `Olá, *${options.guardianName.trim()}*! 👋`
    : `Olá, responsável! 👋`;

  const lines: string[] = [
    `*📊 BOLETIM DE DESEMPENHO - QUÍMICA*`,
    `*Aluno(a):* ${options.studentName}`,
    `*Turma:* ${options.className}`,
    `*Período:* ${options.periodName}`,
    ``,
    greeting,
    `Segue o acompanhamento de rendimento pedagógico do(a) estudante nas atividades e avaliações:`,
    ``
  ];

  if (options.grades) {
    const g = options.grades;
    lines.push(`📝 *Detalhamento das Notas:*`);
    if (g.notebookScore !== undefined && g.notebookScore !== null) {
      lines.push(`• Vistos de Caderno: *${g.notebookScore.toFixed(1)}*`);
    }
    if (g.ankiScore !== undefined && g.ankiScore !== null) {
      lines.push(`• AlgoApp / Anki (Repetição): *${g.ankiScore.toFixed(1)}*`);
    }
    if (g.listsAverage !== undefined && g.listsAverage !== null) {
      lines.push(`• Listas de Exercícios: *${g.listsAverage.toFixed(1)}*`);
    }
    if (g.examScore !== undefined && g.examScore !== null) {
      lines.push(`• Avaliação Oficial: *${g.examScore.toFixed(1)}*`);
    }
    if (g.recoveryScore !== undefined && g.recoveryScore !== null && g.recoveryScore > 0) {
      lines.push(`• Recuperação: *${g.recoveryScore.toFixed(1)}*`);
    }

    if (g.unitAverage !== undefined && g.unitAverage !== null) {
      lines.push(``);
      lines.push(`🎯 *MÉDIA DA UNIDADE: ${g.unitAverage.toFixed(1)}*`);
      const statusText = g.unitAverage >= 6.0 ? '✅ Aprovado(a) / Desempenho Adequado' : '⚠️ Atenção / Necessita Reforço Pedagógico';
      lines.push(`📌 *Situação:* ${statusText}`);
    }
    lines.push(``);
  }

  if (options.customNote?.trim()) {
    lines.push(`💬 *Observação do Professor:*`);
    lines.push(`${options.customNote.trim()}`);
    lines.push(``);
  }

  lines.push(`_Em caso de dúvidas ou necessidade de orientação pedagógica, permaneço à disposição!_ 🔬`);
  if (options.teacherName) {
    lines.push(`_${options.teacherName}_`);
  } else {
    lines.push(`_Professor(a) de Química_`);
  }

  return lines.join('\n');
}

export function formatGeneralNoticeMessage(options: {
  title: string;
  message: string;
  recipientName?: string;
  className?: string;
  teacherName?: string;
}): string {
  const greeting = options.recipientName?.trim()
    ? `Olá, *${options.recipientName.trim()}*! 👋`
    : `Olá! 👋`;

  return [
    `*📢 COMUNICADO PEDAGÓGICO - QUÍMICA*`,
    options.className ? `*Turma:* ${options.className}` : '',
    `*Assunto:* ${options.title}`,
    ``,
    greeting,
    options.message.trim(),
    ``,
    `_Qualquer dúvida, estou à disposição._`,
    options.teacherName ? `_${options.teacherName}_` : `_Professor(a) de Química_`
  ].filter(line => line !== '').join('\n');
}

// ==========================================
// EXTRAÇÃO DE PDF VIA GEMINI
// ==========================================

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

export async function extractStudyScheduleFromPdf(file: File): Promise<ExtractedCampaign> {
  if (!ai) {
    throw new Error('Chave da API Gemini não configurada.');
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
      model: GEMINI_LITE_MODEL,
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
        responseMimeType: 'application/json',
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MINIMAL
        }
      }
    });

    const responseText = response.text || '';
    if (!responseText) {
      throw new Error('A IA retornou uma resposta vazia.');
    }

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
    // Erro de cota / créditos esgotados
    if (error?.message?.includes('402') || error?.message?.includes('RESOURCE_EXHAUSTED') || error?.message?.includes('depleted')) {
      throw new Error('Créditos da chave Gemini esgotados. Você pode digitar ou colar o cronograma diretamente abaixo sem precisar da IA!');
    }
    throw new Error(error.message || 'Falha ao processar o arquivo PDF.');
  }
}

// ==========================================
// PERSISTÊNCIA DE CRONOGRAMA DE SEMANAS
// ==========================================

export async function fetchWeeklyStudyMessages(): Promise<{ data: WeeklyStudyMessage[]; source: 'supabase' | 'local' }> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('weekly_study_messages')
        .select('*')
        .order('semana_numero', { ascending: true });

      if (!error && data) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
        }
        return { data: data as WeeklyStudyMessage[], source: 'supabase' };
      }
    } catch (e) {
      console.warn('Tabela weekly_study_messages indisponível no Supabase, usando cache local:', e);
    }
  }

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

export async function saveWeeklyStudyMessages(
  messages: Array<Omit<WeeklyStudyMessage, 'id' | 'created_at'>>,
  campaignTitle: string,
  groupJid?: string
): Promise<{ count: number; source: 'supabase' | 'local' }> {
  const preparedRecords: WeeklyStudyMessage[] = messages.map(m => ({
    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    semana_numero: m.semana_numero,
    data_envio: m.data_envio,
    horario_envio: m.horario_envio,
    mensagem_texto: m.mensagem_texto,
    status: (m.status || 'agendado') as WeeklyMessageStatus,
    campaign_title: campaignTitle,
    whatsapp_group_jid: groupJid || 'lideres-sala',
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
      }
    } catch (e) {
      console.warn('Falha na gravação do Supabase:', e);
    }
  }

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
