export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

export interface School {
  id: string;
  name: string;
  created_at: string;
}

export interface Class {
  id: string;
  school_id: string;
  name: string;
  school_year: number;
  user_id: string;
  created_at: string;
}

export interface Student {
  id: string;
  class_id: string;
  name: string;
  roll_number: number;
  created_at: string;
}

export interface Unit {
  id: string;
  name: string;
  created_at: string;
}

export interface BNCCSkill {
  id: string;
  code: string;
  description: string;
  created_at: string;
}

export interface Assessment {
  id: string;
  class_id: string;
  unit_id: string;
  title: string;
  description?: string;
  type: 'prova' | 'lista';
  total_questions: number;
  created_at: string;
}

export interface Question {
  id: string;
  assessment_id: string;
  question_number: number;
  question_type: 'objetiva' | 'dissertativa';
  expected_answer: string;
  correction_criteria?: string;
  max_score: number;
}

export interface StudentAnswer {
  id: string;
  student_id: string;
  assessment_id: string;
  question_id: string;
  answer_text: string;
  score: number;
  created_at: string;
}

export interface AICorrection {
  id: string;
  student_answer_id: string;
  ai_model: string;
  correction_feedback: string;
  score_given: number;
  created_at: string;
}

export interface AssessmentResult {
  id: string;
  student_id: string;
  assessment_id: string;
  total_score: number;
  max_score: number;
  percentage: number;
  ai_corrected: boolean;
  created_at: string;
}

export interface Grade {
  id: string;
  student_id: string;
  unit: number;
  notebook_score: number;
  anki_score: number;
  list1_score: number;
  list2_score: number;
  list3_score: number;
  exam_score: number;
  recovery_score?: number;
  unit_average: number;
  created_at: string;
}

export type EnemAnswerOption = 'A' | 'B' | 'C' | 'D' | 'E' | 'BLANK' | 'ANULADA';

export interface EnemSimulation {
  id: string;
  title: string;
  area: string; // Ex: "Ciências da Natureza e suas Tecnologias"
  total_questions: number; // 45
  official_answers: Record<number, EnemAnswerOption>; // 1: 'A', 2: 'C', ...
  access_code: string; // ex: "ENEM2026"
  created_at?: string;
}

export interface EnemSubmission {
  id: string;
  simulation_id: string;
  student_id: string;
  student_name: string;
  roll_number?: number;
  class_id: string;
  reviewer_name: string;
  answers: Record<number, EnemAnswerOption>;
  total_correct: number;
  score_points: number; // 1.0, 2.0, 3.0 ou 4.0
  created_at: string;
}

export interface ReviewerSession {
  reviewerName: string;
  accessCode: string;
  isReviewerOnly: boolean;
}
