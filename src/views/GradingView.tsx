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
import { ai, GEMINI_MODEL } from '../lib/gemini';
import { cn } from '../lib/utils';
import CustomModal from '../components/CustomModal';

export default function GradingView() {
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [activityType, setActivityType] = useState<'prova' | 'lista1' | 'lista2' | 'lista3'>('prova');
  
  // Estado para Lote de 3 Atividades
  const [batchSlots, setBatchSlots] = useState<any[]>([
    { id: '1', studentId: '', files: [], previews: [], result: null, status: 'idle', error: null },
    { id: '2', studentId: '', files: [], previews: [], result: null, status: 'idle', error: null },
    { id: '3', studentId: '', files: [], previews: [], result: null, status: 'idle', error: null }
  ]);
  
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [targetScale, setTargetScale] = useState(10);
  const [useConvertedScore, setUseConvertedScore] = useState(true);
  const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null);

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

  const updateSlot = (id: string, updates: any) => {
    setBatchSlots(prev => prev.map(slot => slot.id === id ? { ...slot, ...updates } : slot));
  };

  const updateCorrectionInSlot = (slotId: string, correctionIndex: number, field: string, value: any) => {
    setBatchSlots(prev => prev.map(slot => {
      if (slot.id !== slotId || !slot.result) return slot;

      const newCorrections = [...slot.result.corrections];
      const oldCorr = newCorrections[correctionIndex];
      
      // Update the specific field
      newCorrections[correctionIndex] = { ...oldCorr, [field]: value };

      // If updating score, it should be reflected in the final_score used for summary
      if (field === 'teacher_score') {
        newCorrections[correctionIndex].final_score = value !== null ? value : oldCorr.ai_score;
      } else if (!('final_score' in newCorrections[correctionIndex])) {
        newCorrections[correctionIndex].final_score = oldCorr.teacher_score !== null ? oldCorr.teacher_score : oldCorr.ai_score;
      }

      // Re-calculate summary total
      const newTotal = newCorrections.reduce((sum: number, c: any) => sum + (parseFloat(c.final_score || c.ai_score) || 0), 0);
      
      return {
        ...slot,
        result: {
          ...slot.result,
          corrections: newCorrections,
          summary: {
            ...slot.result.summary,
            ai_total_score: newTotal // Keep as primary score for conversion
          }
        }
      };
    }));
  };

  const handleFilesAdded = (id: string, acceptedFiles: File[]) => {
    const slot = batchSlots.find(s => s.id === id);
    if (!slot) return;
    
    // Create new objects to avoid reference issues
    const newFiles = [...slot.files, ...acceptedFiles];
    const newPreviews = [...slot.previews, ...acceptedFiles.map(file => URL.createObjectURL(file))];
    
    updateSlot(id, { files: newFiles, previews: newPreviews });
  };

  const removeFileFromSlot = (slotId: string, fileIndex: number) => {
    const slot = batchSlots.find(s => s.id === slotId);
    if (!slot) return;
    
    const newFiles = [...slot.files];
    newFiles.splice(fileIndex, 1);
    const newPreviews = [...slot.previews];
    newPreviews.splice(fileIndex, 1);
    
    updateSlot(slotId, { files: newFiles, previews: newPreviews });
  };

  const handleGradeBatch = async () => {
    const activeSlots = batchSlots.filter(s => s.studentId && s.files.length > 0);
    
    if (activeSlots.length === 0 || !selectedAssessmentId || !ai) {
      setModal({
        isOpen: true,
        title: 'Dados Incompletos',
        message: 'Preencha pelo menos um aluno com suas fotos e selecione o gabarito.',
        type: 'warning'
      });
      return;
    }

    setIsProcessingBatch(true);
    
    try {
      // 1. Fetch Gabarito unificado
      const { data: questions, error: fetchError } = await supabase
        .from('questions')
        .select('*')
        .eq('assessment_id', selectedAssessmentId);

      if (fetchError || !questions) throw new Error('Gabarito não encontrado');

      // 2. Processar slots ativos sequencialmente para evitar 429/503 (ou paralelo moderado)
      for (const slot of activeSlots) {
        updateSlot(slot.id, { status: 'processing', error: null });
        
        try {
          const imageParts = await Promise.all(slot.files.map(async (file: File) => {
            const base64 = await fileToBase64(file);
            return {
              inlineData: {
                mimeType: file.type,
                data: base64
              }
            };
          }));

          const student = students.find(s => s.id === slot.studentId);

          const prompt = `
            Você é um sistema de correção automatizada. Analise as imagens desta prova e compare com o gabarito.
            
            GABARITO OFICIAL:
            ${questions.map(q => `Questão ${q.question_number} (${q.question_type}): ${q.expected_answer} (${q.max_score} pts)`).join('\n')}

            ALUNO: ${student?.name}
            ATIVIDADE_ID: ${selectedAssessmentId}

            REGRAS:
            1. Identifique a resposta do aluno para cada questão.
            2. Atribua nota de acordo com o gabarito.
            3. Gere um breve feedback por questão.
            4. Se a resposta for ilegível, "student_answer": null e "needs_review": true.

            ESTRUTURA DO JSON:
            {
              "corrections": [
                {
                  "question_number": 1,
                  "expected_answer": "Resposta do gabarito",
                  "student_answer": "Resposta extraída",
                  "ai_score": 1.0,
                  "max_score": 1.0,
                  "feedback": "Correto.",
                  "needs_review": false
                }
              ],
              "summary": {
                "ai_total_score": 10.0,
                "max_total_score": 10.0,
                "review_required": false
              }
            }
          `;

          const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }, ...imageParts] }]
          });

          const responseText = response.text || '';
          
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          
          if (jsonMatch) {
            updateSlot(slot.id, { result: JSON.parse(jsonMatch[0]), status: 'done' });
          } else {
            throw new Error('Retorno inválido da IA');
          }
        } catch (err: any) {
          updateSlot(slot.id, { status: 'error', error: err.message });
        }
      }
    } catch (err: any) {
      console.error('Batch grading failed:', err);
    } finally {
      setIsProcessingBatch(false);
    }
  };

  const saveBatchResults = async () => {
    const readySlots = batchSlots.filter(s => s.status === 'done' && s.result);
    if (!readySlots.length) return;

    setIsSavingBatch(true);
    try {
      for (const slot of readySlots) {
        await saveSingleSlot(slot);
      }
      setModal({
        isOpen: true,
        title: 'Sucesso',
        message: 'Todas as notas foram integradas ao sistema de gestão!',
        type: 'success'
      });
    } catch (err: any) {
      setModal({
        isOpen: true,
        title: 'Erro no Salvamento',
        message: err.message,
        type: 'error'
      });
    } finally {
      setIsSavingBatch(false);
    }
  };

  async function saveSingleSlot(slot: any) {
    if (!supabase || !slot.result) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Auth error');

    const result = slot.result;
    const studentId = slot.studentId;
    const assessmentId = selectedAssessmentId;

    // 1. Atividade Detalhes
    const { data: assessment } = await supabase
      .from('assessments')
      .select('type, unit_id')
      .eq('id', assessmentId)
      .single();

    if (!assessment) return;

    // 2. Salvar Respostas Individuais
    for (const corr of result.corrections) {
      const { data: q } = await supabase.from('questions')
        .select('id').eq('assessment_id', assessmentId).eq('question_number', corr.question_number).single();

      if (q) {
        const finalItemScore = corr.final_score !== undefined ? corr.final_score : corr.ai_score;
        
        const { data: ans } = await supabase.from('student_answers').insert([{
          student_id: studentId,
          assessment_id: assessmentId,
          question_id: q.id,
          answer_text: corr.student_answer || '',
          score: finalItemScore,
          user_id: user.id
        }]).select().single();

        if (ans) {
          await supabase.from('ai_corrections').insert([{
            student_answer_id: ans.id,
            ai_model: GEMINI_MODEL,
            correction_feedback: corr.feedback,
            score_given: finalItemScore,
            justification: corr.justification,
            user_id: user.id
          }]);
        }
      }
    }

    // 3. Resultado Geral e Gestão
    const rawScore = result.summary.ai_total_score || 0;
    const maxRaw = result.summary.max_total_score || 1;
    const convertedScore = useConvertedScore ? (rawScore / maxRaw) * targetScale : rawScore;
    const finalScore = Math.round(convertedScore * 10) / 10;

    await supabase.from('assessment_results').insert([{
      student_id: studentId,
      assessment_id: assessmentId,
      total_score: finalScore,
      max_score: useConvertedScore ? targetScale : maxRaw,
      percentage: (rawScore / maxRaw) * 100,
      ai_corrected: true,
      user_id: user.id
    }]);

    // Atualizar tabela GRADES
    const field = assessment.type === 'prova' ? 'exam_score' : 
                 assessment.type === 'lista2' ? 'list2_score' : 
                 assessment.type === 'lista3' ? 'list3_score' : 'list1_score';

    const { data: existing } = await supabase.from('grades')
      .select('*').eq('student_id', studentId).eq('unit_id', assessment.unit_id).maybeSingle();

    if (existing) {
      const updated = { ...existing, [field]: finalScore };
      const sum = (updated.list1_score || 0) + (updated.list2_score || 0) + (updated.list3_score || 0) + (updated.exam_score || 0) + (updated.notebook_score || 0) + (updated.anki_score || 0);
      await supabase.from('grades').update({ [field]: finalScore, unit_average: Math.min(10, sum) }).eq('id', existing.id);
    } else {
      await supabase.from('grades').insert([{ student_id: studentId, unit_id: assessment.unit_id, [field]: finalScore, unit_average: finalScore, user_id: user.id }]);
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

  const exportToPDF = (slot: any) => {
    if (!slot.result || !slot.studentId || !selectedAssessmentId) return;
    
    const student = students.find(s => s.id === slot.studentId);
    const assessment = assessments.find(a => a.id === selectedAssessmentId);
    const className = classes.find(c => c.id === selectedClassId)?.name || '';

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(20);
    doc.setTextColor(10, 37, 64);
    doc.text('Relatório de Correção (Lote)', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Aluno: ${student?.name || 'N/A'}`, 20, 35);
    doc.text(`Turma: ${className}`, 20, 42);
    doc.text(`Atividade: ${assessment?.title || 'N/A'}`, 20, 49);

    const result = slot.result;
    const tableData = result.corrections.map((corr: any) => [
      corr.question_number,
      corr.student_answer || 'Sem resposta',
      corr.feedback || '',
      `${corr.ai_score.toFixed(2)} pts`
    ]);

    autoTable(doc, {
      startY: 60,
      head: [['Nº', 'Resposta', 'Feedback IA', 'Pontos']],
      body: tableData,
      headStyles: { fillColor: [10, 37, 64] },
      styles: { fontSize: 8 }
    });

    doc.save(`Relatorio_${student?.name || 'Aluno'}.pdf`);
  };

  return (
    <div className="space-y-6 pb-20">
      <CustomModal
        isOpen={modal.isOpen}
        onClose={() => setModal({ ...modal, isOpen: false })}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={modal.onConfirm}
      />

      {/* Configuração Global */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px] space-y-2">
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

        <div className="flex-1 min-w-[150px] space-y-2">
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

        <div className="flex-1 min-w-[150px] space-y-2">
          <label className="text-xs font-bold uppercase text-slate-400">Unidade</label>
          <select 
            value={selectedUnitId}
            onChange={(e) => setSelectedUnitId(e.target.value)}
            className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow"
          >
            <option value="">Todas Unidades</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        <div className="flex-1 min-w-[200px] space-y-2">
          <label className="text-xs font-bold uppercase text-slate-400">Gabarito Mestre</label>
          <select 
            value={selectedAssessmentId}
            onChange={(e) => setSelectedAssessmentId(e.target.value)}
            className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow font-bold text-brand-blue-dark"
          >
            <option value="">Selecionar Gabarito</option>
            {assessments
              .filter(a => a.type === activityType && (selectedUnitId ? a.unit_id === selectedUnitId : true))
              .map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-2 min-w-[180px]">
          <label className="text-[10px] font-bold text-slate-400 uppercase">Configuração de Nota</label>
          <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl">
            <div className="flex items-center gap-1">
              <input 
                type="checkbox"
                id="convert"
                checked={useConvertedScore}
                onChange={(e) => setUseConvertedScore(e.target.checked)}
                className="w-4 h-4 text-brand-blue rounded border-slate-300"
              />
              <label htmlFor="convert" className="text-[10px] font-bold text-slate-500 uppercase cursor-pointer">Converter p/</label>
            </div>
            <input 
              type="number"
              value={targetScale}
              onChange={(e) => setTargetScale(parseFloat(e.target.value) || 0)}
              className="w-12 p-1 text-xs border border-slate-200 rounded text-center font-bold text-brand-blue"
            />
          </div>
        </div>
      </div>

      {/* Slots de Lote */}
      <div className="space-y-6">
        {batchSlots.map((slot) => {
          const isExpanded = expandedSlotId === slot.id;
          const currentTotal = slot.result?.summary?.ai_total_score || 0;
          const maxTotal = slot.result?.summary?.max_total_score || 1;
          const convertedVal = useConvertedScore ? (currentTotal / maxTotal * targetScale).toFixed(1) : currentTotal.toFixed(1);

          return (
            <div key={slot.id} className={cn(
              "bg-white rounded-3xl shadow-sm border transition-all overflow-hidden",
              slot.status === 'processing' ? "border-brand-yellow ring-2 ring-brand-yellow/10" : 
              slot.status === 'done' ? "border-slate-100" : "border-slate-100"
            )}>
              {/* Header do Slot */}
              <div className="p-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400">
                    {slot.id}
                  </div>
                  <div className="min-w-[200px]">
                    <select 
                      value={slot.studentId}
                      onChange={(e) => updateSlot(slot.id, { studentId: e.target.value })}
                      className="w-full p-2 bg-transparent border-none font-bold text-brand-blue-dark focus:ring-0"
                      disabled={!selectedClassId || slot.status === 'processing'}
                    >
                      <option value="">Selecionar Aluno</option>
                      {students.map(s => <option key={s.id} value={s.id}>{s.roll_number}. {s.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {slot.result && (
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Nota Final</p>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-black text-brand-blue">{convertedVal}</span>
                        <span className="text-xs text-slate-400">/ {useConvertedScore ? targetScale : maxTotal}</span>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2">
                    {slot.status === 'processing' && <Loader2 className="animate-spin text-brand-yellow" size={20} />}
                    {slot.status === 'done' && (
                      <button 
                        onClick={() => setExpandedSlotId(isExpanded ? null : slot.id)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                          isExpanded ? "bg-brand-blue text-white" : "bg-slate-100 text-brand-blue hover:bg-slate-200"
                        )}
                      >
                        {isExpanded ? 'Fechar Revisão' : 'Revisar & Editar'}
                        <ChevronRight className={cn("transition-transform", isExpanded && "rotate-90")} size={14} />
                      </button>
                    )}
                    
                    <div className="flex items-center gap-1 ml-2">
                      {slot.previews.length === 0 ? (
                        <div className="flex gap-1">
                          <SlotDropzone onFiles={(f) => handleFilesAdded(slot.id, f)} disabled={slot.status === 'processing'} miniature />
                        </div>
                      ) : (
                        <div className="flex -space-x-2">
                          {slot.previews.slice(0, 3).map((src: string, i: number) => (
                            <div key={i} className="w-8 h-8 rounded-lg border-2 border-white overflow-hidden shadow-sm">
                              <img src={src} className="w-full h-full object-cover" />
                            </div>
                          ))}
                          {slot.files.length > 3 && (
                            <div className="w-8 h-8 rounded-lg border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                              +{slot.files.length - 3}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Área de Revisão Detalhada */}
              <AnimatePresence>
                {isExpanded && slot.result && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="bg-slate-50/50 border-t border-slate-100"
                  >
                    <div className="p-6 space-y-6">
                      <div className="grid grid-cols-1 gap-4">
                        {slot.result.corrections.map((corr: any, idx: number) => (
                          <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-4">
                            <div className="flex justify-between items-start">
                              <div className="flex gap-3">
                                <div className="w-8 h-8 rounded-lg bg-brand-blue-dark text-white flex items-center justify-center font-bold text-xs">
                                  {corr.question_number}
                                </div>
                                <div>
                                  <h5 className="text-sm font-bold text-slate-700">Questão {corr.question_number}</h5>
                                  <p className="text-[10px] text-slate-400 font-bold uppercase italic">Peso: {corr.max_score} pts</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                <div className="text-center px-2">
                                  <p className="text-[9px] font-bold text-slate-400 uppercase">IA Sugeriu</p>
                                  <p className="text-xs font-bold text-slate-500">{corr.ai_score.toFixed(1)}</p>
                                </div>
                                <div className="w-px h-8 bg-slate-200" />
                                <div className="text-center px-2">
                                  <p className="text-[9px] font-bold text-brand-blue uppercase">Professor</p>
                                  <input 
                                    type="number"
                                    step="0.1"
                                    min={0}
                                    max={corr.max_score}
                                    value={corr.teacher_score === undefined ? '' : corr.teacher_score}
                                    placeholder={corr.ai_score.toFixed(1)}
                                    onChange={(e) => {
                                      const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                                      updateCorrectionInSlot(slot.id, idx, 'teacher_score', val);
                                    }}
                                    className="w-12 bg-transparent text-center text-xs font-black text-brand-blue-dark border-b border-brand-blue focus:ring-0 p-0"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Resposta do Aluno</label>
                                <textarea 
                                  value={corr.student_answer || ''}
                                  onChange={(e) => updateCorrectionInSlot(slot.id, idx, 'student_answer', e.target.value)}
                                  className="w-full text-xs p-2 bg-slate-50 border-none rounded-lg focus:ring-1 focus:ring-brand-blue resize-none h-16 scrollbar-hide"
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-[10px] font-bold text-brand-blue uppercase">Feedback para Aluno</label>
                                <textarea 
                                  value={corr.feedback || ''}
                                  onChange={(e) => updateCorrectionInSlot(slot.id, idx, 'feedback', e.target.value)}
                                  className="w-full text-xs p-2 bg-brand-blue/5 border-none rounded-lg focus:ring-1 focus:ring-brand-blue resize-none h-16 scrollbar-hide"
                                />
                              </div>
                            </div>

                            <div className="pt-2 border-t border-slate-50">
                              <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Resposta Esperada (Gabarito)</label>
                              <div className="w-full text-[10px] p-2 bg-slate-50 border border-slate-100 rounded-lg font-bold text-slate-600">
                                {corr.expected_answer || 'N/A'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                         <button 
                            onClick={() => exportToPDF(slot)}
                            className="px-4 py-2 bg-white border border-slate-200 text-brand-blue text-xs font-bold rounded-xl hover:bg-slate-50 flex items-center gap-2"
                          >
                            <Printer size={14} />
                            Imprimir PDF Aluno
                          </button>
                         <button 
                            onClick={() => setExpandedSlotId(null)}
                            className="px-4 py-2 bg-brand-blue text-white text-xs font-bold rounded-xl hover:bg-brand-blue-dark"
                          >
                            Concluir Revisão
                          </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {slot.error && <p className="text-[10px] text-red-500 bg-red-50 p-4 m-6 rounded-2xl border border-red-100 flex items-center gap-2">
                <AlertCircle size={14} />
                Erro no slot: {slot.error}
              </p>}
            </div>
          );
        })}
      </div>

      {/* Botões de Ação do Lote */}
      <div className="flex flex-col sm:flex-row gap-4 pt-4">
        <button 
          onClick={handleGradeBatch}
          disabled={isProcessingBatch || batchSlots.every(s => s.files.length === 0)}
          className="flex-1 py-4 bg-brand-blue text-white rounded-2xl font-bold hover:bg-brand-blue-dark shadow-xl flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isProcessingBatch ? <Loader2 className="animate-spin" size={20} /> : <CheckSquare size={20} />}
          {isProcessingBatch ? 'Corrigindo Lote...' : 'Iniciar Correção em Lote (3 Alunos)'}
        </button>

        <button 
          onClick={saveBatchResults}
          disabled={isSavingBatch || !batchSlots.some(s => s.status === 'done')}
          className="flex-1 py-4 bg-brand-gold text-brand-blue-dark rounded-2xl font-bold hover:bg-brand-yellow shadow-xl flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isSavingBatch ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
          {isSavingBatch ? 'Gravando Tudo...' : 'Salvar e Atualizar Gestão'}
        </button>
      </div>
    </div>
  );
}

function SlotDropzone({ onFiles, disabled, miniature }: { onFiles: (f: File[]) => void, disabled?: boolean, miniature?: boolean }) {
  const dropOptions: any = {
    onDrop: onFiles,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png'] },
    disabled
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone(dropOptions);

  if (miniature) {
    return (
      <div 
        {...getRootProps()} 
        className={cn(
          "w-8 h-8 rounded-lg border border-dashed border-brand-yellow flex items-center justify-center cursor-pointer hover:bg-brand-yellow/5 transition-colors",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        <Upload size={14} className="text-brand-yellow" />
      </div>
    );
  }

  return (
    <div 
      {...getRootProps()} 
      className={cn(
        "border border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer",
        isDragActive ? "border-brand-yellow bg-brand-yellow/5" : "border-slate-200 hover:bg-slate-50",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <input {...getInputProps()} />
      <div className="p-2 bg-white rounded-full text-slate-400 shadow-sm">
        <Upload size={20} />
      </div>
      <p className="text-[10px] text-slate-500 font-bold uppercase text-center">Fotos da Atividade</p>
    </div>
  );
}

