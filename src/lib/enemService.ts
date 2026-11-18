import { EnemSimulation, EnemSubmission, EnemAnswerOption } from '../types';
import { supabase } from './supabase';
import { safeGetItem, safeSetItem } from './safeStorage';
import { AI_MODEL_MAIN, callAiGateway, extractJsonObject } from './aiClient';

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
  answers: Record<number, EnemAnswerOption> | undefined | null,
  officialAnswers: Record<number, EnemAnswerOption> | undefined | null
): EnemCorrectionStats {
  const safeAnswers = answers && typeof answers === 'object' ? answers : {};
  const safeOfficial =
    officialAnswers && typeof officialAnswers === 'object'
      ? officialAnswers
      : DEFAULT_SIMULATION.official_answers;
  let totalCorrect = 0;
  let totalBlank = 0;
  let totalMultiple = 0;
  let totalWrong = 0;

  for (let q = 1; q <= 45; q++) {
    const studentAns = safeAnswers[q] || 'BLANK';
    const officialAns = safeOfficial[q] || 'A';

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
    score: calculateEnemScore(totalCorrect),
  };
}

export function getScoreBadgeColor(score: number): string {
  if (score >= 4.0)
    return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-400';
  if (score >= 3.0)
    return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-400';
  if (score >= 2.0)
    return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-400';
  if (score >= 1.0)
    return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-400';
  return 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-400';
}

const LOCAL_STORAGE_SIM_KEY = 'enem_simulation_config_v1';
const LOCAL_STORAGE_SUBMISSIONS_KEY = 'enem_simulation_submissions_v1';

export const DEFAULT_ACCESS_CODE = 'ENEM2026';

export interface EnemSimulationPreset {
  id: string;
  shortLabel: string;
  title: string;
  area: string;
}

// Catálogo oficial dos Simulados ENEM por área (mantém o ID original de Natureza para preservar 100% das correções já feitas)
export const ENEM_SIMULATIONS_CATALOG: EnemSimulationPreset[] = [
  {
    id: 'sim-ciencias-natureza-2026',
    shortLabel: 'Natureza',
    title: 'Simulado ENEM - Ciências da Natureza',
    area: 'Ciências da Natureza e suas Tecnologias (Química, Física e Biologia)',
  },
  {
    id: 'sim-linguagens-2026',
    shortLabel: 'Linguagens',
    title: 'Simulado ENEM - Linguagens e Códigos',
    area: 'Linguagens, Códigos e suas Tecnologias',
  },
  {
    id: 'sim-matematica-2026',
    shortLabel: 'Matemática',
    title: 'Simulado ENEM - Matemática',
    area: 'Matemática e suas Tecnologias',
  },
];

const DEFAULT_OFFICIAL_ANSWERS: Record<number, EnemAnswerOption> = Array.from(
  { length: 45 },
  (_, i) => ({
    num: i + 1,
    ans: ['A', 'B', 'C', 'D', 'E'][i % 5] as EnemAnswerOption,
  })
).reduce((acc, curr) => {
  acc[curr.num] = curr.ans;
  return acc;
}, {} as Record<number, EnemAnswerOption>);

export const DEFAULT_SIMULATION: EnemSimulation = {
  id: ENEM_SIMULATIONS_CATALOG[0].id,
  title: ENEM_SIMULATIONS_CATALOG[0].title,
  area: ENEM_SIMULATIONS_CATALOG[0].area,
  total_questions: 45,
  access_code: DEFAULT_ACCESS_CODE,
  official_answers: DEFAULT_OFFICIAL_ANSWERS,
};

// ID mestre legado (Natureza / Código de Acesso compartilhado)
export const SHARED_SIMULATION_ID = DEFAULT_SIMULATION.id;

export function getSimulationCatalogMeta(simulationId?: string): EnemSimulationPreset {
  const found = ENEM_SIMULATIONS_CATALOG.find((item) => item.id === simulationId);
  return found || ENEM_SIMULATIONS_CATALOG[0];
}

const VALID_OFFICIAL_OPTIONS = new Set<string>(['A', 'B', 'C', 'D', 'E', 'ANULADA']);
const VALID_SUBMISSION_OPTIONS = new Set<string>([
  'A',
  'B',
  'C',
  'D',
  'E',
  'BLANK',
  'DUPLA',
  'ANULADA',
]);

export function sanitizeOfficialAnswers(raw: unknown): Record<number, EnemAnswerOption> {
  const source = raw && typeof raw === 'object' ? (raw as Record<string | number, unknown>) : {};
  const clean: Record<number, EnemAnswerOption> = {};
  for (let q = 1; q <= 45; q++) {
    const rawVal = source[q] ?? source[String(q)];
    const val = typeof rawVal === 'string' ? rawVal.trim().toUpperCase() : '';
    clean[q] = VALID_OFFICIAL_OPTIONS.has(val)
      ? (val as EnemAnswerOption)
      : DEFAULT_SIMULATION.official_answers[q];
  }
  return clean;
}

export function sanitizeSubmissionAnswers(raw: unknown): Record<number, EnemAnswerOption> {
  const source = raw && typeof raw === 'object' ? (raw as Record<string | number, unknown>) : {};
  const clean: Record<number, EnemAnswerOption> = {};
  for (let q = 1; q <= 45; q++) {
    const rawVal = source[q] ?? source[String(q)];
    const val = typeof rawVal === 'string' ? rawVal.trim().toUpperCase() : '';
    clean[q] = VALID_SUBMISSION_OPTIONS.has(val) ? (val as EnemAnswerOption) : 'BLANK';
  }
  return clean;
}

export function getSimulationIdForUser(
  reviewerName?: string,
  baseSimulationId: string = DEFAULT_SIMULATION.id
): string {
  const cleanBaseId = baseSimulationId || DEFAULT_SIMULATION.id;
  if (
    !reviewerName ||
    typeof reviewerName !== 'string' ||
    !reviewerName.trim() ||
    reviewerName.toLowerCase() === 'administrador' ||
    reviewerName.toLowerCase() === 'admin'
  ) {
    return cleanBaseId;
  }
  const cleanReviewer = reviewerName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  // Preserva compatibilidade com gabaritos pessoais antigos criados no simulado de Natureza
  if (cleanBaseId === DEFAULT_SIMULATION.id) {
    return `sim-enem-${cleanReviewer}`;
  }
  return `sim-enem-${cleanBaseId}-${cleanReviewer}`;
}

export function sanitizeSimulation(
  raw: unknown,
  reviewerName?: string,
  baseSimulationId: string = DEFAULT_SIMULATION.id
): EnemSimulation {
  const meta = getSimulationCatalogMeta(baseSimulationId);
  const targetId = getSimulationIdForUser(reviewerName, meta.id);
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const defaultTitle =
    reviewerName &&
    typeof reviewerName === 'string' &&
    reviewerName.trim() &&
    reviewerName.toLowerCase() !== 'administrador'
      ? `Gabarito de ${reviewerName.trim()} (${meta.shortLabel})`
      : meta.title;

  return {
    id: typeof obj.id === 'string' && obj.id.trim() ? obj.id : targetId,
    title: typeof obj.title === 'string' && obj.title.trim() ? obj.title : defaultTitle,
    area: typeof obj.area === 'string' && obj.area.trim() ? obj.area : meta.area,
    total_questions: Number(obj.total_questions) > 0 ? Number(obj.total_questions) : 45,
    access_code:
      typeof obj.access_code === 'string' && obj.access_code.trim()
        ? obj.access_code.trim()
        : DEFAULT_SIMULATION.access_code,
    official_answers: sanitizeOfficialAnswers(obj.official_answers),
    created_at: typeof obj.created_at === 'string' ? obj.created_at : undefined,
  };
}

function normalizeSubmissionSimulationId(rawSimId: unknown): string {
  if (typeof rawSimId !== 'string' || !rawSimId.trim()) {
    return DEFAULT_SIMULATION.id;
  }
  const trimmed = rawSimId.trim();
  const matchedPreset = ENEM_SIMULATIONS_CATALOG.find((item) => item.id === trimmed);
  if (matchedPreset) return matchedPreset.id;

  // Compatibilidade com submissões legadas gravadas com ID de corretor (sim-enem-<nome>) antes da separação
  if (trimmed.startsWith('sim-enem-')) {
    for (const preset of ENEM_SIMULATIONS_CATALOG) {
      if (trimmed.startsWith(`sim-enem-${preset.id}-`)) {
        return preset.id;
      }
    }
    return DEFAULT_SIMULATION.id;
  }

  return trimmed;
}

export function sanitizeSubmission(raw: unknown): EnemSubmission | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const studentId = typeof d.student_id === 'string' ? d.student_id.trim() : '';
  if (!studentId) return null;

  const resolvedSimId = normalizeSubmissionSimulationId(d.simulation_id);
  const totalCorrectNum = Number(d.total_correct);
  const scorePointsNum = Number(d.score_points);
  const safeTotalCorrect = Number.isFinite(totalCorrectNum) ? totalCorrectNum : 0;
  const safeScorePoints = Number.isFinite(scorePointsNum)
    ? scorePointsNum
    : calculateEnemScore(safeTotalCorrect);

  return {
    id: typeof d.id === 'string' && d.id.trim() ? d.id : `${resolvedSimId}_${studentId}`,
    simulation_id: resolvedSimId,
    student_id: studentId,
    student_name:
      typeof d.student_name === 'string' && d.student_name.trim() ? d.student_name : 'Aluno',
    roll_number:
      d.roll_number !== null && d.roll_number !== undefined && Number.isFinite(Number(d.roll_number))
        ? Number(d.roll_number)
        : undefined,
    class_id: typeof d.class_id === 'string' ? d.class_id : '',
    class_name: typeof d.class_name === 'string' ? d.class_name : undefined,
    reviewer_name:
      typeof d.reviewer_name === 'string' && d.reviewer_name.trim()
        ? d.reviewer_name
        : 'Corretor',
    answers: sanitizeSubmissionAnswers(d.answers),
    total_correct: safeTotalCorrect,
    score_points: safeScorePoints,
    blank_count: Number.isFinite(Number(d.blank_count)) ? Number(d.blank_count) : undefined,
    multiple_count: Number.isFinite(Number(d.multiple_count))
      ? Number(d.multiple_count)
      : undefined,
    created_at:
      typeof d.created_at === 'string' && d.created_at
        ? d.created_at
        : new Date().toISOString(),
    updated_at: typeof d.updated_at === 'string' ? d.updated_at : undefined,
  };
}

// Obter simulado configurado (por área e com suporte a gabarito individual por corretor)
export function getStoredSimulation(
  reviewerName?: string,
  baseSimulationId: string = DEFAULT_SIMULATION.id
): EnemSimulation {
  const meta = getSimulationCatalogMeta(baseSimulationId);
  const targetId = getSimulationIdForUser(reviewerName, meta.id);
  const storageKey = `${LOCAL_STORAGE_SIM_KEY}_${targetId}`;

  try {
    const raw = safeGetItem(storageKey);
    if (raw) {
      return sanitizeSimulation(JSON.parse(raw), reviewerName, meta.id);
    }
    if (targetId === DEFAULT_SIMULATION.id) {
      const legacyRaw = safeGetItem(LOCAL_STORAGE_SIM_KEY);
      if (legacyRaw) {
        return sanitizeSimulation(JSON.parse(legacyRaw), reviewerName, meta.id);
      }
    }
  } catch (e) {
    console.error('Erro ao ler simulado local:', e);
  }

  // Fallback para código de acesso mestre ou gabarito oficial base daquela área
  let baseAnswers = { ...DEFAULT_SIMULATION.official_answers };
  let masterAccessCode = DEFAULT_SIMULATION.access_code;
  try {
    const baseRaw = safeGetItem(`${LOCAL_STORAGE_SIM_KEY}_${meta.id}`);
    if (baseRaw) {
      const parsedBase = sanitizeSimulation(JSON.parse(baseRaw), undefined, meta.id);
      baseAnswers = parsedBase.official_answers;
      masterAccessCode = parsedBase.access_code;
    }
    const masterRaw =
      safeGetItem(`${LOCAL_STORAGE_SIM_KEY}_${DEFAULT_SIMULATION.id}`) ||
      safeGetItem(LOCAL_STORAGE_SIM_KEY);
    if (masterRaw) {
      const parsedMaster = sanitizeSimulation(JSON.parse(masterRaw));
      masterAccessCode = parsedMaster.access_code;
      if (!baseRaw && meta.id === DEFAULT_SIMULATION.id) {
        baseAnswers = parsedMaster.official_answers;
      }
    }
  } catch {
    // fallback
  }

  return sanitizeSimulation(
    {
      id: targetId,
      title:
        reviewerName &&
        typeof reviewerName === 'string' &&
        reviewerName.toLowerCase() !== 'administrador'
          ? `Gabarito de ${reviewerName} (${meta.shortLabel})`
          : meta.title,
      area: meta.area,
      total_questions: 45,
      access_code: masterAccessCode,
      official_answers: baseAnswers,
    },
    reviewerName,
    meta.id
  );
}

export async function fetchRemoteSimulation(
  reviewerName?: string,
  baseSimulationId: string = DEFAULT_SIMULATION.id
): Promise<EnemSimulation> {
  const meta = getSimulationCatalogMeta(baseSimulationId);
  const targetId = getSimulationIdForUser(reviewerName, meta.id);
  const local = getStoredSimulation(reviewerName, meta.id);
  if (!supabase) return local;

  try {
    const idsToFetch = Array.from(new Set([DEFAULT_SIMULATION.id, meta.id, targetId]));

    const { data, error } = await supabase
      .from('enem_simulations')
      .select('*')
      .in('id', idsToFetch);

    if (!error && Array.isArray(data) && data.length > 0) {
      const masterRow = data.find((r) => r && r.id === DEFAULT_SIMULATION.id);
      if (masterRow) {
        const masterMerged = sanitizeSimulation({
          ...masterRow,
          id: DEFAULT_SIMULATION.id,
        });
        saveStoredSimulationLocal(masterMerged, undefined, DEFAULT_SIMULATION.id);
      }

      const baseRow = data.find((r) => r && r.id === meta.id);
      if (baseRow && meta.id !== DEFAULT_SIMULATION.id) {
        const baseMerged = sanitizeSimulation(
          {
            ...baseRow,
            id: meta.id,
            access_code: masterRow?.access_code || baseRow.access_code,
          },
          undefined,
          meta.id
        );
        saveStoredSimulationLocal(baseMerged, undefined, meta.id);
      }

      const targetRow = data.find((r) => r && r.id === targetId);
      if (targetRow) {
        const merged = sanitizeSimulation(
          {
            ...local,
            ...targetRow,
            access_code: masterRow?.access_code || targetRow.access_code || local.access_code,
            official_answers: targetRow.official_answers || local.official_answers,
          },
          reviewerName,
          meta.id
        );
        saveStoredSimulationLocal(merged, reviewerName, meta.id);
        return merged;
      }

      if (baseRow && targetId !== meta.id) {
        const hasLocalCustom = !!safeGetItem(`${LOCAL_STORAGE_SIM_KEY}_${targetId}`);
        return sanitizeSimulation(
          {
            ...local,
            id: targetId,
            access_code: masterRow?.access_code || baseRow.access_code || local.access_code,
            official_answers: hasLocalCustom
              ? local.official_answers
              : baseRow.official_answers || local.official_answers,
          },
          reviewerName,
          meta.id
        );
      }

      if (!baseRow && meta.id !== DEFAULT_SIMULATION.id && masterRow) {
        return sanitizeSimulation(
          {
            ...local,
            access_code: masterRow.access_code || local.access_code,
          },
          reviewerName,
          meta.id
        );
      }
    }
  } catch (e) {
    console.warn('Supabase offline ou tabela enem_simulations inexistente. Usando local:', e);
  }

  return local;
}

// Buscar mapa de todos os gabaritos (todas as áreas + individuais dos corretores) para auditoria fiel
export async function fetchAllSimulationsMap(): Promise<Record<string, Record<number, EnemAnswerOption>>> {
  const map: Record<string, Record<number, EnemAnswerOption>> = {};
  for (const preset of ENEM_SIMULATIONS_CATALOG) {
    map[preset.id] = getStoredSimulation(undefined, preset.id).official_answers;
  }

  if (!supabase) return map;

  try {
    const { data, error } = await supabase
      .from('enem_simulations')
      .select('id, official_answers');

    if (!error && Array.isArray(data)) {
      for (const row of data) {
        if (row && row.id && row.official_answers) {
          map[row.id] = sanitizeOfficialAnswers(row.official_answers);
        }
      }
    }
  } catch (e) {
    console.warn('Não foi possível carregar mapa completo de gabaritos:', e);
  }

  return map;
}

// Salvar simulado configurado localmente
function saveStoredSimulationLocal(
  sim: EnemSimulation,
  reviewerName?: string,
  baseSimulationId: string = sim.id
): void {
  const meta = getSimulationCatalogMeta(baseSimulationId);
  const targetId = getSimulationIdForUser(reviewerName, meta.id);
  const storageKey = `${LOCAL_STORAGE_SIM_KEY}_${targetId}`;
  try {
    const serialized = JSON.stringify(sanitizeSimulation(sim, reviewerName, meta.id));
    safeSetItem(storageKey, serialized);
    if (targetId === DEFAULT_SIMULATION.id) {
      safeSetItem(LOCAL_STORAGE_SIM_KEY, serialized);
    }
  } catch (e) {
    console.error('Erro ao salvar simulado local:', e);
  }
}

// Garante que o registro do simulado exista em enem_simulations (evita erro de chave estrangeira em enem_submissions)
async function ensureSimulationExists(simulationId: string): Promise<void> {
  if (!supabase) return;
  try {
    const meta = getSimulationCatalogMeta(simulationId);
    const localSim = getStoredSimulation(undefined, meta.id);
    await supabase.from('enem_simulations').upsert(
      {
        id: meta.id,
        title: localSim.title || meta.title,
        area: localSim.area || meta.area,
        total_questions: 45,
        access_code: localSim.access_code || DEFAULT_ACCESS_CODE,
        official_answers: localSim.official_answers || DEFAULT_OFFICIAL_ANSWERS,
      },
      { onConflict: 'id' }
    );
  } catch {
    // Ignorar silenciosamente se já existir ou sem permissão
  }
}

// Salvar simulado no Supabase e no Cache local (por área e/ou individual por corretor)
export async function saveStoredSimulation(
  sim: EnemSimulation,
  reviewerName?: string,
  baseSimulationId: string = sim.id
): Promise<void> {
  const meta = getSimulationCatalogMeta(baseSimulationId);
  const targetId = getSimulationIdForUser(reviewerName, meta.id);
  const isReviewer = Boolean(
    reviewerName &&
      reviewerName.trim() &&
      reviewerName.toLowerCase() !== 'administrador' &&
      reviewerName.toLowerCase() !== 'admin'
  );

  const toSave: EnemSimulation = {
    ...sim,
    id: targetId,
    title: isReviewer ? `Gabarito de ${reviewerName} (${meta.shortLabel})` : sim.title || meta.title,
    area: sim.area || meta.area,
    total_questions: 45,
  };

  saveStoredSimulationLocal(toSave, reviewerName, meta.id);

  if (!supabase) return;

  try {
    const { error } = await supabase.from('enem_simulations').upsert(
      {
        id: toSave.id,
        title: toSave.title,
        area: toSave.area,
        total_questions: toSave.total_questions,
        access_code: toSave.access_code,
        official_answers: toSave.official_answers,
      },
      { onConflict: 'id' }
    );

    if (error) {
      console.warn('Aviso ao salvar enem_simulations:', error.message);
    }

    // Se o Admin atualizou o código de acesso, mantém o registro mestre sincronizado para o Login dos corretores
    if (!isReviewer && toSave.access_code) {
      if (toSave.id !== DEFAULT_SIMULATION.id) {
        const masterLocal = getStoredSimulation(undefined, DEFAULT_SIMULATION.id);
        const masterUpdated = { ...masterLocal, access_code: toSave.access_code };
        saveStoredSimulationLocal(masterUpdated, undefined, DEFAULT_SIMULATION.id);
        await supabase
          .from('enem_simulations')
          .update({ access_code: toSave.access_code })
          .eq('id', DEFAULT_SIMULATION.id);
      }

      for (const preset of ENEM_SIMULATIONS_CATALOG) {
        if (preset.id !== toSave.id) {
          const otherLocal = getStoredSimulation(undefined, preset.id);
          saveStoredSimulationLocal(
            { ...otherLocal, access_code: toSave.access_code },
            undefined,
            preset.id
          );
          await supabase
            .from('enem_simulations')
            .update({ access_code: toSave.access_code })
            .eq('id', preset.id);
        }
      }
    }
  } catch (e) {
    console.warn('Erro ao sincronizar enem_simulations com Supabase:', e);
  }
}

// Deduplica submissões mantendo sempre a mais recente por par (simulation_id + student_id)
function deduplicateSubmissions(list: EnemSubmission[]): EnemSubmission[] {
  const byKey = new Map<string, EnemSubmission>();

  for (const item of list) {
    if (!item || !item.student_id) continue;
    const simId = item.simulation_id || DEFAULT_SIMULATION.id;
    const key = `${simId}::${item.student_id}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...item, simulation_id: simId });
    } else {
      const existingTime = new Date(existing.updated_at || existing.created_at || 0).getTime();
      const itemTime = new Date(item.updated_at || item.created_at || 0).getTime();
      if (itemTime >= existingTime) {
        byKey.set(key, { ...item, simulation_id: simId });
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
    const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
    return timeB - timeA;
  });
}

// Obter submissões locais (de todos os simulados ENEM)
export function getStoredSubmissions(): EnemSubmission[] {
  try {
    const raw = safeGetItem(LOCAL_STORAGE_SUBMISSIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const sanitized = parsed
          .map((item) => sanitizeSubmission(item))
          .filter((item): item is EnemSubmission => item !== null);
        return deduplicateSubmissions(sanitized);
      }
    }
  } catch (e) {
    console.error('Erro ao ler submissões locais:', e);
  }
  return [];
}

// Persiste uma submissão no Supabase vinculada ao seu simulation_id específico (Natureza, Linguagens, Matemática...)
async function persistSubmissionRemote(
  sub: EnemSubmission
): Promise<{ ok: boolean; errorMessage?: string }> {
  if (!supabase) return { ok: false, errorMessage: 'Supabase não configurado.' };

  const simId = sub.simulation_id || DEFAULT_SIMULATION.id;
  const canonicalId = `${simId}_${sub.student_id}`;
  const basePayload = {
    simulation_id: simId,
    student_id: sub.student_id,
    student_name: sub.student_name,
    roll_number: sub.roll_number ?? null,
    class_id: sub.class_id,
    reviewer_name: sub.reviewer_name,
    answers: sub.answers,
    total_correct: sub.total_correct,
    score_points: sub.score_points,
  };

  try {
    let { error } = await supabase
      .from('enem_submissions')
      .upsert(basePayload, { onConflict: 'simulation_id,student_id' });

    // Se falhar por FK (registro do simulado ainda não criado em enem_simulations), cria e tenta novamente
    if (error && (error.code === '23503' || error.message?.toLowerCase().includes('foreign key'))) {
      await ensureSimulationExists(simId);
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

    // Fallback caso não haja constraint única composta (42P10): verifica existência por (simulation_id, student_id)
    if (error && (error.code === '42P10' || error.message?.toLowerCase().includes('on conflict'))) {
      const { data: existingRows } = await supabase
        .from('enem_submissions')
        .select('id')
        .eq('simulation_id', simId)
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
          .insert({ id: canonicalId, ...basePayload });
        error = ins.error;

        if (error && error.message?.toLowerCase().includes('invalid input syntax for type uuid')) {
          const insNoId = await supabase.from('enem_submissions').insert(basePayload);
          error = insNoId.error;
        }
      }
    }

    if (error) {
      console.warn('Erro retornado pelo Supabase ao salvar enem_submissions:', error);
      return { ok: false, errorMessage: error.message };
    }

    return { ok: true };
  } catch (e: any) {
    console.warn('Falha de rede ao salvar submissão no Supabase:', e);
    return { ok: false, errorMessage: e?.message || 'Falha de rede' };
  }
}

// Buscar TODAS as submissões dos Simulados ENEM no Supabase (preservando simulation_id de cada área)
export async function fetchRemoteSubmissions(
  _simulationId?: string,
  _reviewerName?: string
): Promise<EnemSubmission[]> {
  const local = getStoredSubmissions();
  if (!supabase) return local;

  try {
    const { data, error } = await supabase
      .from('enem_submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      const remoteFormatted: EnemSubmission[] = data
        .map((d: any) => sanitizeSubmission(d))
        .filter((item): item is EnemSubmission => item !== null);

      const remoteKeys = new Set(
        remoteFormatted.map((r) => `${r.simulation_id}::${r.student_id}`)
      );

      // Resgate automático apenas de itens locais que ainda não subiram ao Supabase para aquele (simulation_id, student_id)
      const unsyncedLocal = local.filter(
        (item) => !remoteKeys.has(`${item.simulation_id}::${item.student_id}`)
      );

      if (unsyncedLocal.length > 0) {
        for (const pending of unsyncedLocal) {
          const res = await persistSubmissionRemote(pending);
          if (res.ok) {
            remoteFormatted.push(pending);
          }
        }
      }

      const unified = deduplicateSubmissions(remoteFormatted);
      safeSetItem(LOCAL_STORAGE_SUBMISSIONS_KEY, JSON.stringify(unified));
      return unified;
    }
  } catch (e) {
    console.warn('Supabase offline ou tabela enem_submissions inexistente. Usando local:', e);
  }

  return local;
}

export interface SaveSubmissionResult {
  submissions: EnemSubmission[];
  syncedRemote: boolean;
  syncError?: string;
}

// Salvar submissão de aluno para um simulado específico (local + Supabase compartilhado)
export async function saveStoredSubmission(sub: EnemSubmission): Promise<SaveSubmissionResult> {
  const sanitizedInput = sanitizeSubmission(sub) || sub;
  const simId = sanitizedInput.simulation_id || DEFAULT_SIMULATION.id;
  const canonicalSub: EnemSubmission = {
    ...sanitizedInput,
    id: sanitizedInput.id || `${simId}_${sanitizedInput.student_id}`,
    simulation_id: simId,
    updated_at: new Date().toISOString(),
  };

  const current = getStoredSubmissions();
  const existingIdx = current.findIndex(
    (s) => s.student_id === canonicalSub.student_id && s.simulation_id === canonicalSub.simulation_id
  );

  let updated: EnemSubmission[];
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = canonicalSub;
  } else {
    updated = [canonicalSub, ...current];
  }

  updated = deduplicateSubmissions(updated);
  safeSetItem(LOCAL_STORAGE_SUBMISSIONS_KEY, JSON.stringify(updated));

  const remoteRes = await persistSubmissionRemote(canonicalSub);

  return {
    submissions: updated,
    syncedRemote: remoteRes.ok,
    syncError: remoteRes.errorMessage,
  };
}

// Excluir submissão APENAS do simulado específico (nunca apaga outras áreas do mesmo aluno)
export async function deleteStoredSubmission(
  subId: string,
  studentId?: string,
  simulationId?: string
): Promise<EnemSubmission[]> {
  const current = getStoredSubmissions();
  const targetSub = current.find((s) => s.id === subId);
  const resolvedStudentId = studentId || targetSub?.student_id;
  const resolvedSimId = simulationId || targetSub?.simulation_id;

  const updated = current.filter((s) => {
    if (s.id === subId) return false;
    if (resolvedStudentId && resolvedSimId) {
      if (s.student_id === resolvedStudentId && s.simulation_id === resolvedSimId) {
        return false;
      }
    }
    return true;
  });

  safeSetItem(LOCAL_STORAGE_SUBMISSIONS_KEY, JSON.stringify(updated));

  if (supabase) {
    try {
      if (resolvedStudentId && resolvedSimId) {
        await supabase
          .from('enem_submissions')
          .delete()
          .eq('student_id', resolvedStudentId)
          .eq('simulation_id', resolvedSimId);
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

const ENEM_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: Array.from({ length: 45 }, (_, i) => String(i + 1)).reduce(
    (acc, key) => {
      acc[key] = {
        type: 'string',
        enum: ENEM_ANSWER_ENUM,
      };
      return acc;
    },
    {} as Record<string, unknown>
  ),
  required: Array.from({ length: 45 }, (_, i) => String(i + 1)),
  additionalProperties: false,
};

// Processar imagem do cartão resposta via IA (OpenRouter: google/gemini-3.8-flash em reasoning low com chaves 1..45)
export async function analyzeEnemBubbleSheet(
  imageBase64: string
): Promise<Record<number, EnemAnswerOption>> {
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
    const text = await callAiGateway({
      model: AI_MODEL_MAIN,
      prompt,
      images: [
        {
          mimeType: 'image/jpeg',
          data: cleanBase64,
        },
      ],
      responseFormat: {
        type: 'json_schema',
        json_schema: {
          name: 'enem_bubble_sheet',
          strict: true,
          schema: ENEM_JSON_SCHEMA,
        },
      },
      reasoningEffort: 'low',
      temperature: 0,
      seed: 42,
    });

    const parsed = extractJsonObject<any>(text);
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
    throw new Error(
      'Falha ao reconhecer o cartão-resposta. Você pode preencher ou ajustar as respostas manualmente.'
    );
  }
}
