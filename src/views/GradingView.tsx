import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  X,
  Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone, DropzoneOptions } from 'react-dropzone';
import { supabase } from '../lib/supabase';
import { ai } from '../lib/gemini';
import { cn } from '../lib/utils';
import CustomModal from '../components/CustomModal';

export default function GradingView() {
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [activityType, setActivityType] = useState<'prova' | 'lista1' | 'lista2' | 'lista3'>('prova');
  
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [gradingContext, setGradingContext] = useState<any>(null);

  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error' | 'confirm';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  useEffect(() => {
    fetchInitialData();
    fetchAllAssessments();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      fetchStudents(selectedClassId);
    } else {
      setStudents([]);
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

  async function fetchAllAssessments() {
    if (!supabase) return;
    setIsLoadingData(true);
    try {
      const { data, error } = await supabase
        .from('assessments')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      if (data) {
        // Filter out special notebook settings records
        setAssessments(data.filter(a => !a.title.startsWith('__notebook_settings_')));
      }
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
      setModal({
        isOpen: true,
        title: 'Campos Incompletos',
        message: 'Selecione o aluno, a atividade e envie as fotos antes de iniciar a correção.',
        type: 'warning'
      });
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

      // 3. AI Correction Prompt - STRICT HYBRID LOGIC
      const discursiveQuestions = questions.filter(q => q.question_type === 'dissertativa' || q.question_type === 'discursive' || q.question_type === 'dissertativa');
      const objectiveQuestions = questions.filter(q => q.question_type === 'objetiva' || q.question_type === 'objective' || q.question_type === 'multiple_choice');

      const targetScore = activityType === 'prova' ? 4.0 : 1.0;
      const questionWeight = targetScore / (questions?.length || 1);

      const prompt = `
        Você é um assistente de extração e correção escolar. Sua tarefa é analisar as imagens e extrair as respostas do aluno.
        
        VALOR POR QUESTÃO: ${questionWeight.toFixed(4)} pontos
        
        INSTRUÇÕES RESTRITAS:
        1. EXTRAÇÃO GERAL: No campo "studentAnswer", transcreva o que o aluno escreveu/marcou para TODAS as ${questions.length} questões.
        2. QUESTÕES DISSERTATIVAS: Apenas para as questões listadas abaixo em "DISSERTATIVAS", realize a correção pedagógica baseada no Critério fornecido.
        3. QUESTÕES OBJETIVAS: Para as questões objetivas, extraia APENAS o símbolo da alternativa correta (ex: A, B, Verdadeiro, Sim). Remova aspas, pontos ou parênteses que não façam parte da resposta em si. Seja direto na extração.
        
        DISSERTATIVAS PARA CORREÇÃO:
        ${discursiveQuestions.map(q => `
          Questão ${q.question_number}:
          - Critério: ${q.criteria}
          - Skills: ${q.bncc_skills?.join(', ')}
        `).join('\n')}

        OBJETIVAS PARA TRANSCRIÇÃO:
        ${objectiveQuestions.map(q => `Questão ${q.question_number}`).join(', ')}
        
        RETORNE UM JSON NO FORMATO:
        {
          "overallFeedback": "Resumo geral da correção",
          "corrections": [
            {
              "questionNumber": 1,
              "studentAnswer": "Transcrição da resposta",
              "score": 0.0, (apenas para dissertativas)
              "feedback": "Justificativa (apenas para dissertativas)",
              "skillsMastered": [],
              "skillsToImprove": []
            }
          ]
        }
      `;

      let correctionData: any = { overallFeedback: '', corrections: [] };

      // Rule: Only call AI if there's something to process (always true if we need OCR)
      if (!ai) throw new Error("IA não configurada.");
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: prompt },
            ...imageParts
          ]
        }
      });

      const responseText = response.text || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        correctionData = JSON.parse(jsonMatch[0]);
        
        // PART 2: STERN OBJECTIVE GRADING BY CODE
        correctionData.corrections = questions.map(q => {
          const aiCorr = correctionData.corrections.find((c: any) => c.questionNumber === q.question_number);
          
          // Helper to normalize answers (removes noise like quotes, dots, extra spaces)
          const normalize = (val: string, isObjective: boolean = false) => {
            if (!val) return '';
            let v = val.trim().toUpperCase()
              .replace(/['"().]/g, '') // Remove punctuation/quotes
              .replace(/^(ALTERNATIVA|OPCAO|RESPOSTA|LETRA|QUESTAO|OPCÃO)\s*/i, '') // Remove common prefixes
              .trim();
            
            if (isObjective) {
              // If it's a multiple choice/objective type, often we just care about the identifies (A, B, C, D, E)
              // If the result starts with a clear letter identifier (A-E) as the first character, use just that.
              const firstChar = v.charAt(0);
              if (v.length > 0 && /^[A-E0-9]$/.test(firstChar)) {
                // Special case: if student wrote "B" and gabarito is "B4E4" or "B - ALGUMA COISA", they match on "B"
                return firstChar;
              }
              
              return v.replace(/[^A-Z0-9]/g, ''); // Fallback: clear everything but alphanumeric
            }
            
            return v;
          };

          const aiRaw = aiCorr?.studentAnswer || '';
          
          const studentAnswer = normalize(aiRaw, true);
          const expectedAnswer = normalize(q.expected_answer || '', true);
          
          console.log(`Questão ${q.question_number} - Bruto Aluno: "${aiRaw}" | Bruto Gabarito: "${q.expected_answer}" | Normalizado Aluno: "${studentAnswer}" | Normalizado Gabarito: "${expectedAnswer}"`);

          if (q.question_type === 'objetiva' || q.question_type === 'objective' || q.question_type === 'multiple_choice') {
            const isCorrect = studentAnswer === expectedAnswer && studentAnswer !== '';
            
            return {
              questionNumber: q.question_number,
              score: isCorrect ? questionWeight : 0,
              feedback: isCorrect ? 'RESPOSTA CORRETA (Gabarito Oficial)' : `RESPOSTA INCORRETA. Lido: "${studentAnswer}". Esperado: "${expectedAnswer}"`,
              studentAnswer: aiRaw || 'Não identificado',
              skillsMastered: isCorrect ? (q.bncc_skills || []) : [],
              skillsToImprove: isCorrect ? [] : (q.bncc_skills || [])
            };
          } else {
            // PART 3: Keep AI grading for discursive
            return {
              ...aiCorr,
              questionNumber: q.question_number,
              score: aiCorr?.score || 0,
              feedback: aiCorr?.feedback || 'Sem feedback disponível.',
              studentAnswer: aiCorr?.studentAnswer || 'Não identificado'
            };
          }
        });

        // Recalculate total
        correctionData.totalScore = correctionData.corrections.reduce((sum: number, c: any) => sum + (c.score || 0), 0);
        correctionData.maxScore = targetScore;
        
        setResult(correctionData);
        setGradingContext({
          studentId: selectedStudentId,
          assessmentId: selectedAssessmentId,
          unitId: selectedUnitId,
          classId: selectedClassId
        });
        setHasSaved(false);
      }
    } catch (error: any) {
      console.error('Grading error details:', error);
      // PART 4: SAFETY FALLBACK
      setError(`Falha na correção por IA (${error.message || 'Erro desconhecido'}). Atribuindo nota zero por segurança.`);
      setResult({
        overallFeedback: `Erro técnico no processamento da IA: ${error.message || 'Falha de conexão'}. A atividade precisa de revisão manual.`,
        totalScore: 0,
        maxScore: activityType === 'prova' ? 4.0 : 1.0,
        corrections: []
      });
    } finally {
      setIsProcessing(false);
    }
  };

  async function saveResults() {
    console.log('Iniciando saveResults...', { result, gradingContext, hasSaved });
    if (!supabase || !result || !gradingContext || hasSaved) {
      console.warn('saveResults abortado:', { 
        hasSupabase: !!supabase, 
        hasResult: !!result, 
        hasContext: !!gradingContext, 
        hasSaved 
      });
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error('Usuário não autenticado');

      const { studentId, assessmentId } = gradingContext;
      console.log('Contexto de salvamento:', { studentId, assessmentId, userId: user.id });

      // 1. Get assessment details
      const { data: assessment, error: assessmentError } = await supabase
        .from('assessments')
        .select('type, unit_id')
        .eq('id', assessmentId)
        .single();

      if (assessmentError) {
        console.error('Erro ao buscar atividade:', assessmentError);
        throw new Error('Erro ao buscar atividade: ' + assessmentError.message);
      }
      if (!assessment) throw new Error('Atividade não encontrada no banco de dados.');

      console.log('Atividade encontrada:', assessment);

      // 2. Save individual answers and corrections
      console.log('Salvando respostas individuais...');
      for (const corr of result.corrections) {
        const { data: question, error: questionError } = await supabase
          .from('questions')
          .select('id')
          .eq('assessment_id', assessmentId)
          .eq('question_number', corr.questionNumber)
          .single();

        if (questionError) {
          console.warn(`Questão ${corr.questionNumber} não encontrada no gabarito. Pulando...`, questionError);
          continue;
        }

        if (question) {
          const { data: answer, error: answerError } = await supabase
            .from('student_answers')
            .insert([{
              student_id: studentId,
              assessment_id: assessmentId,
              question_id: question.id,
              answer_text: corr.studentAnswer || '',
              score: corr.score,
              user_id: user.id
            }])
            .select()
            .single();

          if (answerError) {
            console.error('Erro ao salvar student_answer:', answerError);
            throw new Error(`Erro ao salvar resposta da questão ${corr.questionNumber}: ${answerError.message} (${answerError.details || ''})`);
          }

          if (answer) {
            const { error: aiError } = await supabase.from('ai_corrections').insert([{
              student_answer_id: answer.id,
              ai_model: 'gemini-3-flash-preview',
              correction_feedback: corr.feedback,
              score_given: corr.score,
              skills_mastered: corr.skillsMastered || [],
              skills_to_improve: corr.skillsToImprove || [],
              user_id: user.id
            }]);
            
            if (aiError) {
              console.error('Erro ao salvar ai_correction:', aiError);
              throw new Error(`Erro ao salvar correção da questão ${corr.questionNumber}: ${aiError.message} (${aiError.details || ''})`);
            }
          }
        }
      }

      // 3. Save overall result
      console.log('Salvando resultado geral...');
      
      // Calculate totalScore locally to ensure precision before rounding
      const preciseTotal = result.corrections.reduce((sum: number, c: any) => sum + (c.score || 0), 0);
      const roundedTotalScore = Math.round(preciseTotal * 10) / 10;
      
      const { error: resultError } = await supabase.from('assessment_results').insert([{
        student_id: studentId,
        assessment_id: assessmentId,
        total_score: roundedTotalScore,
        max_score: result.maxScore,
        percentage: (roundedTotalScore / result.maxScore) * 100,
        ai_corrected: true,
        overall_feedback: result.overallFeedback,
        user_id: user.id
      }]);

      if (resultError) {
        console.error('Erro ao salvar assessment_results:', resultError);
        throw new Error('Erro ao salvar resultado geral: ' + resultError.message + ' (' + (resultError.details || '') + ')');
      }

      // 4. Update grade in Management
      console.log('Atualizando notas na gestão...');
      const { data: existingGrade, error: gradeFetchError } = await supabase
        .from('grades')
        .select('*')
        .eq('student_id', studentId)
        .eq('unit_id', assessment.unit_id)
        .maybeSingle();

      if (gradeFetchError) {
        console.error('Erro ao buscar nota existente:', gradeFetchError);
        throw new Error('Erro ao buscar nota na gestão: ' + gradeFetchError.message);
      }

      const fieldToUpdate = 
        assessment.type === 'prova' ? 'exam_score' : 
        assessment.type === 'lista2' ? 'list2_score' : 
        assessment.type === 'lista3' ? 'list3_score' : 
        'list1_score';
      
      if (existingGrade) {
        const updatedGrade = { ...existingGrade, [fieldToUpdate]: roundedTotalScore };
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
        
        const roundedAverage = Math.round(average * 10) / 10;
        
        const { error: updateError } = await supabase
          .from('grades')
          .update({ [fieldToUpdate]: roundedTotalScore, unit_average: roundedAverage })
          .eq('id', existingGrade.id);
          
        if (updateError) {
          console.error('Erro ao atualizar nota:', updateError);
          throw new Error('Erro ao atualizar nota na gestão: ' + updateError.message);
        }
      } else {
        const { error: insertError } = await supabase
          .from('grades')
          .insert([{ 
            student_id: studentId,
            unit_id: assessment.unit_id,
            [fieldToUpdate]: roundedTotalScore,
            unit_average: roundedTotalScore,
            user_id: user.id
          }]);
          
        if (insertError) {
          console.error('Erro ao inserir nova nota:', insertError);
          throw new Error('Erro ao criar nota na gestão: ' + insertError.message);
        }
      }

      console.log('Salvamento concluído com sucesso!');
      setHasSaved(true);
      setModal({
        isOpen: true,
        title: 'Sucesso',
        message: 'Resultados salvos com sucesso no banco de dados!',
        type: 'success'
      });
    } catch (error: any) {
      console.error('Erro fatal no saveResults:', error);
      setModal({
        isOpen: true,
        title: 'Erro ao Salvar',
        message: 'Erro ao salvar resultados: ' + (error.message || JSON.stringify(error)),
        type: 'error'
      });
    } finally {
      setIsSaving(false);
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

  const exportToPDF = () => {
    if (!result || !selectedStudentId || !selectedAssessmentId) return;
    
    const student = students.find(s => s.id === selectedStudentId);
    const assessment = assessments.find(a => a.id === selectedAssessmentId);
    const className = classes.find(c => c.id === selectedClassId)?.name || '';

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(20);
    doc.setTextColor(10, 37, 64); // brand-blue-dark
    doc.text('Relatório de Correção', pageWidth / 2, 20, { align: 'center' });

    // Student Info
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Aluno: ${student?.name || 'N/A'}`, 20, 35);
    doc.text(`Turma: ${className}`, 20, 42);
    doc.text(`Atividade: ${assessment?.title || 'N/A'}`, 20, 49);
    doc.text(`Data: ${new Date().toLocaleDateString()}`, 20, 56);

    // Score
    doc.setFontSize(16);
    doc.setTextColor(10, 37, 64);
    doc.text(`Nota: ${result.totalScore.toFixed(1)} / ${result.maxScore} (${Math.round((result.totalScore / result.maxScore) * 100)}%)`, pageWidth - 20, 45, { align: 'right' });

    // Overall Feedback
    if (result.overallFeedback) {
      doc.setFontSize(12);
      doc.setTextColor(10, 37, 64);
      doc.text('Feedback Geral:', 20, 70);
      doc.setFontSize(10);
      doc.setTextColor(80);
      const splitFeedback = doc.splitTextToSize(result.overallFeedback, pageWidth - 40);
      doc.text(splitFeedback, 20, 77);
    }

    // Table of corrections
    const tableData = result.corrections.map((corr: any) => [
      corr.questionNumber,
      'Questão', // Type could be added if available
      corr.studentAnswer || 'Sem resposta',
      corr.feedback || '',
      `${corr.score.toFixed(3)} pts`
    ]);

    autoTable(doc, {
      startY: result.overallFeedback ? 100 : 70,
      head: [['Nº', 'Tipo', 'Resposta do Aluno', 'Feedback da IA', 'Pontos']],
      body: tableData,
      headStyles: { fillColor: [10, 37, 64] },
      styles: { fontSize: 8 },
      columnStyles: {
        2: { cellWidth: 40 },
        3: { cellWidth: 60 }
      }
    });

    doc.save(`Relatorio_${student?.name || 'Aluno'}_${assessment?.title || 'Atividade'}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Custom Modal */}
      <CustomModal
        isOpen={modal.isOpen}
        onClose={() => setModal({ ...modal, isOpen: false })}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={modal.onConfirm}
      />

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
                  <option value="lista1">Lista 1</option>
                  <option value="lista2">Lista 2</option>
                  <option value="lista3">Lista 3</option>
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
              >
                <option value="">Selecionar Gabarito</option>
                {assessments
                  .filter(a => {
                    const typeMatch = a.type === activityType;
                    const unitMatch = selectedUnitId ? a.unit_id === selectedUnitId : true;
                    return typeMatch && unitMatch;
                  })
                  .map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
              </select>
              {assessments.length === 0 && (
                <p className="text-[10px] text-red-500 font-medium">Nenhum gabarito encontrado.</p>
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
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <ImageIcon className="text-white" size={24} />
                    </div>
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
                  <div className="text-4xl font-bold text-brand-blue">{result.totalScore.toFixed(1)}</div>
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
                          {corr.score.toFixed(3)} pts
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 mb-2 italic">"{corr.studentAnswer}"</p>
                      <p className="text-sm text-slate-800 font-medium">{corr.feedback}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mt-8">
                {!hasSaved ? (
                  <button 
                    onClick={saveResults}
                    disabled={isSaving}
                    className="flex-1 py-3 bg-brand-blue text-white font-bold rounded-xl hover:bg-brand-blue-dark transition-all flex items-center justify-center gap-2 shadow-md"
                  >
                    {isSaving ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
                    {isSaving ? 'Salvando...' : 'Salvar'}
                  </button>
                ) : (
                  <div className="flex-1 py-3 bg-emerald-50 text-emerald-600 font-bold rounded-xl flex items-center justify-center gap-2 border border-emerald-100">
                    <CheckCircle2 size={20} />
                    Salvo com Sucesso
                  </div>
                )}
                <button 
                  onClick={exportToPDF}
                  className="flex-1 py-3 bg-brand-gold text-white font-bold rounded-xl hover:bg-brand-gold/90 transition-all flex items-center justify-center gap-2 shadow-md"
                >
                  <Printer size={20} />
                  Baixar PDF
                </button>
                <button 
                  onClick={() => {
                    setResult(null);
                    setFiles([]);
                    setPreviews([]);
                    setHasSaved(false);
                  }}
                  className="flex-1 py-3 bg-slate-100 text-brand-blue-dark font-bold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Nova Correção
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  </div>
);
}

