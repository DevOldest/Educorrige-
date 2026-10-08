import { EnemSimulation, EnemSubmission, EnemAnswerOption } from '../types';
import { supabase } from './supabase';
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

// Obter simulado configurado (com sincronização Supabase)
export function getStoredSimulation(): EnemSimulation {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SIM_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Erro ao ler simulado local:', e);
  }
  return DEFAULT_SIMULATION;
}

export async function fetchRemoteSimulation(): Promise<EnemSimulation> {
  const local = getStoredSimulation();
  if (!supabase) return local;

  try {
    const { data, error } = await supabase
      .from('enem_simulations')
      .select('*')
      .eq('id', DEFAULT_SIMULATION.id)
      .maybeSingle();

    if (!error && data) {
      const merged: EnemSimulation = {
        id: data.id,
        title: data.title || local.title,
        area: data.area || local.area,
        total_questions: data.total_questions || 45,
        access_code: data.access_code || local.access_code,
        official_answers: data.official_answers || local.official_answers,
        created_at: data.created_at
      };
      saveStoredSimulationLocal(merged);
      return merged;
    }
  } catch (e) {
    console.warn('Supabase offline ou tabela enem_simulations inexistente. Usando local:', e);
  }

  return local;
}

// Salvar simulado configurado localmente
function saveStoredSimulationLocal(sim: EnemSimulation): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_SIM_KEY, JSON.stringify(sim));
  } catch (e) {
    console.error('Erro ao salvar simulado local:', e);
  }
}

// Salvar simulado no Supabase e no Cache local
export async function saveStoredSimulation(sim: EnemSimulation): Promise<void> {
  saveStoredSimulationLocal(sim);

  if (!supabase) return;

  try {
    await supabase
      .from('enem_simulations')
      .upsert({
        id: sim.id,
        title: sim.title,
        area: sim.area,
        total_questions: sim.total_questions,
        access_code: sim.access_code,
        official_answers: sim.official_answers,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
  } catch (e) {
    console.warn('Erro ao sincronizar enem_simulations com Supabase:', e);
  }
}

// Obter submissões locais
export function getStoredSubmissions(): EnemSubmission[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SUBMISSIONS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Erro ao ler submissões locais:', e);
  }
  return [];
}

// Buscar submissões no Supabase com sincronização
export async function fetchRemoteSubmissions(simulationId: string): Promise<EnemSubmission[]> {
  const local = getStoredSubmissions();
  if (!supabase) return local;

  try {
    const { data, error } = await supabase
      .from('enem_submissions')
      .select('*')
      .eq('simulation_id', simulationId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const formatted: EnemSubmission[] = data.map((d: any) => ({
        id: d.id,
        simulation_id: d.simulation_id,
        student_id: d.student_id,
        student_name: d.student_name,
        roll_number: d.roll_number,
        class_id: d.class_id,
        reviewer_name: d.reviewer_name,
        answers: d.answers || {},
        total_correct: Number(d.total_correct || 0),
        score_points: Number(d.score_points || 0),
        created_at: d.created_at
      }));

      try {
        localStorage.setItem(LOCAL_STORAGE_SUBMISSIONS_KEY, JSON.stringify(formatted));
      } catch (e) {}

      return formatted;
    }
  } catch (e) {
    console.warn('Supabase offline ou tabela enem_submissions inexistente. Usando local:', e);
  }

  return local;
}

// Salvar submissão de aluno (local + Supabase)
export async function saveStoredSubmission(sub: EnemSubmission): Promise<EnemSubmission[]> {
  const current = getStoredSubmissions();
  const existingIdx = current.findIndex(
    s => s.simulation_id === sub.simulation_id && s.student_id === sub.student_id
  );

  let updated: EnemSubmission[];
  if (existingIdx >= 0) {
    updated = [...current];
    updated[existingIdx] = sub;
  } else {
    updated = [sub, ...current];
  }

  try {
    localStorage.setItem(LOCAL_STORAGE_SUBMISSIONS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Erro ao salvar submissão:', e);
  }

  if (supabase) {
    try {
      await supabase
        .from('enem_submissions')
        .upsert({
          id: sub.id,
          simulation_id: sub.simulation_id,
          student_id: sub.student_id,
          student_name: sub.student_name,
          roll_number: sub.roll_number,
          class_id: sub.class_id,
          reviewer_name: sub.reviewer_name,
          answers: sub.answers,
          total_correct: sub.total_correct,
          score_points: sub.score_points,
          updated_at: new Date().toISOString()
        }, { onConflict: 'simulation_id, student_id' });
    } catch (e) {
      console.warn('Erro ao salvar submissão no Supabase:', e);
    }
  }

  return updated;
}

// Excluir submissão
export async function deleteStoredSubmission(subId: string): Promise<EnemSubmission[]> {
  const current = getStoredSubmissions();
  const updated = current.filter(s => s.id !== subId);
  try {
    localStorage.setItem(LOCAL_STORAGE_SUBMISSIONS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Erro ao deletar submissão:', e);
  }

  if (supabase) {
    try {
      await supabase.from('enem_submissions').delete().eq('id', subId);
    } catch (e) {
      console.warn('Erro ao deletar submissão no Supabase:', e);
    }
  }

  return updated;
}

// Processar imagem do cartão resposta via IA (Gemini Vision)
export async function analyzeEnemBubbleSheet(imageBase64: string): Promise<Record<number, EnemAnswerOption>> {
  if (!ai) {
    throw new Error('Chave da API de IA não configurada.');
  }

  const prompt = `Você é um leitor óptico de altíssima precisão (OMR) para Cartões-Resposta de Simulado ENEM contendo exatamente 45 questões (numeradas de 1 a 45).
Cada questão tem opções de alternativas em bolinhas: A, B, C, D, E.

Analise com extremo rigor a imagem deste cartão de respostas do aluno.
Para cada uma das questões de 1 a 45, identifique com precisão a marcação do estudante seguindo ESTAS REGRAS OFICIAIS DO ENEM:

REGRAS:
1. Retorne ESTRITAMENTE um JSON válido sem marcações markdown extras, no formato:
{
  "answers": {
    "1": "A",
    "2": "C",
    "3": "DUPLA",
    "4": "BLANK",
    ...
    "45": "D"
  }
}
2. QUESTÕES NÃO SINALIZADAS: Se a questão não estiver preenchida (em branco, nenhuma alternativa marcada), coloque "BLANK".
3. DUAS OU MAIS MARCAÇÕES / TODAS MARCADAS: Se o aluno marcou duas alternativas (ex: A e B), marcou três ou mais, marcou todas as alternativas ou cometeu rasura com mais de uma bolinha preenchida, coloque "DUPLA".
4. MARCAÇÃO ÚNICA: Se o aluno marcou claramente apenas uma alternativa, coloque a respectiva letra maiúscula: "A", "B", "C", "D" ou "E".
5. Preencha todas as 45 questões (de 1 a 45).`;

  try {
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

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
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    });

    const text = response.text || '{}';
    const parsed = JSON.parse(text);
    const answers: Record<number, EnemAnswerOption> = {};

    const rawAnswers = parsed.answers || parsed;
    for (let q = 1; q <= 45; q++) {
      const val = String(rawAnswers[q] || rawAnswers[String(q)] || 'BLANK').trim().toUpperCase();
      if (['A', 'B', 'C', 'D', 'E'].includes(val)) {
        answers[q] = val as EnemAnswerOption;
      } else if (val === 'DUPLA' || val === 'ANULADA' || val === 'MULTIPLE' || val === 'RASURA') {
        answers[q] = 'DUPLA';
      } else {
        answers[q] = 'BLANK';
      }
    }

    return answers;
  } catch (error: any) {
    console.error('Erro na análise do cartão resposta via IA:', error);
    throw new Error('Falha ao reconhecer o cartão-resposta. Você pode preencher ou ajustar as respostas manualmente.');
  }
}
