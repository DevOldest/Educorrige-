import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  CheckSquare, 
  User, 
  FileText, 
  Image as ImageIcon, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  MessageSquare,
  Settings,
  Search,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone, DropzoneOptions } from 'react-dropzone';
import { supabase } from '../lib/supabase';
import { ai } from '../lib/gemini';
import { cn } from '../lib/utils';

export default function GradingView() {
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [activityType, setActivityType] = useState<'prova' | 'lista'>('prova');
  
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      fetchStudents(selectedClassId);
      fetchAssessments(selectedClassId);
    } else {
      setStudents([]);
      setAssessments([]);
    }
  }, [selectedClassId]);

  async function fetchInitialData() {
    if (!supabase) return;
    try {
      const [classesRes, unitsRes] = await Promise.all([
        supabase.from('classes').select('*').order('name'),
        supabase.from('units').select('*').order('name')
      ]);
      if (classesRes.data) setClasses(classesRes.data);
      if (unitsRes.data) {
        // Remove potential duplicates by name just in case
        const uniqueUnits = unitsRes.data.filter((unit, index, self) =>
          index === self.findIndex((t) => t.name === unit.name)
        );
        setUnits(uniqueUnits);
      }
    } catch (error) {
      console.error('Error fetching initial data:', error);
    }
  }

  async function fetchStudents(classId: string) {
    if (!supabase) return;
    setIsLoadingData(true);
    try {
      const { data } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', classId)
        .order('name');
      if (data) setStudents(data);
    } finally {
      setIsLoadingData(false);
    }
  }

  async function fetchAssessments(classId: string) {
    if (!supabase) return;
    setIsLoadingData(true);
    try {
      const { data, error } = await supabase
        .from('assessments')
        .select('*')
        .eq('class_id', classId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      if (data) setAssessments(data);
    } catch (error) {
      console.error('Error fetching assessments:', error);
    } finally {
      setIsLoadingData(false);
    }
  }

  const onDrop = (acceptedFiles: File[]) => {
    setFiles([...files, ...acceptedFiles]);
    const newPreviews = acceptedFiles.map(file => URL.createObjectURL(file));
    setPreviews([...previews, ...newPreviews]);
  };

  const dropzoneOptions: any = {
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png'] }
  };

  // @ts-ignore
  const { getRootProps, getInputProps, isDragActive } = useDropzone(dropzoneOptions);

  const handleGrade = async () => {
    if (!selectedAssessmentId || !selectedStudentId || files.length === 0 || !ai) {
      alert('Selecione o aluno, a atividade e envie as fotos.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    try {
      // 1. Fetch Question Data (Answer Key)
      const { data: questions } = await supabase
        .from('questions')
        .select('*')
        .eq('assessment_id', selectedAssessmentId);

      if (!questions) throw new Error('Gabarito não encontrado');

      // 2. Prepare images for Gemini
      const imageParts = await Promise.all(files.map(async (file) => {
        const base64 = await fileToBase64(file);
        return {
          inlineData: {
            mimeType: file.type,
            data: base64
          }
        };
      }));

      // 3. AI Correction Prompt
      const prompt = `
        Você é um assistente de correção escolar especialista. Analise as imagens da atividade do aluno e compare com o gabarito fornecido.
        
        GABARITO:
        ${questions.map(q => `
          Questão ${q.question_number} (${q.question_type}):
          - Resposta Esperada: ${q.expected_answer}
          - Critério de Correção: ${q.criteria || 'Não especificado'}
          - Habilidades BNCC: ${q.bncc_skills ? q.bncc_skills.join(', ') : 'Não especificado'}
          - Pontos Máximos: ${q.max_score}
        `).join('\n')}
        
        INSTRUÇÕES:
        - Identifique as respostas do aluno para cada questão nas imagens.
        - Para questões objetivas, dê a nota total se estiver correta, ou 0 se errada.
        - Para questões dissertativas, avalie a qualidade da resposta baseada estritamente no CRITÉRIO DE CORREÇÃO fornecido e dê uma nota proporcional.
        - Forneça um feedback curto e construtivo para cada questão.
        - Forneça um resumo geral da atividade, destacando pontos fortes e áreas de melhoria.
        - Referencie as habilidades da BNCC que o aluno demonstrou domínio ou que ainda precisa desenvolver.

        RETORNE UM JSON NO FORMATO:
        {
          "overallFeedback": "Texto curto relatando de forma geral a atividade",
          "totalScore": 8.5,
          "maxScore": 10.0,
          "corrections": [
            {
              "questionNumber": 1,
              "score": 1.0,
              "feedback": "Resposta correta e bem fundamentada.",
              "studentAnswer": "Texto da resposta do aluno",
              "skillsMastered": ["EF01MA01"],
              "skillsToImprove": []
            }
          ]
        }
      `;

      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: prompt }, ...imageParts] }]
      });

      const responseText = result.text || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const correctionData = JSON.parse(jsonMatch[0]);
        setResult(correctionData);
        await saveResults(correctionData);
      }
    } catch (error: any) {
      console.error('Grading error:', error);
      setError(error.message || 'Erro na correção automática. Verifique as imagens e tente novamente.');
    } finally {
      setIsProcessing(false);
    }
  };

  async function saveResults(data: any) {
    if (!supabase) return;

    try {
      // 1. Get assessment details to know type and unit
      const { data: assessment } = await supabase
        .from('assessments')
        .select('type, unit_id')
        .eq('id', selectedAssessmentId)
        .single();

      if (!assessment) throw new Error('Atividade não encontrada');

      // 2. Save individual answers and corrections
      for (const corr of data.corrections) {
        const { data: question } = await supabase
          .from('questions')
          .select('id')
          .eq('assessment_id', selectedAssessmentId)
          .eq('question_number', corr.questionNumber)
          .single();

        if (question) {
          const { data: answer } = await supabase
            .from('student_answers')
            .insert([{
              student_id: selectedStudentId,
              assessment_id: selectedAssessmentId,
              question_id: question.id,
              answer_text: corr.studentAnswer || '',
              score: corr.score
            }])
            .select()
            .single();

          if (answer) {
            await supabase.from('ai_corrections').insert([{
              student_answer_id: answer.id,
              ai_model: 'gemini-3-flash-preview',
              correction_feedback: corr.feedback,
              score_given: corr.score,
              skills_mastered: corr.skillsMastered || [],
              skills_to_improve: corr.skillsToImprove || []
            }]);
          }
        }
      }

      // 3. Save overall result
      await supabase.from('assessment_results').insert([{
        student_id: selectedStudentId,
        assessment_id: selectedAssessmentId,
        total_score: data.totalScore,
        max_score: data.maxScore,
        percentage: (data.totalScore / data.maxScore) * 100,
        ai_corrected: true,
        overall_feedback: data.overallFeedback
      }]);

      // 4. Update grade in Management (grades table)
      const { data: existingGrade } = await supabase
        .from('grades')
        .select('*')
        .eq('student_id', selectedStudentId)
        .eq('unit_id', assessment.unit_id)
        .maybeSingle();

      const fieldToUpdate = assessment.type === 'prova' ? 'exam_score' : 'list1_score';
      
      const gradeData: any = {
        student_id: selectedStudentId,
        unit_id: assessment.unit_id,
        [fieldToUpdate]: data.totalScore
      };

      if (existingGrade) {
        // Calculate new average
        const updatedGrade = { ...existingGrade, [fieldToUpdate]: data.totalScore };
        const sum = (updatedGrade.list1_score || 0) + 
                    (updatedGrade.list2_score || 0) + 
                    (updatedGrade.list3_score || 0) + 
                    (updatedGrade.exam_score || 0) + 
                    (updatedGrade.notebook_score || 0) + 
                    (updatedGrade.anki_score || 0);
        
        let average = Math.min(10, sum);
        if (updatedGrade.recovery_score !== null) {
          if (sum < 5) {
            average = Math.min(5, Math.max(sum, updatedGrade.recovery_score));
          } else {
            average = Math.min(10, sum + updatedGrade.recovery_score);
          }
        }
        
        await supabase
          .from('grades')
          .update({ [fieldToUpdate]: data.totalScore, unit_average: average })
          .eq('id', existingGrade.id);
      } else {
        await supabase
          .from('grades')
          .insert([{ ...gradeData, unit_average: data.totalScore }]);
      }
    } catch (error) {
      console.error('Error saving results:', error);
      throw error;
    }
  }

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = error => reject(error);
    });
  }

  return (
    <div className="space-y-6">
      {!ai && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 flex items-center gap-3 mb-6">
          <AlertCircle size={24} />
          <div>
            <p className="font-bold">IA não configurada</p>
            <p className="text-sm text-red-600">A chave da API do Gemini não foi encontrada. A correção automática não funcionará.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <AlertCircle size={24} />
            <p className="text-sm font-medium">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X size={20} />
          </button>
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Selection Panel */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-6">
          <h3 className="text-xl font-bold text-brand-blue-dark flex items-center gap-2">
            <Settings size={20} className="text-brand-gold" />
            Configuração
          </h3>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-400">Turma</label>
              <select 
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow"
              >
                <option value="">Selecionar Turma</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-400">Aluno</label>
              <select 
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow"
                disabled={isLoadingData || !selectedClassId}
              >
                <option value="">{isLoadingData ? 'Carregando...' : 'Selecionar Aluno'}</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.roll_number}. {s.name}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-slate-400">Tipo</label>
                <select 
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value as any)}
                  className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow"
                >
                  <option value="prova">Prova</option>
                  <option value="lista">Lista</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-slate-400">Unidade</label>
                <select 
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                  className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow"
                >
                  <option value="">Unidade</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-slate-400">Gabarito</label>
              <select 
                value={selectedAssessmentId}
                onChange={(e) => setSelectedAssessmentId(e.target.value)}
                className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow"
                disabled={!selectedClassId}
              >
                <option value="">{selectedClassId ? 'Selecionar Gabarito' : 'Selecione uma Turma Primeiro'}</option>
                {assessments
                  .filter(a => {
                    const typeMatch = a.type === activityType;
                    const unitMatch = selectedUnitId ? a.unit_id === selectedUnitId : true;
                    return typeMatch && unitMatch;
                  })
                  .map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
              {selectedClassId && assessments.length === 0 && (
                <p className="text-[10px] text-red-500 font-medium">Nenhum gabarito encontrado para esta turma.</p>
              )}
              {selectedClassId && assessments.length > 0 && assessments.filter(a => a.type === activityType && (selectedUnitId ? a.unit_id === selectedUnitId : true)).length === 0 && (
                <p className="text-[10px] text-amber-600 font-medium">Nenhum gabarito do tipo "{activityType}" encontrado para esta unidade.</p>
              )}
            </div>
          </div>
        </div>

        <button 
          onClick={handleGrade}
          disabled={isProcessing || files.length === 0}
          className="w-full py-4 bg-brand-blue text-white rounded-2xl font-bold hover:bg-brand-blue-dark shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <CheckSquare size={20} />}
          {isProcessing ? 'Corrigindo...' : 'Iniciar Correção'}
        </button>
      </div>

      {/* Upload & Results Panel */}
      <div className="lg:col-span-2 space-y-6">
        {!result ? (
          <div className="space-y-6">
            <div 
              {...getRootProps()} 
              className={cn(
                "border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer bg-white",
                isDragActive ? "border-brand-yellow bg-brand-yellow/5" : "border-slate-200 hover:border-brand-gold hover:bg-slate-50"
              )}
            >
              <input {...getInputProps()} />
              <div className="p-4 bg-brand-gold/10 rounded-full text-brand-gold">
                <Upload size={48} />
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-brand-blue-dark">Upload das Fotos da Atividade</p>
                <p className="text-slate-500">Arraste as imagens ou clique para selecionar</p>
              </div>
            </div>

            {previews.length > 0 && (
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {previews.map((src, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="aspect-square rounded-xl overflow-hidden border border-slate-200 relative group"
                  >
                    <img src={src} alt={`Preview ${i}`} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => {
                        const newFiles = [...files];
                        newFiles.splice(i, 1);
                        setFiles(newFiles);
                        const newPreviews = [...previews];
                        newPreviews.splice(i, 1);
                        setPreviews(newPreviews);
                      }}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={12} />
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h3 className="text-2xl font-serif font-bold text-brand-blue-dark">Resultado da Correção</h3>
                  <p className="text-slate-500">Processado por IA • {new Date().toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-bold text-brand-blue">{result.totalScore}</div>
                  <div className="text-sm text-slate-400">de {result.maxScore} pontos</div>
                </div>
              </div>

              <div className="p-6 bg-slate-50 rounded-2xl mb-8">
                <h4 className="text-sm font-bold text-brand-blue-dark uppercase mb-2 flex items-center gap-2">
                  <MessageSquare size={16} className="text-brand-gold" />
                  Feedback Geral
                </h4>
                <p className="text-slate-700 leading-relaxed">{result.overallFeedback}</p>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-bold text-brand-blue-dark uppercase">Correção por Questão</h4>
                {result.corrections.map((corr: any, i: number) => (
                  <div key={i} className="p-4 border border-slate-100 rounded-2xl flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-brand-blue-dark text-white flex items-center justify-center font-bold shrink-0">
                      {corr.questionNumber}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-brand-blue-dark">Questão {corr.questionNumber}</span>
                        <span className={cn(
                          "text-sm font-bold",
                          corr.score > 0 ? "text-emerald-600" : "text-red-500"
                        )}>
                          {corr.score} pts
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 mb-2 italic">"{corr.studentAnswer}"</p>
                      <p className="text-sm text-slate-800 font-medium">{corr.feedback}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button 
                onClick={() => {
                  setResult(null);
                  setFiles([]);
                  setPreviews([]);
                }}
                className="mt-8 w-full py-3 bg-slate-100 text-brand-blue-dark font-bold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Nova Correção
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  </div>
);
}

