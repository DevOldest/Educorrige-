import { EnemSimulation, EnemSubmission, EnemAnswerOption } from '../types';
import { supabase } from './supabase';
import { ThinkingLevel, Type, type Schema } from '@google/genai';
import { ai, GEMINI_MODEL } from './gemini';

// Regra de pontuação por faixas do Simulado ENEM:
// 1 a 10: 1.0 pt
// 11 a 21: 2.0 pts
// 22 a 33: 3.0 pts
// 34 a 45: 4.0 pts
export function calculateEnemScore(correctCount: number): number {
  if (correctCount <= 0) return 0.0;
  if (correctCount >= 1 && correctCount <= 10) return 1.0;
  if (correctCount >= 11 && correctCount <= 21) return 2.0;
  if (correctCount >= 22 && correctCount <= 33) return 3.0;
  if (correctCount >= 34 && correctCount <= 45) return 4.0;
  return 0.0;
}

// Regra de validação estrita da questão:
// 1. Não sinalizada / Em branco ('BLANK'): SEMPRE INCORRETA (0 pontos).
// 2. Duas alternativas marcadas, mais de uma ou todas marcadas / rasura ('DUPLA' ou 'ANULADA'): SEMPRE INCORRETA (0 pontos).
// 3. Questão anulada pela banca/professor no gabarito oficial ('ANULADA'): apenas pontua se o aluno assinalou uma alternativa válida (A..E).
// 4. Apenas pontua se for uma única alternativa assinalada (A..E) exatamente igual ao gabarito oficial.
export function isEnemQuestionCorrect(
  studentAns: EnemAnswerOption | string | undefined,
  officialAns: EnemAnswerOption | string | undefined
): boolean {
  if (!studentAns || studentAns === 'BLANK') return false;
  if (studentAns === 'DUPLA' || studentAns === 'ANULADA') return false;

  if (officialAns === 'ANULADA') {
    return ['A', 'B', 'C', 'D', 'E'].includes(studentAns);
  }

  return studentAns === officialAns;
}

export interface EnemCorrectionStats {
  totalCorrect: number;
  totalBlank: number;
  totalMultiple: number;
  totalWrong: number;
  totalQuestions: number;
  score: number;
}

export function calculateEnemStatistics(
  answers: Record<number, EnemAnswerOption>,
  officialAnswers: Record<number, EnemAnswerOption>
): EnemCorrectionStats {
  let totalCorrect = 0;
  let totalBlank = 0;
  let totalMultiple = 0;
  let totalWrong = 0;

  for (let q = 1; q <= 45; q++) {
    const studentAns = answers[q] || 'BLANK';
    const officialAns = officialAnswers[q] || 'A';

    if (studentAns === 'BLANK') {
      totalBlank++;
    } else if (studentAns === 'DUPLA' || studentAns === 'ANULADA') {
      totalMultiple++;
    } else if (isEnemQuestionCorrect(studentAns, officialAns)) {
      totalCorrect++;
    } else {
      totalWrong++;
    }
  }

  return {
    totalCorrect,
    totalBlank,
    totalMultiple,
    totalWrong,
    totalQuestions: 45,
    score: calculateEnemScore(totalCorrect)
  };
}

export function getScoreBadgeColor(score: number): string {
  if (score >= 4.0) return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400';
  if (score >= 3.0) return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-400';
  if (score >= 2.0) return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400';
  if (score >= 1.0) return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-400';
  return 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-400';
}

const LOCAL_STORAGE_SIM_KEY = 'enem_simulation_config_v1';
const LOCAL_STORAGE_SUBMISSIONS_KEY = 'enem_simulation_submissions_v1';

export const DEFAULT_ACCESS_CODE = 'ENEM2026';

export const DEFAULT_SIMULATION: EnemSimulation = {
  id: 'sim-ciencias-natureza-2026',
  title: 'Simulado ENEM - Ciências da Natureza',
  area: 'Ciências da Natureza e suas Tecnologias (Química, Física e Biologia)',
  total_questions: 45,
  access_code: DEFAULT_ACCESS_CODE,
  official_answers: Array.from({ length: 45 }, (_, i) => ({
    num: i + 1,
    ans: ['A', 'B', 'C', 'D', 'E'][i % 5] as EnemAnswerOption
  })).reduce((acc, curr) => {
    acc[curr.num] = curr.ans;
    return acc;
  }, {} as Record<number, EnemAnswerOption>)
};

// ID canônico único para o pool global de correções (garante visibilidade entre Admin e todos os Corretores)
export const SHARED_SIMULATION_ID = DEFAULT_SIMULATION.id;

// Obter ID determinístico do Gabarito Individual por usuário/corretor
export function getSimulationIdForUser(reviewerName?: string): string {
  if (!reviewerName || !reviewerName.trim() || reviewerName.toLowerCase() === 'administrador' || reviewerName.toLowerCase() === 'admin') {
    return DEFAULT_SIMULATION.id;
  }
  const clean = reviewerName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `sim-enem-${clean}`;
}

// Obter simulado configurado (com suporte a gabarito individual por corretor)
export function getStoredSimulation(reviewerName?: string): EnemSimulation {
  const targetId = getSimulationIdForUser(reviewerName);
  const storageKey = `${LOCAL_STORAGE_SIM_KEY}_${targetId}`;

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      return JSON.parse(raw);
    }
    // Para o admin, tenta ler também a chave legada
    if (targetId === DEFAULT_SIMULATION.id) {
      const legacyRaw = localStorage.getItem(LOCAL_STORAGE_SIM_KEY);
      if (legacyRaw) {
        return JSON.parse(legacyRaw);
      }
    }
  } catch (e) {
    console.error('Erro ao ler simulado local:', e);
  }

  // Se for corretor e ainda não tiver gabarito próprio salvo, inicializa com cópia do gabarito mestre
  let baseAnswers = { ...DEFAULT_SIMULATION.official_answers };
  let masterAccessCode = DEFAULT_SIMULATION.access_code;
  try {
    const masterRaw = localStorage.getItem(`${LOCAL_STORAGE_SIM_KEY}_${DEFAULT_SIMULATION.id}`) || localStorage.getItem(LOCAL_STORAGE_SIM_KEY);
    if (masterRaw) {
      const parsedMaster = JSON.parse(masterRaw);
      if (parsedMaster.official_answers) {
        baseAnswers = { ...parsedMaster.official_answers };
      }
      if (parsedMaster.access_code) {
        masterAccessCode = parsedMaster.access_code;
      }
    }
  } catch (e) {
    // fallback
  }

  return {
    ...DEFAULT_SIMULATION,
    id: targetId,
    access_code: masterAccessCode,
    title: reviewerName && reviewerName.toLowerCase() !== 'administrador' 
      ? `Gabarito de ${reviewerName}` 
      : DEFAULT_SIMULATION.title,
    official_answers: baseAnswers
  };
}

export async function fetchRemoteSimulation(reviewerName?: string): Promise<EnemSimulation> {
  const targetId = getSimulationIdForUser(reviewerName);
  const local = getStoredSimulation(reviewerName);
  if (!supabase) return local;

  try {
    // Busca tanto o gabarito mestre (para código de acesso atualizado e fallback) quanto o individual do corretor
    const idsToFetch = targetId === DEFAULT_SIMULATION.id
      ? [DEFAULT_SIMULATION.id]
      : [DEFAULT_SIMULATION.id, targetId];

    const { data, error } = await supabase
      .from('enem_simulations')
      .select('*')
      .in('id', idsToFetch);

    if (!error && Array.isArray(data) && data.length > 0) {
      const masterRow = data.find(r => r.id === DEFAULT_SIMULATION.id);
      if (masterRow) {
        const masterMerged: EnemSimulation = {
          id: masterRow.id,
          title: masterRow.title || DEFAULT_SIMULATION.title,
          area: masterRow.area || DEFAULT_SIMULATION.area,
          total_questions: masterRow.total_questions || 45,
          access_code: masterRow.access_code || DEFAULT_SIMULATION.access_code,
          official_answers: masterRow.official_answers || DEFAULT_SIMULATION.official_answers,
          created_at: masterRow.created_at
        };
        saveStoredSimulationLocal(masterMerged);
      }

      const targetRow = data.find(r => r.id === targetId);
      if (targetRow) {
        const merged: EnemSimulation = {
          id: targetRow.id,
          title: targetRow.title || local.title,
          area: targetRow.area || local.area,
          total_questions: targetRow.total_questions || 45,
          access_code: masterRow?.access_code || targetRow.access_code || local.access_code,
          official_answers: targetRow.official_answers || local.official_answers,
          created_at: targetRow.created_at
        };
        saveStoredSimulationLocal(merged, reviewerName);
        return merged;
      } else if (masterRow && targetId !== DEFAULT_SIMULATION.id) {
        // Se o corretor ainda não salvou gabarito próprio no banco, preserva o local dele ou usa o mestre como ponto de partida
        const hasLocalCustom = !!localStorage.getItem(`${LOCAL_STORAGE_SIM_KEY}_${targetId}`);
        const initialReviewerSim: EnemSimulation = {
          ...local,
          id: targetId,
          access_code: masterRow.access_code || local.access_code,
          official_answers: hasLocalCustom ? local.official_answers : (masterRow.official_answers || local.official_answers)
        };
        return initialReviewerSim;
      }
    }
  } catch (e) {
    console.warn('Supabase offline ou tabela enem_simulations inexistente. Usando local:', e);
  }

  return local;
}

// Buscar mapa de todos os gabaritos (Admin e Corretores) para auditoria fiel de qualquer correção
export async function fetchAllSimulationsMap(): Promise<Record<string, Record<number, EnemAnswerOption>>> {
  const map: Record<string, Record<number, EnemAnswerOption>> = {};
  const masterLocal = getStoredSimulation();
  map[DEFAULT_SIMULATION.id] = masterLocal.official_answers;

  if (!supabase) return map;

  try {
    const { data, error } = await supabase
      .from('enem_simulations')
      .select('id, official_answers');

    if (!error && Array.isArray(data)) {
      for (const row of data) {
        if (row.id && row.official_answers) {
          map[row.id] = row.official_answers;
        }
      }
    }
  } catch (e) {
    console.warn('Não foi possível carregar mapa completo de gabaritos:', e);
  }

  return map;
}

// Salvar simulado configurado localmente
function saveStoredSimulationLocal(sim: EnemSimulation, reviewerName?: string): void {
  const targetId = getSimulationIdForUser(reviewerName);
  const storageKey = `${LOCAL_STORAGE_SIM_KEY}_${targetId}`;
  try {
    localStorage.setItem(storageKey, JSON.stringify(sim));
    if (targetId === DEFAULT_SIMULATION.id) {
      localStorage.setItem(LOCAL_STORAGE_SIM_KEY, JSON.stringify(sim));
    }
  } catch (e) {
    console.error('Erro ao salvar simulado local:', e);
  }
}

// Garante que o registro mestre exista em enem_simulations (evita erro de chave estrangeira em enem_submissions)
async function ensureMasterSimulationExists(): Promise<void> {
  if (!supabase) return;
  try {
    const masterSim = getStoredSimulation();
    await supabase
      .from('enem_simulations')
      .upsert({
        id: DEFAULT_SIMULATION.id,
        title: masterSim.title || DEFAULT_SIMULATION.title,
        area: masterSim.area || DEFAULT_SIMULATION.area,
        total_questions: 45,
        access_code: masterSim.access_code || DEFAULT_SIMULATION.access_code,
        official_answers: masterSim.official_answers || DEFAULT_SIMULATION.official_answers
      }, { onConflict: 'id' });
  } catch (e) {
    // Ignorar silenciosamente se já existir ou sem permissão
  }
}

// Salvar simulado no Supabase e no Cache local (individual por corretor)
export async function saveStoredSimulation(sim: EnemSimulation, reviewerName?: string): Promise<void> {
  const targetId = getSimulationIdForUser(reviewerName);
  const toSave: EnemSimulation = {
    ...sim,
    id: targetId,
    title: reviewerName && reviewerName.toLowerCase() !== 'administrador'
      ? `Gabarito de ${reviewerName}`
      : sim.title
  };

  saveStoredSimulationLocal(toSave, reviewerName);

  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('enem_simulations')
      .upsert({
        id: toSave.id,
        title: toSave.title,
        area: toSave.area,
        total_questions: toSave.total_questions,
        access_code: toSave.access_code,
        official_answers: toSave.official_answers
      }, { onConflict: 'id' });

    if (error) {
      console.warn('Aviso ao salvar enem_simulations:', error.message);
    }
  } catch (e) {
    console.warn('Erro ao sincronizar enem_simulations com Supabase:', e);
  }
}

// Deduplica submissões mantendo sempre a mais recente por aluno (student_id)
function deduplicateSubmissionsByStudent(list: EnemSubmission[]): EnemSubmission[] {
  const byStudent = new Map<string, EnemSubmission>();

  for (const item of list) {
    if (!item || !item.student_id) continue;
    const existing = byStudent.get(item.student_id);
    if (!existing) {
      byStudent.set(item.student_id, item);
    } else {
      const existingTime = new Date(existing.updated_at || existing.created_at || 0).getTime();
      const itemTime = new Date(item.updated_at || item.created_at || 0).getTime();
      if (itemTime >= existingTime) {
        byStudent.set(item.student_id, item);
      }
    }
  }

  return Array.from(byStudent.values()).sort((a, b) => {
    const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
    const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
    return timeB - timeA;
  });
}

// Obter submissões locais
export function getStoredSubmissions(): EnemSubmission[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SUBMISSIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return deduplicateSubmissionsByStudent(parsed);
      }
    }
  } catch (e) {
    console.error('Erro ao ler submissões locais:', e);
  }
  return [];
}

// Persiste uma submissão no Supabase usando sempre o SHARED_SIMULATION_ID canônico
async function persistSubmissionRemote(sub: EnemSubmission): Promise<boolean> {
  if (!supabase) return false;

  const canonicalId = `${SHARED_SIMULATION_ID}_${sub.student_id}`;
  const basePayload = {
    simulation_id: SHARED_SIMULATION_ID,
    student_id: sub.student_id,
    student_name: sub.student_name,
    roll_number: sub.roll_number ?? null,
    class_id: sub.class_id,
    reviewer_name: sub.reviewer_name,
    answers: sub.answers,
    total_correct: sub.total_correct,
    score_points: sub.score_points
  };

  try {
    let { error } = await supabase
      .from('enem_submissions')
      .upsert(basePayload, { onConflict: 'simulation_id,student_id' });

    // Se falhar por FK (registro mestre ainda não criado em enem_simulations), cria o mestre e tenta novamente
    if (error && (error.code === '23503' || error.message?.toLowerCase().includes('foreign key'))) {
      await ensureMasterSimulationExists();
      const retryFk = await supabase
        .from('enem_submissions')
        .upsert(basePayload, { onConflict: 'simulation_id,student_id' });
      error = retryFk.error;
    }

    // Se a coluna 'id' for TEXT sem valor default (erro NOT NULL 23502), envia id explícito
    if (error && (error.code === '23502' || error.message?.toLowerCase().includes('null value in column "id"'))) {
      const retryWithId = await supabase
        .from('enem_submissions')
        .upsert({ id: canonicalId, ...basePayload }, { onConflict: 'simulation_id,student_id' });
      error = retryWithId.error;

      if (error && (error.code === '42P10' || error.message?.toLowerCase().includes('on conflict'))) {
        const retryByIdOnly = await supabase
          .from('enem_submissions')
          .upsert({ id: canonicalId, ...basePayload }, { onConflict: 'id' });
        error = retryByIdOnly.error;
      }
    }

    // Fallback caso não haja constraint única composta (42P10): verifica existência e faz update ou insert
    if (error && (error.code === '42P10' || error.message?.toLowerCase().includes('on conflict'))) {
      const { data: existingRows } = await supabase
        .from('enem_submissions')
        .select('id')
        .eq('simulation_id', SHARED_SIMULATION_ID)
        .eq('student_id', sub.student_id)
        .limit(1);

      if (existingRows && existingRows.length > 0) {
        const upd = await supabase
          .from('enem_submissions')
          .update(basePayload)
          .eq('id', existingRows[0].id);
        error = upd.error;
      } else {
        const ins = await supabase
          .from('enem_submissions')
          .insert(basePayload);
        error = ins.error;
      }
    }

    if (error) {
      console.warn('Erro retornado pelo Supabase ao salvar enem_submissions:', error);
      return false;
    }

    // Remove eventuais registros antigos deste mesmo aluno que estavam vinculados a simulation_id individual ('sim-enem-*')
    await supabase
      .from('enem_submissions')
      .delete()
      .eq('student_id', sub.student_id)
      .neq('simulation_id', SHARED_SIMULATION_ID);

    return true;
  } catch (e) {
    console.warn('Falha de rede ao salvar submissão no Supabase:', e);
    return false;
  }
}

// Buscar TODAS as submissões do Simulado ENEM no Supabase (visível para Admin e todos os Corretores)
export async function fetchRemoteSubmissions(_simulationId?: string, _reviewerName?: string): Promise<EnemSubmission[]> {
  const local = getStoredSubmissions();
  if (!supabase) return local;

  try {
    const { data, error } = await supabase
      .from('enem_submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const remoteFormatted: EnemSubmission[] = data.map((d: any) => ({
        id: d.id || `${SHARED_SIMULATION_ID}_${d.student_id}`,
        simulation_id: d.simulation_id || SHARED_SIMULATION_ID,
        student_id: d.student_id,
        student_name: d.student_name,
        roll_number: d.roll_number,
        class_id: d.class_id,
        reviewer_name: d.reviewer_name,
        answers: d.answers || {},
        total_correct: Number(d.total_correct || 0),
        score_points: Number(d.score_points || 0),
        blank_count: d.blank_count,
        multiple_count: d.multiple_count,
        created_at: d.created_at,
        updated_at: d.updated_at
      }));

      const remoteStudentIds = new Set(remoteFormatted.map(r => r.student_id));

      // Resgate automático: se este navegador tiver correções locais feitas com ID individual ('sim-enem-*')
      // que não haviam subido ao banco (ex: por falha de FK anterior), envia agora para todos verem!
      const unsyncedLocal = local.filter(
        item => item.simulation_id && item.simulation_id !== SHARED_SIMULATION_ID && !remoteStudentIds.has(item.student_id)
      );

      if (unsyncedLocal.length > 0) {
        for (const pending of unsyncedLocal) {
          await persistSubmissionRemote(pending);
          remoteFormatted.push({
            ...pending,
            id: `${SHARED_SIMULATION_ID}_${pending.student_id}`,
            simulation_id: SHARED_SIMULATION_ID
          });
        }
      }

      // Migra automaticamente registros remotos que estavam com simulation_id 'sim-enem-*' para o ID compartilhado
      const nonCanonicalRemote = remoteFormatted.filter(
        r => r.simulation_id && r.simulation_id !== SHARED_SIMULATION_ID
      );
      if (nonCanonicalRemote.length > 0) {
        Promise.all(nonCanonicalRemote.map(r => persistSubmissionRemote(r))).catch(() => {});
      }

      const unified = deduplicateSubmissionsByStudent(
        remoteFormatted.map(r => ({
          ...r,
          simulation_id: SHARED_SIMULATION_ID
        }))
      );

      try {
        localStorage.setItem(LOCAL_STORAGE_SUBMISSIONS_KEY, JSON.stringify(unified));
      } catch (e) {}

      return unified;
    }
  } catch (e) {
    console.warn('Supabase offline ou tabela enem_submissions inexistente. Usando local:', e);
  }

  return local;
}

// Salvar submissão de aluno (local + Supabase compartilhado para todos)
export async function saveStoredSubmission(sub: EnemSubmission): Promise<EnemSubmission[]> {
  const canonicalSub: EnemSubmission = {
    ...sub,
    id: sub.id || `${SHARED_SIMULATION_ID}_${sub.student_id}`,
    simulation_id: SHARED_SIMULATION_ID,
    updated_at: new Date().toISOString()
  };

  const current = getStoredSubmissions();
  const existingIdx = current.findIndex(s => s.student_id === canonicalSub.student_id);

  let updated: EnemSubmission[];
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = canonicalSub;
  } else {
    updated = [canonicalSub, ...current];
  }

  updated = deduplicateSubmissionsByStudent(updated);

  try {
    localStorage.setItem(LOCAL_STORAGE_SUBMISSIONS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Erro ao salvar submissão:', e);
  }

  await persistSubmissionRemote(canonicalSub);

  return updated;
}

// Excluir submissão (remove tanto pelo student_id quanto pelo ID da submissão)
export async function deleteStoredSubmission(subId: string, studentId?: string): Promise<EnemSubmission[]> {
  const current = getStoredSubmissions();
  const targetSub = current.find(s => s.id === subId);
  const resolvedStudentId = studentId || targetSub?.student_id;

  const updated = current.filter(s => {
    if (s.id === subId) return false;
    if (resolvedStudentId && s.student_id === resolvedStudentId) return false;
    return true;
  });

  try {
    localStorage.setItem(LOCAL_STORAGE_SUBMISSIONS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Erro ao deletar submissão:', e);
  }

  if (supabase) {
    try {
      if (resolvedStudentId) {
        await supabase.from('enem_submissions').delete().eq('student_id', resolvedStudentId);
      } else {
        await supabase.from('enem_submissions').delete().eq('id', subId);
      }
    } catch (e) {
      console.warn('Erro ao deletar submissão no Supabase:', e);
    }
  }

  return updated;
}

const ENEM_ANSWER_ENUM = ['A', 'B', 'C', 'D', 'E', 'BLANK', 'DUPLA'];

const ENEM_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: Array.from({ length: 45 }, (_, i) => String(i + 1)).reduce(
    (acc, key) => {
      acc[key] = {
        type: Type.STRING,
        enum: ENEM_ANSWER_ENUM,
      };
      return acc;
    },
    {} as Record<string, Schema>
  ),
  required: Array.from({ length: 45 }, (_, i) => String(i + 1)),
};

// Processar imagem do cartão resposta via IA (Opção A: Gemini 3.8 Flash em ThinkingLevel.LOW com chaves numeradas 1..45)
export async function analyzeEnemBubbleSheet(imageBase64: string): Promise<Record<number, EnemAnswerOption>> {
  if (!ai) {
    throw new Error('Chave da API de IA não configurada.');
  }

  const prompt = `Você é um leitor óptico (OMR) de precisão para Cartão-Resposta padrão ENEM com 45 questões numeradas de 1 a 45 (alternativas A, B, C, D, E).

INSTRUÇÕES DE LEITURA:
1. Leia coluna por coluna da esquerda para a direita sem pular nem deslocar números:
   - Coluna 1: questões 1 a 15
   - Coluna 2: questões 16 a 30
   - Coluna 3: questões 31 a 45
2. Para cada número impresso ("1" a "45"), verifique as 5 bolinhas (A, B, C, D, E) naquela linha exata:
   - Se exatamente UMA bolinha estiver preenchida/marcada com caneta ou lápis: retorne "A", "B", "C", "D" ou "E".
   - Se NENHUMA bolinha estiver marcada na linha (totalmente em branco): retorne "BLANK".
   - Se DUAS OU MAIS bolinhas estiverem marcadas ou houver rasura evidente: retorne "DUPLA".
3. Retorne ESTRITAMENTE um objeto JSON com as chaves "1" até "45" mapeando cada questão ao seu resultado.`;

  const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

  const executeWithRetry = async (attempt: number = 0): Promise<string> => {
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
                  mimeType: 'image/jpeg',
                  data: cleanBase64
                }
              }
            ]
          }
        ],
        config: {
          temperature: 0,
          seed: 42,
          responseMimeType: 'application/json',
          responseSchema: ENEM_RESPONSE_SCHEMA,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW
          }
        }
      });
      return response.text || '{}';
    } catch (err: any) {
      const isQuotaOrOverload = err.message?.includes('503') || err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED');
      if (isQuotaOrOverload && attempt < 3) {
        const jitter = Math.floor(Math.random() * 600);
        const waitTime = Math.pow(1.6, attempt + 1) * 750 + jitter;
        await new Promise(r => setTimeout(r, waitTime));
        return executeWithRetry(attempt + 1);
      }
      throw err;
    }
  };

  const normalizeOption = (raw: unknown): EnemAnswerOption => {
    const val = String(raw || 'BLANK').trim().toUpperCase();
    if (['A', 'B', 'C', 'D', 'E'].includes(val)) {
      return val as EnemAnswerOption;
    }
    if (val === 'DUPLA' || val === 'ANULADA' || val === 'MULTIPLE' || val === 'RASURA') {
      return 'DUPLA';
    }
    return 'BLANK';
  };

  try {
    const text = await executeWithRetry();
    const parsed = JSON.parse(text);
    const answers: Record<number, EnemAnswerOption> = {};

    const compactArray = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.a)
      ? parsed.a
      : Array.isArray(parsed?.answers)
      ? parsed.answers
      : null;

    if (compactArray) {
      for (let q = 1; q <= 45; q++) {
        answers[q] = normalizeOption(compactArray[q - 1]);
      }
      return answers;
    }

    const rawAnswers = parsed.answers || parsed;
    for (let q = 1; q <= 45; q++) {
      answers[q] = normalizeOption(rawAnswers[q] ?? rawAnswers[String(q)]);
    }

    return answers;
  } catch (error: any) {
    console.error('Erro na análise do cartão resposta via IA:', error);
    throw new Error('Falha ao reconhecer o cartão-resposta. Você pode preencher ou ajustar as respostas manualmente.');
  }
}
