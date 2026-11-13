import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, 
  Upload, 
  Camera, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Save, 
  Users, 
  Key, 
  BarChart3, 
  Copy, 
  Check, 
  RefreshCw, 
  Trash2, 
  Sparkles, 
  Loader2, 
  ExternalLink,
  Award,
  Filter,
  Eye,
  LogOut,
  HelpCircle,
  Download,
  Lock,
  ShieldCheck,
  Info,
  CheckSquare,
  X,
  Edit3,
  Plus,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  SwitchCamera
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabase';
import { 
  EnemAnswerOption, 
  EnemSimulation, 
  EnemSubmission, 
  Class, 
  Student 
} from '../types';
import { 
  calculateEnemScore, 
  getScoreBadgeColor, 
  getStoredSimulation, 
  fetchRemoteSimulation,
  fetchAllSimulationsMap,
  saveStoredSimulation, 
  getStoredSubmissions, 
  fetchRemoteSubmissions,
  saveStoredSubmission, 
  deleteStoredSubmission, 
  analyzeEnemBubbleSheet,
  calculateEnemStatistics,
  isEnemQuestionCorrect,
  DEFAULT_SIMULATION,
  SHARED_SIMULATION_ID,
  getSimulationIdForUser
} from '../lib/enemService';
import { compressImageForAI } from '../lib/imageOptimizer';

interface EnemSimuladoViewProps {
  isReviewerMode?: boolean;
  reviewerName?: string;
  onExitReviewerMode?: () => void;
}

interface EnemSlotItem {
  id: string;
  studentId: string;
  imagePreview: string | null;
  answers: Record<number, EnemAnswerOption> | null;
  status: 'idle' | 'processing' | 'done' | 'error';
  error: string | null;
  savedSubmissionId?: string | null;
}

export default function EnemSimuladoView({ 
  isReviewerMode = false, 
  reviewerName = 'Professor Corretor',
  onExitReviewerMode 
}: EnemSimuladoViewProps) {
  // Configurações e dados (gabarito individual por corretor; correções compartilhadas para todos)
  const [simulation, setSimulation] = useState<EnemSimulation>(() => getStoredSimulation(isReviewerMode ? reviewerName : undefined));
  const [simulationsMap, setSimulationsMap] = useState<Record<string, Record<number, EnemAnswerOption>>>(() => ({
    [SHARED_SIMULATION_ID]: getStoredSimulation().official_answers
  }));
  const [submissions, setSubmissions] = useState<EnemSubmission[]>(getStoredSubmissions);
  const [classes, setClasses] = useState<Class[]>([]);
  const [allClassesLookup, setAllClassesLookup] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isSyncingSubmissions, setIsSyncingSubmissions] = useState(false);

  // Aba ativa ('grading' | 'answer-key' | 'settings' | 'results')
  const [activeTab, setActiveTab] = useState<'grading' | 'answer-key' | 'settings' | 'results'>('grading');
  const [quickSequenceInput, setQuickSequenceInput] = useState('');
  const [showQuickFill, setShowQuickFill] = useState(false);

  // Estado de correção por Slots (Em Cascata)
  const [enemSlots, setEnemSlots] = useState<EnemSlotItem[]>(() => [
    {
      id: `enem-slot-${Date.now()}-1`,
      studentId: '',
      imagePreview: null,
      answers: null,
      status: 'idle',
      error: null
    }
  ]);
  const [expandedSlotIds, setExpandedSlotIds] = useState<Record<string, boolean>>({});
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [currentBatchProgress, setCurrentBatchProgress] = useState<{
    currentStep: number;
    totalSteps: number;
    studentName: string;
    slotIndex: number;
  } | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  // Modal de câmera contínua para slots
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [activeCameraSlotId, setActiveCameraSlotId] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Edição do gabarito oficial (individual por corretor se for corretor)
  const [editingAnswers, setEditingAnswers] = useState<Record<number, EnemAnswerOption>>(simulation.official_answers);
  const [tempAccessCode, setTempAccessCode] = useState(simulation.access_code);
  const [isCopiedCode, setIsCopiedCode] = useState(false);

  // Filtros de resultados (compartilhados para Admin e Corretores)
  const [filterClassId, setFilterClassId] = useState<string>('all');
  const [filterReviewer, setFilterReviewer] = useState<string>('all');

  // Modal de Verificação / Auditoria do Gabarito do Aluno (Disponível para Admin e Corretores)
  const [verifyingSubmission, setVerifyingSubmission] = useState<EnemSubmission | null>(null);
  const [auditAnswers, setAuditAnswers] = useState<Record<number, EnemAnswerOption>>({});
  const [isSavingAudit, setIsSavingAudit] = useState(false);
  const [pendingDeleteSubmission, setPendingDeleteSubmission] = useState<EnemSubmission | null>(null);

  // Função central de sincronização de correções e gabaritos com o Supabase
  const syncAllRemoteData = async (silent = true) => {
    if (!silent) setIsSyncingSubmissions(true);
    const targetReviewer = isReviewerMode ? reviewerName : undefined;

    try {
      const [sim, subs, allSims] = await Promise.all([
        fetchRemoteSimulation(targetReviewer),
        fetchRemoteSubmissions(),
        fetchAllSimulationsMap()
      ]);

      setSimulation(sim);
      if (silent === false) {
        setTempAccessCode(sim.access_code);
      }
      setSubmissions(subs);
      setSimulationsMap(prev => ({
        ...prev,
        ...allSims,
        [getSimulationIdForUser(targetReviewer)]: sim.official_answers
      }));

      if (!silent) {
        setStatusMessage({
          text: `Sincronização concluída! ${subs.length} correção(ões) carregada(s) para toda a equipe.`,
          type: 'success'
        });
      }
    } catch (e) {
      console.warn('Falha ao sincronizar dados remotos:', e);
    } finally {
      if (!silent) setIsSyncingSubmissions(false);
    }
  };

  // Carregar turmas e sincronizar dados com Supabase + Realtime + Polling leve
  useEffect(() => {
    fetchClasses();

    const targetReviewer = isReviewerMode ? reviewerName : undefined;
    fetchRemoteSimulation(targetReviewer).then(sim => {
      setSimulation(sim);
      setEditingAnswers(sim.official_answers);
      setTempAccessCode(sim.access_code);
      setSimulationsMap(prev => ({
        ...prev,
        [getSimulationIdForUser(targetReviewer)]: sim.official_answers
      }));
    });

    fetchRemoteSubmissions().then(subs => setSubmissions(subs));
    fetchAllSimulationsMap().then(map => setSimulationsMap(prev => ({ ...prev, ...map })));

    const handleFocus = () => {
      fetchRemoteSubmissions().then(subs => setSubmissions(subs));
      fetchAllSimulationsMap().then(map => setSimulationsMap(prev => ({ ...prev, ...map })));
    };
    window.addEventListener('focus', handleFocus);

    const pollInterval = setInterval(() => {
      fetchRemoteSubmissions().then(subs => setSubmissions(subs));
    }, 20000);

    let realtimeChannel: any = null;
    if (supabase) {
      realtimeChannel = supabase
        .channel('enem_submissions_shared_sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'enem_submissions' },
          () => {
            fetchRemoteSubmissions().then(subs => setSubmissions(subs));
          }
        )
        .subscribe();
    }

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(pollInterval);
      if (realtimeChannel && supabase) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, [isReviewerMode, reviewerName]);

  // Atualizar lista de correções sempre que alternar para aba de Correção ou Resultados
  useEffect(() => {
    if (activeTab === 'grading' || activeTab === 'results') {
      fetchRemoteSubmissions().then(subs => setSubmissions(subs));
      fetchAllSimulationsMap().then(map => setSimulationsMap(prev => ({ ...prev, ...map })));
    }
  }, [activeTab]);

  // Carregar alunos quando turma for selecionada
  useEffect(() => {
    if (selectedClassId) {
      fetchStudents(selectedClassId);
    } else {
      setStudents([]);
    }
  }, [selectedClassId]);

  // Função utilitária para filtrar estritamente turmas do 3º ano do Ensino Médio
  const isThirdYearClass = (c: Class): boolean => {
    if (!c) return false;
    if (Number(c.school_year) === 3) return true;
    if ((c as any).grade_level && String((c as any).grade_level).includes('3')) return true;
    const rawName = (c.name || '').trim();
    const name = rawName.toLowerCase();
    if (
      name.includes('3º') ||
      name.includes('3°') ||
      name.includes('3o') ||
      name.includes('3ª') ||
      name.includes('3a') ||
      name.includes('terceiro') ||
      name.includes('3 ano') ||
      name.includes('3ano') ||
      name.includes('3-ano') ||
      name.includes('3_ano') ||
      name.includes('3 em') ||
      name.includes('3em') ||
      name.includes('3º em') ||
      name.includes('3° em') ||
      name.includes('3ª série') ||
      name.includes('3a série') ||
      name.includes('3ª serie') ||
      name.includes('3a serie') ||
      name.includes('3 serie') ||
      name.includes('3serie')
    ) {
      return true;
    }
    // Começa com 3 (ex: "3A", "3B", "3C", "3D", "3-A", "3 01", "301", "3°A", "3ºC")
    if (/^3[a-zA-Z\s\-_0-9º°ª]/.test(rawName) || rawName === '3') {
      return true;
    }
    return false;
  };

  async function fetchClasses() {
    setIsLoadingClasses(true);
    let rawList: Class[] = [];

    // 1. Buscar direto do Supabase
    try {
      if (supabase) {
        const { data, error } = await supabase.from('classes').select('*').order('name');
        if (!error && data && data.length > 0) {
          rawList = data;
          try {
            localStorage.setItem('cached_app_classes', JSON.stringify(data));
          } catch (e) {}
        }
      }
    } catch (err) {
      console.warn('Erro ao buscar turmas no Supabase (tentando fontes locais):', err);
    }

    // 2. Se vazio, verificar caches salvos no navegador pelo administrador
    if (rawList.length === 0) {
      const cacheKeys = ['cached_app_classes', 'educorrige_classes', 'app_classes', 'classes'];
      for (const k of cacheKeys) {
        try {
          const cached = localStorage.getItem(k);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              rawList = parsed;
              break;
            }
          }
        } catch (e) {}
      }
    }

    // 3. Filtrar turmas do 3º ano
    if (rawList.length > 0) {
      setAllClassesLookup(rawList);
    }
    let filtered = rawList.filter(isThirdYearClass);

    // Ordenar de forma natural (ex: 3°A, 3°B, 3ºC, 3ºD)
    filtered.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));

    // Se existirem turmas cadastradas mas nenhuma com "3º" no título, disponibilizar todas para não travar
    if (filtered.length === 0 && rawList.length > 0) {
      filtered = rawList;
    }

    // Se o banco ainda estiver vazio neste ambiente local
    if (filtered.length === 0) {
      filtered = [
        { id: '3-ano-a', name: '3º Ano A - Ensino Médio', school_year: 3, school_id: 'default', user_id: 'admin', created_at: new Date().toISOString() },
        { id: '3-ano-b', name: '3º Ano B - Ensino Médio', school_year: 3, school_id: 'default', user_id: 'admin', created_at: new Date().toISOString() },
        { id: '3-ano-c', name: '3º Ano C - Ensino Médio', school_year: 3, school_id: 'default', user_id: 'admin', created_at: new Date().toISOString() }
      ];
    }

    setClasses(filtered);
    if (filtered.length > 0) {
      setSelectedClassId(prev => prev && filtered.some(c => c.id === prev) ? prev : filtered[0].id);
    }

    setIsLoadingClasses(false);
  }

  async function fetchStudents(classId: string) {
    if (!classId) {
      setStudents([]);
      return;
    }
    setIsLoadingStudents(true);
    let studentList: Student[] = [];

    // 1. Tentar buscar do Supabase
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('students')
          .select('*')
          .eq('class_id', classId)
          .order('roll_number', { ascending: true })
          .order('name', { ascending: true });
        if (!error && data && data.length > 0) {
          studentList = data;
          try {
            localStorage.setItem(`cached_students_${classId}`, JSON.stringify(data));
          } catch (e) {}
        }
      }
    } catch (err) {
      console.warn('Erro ao buscar alunos no Supabase:', err);
    }

    // 2. Fallback de cache local
    if (studentList.length === 0) {
      const studentKeys = [`cached_students_${classId}`, `students_${classId}`];
      for (const k of studentKeys) {
        try {
          const cached = localStorage.getItem(k);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              studentList = parsed;
              break;
            }
          }
        } catch (e) {}
      }
    }

    // Ordenar estudantes em ordem alfabética da turma
    studentList.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

    setStudents(studentList);

    // Se houver apenas 1 slot vazio inicial, já pré-seleciona o primeiro aluno pendente para agilizar
    if (studentList.length > 0) {
      const firstUncorrected = studentList.find(s => !submissions.some(sub => sub.student_id === s.id));
      setEnemSlots(prev => {
        if (prev.length === 1 && !prev[0].studentId && !prev[0].imagePreview && !prev[0].answers) {
          return [{
            ...prev[0],
            studentId: firstUncorrected ? firstUncorrected.id : studentList[0].id
          }];
        }
        return prev;
      });
    }

    setIsLoadingStudents(false);
  }

  // Determina o próximo aluno na ordem alfabética da turma que ainda não está nos slots
  const getNextAlphabeticalStudentId = (currentSlots: EnemSlotItem[], studentPool: Student[] = students): string => {
    if (!studentPool || studentPool.length === 0) return '';
    const usedIds = new Set(currentSlots.map(s => s.studentId).filter(Boolean));

    let lastIdx = -1;
    for (let i = currentSlots.length - 1; i >= 0; i--) {
      const sid = currentSlots[i].studentId;
      if (sid) {
        const idx = studentPool.findIndex(st => st.id === sid);
        if (idx !== -1) {
          lastIdx = idx;
          break;
        }
      }
    }

    if (lastIdx !== -1) {
      for (let i = lastIdx + 1; i < studentPool.length; i++) {
        if (!usedIds.has(studentPool[i].id)) {
          return studentPool[i].id;
        }
      }
    }

    for (let i = 0; i < studentPool.length; i++) {
      if (!usedIds.has(studentPool[i].id)) {
        return studentPool[i].id;
      }
    }

    return '';
  };

  // Gerenciamento dos Slots de Correção do ENEM
  const addEnemSlot = (preselectStudentId: string = '') => {
    setEnemSlots(prev => {
      if (prev.length >= 60) return prev;
      const newId = `enem-slot-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const nextStudentId = preselectStudentId || getNextAlphabeticalStudentId(prev);
      return [
        ...prev,
        {
          id: newId,
          studentId: nextStudentId,
          imagePreview: null,
          answers: null,
          status: 'idle',
          error: null
        }
      ];
    });
  };

  const removeEnemSlot = (slotId: string) => {
    if (enemSlots.length <= 1) return;
    setEnemSlots(prev => prev.filter(s => s.id !== slotId));
  };

  const updateEnemSlot = (slotId: string, updates: Partial<EnemSlotItem>) => {
    setEnemSlots(prev => prev.map(s => (s.id === slotId ? { ...s, ...updates } : s)));
  };

  const handleFillEnemSlots = (onlyPending: boolean) => {
    if (!students || students.length === 0) {
      setStatusMessage({
        text: 'Selecione uma turma que contenha alunos cadastrados primeiro.',
        type: 'error'
      });
      return;
    }

    const targetList = onlyPending
      ? students.filter(s => !submissions.some(sub => sub.student_id === s.id))
      : students;

    if (targetList.length === 0) {
      setStatusMessage({
        text: 'Todos os alunos desta turma já estão corrigidos! Use "Preencher Todos" se desejar refazer algum cartão.',
        type: 'info'
      });
      return;
    }

    const newSlots: EnemSlotItem[] = targetList.map((student, idx) => ({
      id: `enem-slot-${student.id}-${Date.now()}-${idx}`,
      studentId: student.id,
      imagePreview: null,
      answers: null,
      status: 'idle',
      error: null
    }));

    setEnemSlots(newSlots);
    setStatusMessage({
      text: `${newSlots.length} slot(s) criados em ordem alfabética (${onlyPending ? 'apenas pendentes' : 'turma completa'}). Agora fotografe com a câmera contínua ou distribua as fotos!`,
      type: 'success'
    });
  };

  const compressFileToDataUrl = async (file: File): Promise<string> => {
    try {
      const compressed = await compressImageForAI(file, 1440, 0.85);
      return `data:${compressed.mimeType};base64,${compressed.base64}`;
    } catch {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
  };

  const handleSlotFileUpload = async (slotId: string, files: File[]) => {
    const file = files[0];
    if (!file) return;
    const dataUrl = await compressFileToDataUrl(file);
    updateEnemSlot(slotId, {
      imagePreview: dataUrl,
      answers: null,
      status: 'idle',
      error: null
    });
  };

  const handleBatchEnemPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList: File[] = Array.from(files);
    fileList.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const dataUrls = await Promise.all(fileList.map(compressFileToDataUrl));

    setEnemSlots(prev => {
      const updated = [...prev];
      let urlIdx = 0;

      // Preenche primeiro os slots que ainda não possuem foto
      for (let i = 0; i < updated.length && urlIdx < dataUrls.length; i++) {
        if (!updated[i].imagePreview) {
          const assignedStudentId = updated[i].studentId || getNextAlphabeticalStudentId(updated);
          updated[i] = {
            ...updated[i],
            studentId: assignedStudentId,
            imagePreview: dataUrls[urlIdx],
            answers: null,
            status: 'idle',
            error: null
          };
          urlIdx++;
        }
      }

      // Se sobrarem fotos, cria novos slots automaticamente já preenchidos com os próximos alunos em ordem alfabética
      while (urlIdx < dataUrls.length && updated.length < 60) {
        const nextStudentId = getNextAlphabeticalStudentId(updated);
        updated.push({
          id: `enem-slot-${Date.now()}-${urlIdx}`,
          studentId: nextStudentId,
          imagePreview: dataUrls[urlIdx],
          answers: null,
          status: 'idle',
          error: null
        });
        urlIdx++;
      }

      return updated;
    });

    e.target.value = '';
    setStatusMessage({
      text: `${fileList.length} foto(s) comprimidas em alta nitidez (1440px) e distribuídas nos slots!`,
      type: 'success'
    });
  };

  const handleClearCompletedEnemSlots = () => {
    setEnemSlots(prev => {
      const remaining = prev.filter(s => s.status !== 'done');
      if (remaining.length === 0) {
        const firstPending = students.find(s => !submissions.some(sub => sub.student_id === s.id));
        const fallbackId = firstPending ? firstPending.id : (students[0]?.id || '');
        return [{
          id: `enem-slot-${Date.now()}-1`,
          studentId: fallbackId,
          imagePreview: null,
          answers: null,
          status: 'idle',
          error: null
        }];
      }
      return remaining;
    });
  };

  const handleResetAllEnemSlots = () => {
    setEnemSlots(prev => prev.map(s => ({
      ...s,
      imagePreview: null,
      answers: null,
      status: 'idle',
      error: null
    })));
  };

  const handleFocusOrCreateSlotForStudent = (studentId: string) => {
    setEnemSlots(prev => {
      const alreadyIdx = prev.findIndex(s => s.studentId === studentId && s.status !== 'done');
      if (alreadyIdx >= 0) return prev;

      const emptyIdx = prev.findIndex(s => !s.studentId && !s.imagePreview && !s.answers);
      if (emptyIdx >= 0) {
        const clone = [...prev];
        clone[emptyIdx] = { ...clone[emptyIdx], studentId };
        return clone;
      }

      return [
        ...prev,
        {
          id: `enem-slot-${studentId}-${Date.now()}`,
          studentId,
          imagePreview: null,
          answers: null,
          status: 'idle',
          error: null
        }
      ];
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Câmera Contínua para Slots
  const startCamera = async (slotId?: string) => {
    const targetSlotId = slotId || (enemSlots.find(s => !s.imagePreview) || enemSlots[0])?.id || null;
    try {
      setActiveCameraSlotId(targetSlotId);
      setIsCameraOpen(true);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Erro ao acessar câmera:', err);
      setStatusMessage({
        text: 'Não foi possível acessar a câmera. Você pode usar a opção "Galeria" ou "Upload em Lote".',
        type: 'error'
      });
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraOpen(false);
    setActiveCameraSlotId(null);
  };

  const switchCameraFacing = async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextMode }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.warn('Não foi possível alternar câmera:', err);
    }
  };

  const capturePhoto = (advanceToNextSlot: boolean = true) => {
    if (!videoRef.current || !activeCameraSlotId) return;
    let width = videoRef.current.videoWidth || 1440;
    let height = videoRef.current.videoHeight || 1080;
    const maxDim = 1440;
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      updateEnemSlot(activeCameraSlotId, {
        imagePreview: dataUrl,
        answers: null,
        status: 'idle',
        error: null
      });

      if (advanceToNextSlot) {
        const currentIndex = enemSlots.findIndex(s => s.id === activeCameraSlotId);
        if (currentIndex !== -1 && currentIndex + 1 < enemSlots.length) {
          setActiveCameraSlotId(enemSlots[currentIndex + 1].id);
        } else {
          stopCamera();
        }
      }
    }
  };

  const buildSubmissionFromSlot = (
    slot: EnemSlotItem,
    answers: Record<number, EnemAnswerOption>
  ): EnemSubmission | null => {
    const studentObj = students.find(s => s.id === slot.studentId);
    if (!studentObj || !selectedClassId) return null;

    const classObj = classes.find(c => c.id === selectedClassId) || allClassesLookup.find(c => c.id === selectedClassId);
    const stats = calculateEnemStatistics(answers, simulation.official_answers);

    return {
      id: `${SHARED_SIMULATION_ID}_${studentObj.id}`,
      simulation_id: SHARED_SIMULATION_ID,
      student_id: studentObj.id,
      student_name: studentObj.name,
      roll_number: studentObj.roll_number,
      class_id: selectedClassId,
      class_name: classObj?.name,
      reviewer_name: isReviewerMode ? reviewerName : 'Administrador',
      answers,
      total_correct: stats.totalCorrect,
      score_points: stats.score,
      blank_count: stats.totalBlank,
      multiple_count: stats.totalMultiple,
      created_at: new Date().toISOString()
    };
  };

  // Correção em cascata dos slots do ENEM (Opção A: Gemini 3.8 Flash LOW + 1440px + Salvamento Automático)
  const handleGradeEnemBatch = async () => {
    const readySlots = enemSlots
      .map((slot, index) => ({ slot, slotVisualIndex: index + 1 }))
      .filter(item => item.slot.studentId && item.slot.imagePreview && item.slot.status !== 'done');

    if (readySlots.length === 0) {
      setStatusMessage({
        text: 'Selecione um aluno e carregue/fotografe o cartão-resposta em pelo menos um slot antes de corrigir.',
        type: 'error'
      });
      return;
    }

    setIsProcessingBatch(true);
    setStatusMessage(null);
    setCurrentBatchProgress(null);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const CONCURRENCY = 2;
    let currentIndex = 0;
    let completedCount = 0;
    let successCount = 0;

    const processSlot = async (item: { slot: EnemSlotItem; slotVisualIndex: number }) => {
      const { slot, slotVisualIndex } = item;
      const studentObj = students.find(s => s.id === slot.studentId);
      const studentName = studentObj?.name || `Slot #${slotVisualIndex}`;

      setCurrentBatchProgress({
        currentStep: completedCount + 1,
        totalSteps: readySlots.length,
        studentName,
        slotIndex: slotVisualIndex
      });

      updateEnemSlot(slot.id, { status: 'processing', error: null });

      try {
        const aiAnswers = await analyzeEnemBubbleSheet(slot.imagePreview!);
        const newSub = buildSubmissionFromSlot(slot, aiAnswers);
        if (newSub) {
          const updatedSubs = await saveStoredSubmission(newSub);
          setSubmissions(updatedSubs);
        }

        updateEnemSlot(slot.id, {
          answers: aiAnswers,
          status: 'done',
          error: null,
          savedSubmissionId: newSub?.id || null
        });
        successCount++;
      } catch (err: any) {
        updateEnemSlot(slot.id, {
          status: 'error',
          error: err?.message || 'Falha ao ler cartão-resposta'
        });
      } finally {
        completedCount++;
        setCurrentBatchProgress({
          currentStep: completedCount,
          totalSteps: readySlots.length,
          studentName,
          slotIndex: slotVisualIndex
        });
        await delay(100);
      }
    };

    const workerCount = Math.min(CONCURRENCY, readySlots.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (currentIndex < readySlots.length) {
        const nextItem = readySlots[currentIndex++];
        await processSlot(nextItem);
      }
    });

    await Promise.all(workers);

    setIsProcessingBatch(false);
    setCurrentBatchProgress(null);

    if (successCount > 0) {
      setStatusMessage({
        text: `Correção em cascata concluída! ${successCount} de ${readySlots.length} cartões reconhecidos e salvos automaticamente para toda a equipe.`,
        type: 'success'
      });
    } else {
      setStatusMessage({
        text: 'Nenhum cartão pôde ser reconhecido. Verifique as fotos e tente novamente.',
        type: 'error'
      });
    }
  };

  // Atualizar manualmente uma alternativa dentro de um slot e marcar para sincronização
  const handleUpdateSlotAnswer = (slotId: string, qNum: number, nextOpt: EnemAnswerOption) => {
    setEnemSlots(prev => prev.map(slot => {
      if (slot.id !== slotId) return slot;
      const baseAnswers: Record<number, EnemAnswerOption> = slot.answers || (() => {
        const empty: Record<number, EnemAnswerOption> = {};
        for (let q = 1; q <= 45; q++) empty[q] = 'BLANK';
        return empty;
      })();
      return {
        ...slot,
        answers: {
          ...baseAnswers,
          [qNum]: nextOpt
        }
      };
    }));
  };

  // Salvar / ressincronizar todos os slots com respostas (incluindo ajustes manuais)
  const handleSaveAllEnemSlots = async () => {
    const slotsToSave = enemSlots.filter(s => s.studentId && s.answers);
    if (slotsToSave.length === 0) return;

    setIsSavingBatch(true);
    try {
      let latestSubs = submissions;
      for (const slot of slotsToSave) {
        const newSub = buildSubmissionFromSlot(slot, slot.answers!);
        if (newSub) {
          latestSubs = await saveStoredSubmission(newSub);
        }
      }
      setSubmissions(latestSubs);
      setStatusMessage({
        text: `${slotsToSave.length} correção(ões) sincronizada(s) com sucesso para toda a equipe!`,
        type: 'success'
      });
    } catch (err: any) {
      setStatusMessage({
        text: 'Erro ao sincronizar correções: ' + (err?.message || 'Tente novamente'),
        type: 'error'
      });
    } finally {
      setIsSavingBatch(false);
    }
  };

  // Preenchimento rápido a partir de uma sequência de texto (ex: "ABCDE...")
  const handleApplyQuickSequence = () => {
    if (!quickSequenceInput.trim()) return;
    const cleanLetters = quickSequenceInput
      .toUpperCase()
      .replace(/[^ABCDE*]/g, '');

    if (cleanLetters.length === 0) {
      setStatusMessage({
        text: 'Nenhuma alternativa válida (A, B, C, D, E) encontrada no texto.',
        type: 'error'
      });
      return;
    }

    const nextAnswers = { ...editingAnswers };
    for (let i = 0; i < Math.min(cleanLetters.length, 45); i++) {
      const char = cleanLetters[i];
      if (['A', 'B', 'C', 'D', 'E'].includes(char)) {
        nextAnswers[i + 1] = char as EnemAnswerOption;
      } else if (char === '*') {
        nextAnswers[i + 1] = 'ANULADA';
      }
    }

    setEditingAnswers(nextAnswers);
    setShowQuickFill(false);
    setQuickSequenceInput('');
    setStatusMessage({
      text: `${Math.min(cleanLetters.length, 45)} questões foram preenchidas a partir da sequência informada! Clique em "Salvar" para confirmar.`,
      type: 'success'
    });
  };

  // Salvar novo Gabarito Oficial (Individual por corretor se for corretor)
  const handleSaveOfficialAnswers = async () => {
    const targetReviewer = isReviewerMode ? reviewerName : undefined;
    const updatedSim: EnemSimulation = {
      ...simulation,
      official_answers: editingAnswers,
      access_code: tempAccessCode.trim() || DEFAULT_SIMULATION.access_code
    };
    setSimulation(updatedSim);
    setSimulationsMap(prev => ({
      ...prev,
      [getSimulationIdForUser(targetReviewer)]: editingAnswers
    }));
    await saveStoredSimulation(updatedSim, targetReviewer);
    setStatusMessage({
      text: isReviewerMode
        ? `Seu gabarito pessoal de correção (${reviewerName}) foi salvo com sucesso!`
        : 'Gabarito Oficial e Código de Acesso salvos com sucesso no banco de dados!',
      type: 'success'
    });
  };

  const copyAccessCode = () => {
    navigator.clipboard.writeText(simulation.access_code);
    setIsCopiedCode(true);
    setTimeout(() => setIsCopiedCode(false), 2000);
  };

  // Ações de Auditoria / Verificação e Exclusão (Admin e Corretores)
  const handleOpenAuditModal = (sub: EnemSubmission) => {
    setVerifyingSubmission(sub);
    const answersCopy: Record<number, EnemAnswerOption> = {};
    for (let q = 1; q <= 45; q++) {
      answersCopy[q] = sub.answers?.[q] || 'BLANK';
    }
    setAuditAnswers(answersCopy);
  };

  const handleCloseAuditModal = () => {
    setVerifyingSubmission(null);
    setAuditAnswers({});
  };

  // Gabarito de referência exato do professor que corrigiu a submissão em auditoria
  const auditOfficialAnswers: Record<number, EnemAnswerOption> = verifyingSubmission
    ? (simulationsMap[getSimulationIdForUser(verifyingSubmission.reviewer_name)] ||
       (verifyingSubmission.reviewer_name === reviewerName ? simulation.official_answers : undefined) ||
       simulationsMap[SHARED_SIMULATION_ID] ||
       simulation.official_answers)
    : simulation.official_answers;

  const auditStats = verifyingSubmission
    ? calculateEnemStatistics(auditAnswers, auditOfficialAnswers)
    : null;

  const handleSaveAudit = async () => {
    if (!verifyingSubmission || !auditStats) return;

    setIsSavingAudit(true);
    const updatedSub: EnemSubmission = {
      ...verifyingSubmission,
      simulation_id: SHARED_SIMULATION_ID,
      answers: auditAnswers,
      total_correct: auditStats.totalCorrect,
      score_points: auditStats.score,
      blank_count: auditStats.totalBlank,
      multiple_count: auditStats.totalMultiple,
      updated_at: new Date().toISOString()
    };

    try {
      const updatedList = await saveStoredSubmission(updatedSub);
      setSubmissions(updatedList);

      setStatusMessage({
        text: `Gabarito de "${verifyingSubmission.student_name}" verificado e sincronizado com sucesso! (${auditStats.totalCorrect}/45 acertos = ${auditStats.score.toFixed(1)} pts)`,
        type: 'success'
      });
      handleCloseAuditModal();
    } catch (err: any) {
      setStatusMessage({
        text: 'Erro ao salvar auditoria: ' + (err?.message || 'Tente novamente'),
        type: 'error'
      });
    } finally {
      setIsSavingAudit(false);
    }
  };

  const handleDeleteSubmission = (sub: EnemSubmission) => {
    setPendingDeleteSubmission(sub);
  };

  const confirmDeleteSubmission = async () => {
    if (!pendingDeleteSubmission) return;
    const sub = pendingDeleteSubmission;
    setPendingDeleteSubmission(null);

    const updated = await deleteStoredSubmission(sub.id, sub.student_id);
    setSubmissions(updated);

    setEnemSlots(prev => prev.map(slot => {
      if (slot.studentId === sub.student_id) {
        return {
          ...slot,
          answers: null,
          status: 'idle',
          error: null,
          savedSubmissionId: null
        };
      }
      return slot;
    }));

    setStatusMessage({
      text: `Nota do simulado de "${sub.student_name}" excluída com sucesso. Aluno liberado para nova correção.`,
      type: 'info'
    });
  };

  const resolveClassName = (classId: string, fallbackName?: string): string => {
    return (
      classes.find(c => c.id === classId)?.name ||
      allClassesLookup.find(c => c.id === classId)?.name ||
      fallbackName ||
      '3º Ano'
    );
  };

  const selectedClassObj = classes.find(c => c.id === selectedClassId);
  const readyEnemSlotsCount = enemSlots.filter(s => s.studentId && s.imagePreview && s.status !== 'done').length;
  const doneEnemSlotsCount = enemSlots.filter(s => s.status === 'done' && s.answers).length;
  const correctedInClassCount = students.filter(st => submissions.some(sub => sub.student_id === st.id)).length;
  const pendingInClassCount = Math.max(0, students.length - correctedInClassCount);

  // Lista única de corretores que já realizaram correções para filtro opcional
  const uniqueReviewers = Array.from(
    new Set(submissions.map(s => s.reviewer_name).filter((r): r is string => Boolean(r && r.trim())))
  );

  // Todas as correções do simulado ficam disponíveis para Admin e Corretores
  const filteredSubmissions = submissions.filter(s => {
    const matchClass = filterClassId === 'all' || s.class_id === filterClassId;
    const matchReviewer = filterReviewer === 'all' || s.reviewer_name === filterReviewer;
    return matchClass && matchReviewer;
  });

  // Exportação profissional de Relatório em PDF (Exclusivo do Administrador)
  const exportSimuladoPDF = (targetClassId?: string) => {
    if (isReviewerMode) return;
    const listToExport = targetClassId && targetClassId !== 'all'
      ? submissions.filter(s => s.class_id === targetClassId)
      : filteredSubmissions;

    if (listToExport.length === 0) {
      setStatusMessage({
        text: 'Nenhum resultado corrigido encontrado para exportar o relatório em PDF.',
        type: 'info'
      });
      return;
    }

    try {
      const doc = new jsPDF();
      const targetClassName = targetClassId && targetClassId !== 'all'
        ? resolveClassName(targetClassId, 'Turma Selecionada')
        : (filterClassId === 'all'
            ? 'Todas as Turmas do 3º Ano'
            : resolveClassName(filterClassId, 'Turma Selecionada'));

      // Cabeçalho institucional do documento
      doc.setFillColor(10, 37, 64);
      doc.rect(0, 0, 210, 32, 'F');

      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text('RELATÓRIO DE RESULTADOS DO SIMULADO ENEM', 105, 14, { align: 'center' });

      doc.setFontSize(10);
      doc.setTextColor(226, 232, 240);
      doc.text(`${DEFAULT_SIMULATION.title} | Turma: ${targetClassName} | Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 105, 23, { align: 'center' });

      // Estatísticas gerais
      const totalCorrigidos = listToExport.length;
      const mediaAcertos = (listToExport.reduce((acc, s) => acc + s.total_correct, 0) / totalCorrigidos).toFixed(1);
      const mediaNota = (listToExport.reduce((acc, s) => acc + s.score_points, 0) / totalCorrigidos).toFixed(2);
      const maiorNota = Math.max(...listToExport.map(s => s.score_points)).toFixed(1);

      // Card de resumo
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, 38, 182, 18, 3, 3, 'FD');

      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(`Alunos Corrigidos: ${totalCorrigidos}`, 20, 49);
      doc.text(`Média de Acertos: ${mediaAcertos} / 45`, 70, 49);
      doc.text(`Média Geral: ${mediaNota} pts`, 122, 49);
      doc.text(`Maior Nota: ${maiorNota} pts`, 166, 49);

      // Tabela ordenada por nota decrescente
      const sortedList = [...listToExport].sort((a, b) => {
        if (b.score_points !== a.score_points) return b.score_points - a.score_points;
        return b.total_correct - a.total_correct;
      });

      const tableData = sortedList.map((item, index) => {
        const cls = resolveClassName(item.class_id, item.class_name);
        const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : '-';
        return [
          `${index + 1}º`,
          item.student_name,
          cls,
          `${item.total_correct} / 45`,
          `${item.score_points.toFixed(1)} pts`,
          item.reviewer_name || 'Admin',
          dateStr
        ];
      });

      autoTable(doc, {
        startY: 62,
        head: [['Class.', 'Aluno', 'Turma', 'Acertos', 'Nota', 'Corretor', 'Data']],
        body: tableData,
        headStyles: { fillColor: [10, 37, 64], fontSize: 9, halign: 'center' },
        bodyStyles: { fontSize: 8.5 },
        columnStyles: {
          0: { cellWidth: 15, halign: 'center' },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 25, halign: 'center' },
          3: { cellWidth: 22, halign: 'center' },
          4: { cellWidth: 22, halign: 'center' },
          5: { cellWidth: 35 },
          6: { cellWidth: 22, halign: 'center' }
        },
        didDrawPage: () => {
          doc.setFontSize(8);
          doc.setTextColor(148, 163, 184);
          doc.text(
            `Página ${doc.internal.pages.length - 1} | Sistema de Gestão Escolar - Simulado ENEM`,
            105,
            doc.internal.pageSize.height - 10,
            { align: 'center' }
          );
        }
      });

      const safeClassName = targetClassName.replace(/[^a-zA-Z0-9]/g, '_');
      doc.save(`Relatorio_Simulado_ENEM_${safeClassName}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`);

      setStatusMessage({
        text: `Relatório em PDF baixado com sucesso (${targetClassName})!`,
        type: 'success'
      });
    } catch (err: any) {
      console.error('Erro ao gerar PDF:', err);
      setStatusMessage({
        text: 'Não foi possível gerar o arquivo PDF. Tente novamente.',
        type: 'error'
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Barra de Notificação de Status */}
      {statusMessage && (
        <div className={`p-4 rounded-2xl flex items-center justify-between border ${
          statusMessage.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' 
            : statusMessage.type === 'error'
            ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
            : 'bg-blue-50 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800'
        }`}>
          <div className="flex items-center gap-3">
            {statusMessage.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
            <span className="text-sm font-medium">{statusMessage.text}</span>
          </div>
          <button 
            onClick={() => setStatusMessage(null)}
            className="text-xs uppercase font-bold tracking-wider opacity-70 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Cabeçalho do Módulo */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-3 py-1 bg-brand-yellow/20 text-brand-blue-dark dark:text-brand-yellow text-xs font-bold rounded-full uppercase tracking-wider">
              {simulation.title}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-brand-blue-dark dark:text-white">
            {isReviewerMode ? 'Portal do Corretor' : 'Gestão do Simulado ENEM'}
          </h1>
          {isReviewerMode && (
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              Conectado como: {reviewerName}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => syncAllRemoteData(false)}
            disabled={isSyncingSubmissions}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all border border-slate-200 dark:border-slate-700 disabled:opacity-50"
            title="Sincronizar todas as correções da equipe agora"
          >
            <RefreshCw size={14} className={isSyncingSubmissions ? 'animate-spin text-brand-blue' : ''} />
            <span>Sincronizar</span>
          </button>

          {isReviewerMode ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                <button
                  onClick={() => setActiveTab('grading')}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'grading' 
                      ? 'bg-brand-blue text-white shadow-md' 
                      : 'text-slate-600 dark:text-slate-300 hover:text-brand-blue'
                  }`}
                >
                  Corrigir Cartões
                </button>
                <button
                  onClick={() => setActiveTab('answer-key')}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    activeTab === 'answer-key' 
                      ? 'bg-brand-blue text-white shadow-md' 
                      : 'text-slate-600 dark:text-slate-300 hover:text-brand-blue'
                  }`}
                >
                  <Key size={13} />
                  <span>Meu Gabarito</span>
                </button>
                <button
                  onClick={() => setActiveTab('results')}
                  className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    activeTab === 'results' 
                      ? 'bg-brand-blue text-white shadow-md' 
                      : 'text-slate-600 dark:text-slate-300 hover:text-brand-blue'
                  }`}
                >
                  Resultados ({submissions.length})
                </button>
              </div>

              <button
                onClick={onExitReviewerMode}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 hover:bg-rose-100 text-xs font-bold transition-all border border-rose-200 dark:border-rose-900"
                title="Sair do Portal do Corretor"
              >
                <LogOut size={14} />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
              <button
                onClick={() => setActiveTab('grading')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'grading' 
                    ? 'bg-brand-blue text-white shadow-md' 
                    : 'text-slate-600 dark:text-slate-300 hover:text-brand-blue'
                }`}
              >
                Correção
              </button>
              <button
                onClick={() => setActiveTab('answer-key')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'answer-key' 
                    ? 'bg-brand-blue text-white shadow-md' 
                    : 'text-slate-600 dark:text-slate-300 hover:text-brand-blue'
                }`}
              >
                Gabarito Oficial
              </button>
              <button
                onClick={() => setActiveTab('results')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'results' 
                    ? 'bg-brand-blue text-white shadow-md' 
                    : 'text-slate-600 dark:text-slate-300 hover:text-brand-blue'
                }`}
              >
                Resultados & PDF ({submissions.length})
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'settings' 
                    ? 'bg-brand-blue text-white shadow-md' 
                    : 'text-slate-600 dark:text-slate-300 hover:text-brand-blue'
                }`}
              >
                Acesso Corretores
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Régua explicativa das Faixas de Pontuação */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-2xl p-4 shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Award className="text-brand-yellow shrink-0" size={24} />
          <div>
            <span className="text-xs uppercase font-bold tracking-wider text-brand-yellow">Escala de Pontuação do Simulado</span>
            <p className="text-sm text-slate-200">A nota é gerada automaticamente pelo número de acertos das 45 questões:</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full md:w-auto text-center">
          <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
            <div className="text-xs text-slate-300">1 a 10 acertos</div>
            <div className="text-base font-bold text-amber-300">1,0 pt</div>
          </div>
          <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
            <div className="text-xs text-slate-300">11 a 21 acertos</div>
            <div className="text-base font-bold text-amber-300">2,0 pts</div>
          </div>
          <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
            <div className="text-xs text-slate-300">22 a 33 acertos</div>
            <div className="text-base font-bold text-emerald-300">3,0 pts</div>
          </div>
          <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/10">
            <div className="text-xs text-slate-300">34 a 45 acertos</div>
            <div className="text-base font-bold text-emerald-300">4,0 pts</div>
          </div>
        </div>
      </div>

      {/* ABA 1: TELA DE CORREÇÃO (Disponível para Administrador e para o Corretor) */}
      {activeTab === 'grading' && (
        <div className="space-y-6">
          {/* Barra Informativa do Gabarito Ativo */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 bg-blue-50/80 dark:bg-blue-950/40 rounded-2xl border border-blue-200/70 dark:border-blue-900/50 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-600/10 dark:bg-blue-400/10 text-brand-blue dark:text-brand-yellow flex items-center justify-center shrink-0">
                <Key size={15} />
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block text-[11px]">Chave de Correção Utilizada:</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 text-xs">
                  {isReviewerMode ? `Gabarito Pessoal de ${reviewerName}` : 'Gabarito Oficial Mestre (Admin)'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('answer-key')}
              className="self-start sm:self-center px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-brand-blue dark:text-brand-yellow font-bold text-xs rounded-xl shadow-xs border border-blue-200 dark:border-blue-900 transition-all flex items-center gap-1.5"
            >
              <Edit3 size={13} />
              <span>{isReviewerMode ? 'Ajustar Meu Gabarito Pessoal' : 'Editar Gabarito Mestre'}</span>
            </button>
          </div>

          {/* Input oculto para upload de múltiplas fotos distribuídas */}
          <input
            ref={batchFileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={handleBatchEnemPhotoUpload}
          />

          {/* Barra de Progresso Durante Correção em Cascata */}
          {isProcessingBatch && currentBatchProgress && (
            <div className="bg-gradient-to-r from-brand-blue-dark via-brand-blue to-indigo-900 text-white p-5 rounded-3xl shadow-xl border border-white/10 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="animate-spin text-brand-yellow shrink-0" size={24} />
                  <div>
                    <p className="text-xs font-bold uppercase text-brand-yellow tracking-wider flex items-center gap-1.5">
                      <Sparkles size={14} />
                      Correção ENEM em Cascata (Gemini 3.8 Flash • Precisão Baixa)
                    </p>
                    <p className="text-base font-black">
                      Progresso: {currentBatchProgress.currentStep} de {currentBatchProgress.totalSteps} cartões concluídos
                      {currentBatchProgress.studentName ? ` • ${currentBatchProgress.studentName}` : ''}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-black bg-white/10 px-3 py-1.5 rounded-xl shrink-0">
                  {Math.round((currentBatchProgress.currentStep / currentBatchProgress.totalSteps) * 100)}%
                </span>
              </div>

              <div className="w-full bg-black/30 h-2.5 rounded-full overflow-hidden p-0.5">
                <div
                  className="bg-brand-yellow h-full rounded-full transition-all duration-300 shadow-md"
                  style={{ width: `${(currentBatchProgress.currentStep / currentBatchProgress.totalSteps) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Configuração de Turma e Ações em Lote por Slots */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
              <div className="flex-1 min-w-[240px]">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Turma (Apenas 3º Ano)
                  </label>
                  <button
                    type="button"
                    onClick={() => fetchClasses()}
                    className="text-[11px] text-brand-blue dark:text-brand-yellow hover:underline flex items-center gap-1 font-semibold"
                    title="Recarregar turmas cadastradas"
                  >
                    <RefreshCw size={11} className={isLoadingClasses ? 'animate-spin' : ''} />
                    Atualizar Turmas
                  </button>
                </div>
                <select
                  value={selectedClassId}
                  onChange={(e) => {
                    setSelectedClassId(e.target.value);
                    setEnemSlots([{
                      id: `enem-slot-${Date.now()}-1`,
                      studentId: '',
                      imagePreview: null,
                      answers: null,
                      status: 'idle',
                      error: null
                    }]);
                  }}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-brand-yellow shadow-sm"
                >
                  {classes.length === 0 ? (
                    <option value="">Carregando turmas do 3º ano...</option>
                  ) : (
                    <>
                      <option value="">Selecione a turma do 3º ano...</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200 dark:border-emerald-900">
                  ✓ {correctedInClassCount} Corrigido(s)
                </span>
                <span className="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-900">
                  ⏳ {pendingInClassCount} Pendente(s)
                </span>
                {isReviewerMode && (
                  <span className="px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-brand-blue dark:text-brand-yellow font-bold border border-blue-200 dark:border-blue-900">
                    {submissions.filter(s => s.reviewer_name === reviewerName).length} por você
                  </span>
                )}
              </div>
            </div>

            {/* Barra de Ações Rápidas dos Slots */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleFillEnemSlots(true)}
                  disabled={!selectedClassId || students.length === 0 || isProcessingBatch}
                  className="px-4 py-2.5 bg-brand-blue text-white rounded-xl text-xs font-bold hover:bg-brand-blue-dark flex items-center gap-2 shadow-sm disabled:opacity-50 transition-all active:scale-95"
                  title="Cria slots em ordem alfabética apenas para os alunos pendentes desta turma"
                >
                  <Users size={15} />
                  Preencher Pendentes ({pendingInClassCount})
                </button>

                <button
                  type="button"
                  onClick={() => handleFillEnemSlots(false)}
                  disabled={!selectedClassId || students.length === 0 || isProcessingBatch}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-2 disabled:opacity-50 transition-all active:scale-95"
                  title="Cria slots para todos os alunos da turma em ordem alfabética"
                >
                  <Users size={15} className="text-brand-blue dark:text-brand-yellow" />
                  Preencher Todos ({students.length})
                </button>

                <button
                  type="button"
                  onClick={() => batchFileInputRef.current?.click()}
                  disabled={isProcessingBatch}
                  className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                  title="Selecione várias fotos de cartões da galeria para distribuir na sequência dos slots"
                >
                  <Upload size={15} className="text-brand-yellow" />
                  Upload em Lote (Distribuir Fotos)
                </button>

                <button
                  type="button"
                  onClick={() => startCamera()}
                  disabled={isProcessingBatch}
                  className="px-4 py-2.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold hover:bg-amber-500/20 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                  title="Abre câmera contínua para fotografar aluno após aluno automaticamente"
                >
                  <Camera size={15} />
                  Câmera Contínua
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClearCompletedEnemSlots}
                  disabled={isProcessingBatch}
                  className="px-3 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  title="Remove os slots já concluídos"
                >
                  <RotateCcw size={14} />
                  Limpar Concluídos
                </button>
                <button
                  type="button"
                  onClick={handleResetAllEnemSlots}
                  disabled={isProcessingBatch}
                  className="px-3 py-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                  title="Limpa fotos e leituras de todos os slots"
                >
                  Resetar Tudo
                </button>
              </div>
            </div>
          </div>

          {/* Lista Sequencial de Slots do Simulado ENEM */}
          <div className="space-y-4">
            {enemSlots.map((slot, index) => {
              const slotStats = slot.answers
                ? calculateEnemStatistics(slot.answers, simulation.official_answers)
                : null;
              const isExpanded = !!expandedSlotIds[slot.id];

              return (
                <div
                  key={slot.id}
                  className={`bg-white dark:bg-slate-900 rounded-3xl shadow-sm border transition-all overflow-hidden ${
                    slot.status === 'processing'
                      ? 'border-brand-yellow ring-4 ring-brand-yellow/20'
                      : slot.status === 'done'
                        ? 'border-emerald-200 dark:border-emerald-900/50'
                        : slot.status === 'error'
                          ? 'border-rose-200 dark:border-rose-900/50'
                          : 'border-slate-100 dark:border-slate-800'
                  }`}
                >
                  {/* Cabeçalho do Slot */}
                  <div className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-50 dark:border-slate-800">
                    <div className="flex items-center gap-3 flex-1 min-w-[240px]">
                      <div
                        className={`w-9 h-9 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 shadow-sm ${
                          slot.status === 'done'
                            ? 'bg-emerald-500 text-white'
                            : slot.status === 'processing'
                              ? 'bg-brand-yellow text-brand-blue-dark animate-pulse'
                              : slot.status === 'error'
                                ? 'bg-rose-500 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {index + 1}
                      </div>

                      <select
                        value={slot.studentId}
                        onChange={(e) => updateEnemSlot(slot.id, { studentId: e.target.value })}
                        disabled={!selectedClassId || isLoadingStudents || slot.status === 'processing'}
                        className="flex-1 max-w-md p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl font-bold text-brand-blue-dark dark:text-brand-yellow focus:ring-2 focus:ring-brand-yellow text-sm border-none disabled:opacity-50"
                      >
                        <option value="">
                          {isLoadingStudents ? 'Carregando alunos...' : 'Selecionar Aluno (Ordem Alfabética)...'}
                        </option>
                        {students.map(s => {
                          const existingSub = submissions.find(item => item.student_id === s.id);
                          return (
                            <option key={s.id} value={s.id}>
                              {s.name}{s.roll_number ? ` (Nº ${s.roll_number})` : ''} {existingSub ? `✓ [${existingSub.score_points.toFixed(1)} pts]` : '• (Pendente)'}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Captura, Prévia e Resultados do Slot */}
                    <div className="flex items-center flex-wrap gap-3">
                      {slot.imagePreview && (
                        <div className="relative group/thumb">
                          <div className="w-11 h-11 rounded-xl border-2 border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm bg-black">
                            <img src={slot.imagePreview} className="w-full h-full object-cover" alt="Cartão-resposta" />
                          </div>
                          {slot.status !== 'processing' && (
                            <button
                              type="button"
                              onClick={() => updateEnemSlot(slot.id, { imagePreview: null, answers: null, status: 'idle', error: null })}
                              className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-rose-600 text-white rounded-full flex items-center justify-center shadow"
                              title="Remover imagem"
                            >
                              <X size={10} />
                            </button>
                          )}
                        </div>
                      )}

                      {slot.status !== 'processing' && (
                        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-2xl border border-slate-100 dark:border-slate-800">
                          <button
                            type="button"
                            onClick={() => startCamera(slot.id)}
                            className="p-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 flex items-center gap-1.5 text-xs font-bold transition-all shadow-sm active:scale-95"
                            title="Tirar foto deste cartão"
                          >
                            <Camera size={15} />
                            <span className="hidden sm:inline">Câmera</span>
                          </button>

                          <label
                            className="p-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center gap-1 text-xs font-bold transition-all cursor-pointer"
                            title="Câmera nativa do smartphone"
                          >
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files && e.target.files.length > 0) {
                                  handleSlotFileUpload(slot.id, Array.from(e.target.files));
                                }
                                e.target.value = '';
                              }}
                            />
                            <span className="text-[11px]">Celular</span>
                          </label>

                          <EnemSlotDropzone
                            onFiles={(files) => handleSlotFileUpload(slot.id, files)}
                            disabled={slot.status === 'processing'}
                          />
                        </div>
                      )}

                      {slot.status === 'processing' && (
                        <div className="flex items-center gap-2 text-brand-blue dark:text-brand-yellow font-bold text-xs bg-brand-yellow/15 px-3 py-2 rounded-xl border border-brand-yellow/30">
                          <Loader2 className="animate-spin" size={15} />
                          <span>Lendo 45Q...</span>
                        </div>
                      )}

                      {slotStats && (
                        <div className="flex items-center gap-2.5 pl-2 border-l border-slate-100 dark:border-slate-800">
                          <div className="text-right">
                            <span className="text-[10px] font-bold uppercase text-slate-400 block">
                              {slotStats.totalCorrect} / 45 acertos
                            </span>
                            <span className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-black border ${getScoreBadgeColor(slotStats.score)}`}>
                              {slotStats.score.toFixed(1)} pts
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => setExpandedSlotIds(prev => ({ ...prev, [slot.id]: !prev[slot.id] }))}
                            className="px-2.5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1 transition-colors"
                            title="Ver ou editar as 45 marcações deste aluno"
                          >
                            <Eye size={14} />
                            <span>{isExpanded ? 'Ocultar' : '45Q'}</span>
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>
                      )}

                      {enemSlots.length > 1 && slot.status !== 'processing' && (
                        <button
                          type="button"
                          onClick={() => removeEnemSlot(slot.id)}
                          className="p-2 text-slate-300 dark:text-slate-600 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl transition-colors"
                          title="Remover Slot"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mensagem de erro do slot */}
                  {slot.error && (
                    <div className="mx-4 my-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                      <AlertCircle size={15} className="shrink-0" />
                      <span>Slot #{index + 1}: {slot.error}</span>
                    </div>
                  )}

                  {/* Matriz Expansível de 45 Questões para Inspeção / Ajuste */}
                  {slot.answers && isExpanded && slotStats && (
                    <div className="p-4 sm:p-5 bg-slate-50/70 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-800 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Cartão-Resposta Lido (Clique em uma letra para ajustar)
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">
                            {slotStats.totalCorrect} certas
                          </span>
                          <span className="font-bold text-rose-600 dark:text-rose-400">
                            {slotStats.totalWrong + slotStats.totalBlank + slotStats.totalMultiple} erradas
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {[0, 1, 2].map(colIdx => {
                          const startQ = colIdx * 15 + 1;
                          return (
                            <div key={colIdx} className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
                              <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-400 pb-1 border-b border-slate-100 dark:border-slate-800">
                                <span>Q{startQ} a Q{startQ + 14}</span>
                                <span>Gab. | Marcado</span>
                              </div>
                              {Array.from({ length: 15 }, (_, i) => {
                                const qNum = startQ + i;
                                const officialAns = simulation.official_answers[qNum] || 'A';
                                const studentAns = slot.answers?.[qNum] || 'BLANK';
                                const isCorrect = isEnemQuestionCorrect(studentAns, officialAns);

                                return (
                                  <div
                                    key={qNum}
                                    className={`px-2 py-1 rounded-lg flex items-center justify-between gap-1 text-xs ${
                                      isCorrect
                                        ? 'bg-emerald-50/60 dark:bg-emerald-950/20'
                                        : 'bg-rose-50/50 dark:bg-rose-950/20'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-5 font-bold text-slate-500 text-[11px]">
                                        {qNum.toString().padStart(2, '0')}
                                      </span>
                                      <span className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-bold flex items-center justify-center text-slate-700 dark:text-slate-300">
                                        {officialAns}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-0.5">
                                      {(['A', 'B', 'C', 'D', 'E'] as EnemAnswerOption[]).map(opt => {
                                        const isSelected = studentAns === opt;
                                        return (
                                          <button
                                            key={opt}
                                            type="button"
                                            onClick={() => handleUpdateSlotAnswer(slot.id, qNum, opt)}
                                            className={`w-6 h-6 rounded-md text-[11px] font-bold transition-all ${
                                              isSelected
                                                ? isCorrect
                                                  ? 'bg-emerald-600 text-white shadow-xs'
                                                  : 'bg-rose-600 text-white shadow-xs'
                                                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                                            }`}
                                          >
                                            {opt}
                                          </button>
                                        );
                                      })}
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateSlotAnswer(slot.id, qNum, studentAns === 'BLANK' ? 'DUPLA' : 'BLANK')}
                                        className={`w-6 h-6 rounded-md text-[10px] font-bold ml-0.5 ${
                                          studentAns === 'BLANK'
                                            ? 'bg-slate-700 text-white'
                                            : studentAns === 'DUPLA'
                                              ? 'bg-amber-600 text-white'
                                              : 'text-slate-300 hover:text-slate-500'
                                        }`}
                                        title={studentAns === 'BLANK' ? 'Em branco' : studentAns === 'DUPLA' ? 'Dupla marcação' : 'Marcar em branco'}
                                      >
                                        {studentAns === 'BLANK' ? '—' : studentAns === 'DUPLA' ? '×' : '•'}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Botão para adicionar mais um slot manual */}
            {enemSlots.length < 60 && !isProcessingBatch && (
              <button
                type="button"
                onClick={() => addEnemSlot()}
                className="w-full py-3.5 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl text-slate-500 dark:text-slate-400 font-bold hover:border-brand-blue dark:hover:border-brand-yellow hover:text-brand-blue dark:hover:text-brand-yellow hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all flex items-center justify-center gap-2 text-sm"
              >
                <Plus size={18} />
                Adicionar Slot para Aluno
              </button>
            )}
          </div>

          {/* Barra Flutuante de Execução e Sincronização em Lote */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2 sticky bottom-4 z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl">
            <button
              type="button"
              onClick={handleGradeEnemBatch}
              disabled={isProcessingBatch || readyEnemSlotsCount === 0}
              className="flex-1 py-3.5 px-5 bg-brand-blue text-white rounded-2xl font-bold hover:bg-brand-blue-dark shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 text-sm transition-all"
            >
              {isProcessingBatch ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} className="text-brand-yellow" />}
              {isProcessingBatch
                ? 'Corrigindo Cartões em Cascata...'
                : `Iniciar Correção em Cascata (${readyEnemSlotsCount} cartão(ões) pronto(s))`}
            </button>

            <button
              type="button"
              onClick={handleSaveAllEnemSlots}
              disabled={isSavingBatch || doneEnemSlotsCount === 0}
              className="flex-1 py-3.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 text-sm transition-all"
            >
              {isSavingBatch ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              {isSavingBatch
                ? 'Sincronizando...'
                : `Salvar / Sincronizar Alterações (${doneEnemSlotsCount})`}
            </button>
          </div>

          {/* Fim da Aba: Relação Completa dos Alunos Corrigidos nesta Turma */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 dark:border-slate-800 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-3">
              <div>
                <h3 className="text-xl font-serif font-bold text-brand-blue-dark dark:text-white flex items-center gap-2">
                  <Users size={22} className="text-brand-blue dark:text-brand-yellow" />
                  Alunos corrigidos nesta turma ({submissions.filter(s => s.class_id === selectedClassId).length} de {students.length})
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Lista compartilhada em tempo real entre o Administrador e todos os Professores Corretores.
                </p>
              </div>

              {!isReviewerMode && (
                <button
                  onClick={() => exportSimuladoPDF(selectedClassId)}
                  disabled={submissions.filter(s => s.class_id === selectedClassId).length === 0}
                  className="py-2.5 px-4 bg-brand-blue hover:bg-brand-blue-dark text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all disabled:opacity-40"
                  title="Gerar e baixar relatório em PDF desta turma"
                >
                  <Download size={14} />
                  Baixar / Imprimir PDF da Turma
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase text-xs">
                    <th className="py-3 px-3">Nº Chamada</th>
                    <th className="py-3 px-3">Aluno</th>
                    <th className="py-3 px-3 text-center">Status</th>
                    <th className="py-3 px-3 text-center">Total de Acertos</th>
                    <th className="py-3 px-3 text-center">Nota do Simulado</th>
                    <th className="py-3 px-3">Corretor Responsável</th>
                    <th className="py-3 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {students.map((student) => {
                    const sub = submissions.find(
                      item => item.student_id === student.id
                    );

                    return (
                      <tr
                        key={student.id}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                          enemSlots.some(slotItem => slotItem.studentId === student.id) ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''
                        }`}
                      >
                        <td className="py-3 px-3 font-semibold text-slate-500">
                          {student.roll_number ? `Nº ${student.roll_number}` : '-'}
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-200">
                          {student.name}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {sub ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200">
                              ✓ Corrigido
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              ⏳ Pendente
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-700 dark:text-slate-300">
                          {sub ? `${sub.total_correct} / 45` : '-'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {sub ? (
                            <span className={`px-2.5 py-0.5 rounded-full font-bold border text-xs ${getScoreBadgeColor(sub.score_points)}`}>
                              {sub.score_points.toFixed(1)} pts
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400 font-medium text-xs">
                          {sub?.reviewer_name || '-'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {sub ? (
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Botão de Verificar Gabarito Marcado pelo Aluno (Disponível para Admin e Corretores) */}
                              <button
                                type="button"
                                onClick={() => handleOpenAuditModal(sub)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800/80 shadow-sm transition-all"
                                title="Verificar gabarito marcado pelo aluno, comparar com oficial e ajustar alternativas se necessário"
                              >
                                <Eye size={14} className="text-amber-600 dark:text-amber-400" />
                                <span>Verificar Gabarito</span>
                              </button>

                              {/* Botão de Excluir Correção (Disponível para Admin e Corretores) */}
                              <button
                                type="button"
                                onClick={() => handleDeleteSubmission(sub)}
                                className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-800/60 transition-colors"
                                title="Excluir nota / correção do aluno"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleFocusOrCreateSlotForStudent(student.id)}
                              className="px-2.5 py-1 text-xs font-semibold text-brand-blue hover:text-brand-blue-dark dark:text-brand-yellow hover:underline"
                            >
                              Corrigir este aluno →
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {students.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        {selectedClassId ? 'Nenhum aluno encontrado para a turma selecionada.' : 'Selecione uma turma para carregar a lista de alunos.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: GABARITO (OFICIAL OU PESSOAL DO CORRETOR) */}
      {activeTab === 'answer-key' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 dark:border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-brand-blue dark:text-brand-yellow text-xs font-bold uppercase tracking-wider mb-2 border border-blue-200/60 dark:border-blue-900">
                <Key size={13} />
                {isReviewerMode ? `Gabarito Pessoal de ${reviewerName}` : 'Gabarito Oficial Master (Administrador)'}
              </div>
              <h2 className="text-xl font-serif font-bold text-brand-blue-dark dark:text-white">
                {isReviewerMode ? `Seu Gabarito Exclusivo de Correção (45 Questões)` : 'Gabarito Oficial do Simulado (45 Questões)'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
                {isReviewerMode 
                  ? `Professor(a) ${reviewerName}, este gabarito é individual para você. Suas correções usarão estritamente estas respostas. Suas alterações não afetam outros corretores nem o administrador.`
                  : 'Defina a resposta correta de cada questão. Esse gabarito mestre serve como base padrão do simulado.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowQuickFill(!showQuickFill)}
                className="py-3 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all border border-slate-200 dark:border-slate-700"
              >
                <Sparkles size={16} className="text-brand-yellow" />
                <span>Colar Sequência (Preencher Rápido)</span>
              </button>

              <button
                onClick={handleSaveOfficialAnswers}
                className="py-3 px-6 bg-brand-blue hover:bg-brand-blue-dark text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all"
              >
                <Save size={18} />
                <span>{isReviewerMode ? 'Salvar Meu Gabarito Pessoal' : 'Salvar Gabarito Oficial'}</span>
              </button>
            </div>
          </div>

          {/* Painel de Preenchimento Rápido (Colar sequência de 45 letras) */}
          {showQuickFill && (
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-blue-200 dark:border-blue-900/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <Sparkles size={14} className="text-brand-yellow" />
                  Preenchimento Automático por Sequência de Letras
                </span>
                <span className="text-[11px] text-slate-400">
                  Ex: ABCDEEDCBA... (Espaços e quebras de linha são ignorados automaticamente)
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Cole aqui a sequência com as alternativas (ex: A B C D E...)"
                  value={quickSequenceInput}
                  onChange={(e) => setQuickSequenceInput(e.target.value)}
                  className="flex-1 p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono uppercase tracking-widest text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
                <button
                  type="button"
                  onClick={handleApplyQuickSequence}
                  className="px-4 py-2 bg-brand-yellow hover:bg-amber-400 text-brand-blue-dark font-bold text-xs rounded-xl shadow-sm transition-all"
                >
                  Aplicar às 45 Questões
                </button>
              </div>
            </div>
          )}

          {/* Matriz de edição do gabarito oficial */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[0, 1, 2].map(colIndex => {
              const startQ = colIndex * 15 + 1;
              const endQ = startQ + 14;

              return (
                <div key={colIndex} className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 space-y-2">
                  <div className="text-center font-bold text-xs uppercase text-slate-400 pb-2 border-b border-slate-200 dark:border-slate-700">
                    Questões {startQ} a {endQ}
                  </div>

                  {Array.from({ length: 15 }, (_, i) => {
                    const qNum = startQ + i;
                    const currentOfficial = editingAnswers[qNum] || 'A';

                    return (
                      <div key={qNum} className="flex items-center justify-between p-1.5 rounded-xl hover:bg-white dark:hover:bg-slate-700/60 transition-all">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 w-8">
                          Q{qNum.toString().padStart(2, '0')}
                        </span>

                        <div className="flex items-center gap-1">
                          {(['A', 'B', 'C', 'D', 'E'] as EnemAnswerOption[]).map(opt => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setEditingAnswers(prev => ({ ...prev, [qNum]: opt }))}
                              className={`w-7 h-7 rounded-full text-xs font-bold transition-all ${
                                currentOfficial === opt
                                  ? 'bg-brand-blue text-white shadow-md ring-2 ring-brand-yellow'
                                  : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-brand-blue'
                              }`}
                            >
                              {opt}
                            </button>
                          ))}

                          {/* Opção anular questão */}
                          <button
                            type="button"
                            title="Anular questão (pontua para todos)"
                            onClick={() => setEditingAnswers(prev => ({ 
                              ...prev, 
                              [qNum]: prev[qNum] === 'ANULADA' ? 'A' : 'ANULADA' 
                            }))}
                            className={`px-1.5 py-1 text-[10px] rounded-lg font-bold uppercase transition-all ${
                              currentOfficial === 'ANULADA'
                                ? 'bg-amber-500 text-white shadow-sm'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                            }`}
                          >
                            Anulada
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ABA 3: RESULTADOS GERAIS E RELATÓRIO */}
      {activeTab === 'results' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 dark:border-slate-800 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-4">
            <div>
              <h2 className="text-xl font-serif font-bold text-brand-blue-dark dark:text-white">
                {isReviewerMode ? 'Acompanhamento de Resultados' : 'Relatório Geral do Simulado ENEM'}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {isReviewerMode
                  ? 'Acompanhe as correções da equipe, confira os acertos/erros de cada aluno e audite os cartões.'
                  : 'Todas as correções da equipe ficam disponíveis aqui para consulta e exportação em PDF.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                value={filterClassId}
                onChange={(e) => setFilterClassId(e.target.value)}
                className="p-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                <option value="all">Todas as Turmas (3º Ano)</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <select
                value={filterReviewer}
                onChange={(e) => setFilterReviewer(e.target.value)}
                className="p-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                <option value="all">Todos os Corretores</option>
                {uniqueReviewers.map(rev => (
                  <option key={rev} value={rev}>{rev}</option>
                ))}
              </select>

              {!isReviewerMode && (
                <button
                  onClick={() => exportSimuladoPDF(filterClassId)}
                  disabled={filteredSubmissions.length === 0}
                  className="py-2.5 px-4 bg-brand-blue hover:bg-brand-blue-dark text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
                  title="Gerar e baixar relatório em PDF"
                >
                  <Download size={14} />
                  Baixar / Imprimir PDF
                </button>
              )}
            </div>
          </div>

          {/* Cards de Resumo Estatístico */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-400 uppercase font-semibold">Total Corrigidos</span>
              <div className="text-2xl font-bold text-brand-blue-dark dark:text-white mt-1">
                {filteredSubmissions.length}
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-400 uppercase font-semibold">Média de Acertos</span>
              <div className="text-2xl font-bold text-brand-blue-dark dark:text-white mt-1">
                {filteredSubmissions.length > 0 
                  ? (filteredSubmissions.reduce((acc, s) => acc + s.total_correct, 0) / filteredSubmissions.length).toFixed(1)
                  : '0'} <span className="text-xs text-slate-400">/ 45</span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-400 uppercase font-semibold">Média da Nota</span>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {filteredSubmissions.length > 0 
                  ? (filteredSubmissions.reduce((acc, s) => acc + s.score_points, 0) / filteredSubmissions.length).toFixed(2)
                  : '0.00'} <span className="text-xs text-slate-400">pts</span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-400 uppercase font-semibold">Faixa Máxima (4.0 pts)</span>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                {filteredSubmissions.filter(s => s.score_points >= 4.0).length} <span className="text-xs text-slate-400">alunos</span>
              </div>
            </div>
          </div>

          {/* Tabela de Resultados */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase text-xs">
                  <th className="py-3 px-2">Aluno</th>
                  <th className="py-3 px-2">Turma</th>
                  <th className="py-3 px-2 text-center">Acertos</th>
                  <th className="py-3 px-2 text-center">Nota no Simulado</th>
                  <th className="py-3 px-2">Corretor Responsável</th>
                  <th className="py-3 px-2 text-center">Data/Hora</th>
                  <th className="py-3 px-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSubmissions.map(sub => {
                  const className = resolveClassName(sub.class_id, sub.class_name);
                  return (
                    <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-2 font-medium text-slate-800 dark:text-white">
                        {sub.roll_number ? `Nº ${sub.roll_number} - ` : ''}{sub.student_name}
                      </td>
                      <td className="py-3 px-2 text-slate-600 dark:text-slate-300">
                        {className}
                      </td>
                      <td className="py-3 px-2 text-center font-bold text-slate-700 dark:text-slate-300">
                        {sub.total_correct} / 45
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getScoreBadgeColor(sub.score_points)}`}>
                          {sub.score_points.toFixed(1)} pts
                        </span>
                      </td>
                      <td className="py-3 px-2 text-xs text-slate-500">
                        {sub.reviewer_name}
                      </td>
                      <td className="py-3 px-2 text-center text-xs text-slate-400">
                        {new Date(sub.created_at).toLocaleDateString('pt-BR')} {new Date(sub.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenAuditModal(sub)}
                            className="p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg transition-colors"
                            title="Verificar e comparar gabarito deste aluno"
                          >
                            <Eye size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSubmission(sub)}
                            className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                            title="Excluir nota / correção do aluno"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredSubmissions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Nenhum resultado registrado ainda para este filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 4: CONFIGURAÇÕES E CÓDIGO DE ACESSO DOS PROFESSORES (Exclusivo Administrador) */}
      {!isReviewerMode && activeTab === 'settings' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 dark:border-slate-800 space-y-6">
          <div className="pb-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-xl font-serif font-bold text-brand-blue-dark dark:text-white flex items-center gap-2">
              <Key size={22} className="text-brand-blue dark:text-brand-yellow" />
              Acesso dos Professores Corretores
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Configure o código que os outros professores usarão para acessar exclusivamente o módulo de correção do Simulado, sem precisar de e-mail ou cadastro.
            </p>
          </div>

          <div className="p-6 bg-slate-50 dark:bg-slate-800/60 rounded-3xl border border-slate-200 dark:border-slate-700 max-w-xl space-y-4">
            <label className="text-xs font-bold uppercase text-slate-400 block">
              Código de Acesso Atual do Simulado
            </label>

            <div className="flex items-center gap-3">
              <input
                type="text"
                value={tempAccessCode}
                onChange={(e) => setTempAccessCode(e.target.value.toUpperCase())}
                placeholder="Ex: ENEM2026"
                className="w-full p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl font-mono text-lg font-bold text-brand-blue-dark dark:text-brand-yellow tracking-wider"
              />

              <button
                onClick={copyAccessCode}
                className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-brand-blue rounded-2xl text-slate-600 dark:text-slate-300 transition-all flex items-center gap-2 shrink-0"
                title="Copiar código"
              >
                {isCopiedCode ? <Check size={20} className="text-emerald-500" /> : <Copy size={20} />}
                <span className="text-xs font-bold">{isCopiedCode ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>

            <button
              onClick={handleSaveOfficialAnswers}
              className="py-3 px-6 bg-brand-blue hover:bg-brand-blue-dark text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md transition-all text-sm"
            >
              <Save size={16} />
              Atualizar Código de Acesso
            </button>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-700/80 text-xs text-slate-500 dark:text-slate-400 space-y-2">
              <p className="font-semibold text-slate-700 dark:text-slate-300">Como passar aos professores:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Envie o link do aplicativo para os professores da equipe.</li>
                <li>Eles clicam no botão <strong className="text-brand-blue dark:text-brand-yellow">"Entrar como Corretor (Simulado ENEM)"</strong> na tela inicial.</li>
                <li>Eles digitam apenas o próprio nome e o código <strong className="font-mono text-brand-blue dark:text-brand-yellow">{simulation.access_code}</strong>.</li>
                <li>Eles têm acesso imediato e exclusivo à correção, sem ver suas turmas ou notas privadas.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Câmera Contínua para Slots ENEM */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-3 sm:p-6 backdrop-blur-md">
          <div className="w-full max-w-xl bg-slate-900 rounded-3xl overflow-hidden relative border border-white/20 shadow-2xl flex flex-col">
            <div className="p-4 bg-slate-900/90 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shrink-0" />
                <span className="text-white text-xs font-bold uppercase tracking-wider truncate">
                  {(() => {
                    const currentSlot = enemSlots.find(s => s.id === activeCameraSlotId);
                    const slotIdx = enemSlots.findIndex(s => s.id === activeCameraSlotId);
                    const studentName = students.find(st => st.id === currentSlot?.studentId)?.name || 'Aluno não selecionado';
                    return `Slot #${slotIdx + 1}: ${studentName}`;
                  })()}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={switchCameraFacing}
                  className="p-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-colors"
                  title="Alternar Câmera"
                >
                  <SwitchCamera size={18} />
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="p-2 bg-white/10 text-white rounded-xl hover:bg-rose-600 transition-colors"
                  title="Fechar Câmera"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="relative aspect-[3/4] max-h-[60vh] bg-black flex items-center justify-center overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-6 border border-white/30 rounded-2xl pointer-events-none flex flex-col justify-between p-3">
                <span className="text-[10px] text-white/60 uppercase tracking-widest font-mono">Enquadre as 45 questões</span>
                <span className="text-[10px] text-white/60 text-right uppercase tracking-widest font-mono">Boa iluminação</span>
              </div>
            </div>

            <div className="p-4 bg-slate-900 border-t border-white/10 flex flex-col gap-3">
              <div className="flex items-center justify-around">
                <button
                  type="button"
                  onClick={() => capturePhoto(false)}
                  className="flex flex-col items-center gap-1 text-slate-300 hover:text-white transition-colors text-[11px] font-bold"
                >
                  <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
                    <Camera size={18} />
                  </div>
                  Refazer Este
                </button>

                <button
                  type="button"
                  onClick={() => capturePhoto(true)}
                  className="w-20 h-20 rounded-full border-4 border-brand-yellow bg-white flex items-center justify-center shadow-2xl active:scale-95 transition-transform"
                  title="Fotografar e avançar para o próximo slot"
                >
                  <div className="w-16 h-16 rounded-full bg-brand-yellow/30 flex items-center justify-center">
                    <Camera size={28} className="text-brand-blue-dark" />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const currentIndex = enemSlots.findIndex(s => s.id === activeCameraSlotId);
                    if (currentIndex !== -1 && currentIndex + 1 < enemSlots.length) {
                      setActiveCameraSlotId(enemSlots[currentIndex + 1].id);
                    } else {
                      stopCamera();
                    }
                  }}
                  className="flex flex-col items-center gap-1 text-slate-300 hover:text-white transition-colors text-[11px] font-bold"
                >
                  <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
                    <ExternalLink size={18} />
                  </div>
                  Pular Aluno ➡️
                </button>
              </div>
              <p className="text-[11px] text-slate-400 text-center font-medium">
                Toque no botão central amarelo para salvar o cartão e avançar para o próximo aluno da fila!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Verificação / Auditoria do Gabarito do Aluno (Admin e Corretores) */}
      {verifyingSubmission && auditStats && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl my-auto flex flex-col max-h-[92vh] overflow-hidden">
            {/* Cabeçalho do Modal - Clean & Direto */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 font-bold border border-amber-200 dark:border-amber-800">
                  <Eye size={20} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white truncate">
                      {verifyingSubmission.student_name}
                    </h3>
                    {verifyingSubmission.roll_number && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                        Nº {verifyingSubmission.roll_number}
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-medium border border-blue-200 dark:border-blue-800">
                      {resolveClassName(verifyingSubmission.class_id, verifyingSubmission.class_name)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    Corretor: <span className="font-semibold text-slate-700 dark:text-slate-300">{verifyingSubmission.reviewer_name || 'Administrador'}</span>
                    {' '}&bull; Gabarito aplicado: <span className="font-semibold text-brand-blue dark:text-brand-yellow">{verifyingSubmission.reviewer_name && verifyingSubmission.reviewer_name.toLowerCase() !== 'administrador' ? `Gabarito de ${verifyingSubmission.reviewer_name}` : 'Gabarito Mestre'}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right hidden sm:block">
                  <div className="text-[11px] text-slate-400 uppercase font-semibold">Nota Atual</div>
                  <div className="text-lg font-black text-slate-900 dark:text-white leading-none">
                    {auditStats.score.toFixed(1)} <span className="text-xs font-normal text-slate-400">pts</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCloseAuditModal}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="Fechar"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Placar Rápido: Certo vs Errado */}
            <div className="px-4 sm:px-6 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-4 sm:gap-6">
                {/* Certos */}
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold">
                    <Check size={14} />
                  </span>
                  <div>
                    <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">{auditStats.totalCorrect}</span>
                    <span className="text-slate-400 text-xs ml-1">certas</span>
                  </div>
                </div>

                {/* Errados */}
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400 flex items-center justify-center font-bold">
                    <X size={14} />
                  </span>
                  <div>
                    <span className="font-black text-rose-600 dark:text-rose-400 text-sm">{auditStats.totalWrong + auditStats.totalBlank + auditStats.totalMultiple}</span>
                    <span className="text-slate-400 text-xs ml-1">erradas</span>
                  </div>
                </div>

                {/* Indicadores discretos caso existam brancas ou duplas */}
                {(auditStats.totalBlank > 0 || auditStats.totalMultiple > 0) && (
                  <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400 border-l border-slate-200 dark:border-slate-800 pl-3">
                    {auditStats.totalMultiple > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 font-medium">
                        {auditStats.totalMultiple} dupla(s)
                      </span>
                    )}
                    {auditStats.totalBlank > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium">
                        {auditStats.totalBlank} em branco
                      </span>
                    )}
                  </div>
                )}

                {/* Nota em destaque */}
                <div className="sm:hidden font-bold text-slate-800 dark:text-slate-200">
                  {auditStats.score.toFixed(1)} pts
                </div>
              </div>

              <div className="text-[11px] text-slate-400 hidden md:block">
                Selecione a letra para corrigir ou clique no gabarito caso divirja.
              </div>
            </div>

            {/* Matriz Clean: 45 Questões Simples e Visuais (Certo e Errado) */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-5 bg-slate-50/50 dark:bg-slate-950/40">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                {[0, 1, 2].map(colIndex => {
                  const startQ = colIndex * 15 + 1;
                  const endQ = startQ + 14;

                  return (
                    <div 
                      key={colIndex} 
                      className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1.5"
                    >
                      <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <span>Questões {startQ} a {endQ}</span>
                        <span>Gab. | Aluno</span>
                      </div>

                      {Array.from({ length: 15 }, (_, i) => {
                        const qNum = startQ + i;
                        const officialAns = auditOfficialAnswers[qNum] || 'A';
                        const studentAns = auditAnswers[qNum] || 'BLANK';
                        const isCorrect = isEnemQuestionCorrect(studentAns, officialAns);
                        const isMultiple = studentAns === 'DUPLA';
                        const isBlank = studentAns === 'BLANK';

                        return (
                          <div 
                            key={qNum} 
                            className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                              isCorrect 
                                ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60' 
                                : isMultiple
                                  ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200/80 dark:border-amber-800/50'
                                  : isBlank
                                    ? 'bg-slate-50/60 dark:bg-slate-850/30 border-slate-200 dark:border-slate-800'
                                    : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/60'
                            }`}
                          >
                            {/* Número da questão e gabarito oficial */}
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="w-5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                {qNum.toString().padStart(2, '0')}
                              </span>
                              
                              <span className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center font-mono border border-slate-200 dark:border-slate-700" title={`Gabarito oficial: ${officialAns}`}>
                                {officialAns}
                              </span>

                              {/* Indicador visual Certo / Errado */}
                              {isCorrect ? (
                                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs" title="Acertou">
                                  <Check size={12} strokeWidth={3} />
                                </span>
                              ) : (
                                <span className="w-5 h-5 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-xs" title="Errou">
                                  <X size={12} strokeWidth={3} />
                                </span>
                              )}

                              {/* Tag discreta para Dupla ou Em Branco */}
                              {isMultiple && (
                                <span 
                                  className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 tracking-tight"
                                  title="Aluno assinalou duas ou mais alternativas (duplicada/rasura)"
                                >
                                  dupla
                                </span>
                              )}
                              {isBlank && (
                                <span 
                                  className="text-[9px] font-semibold px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 tracking-tight"
                                  title="Questão deixada em branco"
                                >
                                  branco
                                </span>
                              )}
                            </div>

                            {/* Alternativas A-E selecionáveis de forma limpa */}
                            <div className="flex items-center gap-0.5 sm:gap-1">
                              {(['A', 'B', 'C', 'D', 'E'] as EnemAnswerOption[]).map(opt => {
                                const isSelected = studentAns === opt;
                                const isOfficial = officialAns === opt;

                                let btnStyle = 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800';

                                if (isSelected) {
                                  if (isCorrect) {
                                    btnStyle = 'bg-emerald-600 text-white font-black shadow-xs ring-1 ring-emerald-600';
                                  } else {
                                    btnStyle = 'bg-rose-600 text-white font-black shadow-xs ring-1 ring-rose-600';
                                  }
                                } else if (isOfficial && !isCorrect) {
                                  btnStyle = 'text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800';
                                }

                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => setAuditAnswers(prev => ({ ...prev, [qNum]: opt }))}
                                    className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg text-xs font-semibold flex items-center justify-center transition-all ${btnStyle}`}
                                    title={`Marcar opção ${opt} para a questão ${qNum}`}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}

                              {/* Botão Branco / Rasura unificado e discreto */}
                              <button
                                type="button"
                                onClick={() => {
                                  const nextVal = studentAns === 'BLANK' ? 'DUPLA' : studentAns === 'DUPLA' ? 'A' : 'BLANK';
                                  setAuditAnswers(prev => ({ ...prev, [qNum]: nextVal as any }));
                                }}
                                className={`w-6 h-6 rounded-lg text-[10px] font-bold flex items-center justify-center transition-all ml-0.5 ${
                                  studentAns === 'BLANK'
                                    ? 'bg-slate-700 text-white shadow-xs'
                                    : studentAns === 'DUPLA'
                                      ? 'bg-amber-600 text-white shadow-xs ring-1 ring-amber-400'
                                      : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                                title={studentAns === 'BLANK' ? 'Em branco' : studentAns === 'DUPLA' ? 'Duplicada / Rasura' : 'Deixar em branco'}
                              >
                                {studentAns === 'BLANK' ? '—' : studentAns === 'DUPLA' ? '×' : '•'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rodapé do Modal com Ações */}
            <div className="p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Acertos: <strong className="text-emerald-600">{auditStats.totalCorrect}</strong> / 45 &bull; Nota: <strong className="text-slate-900 dark:text-white">{auditStats.score.toFixed(1)}</strong>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCloseAuditModal}
                  disabled={isSavingAudit}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs transition-colors"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={handleSaveAudit}
                  disabled={isSavingAudit}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
                >
                  {isSavingAudit ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save size={15} />
                      Salvar Correção
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Correção */}
      {pendingDeleteSubmission && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Excluir correção?</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Esta ação atualiza a lista para todos os professores.</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300">
              Deseja remover a nota do simulado de <strong className="text-slate-900 dark:text-white">{pendingDeleteSubmission.student_name}</strong>? O aluno voltará para o status <strong>Pendente</strong>.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingDeleteSubmission(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteSubmission}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors shadow-sm"
              >
                Sim, Excluir Nota
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EnemSlotDropzone({ onFiles, disabled }: { onFiles: (f: File[]) => void; disabled?: boolean }) {
  const dropOptions: any = {
    onDrop: onFiles,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
    multiple: false,
    disabled
  };
  const { getRootProps, getInputProps } = useDropzone(dropOptions);

  return (
    <div
      {...getRootProps()}
      className={`p-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-300 dark:hover:bg-slate-600 flex items-center gap-1.5 text-xs font-bold cursor-pointer transition-colors ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      }`}
      title="Carregar foto da galeria ou arquivo"
    >
      <input {...getInputProps()} />
      <Upload size={14} className="text-slate-600 dark:text-slate-300" />
      <span className="hidden sm:inline text-[11px]">Galeria</span>
    </div>
  );
}
