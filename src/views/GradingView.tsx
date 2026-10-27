import React, { useState, useEffect, useRef } from 'react';
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
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Settings,
  Search,
  X,
  Printer,
  RotateCcw,
  Plus,
  Trash2,
  Camera,
  Users,
  Sparkles,
  RefreshCw,
  Eye,
  SwitchCamera,
  Check,
  Edit3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '../lib/supabase';
import { ai, GEMINI_MODEL } from '../lib/gemini';
import { cn } from '../lib/utils';
import CustomModal from '../components/CustomModal';

interface SlotItem {
  id: string;
  studentIds: string[];
  files: File[];
  previews: string[];
  result: any | null;
  status: 'idle' | 'processing' | 'done' | 'error';
  error: string | null;
}

export default function GradingView() {
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [activityType, setActivityType] = useState<'prova' | 'lista1' | 'lista2' | 'lista3'>('prova');
  
  // Slots Dinâmicos com IDs únicos e estáveis
  const [batchSlots, setBatchSlots] = useState<SlotItem[]>([
    { id: `slot-${Date.now()}-1`, studentIds: [''], files: [], previews: [], result: null, status: 'idle', error: null }
  ]);
  
  // Expandir/recolher visualização do gabarito por slot
  const [expandedSlots, setExpandedSlots] = useState<Record<string, boolean>>({});

  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [targetScale, setTargetScale] = useState(10);
  const [useConvertedScore, setUseConvertedScore] = useState(true);

  // Progresso em tempo real da correção em cascata
  const [currentProgress, setCurrentProgress] = useState<{
    currentStep: number;
    totalSteps: number;
    studentName: string;
    slotIndex: number;
  } | null>(null);

  // Modal de Câmera Ao Vivo
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [activeCameraSlotId, setActiveCameraSlotId] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);

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
      if (data) {
        // Ordenar por roll_number e nome
        const sorted = [...data].sort((a, b) => {
          if (a.roll_number && b.roll_number) return a.roll_number - b.roll_number;
          if (a.roll_number) return -1;
          if (b.roll_number) return 1;
          return a.name.localeCompare(b.name, 'pt-BR');
        });
        setStudents(sorted);
      }
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
        setAssessments(data.filter(a => !a.title.startsWith('__notebook_settings_')));
      }
    } catch (error) {
      console.error('Error fetching assessments:', error);
    } finally {
      setIsLoadingData(false);
    }
  }

  // Adicionar um novo slot vazio
  const addSlot = () => {
    if (batchSlots.length >= 60) return;
    const newId = `slot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setBatchSlots(prev => [...prev, { 
      id: newId, 
      studentIds: [''], 
      files: [], 
      previews: [], 
      result: null, 
      status: 'idle', 
      error: null 
    }]);
  };

  // Preencher automaticamente todos os slots com os alunos da turma
  const handleFillAllSlotsFromClass = () => {
    if (!students || students.length === 0) {
      setModal({
        isOpen: true,
        title: 'Selecione uma Turma',
        message: 'Primeiro selecione uma turma que contenha alunos cadastrados.',
        type: 'warning'
      });
      return;
    }

    const newSlots: SlotItem[] = students.map((student, idx) => ({
      id: `slot-${student.id}-${Date.now()}-${idx}`,
      studentIds: [student.id],
      files: [],
      previews: [],
      result: null,
      status: 'idle',
      error: null
    }));

    setBatchSlots(newSlots);
    setModal({
      isOpen: true,
      title: 'Slots Preenchidos com Sucesso',
      message: `${students.length} slots foram criados na sequência da chamada da turma. Agora você pode tirar fotos via câmera ou carregar imagens para os alunos!`,
      type: 'success'
    });
  };

  const removeSlot = (id: string) => {
    if (batchSlots.length <= 1) return;
    setBatchSlots(prev => prev.filter(s => s.id !== id));
  };

  const updateSlot = (id: string, updates: Partial<SlotItem>) => {
    setBatchSlots(prev => prev.map(slot => slot.id === id ? { ...slot, ...updates } : slot));
  };

  const updateStudentInSlot = (slotId: string, studentIndex: number, studentId: string) => {
    setBatchSlots(prev => prev.map(slot => {
      if (slot.id !== slotId) return slot;
      const newIds = [...slot.studentIds];
      newIds[studentIndex] = studentId;
      return { ...slot, studentIds: newIds };
    }));
  };

  const addStudentToSlot = (slotId: string) => {
    setBatchSlots(prev => prev.map(slot => {
      if (slot.id !== slotId || slot.studentIds.length >= 4) return slot;
      return { ...slot, studentIds: [...slot.studentIds, ''] };
    }));
  };

  const removeStudentFromSlot = (slotId: string, studentIndex: number) => {
    setBatchSlots(prev => prev.map(slot => {
      if (slot.id !== slotId || slot.studentIds.length <= 1) return slot;
      const newIds = [...slot.studentIds];
      newIds.splice(studentIndex, 1);
      return { ...slot, studentIds: newIds };
    }));
  };

  const updateCorrectionInSlot = (slotId: string, correctionIndex: number, field: string, value: any) => {
    setBatchSlots(prev => prev.map(slot => {
      if (slot.id !== slotId || !slot.result) return slot;

      const newCorrections = [...slot.result.corrections];
      const oldCorr = newCorrections[correctionIndex];
      
      newCorrections[correctionIndex] = { ...oldCorr, [field]: value };

      if (field === 'teacher_score') {
        newCorrections[correctionIndex].final_score = value !== null ? value : oldCorr.ai_score;
      } else if (!('final_score' in newCorrections[correctionIndex])) {
        newCorrections[correctionIndex].final_score = oldCorr.teacher_score !== null ? oldCorr.teacher_score : oldCorr.ai_score;
      }

      const newTotal = newCorrections.reduce((sum: number, c: any) => sum + (parseFloat(c.final_score || c.ai_score) || 0), 0);
      
      return {
        ...slot,
        result: {
          ...slot.result,
          corrections: newCorrections,
          summary: {
            ...slot.result.summary,
            ai_total_score: newTotal
          }
        }
      };
    }));
  };

  const handleFilesAdded = (id: string, acceptedFiles: File[]) => {
    const slot = batchSlots.find(s => s.id === id);
    if (!slot) return;
    
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

  // Upload em lote: Distribui fotos sequencialmente nos slots
  const handleBatchPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList: File[] = Array.from(files);
    fileList.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    setBatchSlots(prev => {
      const updated = [...prev];
      let fileIdx = 0;

      // Primeiro preenche os slots vazios que têm aluno
      for (let i = 0; i < updated.length && fileIdx < fileList.length; i++) {
        if (updated[i].files.length === 0) {
          const file = fileList[fileIdx];
          const previewUrl = URL.createObjectURL(file);
          updated[i] = {
            ...updated[i],
            files: [file],
            previews: [previewUrl]
          };
          fileIdx++;
        }
      }

      // Se ainda sobrarem fotos, anexa nos slots na sequência
      for (let i = 0; i < updated.length && fileIdx < fileList.length; i++) {
        const file = fileList[fileIdx];
        const previewUrl = URL.createObjectURL(file);
        updated[i] = {
          ...updated[i],
          files: [...updated[i].files, file],
          previews: [...updated[i].previews, previewUrl]
        };
        fileIdx++;
      }

      return updated;
    });

    e.target.value = '';
    setModal({
      isOpen: true,
      title: 'Fotos Distribuídas nos Slots',
      message: `${fileList.length} foto(s) foram inseridas em sequência nos slots da turma!`,
      type: 'success'
    });
  };

  // Câmera Ao Vivo
  const startCamera = async (slotId: string) => {
    try {
      setActiveCameraSlotId(slotId);
      setIsCameraOpen(true);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode }
      });
      setCameraStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Erro ao acessar câmera:', err);
      alert('Não foi possível abrir a câmera diretamente no navegador. Use a opção de upload ou captura padrão do aparelho.');
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraOpen(false);
    setActiveCameraSlotId(null);
  };

  const switchCameraFacing = async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextMode }
      });
      setCameraStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.warn('Não foi possível alternar câmera:', err);
    }
  };

  const capturePhotoFromCamera = (advanceToNextSlot: boolean = false) => {
    if (!videoRef.current || !activeCameraSlotId) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `foto_aluno_${activeCameraSlotId}_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const previewUrl = URL.createObjectURL(blob);

      setBatchSlots(prev => prev.map(s => {
        if (s.id === activeCameraSlotId) {
          return {
            ...s,
            files: [...s.files, file],
            previews: [...s.previews, previewUrl]
          };
        }
        return s;
      }));

      if (advanceToNextSlot) {
        // Encontrar próximo slot da sequência
        const currentIndex = batchSlots.findIndex(s => s.id === activeCameraSlotId);
        if (currentIndex !== -1 && currentIndex + 1 < batchSlots.length) {
          setActiveCameraSlotId(batchSlots[currentIndex + 1].id);
        } else {
          stopCamera();
        }
      }
    }, 'image/jpeg', 0.92);
  };

  const handleResetBatch = () => {
    setBatchSlots(prev => prev.map(slot => ({
      ...slot,
      status: 'idle',
      files: [],
      previews: [],
      result: null,
      error: null
    })));
  };

  const clearCompleted = () => {
    setBatchSlots(prev => {
      const remaining = prev.filter(s => s.status !== 'done');
      if (remaining.length === 0) {
        return [{ id: `slot-${Date.now()}-1`, studentIds: [''], files: [], previews: [], result: null, status: 'idle', error: null }];
      }
      return remaining;
    });
  };

  // Correção em cascata garantindo ordem estrita do primeiro para o último slot
  const handleGradeBatch = async () => {
    // Preservar a ordem exata em que os slots aparecem na interface
    const activeSlotsWithOrder = batchSlots
      .map((slot, index) => ({ slot, slotVisualIndex: index + 1 }))
      .filter(item => 
        item.slot.studentIds.some((id: string) => id && id.trim() !== '') && 
        item.slot.files.length > 0 && 
        item.slot.status !== 'done'
      );
    
    if (activeSlotsWithOrder.length === 0 || !selectedAssessmentId || !ai) {
      setModal({
        isOpen: true,
        title: 'Dados Incompletos',
        message: 'Preencha pelo menos um aluno com foto(s) e certifique-se de ter selecionado o Gabarito Mestre.',
        type: 'warning'
      });
      return;
    }

    setIsProcessingBatch(true);
    setCurrentProgress(null);
    
    try {
      // 1. Fetch Gabarito unificado com ordenação estrita das questões
      let questions: any[] = [];
      if (supabase) {
        const { data: qData, error: fetchError } = await supabase
          .from('questions')
          .select('*')
          .eq('assessment_id', selectedAssessmentId)
          .order('question_number', { ascending: true });
        
        if (!fetchError && qData) {
          questions = qData;
        }
      }

      if (questions.length === 0) {
        // Fallback para avaliação selecionada
        const currentAss = assessments.find(a => a.id === selectedAssessmentId);
        if (currentAss && currentAss.questions) {
          questions = currentAss.questions;
        }
      }

      if (questions.length === 0) {
        throw new Error('Nenhuma questão encontrada para o gabarito selecionado.');
      }

      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      // 2. Processar slots ativos em ordem sequencial estrita (do 1º ao último)
      for (let i = 0; i < activeSlotsWithOrder.length; i++) {
        const { slot, slotVisualIndex } = activeSlotsWithOrder[i];
        
        const studentNames = slot.studentIds
          .map((id: string) => students.find(s => s.id === id)?.name)
          .filter(Boolean)
          .join(', ');

        setCurrentProgress({
          currentStep: i + 1,
          totalSteps: activeSlotsWithOrder.length,
          studentName: studentNames || `Slot #${slotVisualIndex}`,
          slotIndex: slotVisualIndex
        });

        updateSlot(slot.id, { status: 'processing', error: null });
        
        const tryProcessing = async (attempt: number = 0): Promise<void> => {
          try {
            const imageParts = await Promise.all(slot.files.map(async (file: File) => {
              const base64 = await fileToBase64(file);
              return {
                inlineData: {
                  mimeType: file.type || 'image/jpeg',
                  data: base64
                }
              };
            }));

            const prompt = `
              Você é um corretor pedagógico e analista óptico de provas e atividades escolares.
              Analise as imagens enviadas e compare estritamente com o GABARITO OFICIAL fornecido.

              GABARITO OFICIAL:
              ${questions.map(q => `Questão ${q.question_number} (${q.question_type || 'objetiva'}): Resposta Esperada: "${q.expected_answer}" | Pontuação Máxima: ${q.max_score || 1.0} pts`).join('\n')}

              ALUNO(S): ${studentNames}
              ATIVIDADE: ${selectedAssessmentId}

              DIRETRIZES DE COMPARAÇÃO E CORREÇÃO:
              1. Identifique a resposta marcada ou escrita pelo aluno para cada questão.
              2. Compare com a Resposta Esperada do Gabarito.
              3. Atribua a nota (ai_score) proporcional: acerto total = max_score, erro = 0.0, acerto parcial = pontuação proporcional.
              4. Forneça o feedback sintético: "Correto", "Incorreto" ou "Parcial".
              5. Se a resposta estiver em branco ou ilegível, student_answer: "(Em branco)", ai_score: 0.0.

              RETORNE ESTRITAMENTE O JSON ABAIXO:
              {
                "corrections": [
                  {
                    "question_number": 1,
                    "expected_answer": "A",
                    "student_answer": "A",
                    "ai_score": 1.0,
                    "max_score": 1.0,
                    "feedback": "Correto.",
                    "is_correct": true
                  }
                ],
                "summary": {
                  "ai_total_score": 10.0,
                  "max_total_score": 10.0,
                  "total_questions": ${questions.length}
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
              const parsedResult = JSON.parse(jsonMatch[0]);
              updateSlot(slot.id, { result: parsedResult, status: 'done' });
              
              // SALVAMENTO AUTOMÁTICO IMEDIATO DO SLOT APÓS CORREÇÃO
              await saveSingleSlot({ ...slot, result: parsedResult });
            } else {
              throw new Error('Retorno da IA em formato inválido');
            }
          } catch (err: any) {
            const isQuotaError = err.message?.includes('503') || err.message?.includes('429');
            if (isQuotaError && attempt < 3) {
              const waitTime = Math.pow(2, attempt + 1) * 1000;
              updateSlot(slot.id, { error: `Limite momentâneo da IA. Retentando em ${waitTime/1000}s...` });
              await delay(waitTime);
              return tryProcessing(attempt + 1);
            }
            throw err;
          }
        };

        try {
          await tryProcessing();
          await delay(600); // Intervalo de segurança e controle térmico entre requisições
        } catch (err: any) {
          updateSlot(slot.id, { status: 'error', error: err.message || 'Falha ao processar' });
        }
      }

      setModal({
        isOpen: true,
        title: 'Correção Concluída e Salva!',
        message: `Todas as ${activeSlotsWithOrder.length} atividades foram corrigidas em sequência do primeiro ao último aluno e salvas automaticamente nas notas da turma!`,
        type: 'success'
      });
    } catch (err: any) {
      console.error('Batch grading failed:', err);
      setModal({
        isOpen: true,
        title: 'Aviso de Correção',
        message: err.message || 'Ocorreu um erro durante a correção.',
        type: 'error'
      });
    } finally {
      setIsProcessingBatch(false);
      setCurrentProgress(null);
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
        title: 'Salvo com Sucesso',
        message: 'Todas as notas foram sincronizadas com o banco de dados e quadro de notas!',
        type: 'success'
      });
    } catch (err: any) {
      setModal({
        isOpen: true,
        title: 'Erro ao Salvar',
        message: err.message,
        type: 'error'
      });
    } finally {
      setIsSavingBatch(false);
    }
  };

  async function saveSingleSlot(slot: any) {
    if (!slot.result) return;
    const result = slot.result;
    const assessmentId = selectedAssessmentId;
    if (!assessmentId) return;

    let userId = 'admin_user';
    try {
      if (supabase) {
        const { data: authData } = await supabase.auth.getUser();
        if (authData?.user?.id) userId = authData.user.id;
      }
    } catch (e) {
      console.warn('Could not get auth user:', e);
    }

    let assessmentType = activityType;
    let unitId = selectedUnitId;
    try {
      if (supabase) {
        const { data: assessment } = await supabase
          .from('assessments')
          .select('type, unit_id')
          .eq('id', assessmentId)
          .maybeSingle();

        if (assessment) {
          assessmentType = assessment.type || activityType;
          unitId = assessment.unit_id || selectedUnitId;
        }
      }
    } catch (e) {}

    // Loop individual para cada aluno vinculado ao slot
    for (const studentId of slot.studentIds) {
      if (!studentId) continue;

      // 1. Salvar Respostas Individuais
      for (const corr of result.corrections) {
        try {
          if (supabase) {
            const { data: q } = await supabase.from('questions')
              .select('id').eq('assessment_id', assessmentId).eq('question_number', corr.question_number).maybeSingle();

            const questionId = q?.id;
            const finalItemScore = corr.final_score !== undefined ? corr.final_score : corr.ai_score;
            
            if (questionId) {
              const { data: ans } = await supabase.from('student_answers').insert([{
                student_id: studentId,
                assessment_id: assessmentId,
                question_id: questionId,
                answer_text: corr.student_answer || '',
                score: finalItemScore,
                user_id: userId
              }]).select().maybeSingle();

              if (ans) {
                await supabase.from('ai_corrections').insert([{
                  student_answer_id: ans.id,
                  ai_model: GEMINI_MODEL,
                  correction_feedback: corr.feedback || '',
                  score_given: finalItemScore,
                  justification: corr.feedback || '',
                  user_id: userId
                }]);
              }
            }
          }
        } catch (err) {
          console.warn('Erro ao salvar resposta individual:', err);
        }
      }

      // 2. Resultado Geral e Média
      const rawScore = result.summary?.ai_total_score || 0;
      const maxRaw = result.summary?.max_total_score || 1;
      const convertedScore = useConvertedScore ? (rawScore / maxRaw) * targetScale : rawScore;
      const finalScore = Math.round(convertedScore * 10) / 10;

      try {
        if (supabase) {
          await supabase.from('assessment_results').insert([{
            student_id: studentId,
            assessment_id: assessmentId,
            total_score: finalScore,
            max_score: useConvertedScore ? targetScale : maxRaw,
            percentage: (rawScore / maxRaw) * 100,
            ai_corrected: true,
            user_id: userId
          }]);

          // Atualizar tabela GRADES
          const field = assessmentType === 'prova' ? 'exam_score' : 
                       assessmentType === 'lista2' ? 'list2_score' : 
                       assessmentType === 'lista3' ? 'list3_score' : 'list1_score';

          if (unitId) {
            const { data: existing } = await supabase.from('grades')
              .select('*').eq('student_id', studentId).eq('unit_id', unitId).maybeSingle();

            if (existing) {
              const updated = { ...existing, [field]: finalScore };
              const sum = (updated.list1_score || 0) + (updated.list2_score || 0) + (updated.list3_score || 0) + (updated.exam_score || 0) + (updated.notebook_score || 0) + (updated.anki_score || 0);
              await supabase.from('grades').update({ [field]: finalScore, unit_average: Math.min(10, sum) }).eq('id', existing.id);
            } else {
              await supabase.from('grades').insert([{ student_id: studentId, unit_id: unitId, [field]: finalScore, unit_average: finalScore, user_id: userId }]);
            }
          }
        }
      } catch (err) {
        console.warn('Erro ao atualizar grades:', err);
      }
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
    if (!slot.result || !slot.studentIds.some((id: string) => id) || !selectedAssessmentId) return;
    
    const studentNames = slot.studentIds
      .map((id: string) => students.find(s => s.id === id)?.name)
      .filter(Boolean)
      .join(' & ');
      
    const assessment = assessments.find(a => a.id === selectedAssessmentId);
    const className = classes.find(c => c.id === selectedClassId)?.name || '';

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(20);
    doc.setTextColor(10, 37, 64);
    doc.text('Relatório de Correção (Lote)', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Aluno(s): ${studentNames || 'N/A'}`, 20, 35);
    doc.text(`Turma: ${className}`, 20, 42);
    doc.text(`Atividade: ${assessment?.title || 'N/A'}`, 20, 49);

    const result = slot.result;

    const uniqueCorrections = (result.corrections || [])
      .reduce((acc: any[], curr: any) => {
        if (!acc.find(item => item.question_number === curr.question_number)) {
          acc.push(curr);
        }
        return acc;
      }, [])
      .sort((a: any, b: any) => a.question_number - b.question_number);

    const tableData = uniqueCorrections.map((corr: any) => [
      corr.question_number,
      corr.expected_answer || '-',
      corr.student_answer || 'Sem resposta',
      corr.ai_score >= corr.max_score ? 'ACERTO' : corr.ai_score > 0 ? 'PARCIAL' : 'ERRO',
      `${corr.ai_score.toFixed(2)} pts`
    ]);

    autoTable(doc, {
      startY: 60,
      head: [['Nº', 'Gabarito', 'Resposta Aluno', 'Resultado', 'Pontos']],
      body: tableData,
      headStyles: { fillColor: [10, 37, 64] },
      styles: { fontSize: 8 }
    });

    doc.save(`Relatorio_${studentNames.split(' & ')[0] || 'Aluno'}.pdf`);
  };

  const activeSlotsCount = batchSlots.filter(s => s.studentIds.some((id: string) => id) && s.files.length > 0 && s.status !== 'done').length;

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

      {/* Input oculto para upload de múltiplas fotos distribuídas */}
      <input 
        ref={batchFileInputRef}
        type="file" 
        multiple 
        accept="image/*" 
        className="hidden" 
        onChange={handleBatchPhotoUpload} 
      />

      {/* Modal de Câmera Ao Vivo com Avanço Rápido entre Alunos */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-3 sm:p-6 backdrop-blur-md">
          <div className="w-full max-w-xl bg-slate-900 rounded-3xl overflow-hidden relative border border-white/20 shadow-2xl flex flex-col">
            {/* Header Câmera */}
            <div className="p-4 bg-slate-900/90 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="text-white text-xs font-bold uppercase tracking-wider">
                  {(() => {
                    const currentSlot = batchSlots.find(s => s.id === activeCameraSlotId);
                    const slotIdx = batchSlots.findIndex(s => s.id === activeCameraSlotId);
                    const studentName = currentSlot?.studentIds
                      .map(id => students.find(s => s.id === id)?.name)
                      .filter(Boolean)
                      .join(', ') || 'Aluno não selecionado';
                    return `Slot #${slotIdx + 1}: ${studentName}`;
                  })()}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={switchCameraFacing}
                  className="p-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-colors"
                  title="Alternar Câmera Frontal / Traseira"
                >
                  <SwitchCamera size={18} />
                </button>
                <button 
                  onClick={stopCamera}
                  className="p-2 bg-white/10 text-white rounded-xl hover:bg-red-500/80 transition-colors"
                  title="Fechar Câmera"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Viewfinder da Câmera */}
            <div className="relative aspect-[3/4] max-h-[60vh] bg-black flex items-center justify-center overflow-hidden">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover"
              />
              {/* Grid Guia */}
              <div className="absolute inset-6 border border-white/30 rounded-2xl pointer-events-none flex flex-col justify-between p-3">
                <span className="text-[10px] text-white/50 uppercase tracking-widest font-mono">Enquadre a folha da atividade</span>
                <span className="text-[10px] text-white/50 text-right uppercase tracking-widest font-mono">Boa iluminação</span>
              </div>
            </div>

            {/* Controles da Câmera */}
            <div className="p-4 bg-slate-900 border-t border-white/10 flex flex-col gap-3">
              <div className="flex items-center justify-around">
                <button
                  onClick={() => capturePhotoFromCamera(false)}
                  className="flex flex-col items-center gap-1 text-slate-300 hover:text-white transition-colors text-[11px] font-bold"
                >
                  <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
                    <Plus size={20} />
                  </div>
                  + Página (Mesmo Aluno)
                </button>

                {/* Botão de Disparo Principal */}
                <button
                  onClick={() => capturePhotoFromCamera(true)}
                  className="w-20 h-20 rounded-full border-4 border-brand-yellow bg-white flex items-center justify-center shadow-2xl active:scale-95 transition-transform"
                  title="Tirar foto e avançar para o próximo aluno"
                >
                  <div className="w-16 h-16 rounded-full bg-brand-yellow/30 flex items-center justify-center">
                    <Camera size={28} className="text-brand-blue-dark" />
                  </div>
                </button>

                <button
                  onClick={() => {
                    const currentIndex = batchSlots.findIndex(s => s.id === activeCameraSlotId);
                    if (currentIndex !== -1 && currentIndex + 1 < batchSlots.length) {
                      setActiveCameraSlotId(batchSlots[currentIndex + 1].id);
                    } else {
                      stopCamera();
                    }
                  }}
                  className="flex flex-col items-center gap-1 text-slate-300 hover:text-white transition-colors text-[11px] font-bold"
                >
                  <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
                    <ChevronRight size={20} />
                  </div>
                  Pular Aluno ➡️
                </button>
              </div>

              <p className="text-[11px] text-slate-400 text-center font-medium">
                Toque no botão central amarelo para salvar a foto deste aluno e avançar instantaneamente para o próximo da turma!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Progresso Durante Correção */}
      {isProcessingBatch && currentProgress && (
        <div className="bg-gradient-to-r from-brand-blue-dark via-brand-blue to-brand-blue-dark text-white p-5 rounded-3xl shadow-xl border border-white/10 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Loader2 className="animate-spin text-brand-yellow" size={24} />
              <div>
                <p className="text-xs font-bold uppercase text-brand-yellow tracking-wider">
                  Corrigindo em Sequência Estrita (1º ao Último)
                </p>
                <p className="text-base font-black">
                  Passo {currentProgress.currentStep} de {currentProgress.totalSteps}: {currentProgress.studentName}
                </p>
              </div>
            </div>
            <span className="text-sm font-black bg-white/10 px-3 py-1.5 rounded-xl">
              {Math.round((currentProgress.currentStep / currentProgress.totalSteps) * 100)}%
            </span>
          </div>

          <div className="w-full bg-black/30 h-2.5 rounded-full overflow-hidden p-0.5">
            <div 
              className="bg-brand-yellow h-full rounded-full transition-all duration-300 shadow-md"
              style={{ width: `${(currentProgress.currentStep / currentProgress.totalSteps) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Configuração Global e Ações Rápidas de Lote */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-5 transition-colors">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px] space-y-2">
            <label className="text-xs font-bold uppercase text-slate-400">Turma</label>
            <select 
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow dark:text-white font-bold"
            >
              <option value="">Selecionar Turma</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="flex-1 min-w-[140px] space-y-2">
            <label className="text-xs font-bold uppercase text-slate-400">Tipo</label>
            <select 
              value={activityType}
              onChange={(e) => setActivityType(e.target.value as any)}
              className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow dark:text-white"
            >
              <option value="prova">Prova</option>
              <option value="lista1">Lista 1</option>
              <option value="lista2">Lista 2</option>
              <option value="lista3">Lista 3</option>
            </select>
          </div>

          <div className="flex-1 min-w-[140px] space-y-2">
            <label className="text-xs font-bold uppercase text-slate-400">Unidade</label>
            <select 
              value={selectedUnitId}
              onChange={(e) => setSelectedUnitId(e.target.value)}
              className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow dark:text-white"
            >
              <option value="">Todas Unidades</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>

          <div className="flex-1 min-w-[220px] space-y-2">
            <label className="text-xs font-bold uppercase text-slate-400">Gabarito Mestre</label>
            <select 
              value={selectedAssessmentId}
              onChange={(e) => setSelectedAssessmentId(e.target.value)}
              className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow font-bold text-brand-blue-dark dark:text-brand-yellow"
            >
              <option value="">Selecionar Gabarito</option>
              {assessments
                .filter(a => a.type === activityType && (selectedUnitId ? a.unit_id === selectedUnitId : true))
                .map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-2 min-w-[170px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Configuração de Nota</label>
            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 p-2 rounded-xl h-[46px] transition-colors">
              <div className="flex items-center gap-1">
                <input 
                  type="checkbox"
                  id="convert"
                  checked={useConvertedScore}
                  onChange={(e) => setUseConvertedScore(e.target.checked)}
                  className="w-4 h-4 text-brand-blue rounded border-slate-300 dark:border-slate-700"
                />
                <label htmlFor="convert" className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase cursor-pointer">Converter p/</label>
              </div>
              <input 
                type="number"
                value={targetScale}
                onChange={(e) => setTargetScale(parseFloat(e.target.value) || 0)}
                className="w-12 p-1 text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded text-center font-bold text-brand-blue dark:text-brand-yellow transition-colors"
              />
            </div>
          </div>
        </div>

        {/* BARRA DE AÇÕES PODEROSAS DO LOTE: Preencher slots, Câmera contínua, Upload em Lote */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Preencher todos os slots com os alunos da turma */}
            <button
              onClick={handleFillAllSlotsFromClass}
              disabled={!selectedClassId || students.length === 0}
              className="px-4 py-2.5 bg-brand-blue text-white rounded-xl text-xs font-bold hover:bg-brand-blue-dark flex items-center gap-2 shadow-sm disabled:opacity-50 transition-all active:scale-95"
              title="Cria um slot para cada aluno da turma em ordem alfabética e número de chamada"
            >
              <Users size={16} />
              Preencher Todos os Slots da Turma ({students.length} alunos)
            </button>

            {/* Upload em lote que distribui fotos nos slots */}
            <button
              onClick={() => batchFileInputRef.current?.click()}
              className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-2 transition-all active:scale-95"
              title="Selecione múltiplas fotos da galeria; o sistema insere cada uma em sequência nos slots"
            >
              <Upload size={16} className="text-brand-yellow" />
              Upload em Lote (Distribuir Fotos)
            </button>

            {/* Iniciar câmera rápida */}
            <button
              onClick={() => {
                const firstAvailable = batchSlots.find(s => s.files.length === 0) || batchSlots[0];
                if (firstAvailable) startCamera(firstAvailable.id);
              }}
              className="px-4 py-2.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold hover:bg-amber-500/20 flex items-center gap-2 transition-all active:scale-95"
              title="Abre a câmera em tela cheia para fotografar aluno após aluno em sequência rápida"
            >
              <Camera size={16} />
              Câmera Contínua (Fotografar Turma)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={clearCompleted}
              className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-colors"
              title="Remove apenas os slots que já foram concluídos"
            >
              <RotateCcw size={14} />
              Limpar Concluídos
            </button>
            <button 
              onClick={handleResetBatch}
              className="px-3 py-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl text-xs font-bold transition-colors"
              title="Limpa fotos e resultados de todos os slots"
            >
              Resetar Tudo
            </button>
          </div>
        </div>
      </div>

      {/* Lista Sequencial de Slots */}
      <div className="space-y-4">
        {batchSlots.map((slot, index) => {
          const currentTotal = slot.result?.summary?.ai_total_score || 0;
          const maxTotal = slot.result?.summary?.max_total_score || 1;
          const convertedVal = useConvertedScore ? (currentTotal / maxTotal * targetScale).toFixed(1) : currentTotal.toFixed(1);
          const isExpanded = !!expandedSlots[slot.id];
          const hasResult = !!slot.result;

          return (
            <div 
              key={slot.id} 
              className={cn(
                "bg-white dark:bg-slate-900 rounded-3xl shadow-sm border transition-all overflow-hidden",
                slot.status === 'processing' ? "border-brand-yellow ring-4 ring-brand-yellow/20" : 
                slot.status === 'done' ? "border-emerald-200 dark:border-emerald-900/50" : 
                slot.status === 'error' ? "border-red-200 dark:border-red-900/50" : "border-slate-100 dark:border-slate-800"
              )}
            >
              {/* Header do Slot */}
              <div className="p-5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-50 dark:border-slate-800 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-9 h-9 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 transition-colors shadow-sm",
                    slot.status === 'done' ? "bg-emerald-500 text-white" :
                    slot.status === 'processing' ? "bg-brand-yellow text-brand-blue-dark animate-pulse" :
                    "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                  )}>
                    {index + 1}
                  </div>

                  <div className="flex flex-col gap-1 min-w-[240px]">
                    {slot.studentIds.map((sId: string, sIdx: number) => (
                      <div key={sIdx} className="flex items-center gap-1 group/student">
                        <select 
                          value={sId}
                          onChange={(e) => updateStudentInSlot(slot.id, sIdx, e.target.value)}
                          className="flex-1 p-2 bg-slate-50/70 dark:bg-slate-800/50 rounded-xl font-bold text-brand-blue-dark dark:text-brand-yellow focus:ring-2 focus:ring-brand-yellow text-sm transition-colors border-none"
                          disabled={!selectedClassId || slot.status === 'processing'}
                        >
                          <option value="">{sIdx === 0 ? 'Selecionar Aluno da Turma' : 'Aluno Adicional (Dupla/Grupo)'}</option>
                          {students.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.roll_number ? `${s.roll_number}. ` : ''}{s.name}
                            </option>
                          ))}
                        </select>
                        {sIdx > 0 && slot.status !== 'processing' && (
                          <button 
                            onClick={() => removeStudentFromSlot(slot.id, sIdx)}
                            className="p-1 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                    {slot.studentIds.length < 4 && slot.status !== 'processing' && (
                      <button 
                        onClick={() => addStudentToSlot(slot.id)}
                        className="text-[10px] font-bold text-brand-blue dark:text-brand-yellow flex items-center gap-1 px-1 hover:underline transition-colors w-fit"
                        disabled={!selectedClassId}
                      >
                        <Plus size={10} /> + Integrante (Trabalho em Grupo)
                      </button>
                    )}
                  </div>
                </div>

                {/* Área de Captura de Fotos do Slot (CÂMERA DIRETA + UPLOAD) */}
                <div className="flex items-center flex-wrap gap-3">
                  {/* Previews de fotos do slot */}
                  {slot.previews.length > 0 && (
                    <div className="flex -space-x-2 items-center">
                      {slot.previews.map((src: string, i: number) => (
                        <div key={i} className="relative group/thumb">
                          <div className="w-10 h-10 rounded-xl border-2 border-white dark:border-slate-800 overflow-hidden shadow-sm transition-all hover:scale-105">
                            <img src={src} className="w-full h-full object-cover" alt={`Página ${i + 1}`} />
                          </div>
                          {slot.status !== 'processing' && (
                            <button 
                              onClick={() => removeFileFromSlot(slot.id, i)}
                              className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity z-10 shadow"
                              title="Remover foto"
                            >
                              <X size={9} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Botões de Ação de Foto do Slot */}
                  {slot.status !== 'processing' && (
                    <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-2xl border border-slate-100 dark:border-slate-800">
                      {/* Botão CÂMERA AO VIVO */}
                      <button
                        onClick={() => startCamera(slot.id)}
                        className="p-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 flex items-center gap-1.5 text-xs font-bold transition-all shadow-sm active:scale-95"
                        title="Tirar foto com a câmera"
                      >
                        <Camera size={15} />
                        <span className="hidden sm:inline">Câmera</span>
                      </button>

                      {/* Botão Câmera Nativa Celular (Fallback Direct Input) */}
                      <label 
                        className="p-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center gap-1 text-xs font-bold transition-all cursor-pointer"
                        title="Abrir app de câmera nativa do smartphone"
                      >
                        <input 
                          type="file" 
                          accept="image/*" 
                          capture="environment" 
                          className="hidden" 
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleFilesAdded(slot.id, Array.from(e.target.files));
                            }
                            e.target.value = '';
                          }}
                        />
                        <span className="text-[11px]">Celular</span>
                      </label>

                      {/* Botão UPLOAD / GALERIA */}
                      <SlotDropzone onFiles={(f) => handleFilesAdded(slot.id, f)} disabled={slot.status === 'processing'} miniature />
                    </div>
                  )}

                  {/* Nota Final se já corrigido */}
                  {slot.result && (
                    <div className="text-right pl-2 border-l border-slate-100 dark:border-slate-800">
                      <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase">Nota Final</p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xl font-black text-brand-blue dark:text-brand-yellow">{convertedVal}</span>
                        <span className="text-[10px] text-slate-400">/ {useConvertedScore ? targetScale : maxTotal}</span>
                      </div>
                    </div>
                  )}

                  {/* Status Indicator */}
                  {slot.status === 'processing' && (
                    <div className="flex items-center gap-2 text-brand-yellow font-bold text-xs bg-brand-yellow/10 px-3 py-1.5 rounded-xl border border-brand-yellow/30">
                      <Loader2 className="animate-spin" size={16} />
                      <span>Corrigindo...</span>
                    </div>
                  )}

                  {slot.status === 'done' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setExpandedSlots(prev => ({ ...prev, [slot.id]: !prev[slot.id] }))}
                        className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1 transition-colors"
                        title="Exibir comparação com gabarito"
                      >
                        <Eye size={14} />
                        {isExpanded ? 'Recolher' : 'Ver Correção'}
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>

                      <button
                        onClick={() => exportToPDF(slot)}
                        className="p-2 text-slate-400 hover:text-brand-blue dark:hover:text-brand-yellow transition-colors"
                        title="Exportar PDF do Aluno"
                      >
                        <Printer size={16} />
                      </button>
                    </div>
                  )}

                  {/* Excluir Slot */}
                  {batchSlots.length > 1 && slot.status !== 'processing' && (
                    <button 
                      onClick={() => removeSlot(slot.id)}
                      className="p-2 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 rounded-xl transition-colors"
                      title="Remover Slot"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Mensagem de Erro do Slot */}
              {slot.error && (
                <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/20 p-3 m-4 rounded-xl border border-red-100 dark:border-red-900/50 flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>Erro no slot #{index + 1}: {slot.error}</span>
                </div>
              )}

              {/* COMPARAÇÃO DETALHADA COM O GABARITO OFICIAL (EXPANDÍVEL) */}
              {hasResult && isExpanded && (
                <div className="p-5 bg-slate-50/70 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                      <FileText size={15} /> Comparação com o Gabarito Oficial
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      Total de Questões: {slot.result.corrections?.length || 0}
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="p-3 text-center w-12">Q#</th>
                          <th className="p-3">Gabarito Oficial</th>
                          <th className="p-3">Resposta Aluno</th>
                          <th className="p-3 text-center">Avaliação</th>
                          <th className="p-3 text-center w-28">Nota (pts)</th>
                          <th className="p-3">Feedback IA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {(slot.result.corrections || []).map((corr: any, cIdx: number) => {
                          const isCorrect = corr.ai_score >= corr.max_score;
                          const isPartial = corr.ai_score > 0 && !isCorrect;

                          return (
                            <tr key={cIdx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="p-3 font-bold text-center text-slate-400">
                                {corr.question_number}
                              </td>
                              <td className="p-3 font-mono font-bold text-brand-blue dark:text-brand-yellow">
                                {corr.expected_answer}
                              </td>
                              <td className="p-3 font-medium text-slate-700 dark:text-slate-300">
                                {corr.student_answer || '(Em branco)'}
                              </td>
                              <td className="p-3 text-center">
                                {isCorrect ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                    <Check size={11} /> Certo
                                  </span>
                                ) : isPartial ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                    Parcial
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                                    <X size={11} /> Errado
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-center">
                                <div className="inline-flex items-center gap-1">
                                  <input 
                                    type="number"
                                    step="0.1"
                                    value={corr.teacher_score !== undefined && corr.teacher_score !== null ? corr.teacher_score : corr.ai_score}
                                    onChange={(e) => updateCorrectionInSlot(slot.id, cIdx, 'teacher_score', parseFloat(e.target.value) || 0)}
                                    className="w-14 p-1 text-center font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                                  />
                                  <span className="text-[10px] text-slate-400">/ {corr.max_score}</span>
                                </div>
                              </td>
                              <td className="p-3 text-slate-500 dark:text-slate-400 italic">
                                {corr.feedback || '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Adicionar Mais Um Slot Manual */}
        {batchSlots.length < 60 && !isProcessingBatch && (
          <button 
            onClick={addSlot}
            className="w-full py-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl text-slate-400 font-bold hover:border-brand-blue dark:hover:border-brand-yellow hover:text-brand-blue dark:hover:text-brand-yellow hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center justify-center gap-2 text-sm"
          >
            <Plus size={18} />
            Adicionar Slot para Aluno Adicional
          </button>
        )}
      </div>

      {/* Botões de Ação do Lote com Barra Flutuante */}
      <div className="flex flex-col sm:flex-row gap-4 pt-4 sticky bottom-6 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl transition-colors">
        <button 
          onClick={handleGradeBatch}
          disabled={isProcessingBatch || !selectedAssessmentId || activeSlotsCount === 0}
          className="flex-1 py-4 bg-brand-blue text-white rounded-2xl font-bold hover:bg-brand-blue-dark shadow-xl flex items-center justify-center gap-2.5 disabled:opacity-50 text-sm transition-transform active:scale-98"
        >
          {isProcessingBatch ? <Loader2 className="animate-spin" size={20} /> : <CheckSquare size={20} />}
          {isProcessingBatch 
            ? 'Corrigindo em Cascata na Sequência dos Slots...' 
            : `Iniciar Correção em Cascata (${activeSlotsCount} aluno(s) prontos)`}
        </button>

        <button 
          onClick={saveBatchResults}
          disabled={isSavingBatch || !batchSlots.some(s => s.status === 'done')}
          className="flex-1 py-4 bg-brand-gold text-brand-blue-dark rounded-2xl font-bold hover:bg-brand-yellow shadow-xl flex items-center justify-center gap-2.5 disabled:opacity-50 text-sm transition-transform active:scale-98"
        >
          {isSavingBatch ? <Loader2 className="animate-spin" size={20} /> : <CheckCircle2 size={20} />}
          {isSavingBatch ? 'Sincronizando...' : 'Salvar e Atualizar Gestão'}
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
          "p-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center gap-1.5 text-xs font-bold cursor-pointer transition-colors",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        title="Carregar fotos da galeria ou arquivo"
      >
        <input {...getInputProps()} />
        <Upload size={14} className="text-slate-600 dark:text-slate-300" />
        <span className="hidden sm:inline text-[11px]">Galeria</span>
      </div>
    );
  }

  return (
    <div 
      {...getRootProps()} 
      className={cn(
        "border border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-2 transition-all cursor-pointer",
        isDragActive ? "border-brand-yellow bg-brand-yellow/5 dark:bg-brand-yellow/10" : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/30",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <input {...getInputProps()} />
      <div className="p-2 bg-white dark:bg-slate-800 rounded-full text-slate-400 dark:text-slate-500 shadow-sm transition-colors">
        <Upload size={20} />
      </div>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase text-center transition-colors">Fotos da Atividade</p>
    </div>
  );
}
