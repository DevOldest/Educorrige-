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
  Edit3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
  saveStoredSimulation, 
  getStoredSubmissions, 
  fetchRemoteSubmissions,
  saveStoredSubmission, 
  deleteStoredSubmission, 
  analyzeEnemBubbleSheet,
  calculateEnemStatistics,
  isEnemQuestionCorrect,
  DEFAULT_SIMULATION
} from '../lib/enemService';

interface EnemSimuladoViewProps {
  isReviewerMode?: boolean;
  reviewerName?: string;
  onExitReviewerMode?: () => void;
}

export default function EnemSimuladoView({ 
  isReviewerMode = false, 
  reviewerName = 'Professor Corretor',
  onExitReviewerMode 
}: EnemSimuladoViewProps) {
  // Configurações e dados
  const [simulation, setSimulation] = useState<EnemSimulation>(getStoredSimulation);
  const [submissions, setSubmissions] = useState<EnemSubmission[]>(getStoredSubmissions);
  const [classes, setClasses] = useState<Class[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoadingClasses, setIsLoadingClasses] = useState(false);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);

  // Aba ativa para Administrador ('grading' | 'answer-key' | 'settings' | 'results')
  const [activeTab, setActiveTab] = useState<'grading' | 'answer-key' | 'settings' | 'results'>('grading');

  // Estado da correção atual
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [currentAnswers, setCurrentAnswers] = useState<Record<number, EnemAnswerOption>>({});
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Modal de câmera
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Edição do gabarito oficial (modo admin)
  const [editingAnswers, setEditingAnswers] = useState<Record<number, EnemAnswerOption>>(simulation.official_answers);
  const [tempAccessCode, setTempAccessCode] = useState(simulation.access_code);
  const [isCopiedCode, setIsCopiedCode] = useState(false);

  // Filtro de resultados
  const [filterClassId, setFilterClassId] = useState<string>('all');

  // Modal de Verificação / Auditoria do Gabarito do Aluno (Disponível para Admin e Corretores)
  const [verifyingSubmission, setVerifyingSubmission] = useState<EnemSubmission | null>(null);
  const [auditAnswers, setAuditAnswers] = useState<Record<number, EnemAnswerOption>>({});
  const [isSavingAudit, setIsSavingAudit] = useState(false);

  // Carregar turmas e sincronizar dados com Supabase
  useEffect(() => {
    fetchClasses();

    // Sincronizar dados do Simulado do Supabase
    fetchRemoteSimulation().then(sim => {
      setSimulation(sim);
      setEditingAnswers(sim.official_answers);
      setTempAccessCode(sim.access_code);

      // Sincronizar submissões do Supabase
      fetchRemoteSubmissions(sim.id).then(subs => {
        setSubmissions(subs);
      });
    });
  }, []);

  // Carregar alunos quando turma for selecionada
  useEffect(() => {
    if (selectedClassId) {
      fetchStudents(selectedClassId);
    } else {
      setStudents([]);
      setSelectedStudentId('');
    }
  }, [selectedClassId]);

  // Se o aluno mudar, verificar se já tem submissão gravada para carregar
  useEffect(() => {
    if (selectedStudentId) {
      const existing = submissions.find(
        s => s.simulation_id === simulation.id && s.student_id === selectedStudentId
      );
      if (existing) {
        setCurrentAnswers(existing.answers);
      } else {
        // Inicializar com respostas em branco
        const initialAnswers: Record<number, EnemAnswerOption> = {};
        for (let q = 1; q <= 45; q++) {
          initialAnswers[q] = 'BLANK';
        }
        setCurrentAnswers(initialAnswers);
      }
    }
  }, [selectedStudentId, simulation.id, submissions]);

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
      setSelectedStudentId('');
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

    // Ordenar estudantes
    studentList.sort((a, b) => {
      if (a.roll_number && b.roll_number) return a.roll_number - b.roll_number;
      if (a.roll_number) return -1;
      if (b.roll_number) return 1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

    setStudents(studentList);
    if (studentList.length > 0) {
      // Priorizar o primeiro aluno ainda não corrigido
      const firstUncorrected = studentList.find(s => 
        !submissions.some(sub => sub.simulation_id === simulation.id && sub.student_id === s.id)
      );
      setSelectedStudentId(firstUncorrected ? firstUncorrected.id : studentList[0].id);
    } else {
      setSelectedStudentId('');
    }

    setIsLoadingStudents(false);
  }

  // Estatísticas calculadas em tempo real para a correção atual seguindo regras do ENEM:
  const currentStats = calculateEnemStatistics(currentAnswers, simulation.official_answers);
  const correctCount = currentStats.totalCorrect;
  const calculatedScore = currentStats.score;

  // Upload de imagem do cartão
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCapturedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Câmera
  const startCamera = async () => {
    try {
      setIsCameraOpen(true);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Erro ao acessar câmera:', err);
      alert('Não foi possível acessar a câmera. Você pode usar a opção de upload de imagem.');
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setCapturedImage(dataUrl);
        stopCamera();
      }
    }
  };

  // Análise com IA
  const handleAnalyzeWithAI = async () => {
    if (!capturedImage) {
      alert('Tire uma foto ou carregue a imagem do cartão-resposta antes de analisar.');
      return;
    }

    setIsAnalyzingImage(true);
    setStatusMessage(null);

    try {
      const aiAnswers = await analyzeEnemBubbleSheet(capturedImage);
      setCurrentAnswers(aiAnswers);
      const stats = calculateEnemStatistics(aiAnswers, simulation.official_answers);
      setStatusMessage({
        text: `Cartão lido e corrigido pela IA com sucesso! ${stats.totalCorrect} de 45 acertos (${stats.score.toFixed(1)} pts). Clique abaixo para confirmar e salvar a nota.`,
        type: 'success'
      });
    } catch (err: any) {
      setStatusMessage({
        text: err.message || 'Não foi possível ler as marcações na imagem com precisão. Verifique a iluminação e tente uma nova foto.',
        type: 'error'
      });
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  // Salvar a submissão do aluno
  const handleSaveSubmission = async () => {
    if (!selectedClassId || !selectedStudentId) {
      alert('Selecione a turma e o aluno.');
      return;
    }

    const studentObj = students.find(s => s.id === selectedStudentId);
    if (!studentObj) return;

    setIsSaving(true);

    const newSub: EnemSubmission = {
      id: `${simulation.id}_${selectedStudentId}`,
      simulation_id: simulation.id,
      student_id: selectedStudentId,
      student_name: studentObj.name,
      roll_number: studentObj.roll_number,
      class_id: selectedClassId,
      reviewer_name: reviewerName,
      answers: currentAnswers,
      total_correct: currentStats.totalCorrect,
      score_points: currentStats.score,
      blank_count: currentStats.totalBlank,
      multiple_count: currentStats.totalMultiple,
      created_at: new Date().toISOString()
    };

    const updated = await saveStoredSubmission(newSub);
    setSubmissions(updated);
    setIsSaving(false);

    setStatusMessage({
      text: `Nota de "${studentObj.name}" salva com sucesso! (${correctCount}/45 acertos = ${calculatedScore.toFixed(1)} pts)`,
      type: 'success'
    });

    // Avançar automaticamente para o próximo aluno pendente da turma
    const nextUncorrected = students.find(s => 
      s.id !== selectedStudentId && !updated.some(sub => sub.simulation_id === simulation.id && sub.student_id === s.id)
    );
    if (nextUncorrected) {
      setSelectedStudentId(nextUncorrected.id);
      setCapturedImage(null);
    }
  };

  // Salvar novo Gabarito Oficial
  const handleSaveOfficialAnswers = async () => {
    const updatedSim: EnemSimulation = {
      ...simulation,
      official_answers: editingAnswers,
      access_code: tempAccessCode.trim() || DEFAULT_SIMULATION.access_code
    };
    setSimulation(updatedSim);
    await saveStoredSimulation(updatedSim);
    setStatusMessage({
      text: 'Gabarito Oficial e Código de Acesso salvos com sucesso no banco de dados!',
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

  const auditStats = verifyingSubmission
    ? calculateEnemStatistics(auditAnswers, simulation.official_answers)
    : null;

  const handleSaveAudit = async () => {
    if (!verifyingSubmission || !auditStats) return;

    setIsSavingAudit(true);
    const updatedSub: EnemSubmission = {
      ...verifyingSubmission,
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

      if (selectedStudentId === verifyingSubmission.student_id) {
        setCurrentAnswers(auditAnswers);
      }

      setStatusMessage({
        text: `Gabarito de "${verifyingSubmission.student_name}" verificado e atualizado com sucesso! (${auditStats.totalCorrect}/45 acertos = ${auditStats.score.toFixed(1)} pts)`,
        type: 'success'
      });
      handleCloseAuditModal();
    } catch (err: any) {
      alert('Erro ao salvar auditoria: ' + (err?.message || 'Tente novamente'));
    } finally {
      setIsSavingAudit(false);
    }
  };

  const handleDeleteSubmission = async (sub: EnemSubmission) => {
    if (confirm(`Deseja excluir a nota do simulado de "${sub.student_name}"?\n\nEsta nota será removida e o aluno voltará para o status "Pendente" para uma nova correção.`)) {
      const updated = await deleteStoredSubmission(sub.id);
      setSubmissions(updated);

      if (selectedStudentId === sub.student_id) {
        const initialAnswers: Record<number, EnemAnswerOption> = {};
        for (let q = 1; q <= 45; q++) {
          initialAnswers[q] = 'BLANK';
        }
        setCurrentAnswers(initialAnswers);
        setCapturedImage(null);
      }

      setStatusMessage({
        text: `Nota do simulado de "${sub.student_name}" excluída com sucesso. Aluno liberado para nova correção.`,
        type: 'info'
      });
    }
  };

  const selectedStudentObj = students.find(s => s.id === selectedStudentId);
  const selectedClassObj = classes.find(c => c.id === selectedClassId);

  // Submissões filtradas exclusivamente para as turmas de 3º ano
  const thirdYearClassIds = new Set(classes.map(c => c.id));
  const thirdYearSubmissions = submissions.filter(s => thirdYearClassIds.has(s.class_id));

  const filteredSubmissions = filterClassId === 'all' 
    ? thirdYearSubmissions 
    : thirdYearSubmissions.filter(s => s.class_id === filterClassId);

  // Exportação profissional de Relatório em PDF para o Administrador
  const exportSimuladoPDF = (targetClassId?: string) => {
    const listToExport = targetClassId && targetClassId !== 'all'
      ? thirdYearSubmissions.filter(s => s.class_id === targetClassId)
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
        ? (classes.find(c => c.id === targetClassId)?.name || 'Turma Selecionada')
        : (filterClassId === 'all'
            ? 'Todas as Turmas do 3º Ano'
            : (classes.find(c => c.id === filterClassId)?.name || 'Turma Selecionada'));

      // Cabeçalho institucional do documento
      doc.setFillColor(10, 37, 64);
      doc.rect(0, 0, 210, 32, 'F');

      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text('RELATÓRIO DE RESULTADOS DO SIMULADO ENEM', 105, 14, { align: 'center' });

      doc.setFontSize(10);
      doc.setTextColor(226, 232, 240);
      doc.text(`${simulation.title} | Turma: ${targetClassName} | Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 105, 23, { align: 'center' });

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
      const sortedList = [...listToExport].sort((a, b) => b.score_points - a.score_points);

      const tableData = sortedList.map((item, index) => {
        const cls = classes.find(c => c.id === item.class_id)?.name || item.class_name || '-';
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

        <div className="flex items-center gap-3">
          {isReviewerMode && (
            <button
              onClick={onExitReviewerMode}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-sm font-semibold transition-all"
            >
              <LogOut size={16} />
              Sair do Portal
            </button>
          )}

          {!isReviewerMode && (
            <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
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
                Resultados ({submissions.length})
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
      {(isReviewerMode || activeTab === 'grading') && (
        <div className="space-y-8">
          {/* Topo: Painel de Correção em 2 Colunas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Coluna 1: Seleção de Turma do 3º Ano e Aluno */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-lg font-serif font-bold text-brand-blue-dark dark:text-white flex items-center gap-2">
                  <Users size={20} className="text-brand-blue dark:text-brand-yellow" />
                  1. Dados do Aluno
                </h2>
                {isReviewerMode && (
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    {submissions.filter(s => s.reviewer_name === reviewerName).length} corrigidos por você
                  </span>
                )}
              </div>

              <div>
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
                    <RefreshCw size={11} className={isLoadingClasses ? "animate-spin" : ""} />
                    Atualizar Turmas
                  </button>
                </div>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-brand-yellow shadow-sm"
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

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5">
                  Aluno da Turma {students.length > 0 && `(${students.length} alunos)`}
                </label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  disabled={!selectedClassId || students.length === 0}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm font-medium text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-brand-yellow shadow-sm disabled:opacity-50"
                >
                  <option value="">
                    {isLoadingStudents ? 'Carregando lista de alunos...' : 'Selecione o aluno para correção...'}
                  </option>
                  {students.map(s => {
                    const sub = submissions.find(
                      item => item.simulation_id === simulation.id && item.student_id === s.id
                    );
                    return (
                      <option key={s.id} value={s.id}>
                        {s.roll_number ? `Nº ${s.roll_number} - ` : ''}{s.name} {sub ? `✓ [Nota: ${sub.score_points.toFixed(1)} pts]` : '• (Pendente)'}
                      </option>
                    );
                  })}
                </select>
              </div>

              {selectedStudentObj ? (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      {selectedStudentObj.roll_number ? `Nº ${selectedStudentObj.roll_number} - ` : ''}{selectedStudentObj.name}
                    </span>
                    {submissions.some(sub => sub.simulation_id === simulation.id && sub.student_id === selectedStudentObj.id) ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200">
                        Já Corrigido
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200">
                        Aguardando Correção
                      </span>
                    )}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    Turma: <strong className="text-slate-700 dark:text-slate-200">{selectedClassObj?.name}</strong>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300">
                  Selecione uma turma e um aluno para iniciar a leitura do cartão-resposta.
                </div>
              )}
            </div>

            {/* Coluna 2: Captura do Cartão-Resposta e Correção com IA */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-lg font-serif font-bold text-brand-blue-dark dark:text-white flex items-center gap-2">
                  <Camera size={20} className="text-brand-blue dark:text-brand-yellow" />
                  2. Cartão-Resposta & Leitura IA
                </h2>
              </div>

              {capturedImage ? (
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black aspect-[4/3] max-h-56 flex items-center justify-center">
                    <img src={capturedImage} alt="Cartão resposta" className="w-full h-full object-contain" />
                    <button
                      onClick={() => setCapturedImage(null)}
                      className="absolute top-2 right-2 p-1.5 bg-rose-600 text-white rounded-full hover:bg-rose-700 shadow-md transition-all"
                      title="Remover imagem"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <button
                    onClick={handleAnalyzeWithAI}
                    disabled={isAnalyzingImage}
                    className="w-full py-3 px-4 bg-gradient-to-r from-brand-blue to-indigo-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-md disabled:opacity-50"
                  >
                    {isAnalyzingImage ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        Lendo bolinhas e calculando pontuação...
                      </>
                    ) : (
                      <>
                        <Sparkles size={18} className="text-brand-yellow" />
                        Reconhecer e Corrigir via IA
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={startCamera}
                      className="py-3 px-4 bg-brand-blue text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-brand-blue-dark transition-all shadow-sm"
                    >
                      <Camera size={18} />
                      Tirar Foto
                    </button>

                    <label className="py-3 px-4 border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-brand-blue text-slate-700 dark:text-slate-300 rounded-xl font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all">
                      <Upload size={18} />
                      Carregar Foto
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={handleImageUpload} 
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Placar Direto do Simulado (Sem indicação de brancos ou duplas) */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <span className="text-[11px] uppercase font-bold text-slate-400 block">Total de Acertos</span>
                  <div className="text-2xl font-black text-brand-blue-dark dark:text-white">
                    {currentStats.totalCorrect} <span className="text-sm font-medium text-slate-400">/ 45 questões</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] uppercase font-bold text-slate-400 block">Nota do Simulado</span>
                  <div className={`inline-block px-3.5 py-1.5 rounded-xl text-base font-extrabold border ${getScoreBadgeColor(calculatedScore)}`}>
                    {calculatedScore.toFixed(1)} pts
                  </div>
                </div>
              </div>

              <button
                onClick={handleSaveSubmission}
                disabled={isSaving || !selectedStudentId}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Confirmar e Salvar Nota do Aluno
              </button>
            </div>
          </div>

          {/* Fim da Aba: Relação Completa dos Alunos Corrigidos nesta Turma */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 dark:border-slate-800 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-3">
              <div>
                <h3 className="text-xl font-serif font-bold text-brand-blue-dark dark:text-white flex items-center gap-2">
                  <Users size={22} className="text-brand-blue dark:text-brand-yellow" />
                  Alunos corrigidos nesta turma ({submissions.filter(s => s.class_id === selectedClassId).length} de {students.length})
                </h3>
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
                      item => item.simulation_id === simulation.id && item.student_id === student.id
                    );

                    return (
                      <tr 
                        key={student.id} 
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                          selectedStudentId === student.id ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''
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
                              onClick={() => {
                                setSelectedStudentId(student.id);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
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

      {/* ABA 2: GABARITO OFICIAL (Exclusivo Administrador) */}
      {!isReviewerMode && activeTab === 'answer-key' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 dark:border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-4">
            <div>
              <h2 className="text-xl font-serif font-bold text-brand-blue-dark dark:text-white">
                Gabarito Oficial do Simulado (45 Questões)
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Defina a resposta correta de cada questão. Esse gabarito será usado por todos os professores durante a correção.
              </p>
            </div>

            <button
              onClick={handleSaveOfficialAnswers}
              className="py-3 px-6 bg-brand-blue hover:bg-brand-blue-dark text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md transition-all"
            >
              <Save size={18} />
              Salvar Gabarito Oficial
            </button>
          </div>

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

      {/* ABA 3: RESULTADOS GERAIS E RELATÓRIO (Exclusivo Administrador) */}
      {!isReviewerMode && activeTab === 'results' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100 dark:border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-4">
            <div>
              <h2 className="text-xl font-serif font-bold text-brand-blue-dark dark:text-white">
                Relatório Geral do Simulado ENEM
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Acompanhe o desempenho de todos os alunos e exporte os dados consolidados.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={filterClassId}
                onChange={(e) => setFilterClassId(e.target.value)}
                className="p-2.5 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                <option value="all">Todos os 3º Anos</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <button
                onClick={() => exportSimuladoPDF(filterClassId)}
                disabled={filteredSubmissions.length === 0}
                className="py-2.5 px-4 bg-brand-blue hover:bg-brand-blue-dark text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
                title="Gerar e baixar relatório em PDF"
              >
                <Download size={14} />
                Baixar / Imprimir PDF
              </button>
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
                  const className = classes.find(c => c.id === sub.class_id)?.name || 'Turma';
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

      {/* Modal de Câmera */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-lg bg-black rounded-3xl overflow-hidden relative border border-white/20">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              className="w-full h-auto aspect-[3/4] object-cover"
            />
            <div className="absolute bottom-6 inset-x-0 flex items-center justify-center gap-6">
              <button
                onClick={stopCamera}
                className="p-3 bg-white/20 text-white rounded-full hover:bg-white/30 backdrop-blur-md"
              >
                <XCircle size={24} />
              </button>
              <button
                onClick={capturePhoto}
                className="w-16 h-16 bg-white rounded-full border-4 border-brand-yellow flex items-center justify-center shadow-2xl active:scale-95 transition-all"
              >
                <div className="w-12 h-12 bg-white rounded-full"></div>
              </button>
            </div>
          </div>
          <p className="text-white/70 text-xs mt-3 text-center">
            Enquadre as 45 questões do cartão-resposta em ambiente bem iluminado.
          </p>
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
                      {classes.find(c => c.id === verifyingSubmission.class_id)?.name || '3º Ano'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    Corretor: <span className="font-semibold text-slate-700 dark:text-slate-300">{verifyingSubmission.reviewer_name || 'Desconhecido'}</span>
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
                        const officialAns = simulation.official_answers[qNum] || 'A';
                        const studentAns = auditAnswers[qNum] || 'BLANK';
                        const isCorrect = isEnemQuestionCorrect(studentAns, officialAns);

                        return (
                          <div 
                            key={qNum} 
                            className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-2 transition-all ${
                              isCorrect 
                                ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60' 
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
                                    ? 'bg-slate-700 text-white'
                                    : studentAns === 'DUPLA'
                                      ? 'bg-amber-600 text-white'
                                      : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                                title={studentAns === 'BLANK' ? 'Em branco' : studentAns === 'DUPLA' ? 'Rasura / Dupla' : 'Deixar em branco'}
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
    </div>
  );
}
