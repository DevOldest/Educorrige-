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
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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

  // Função utilitária para filtrar estritamente turmas do 3º ano
  const isThirdYearClass = (c: Class): boolean => {
    if (c.school_year === 3) return true;
    const name = (c.name || '').toLowerCase().trim();
    if (
      name.includes('3º') ||
      name.includes('3°') ||
      name.includes('3o') ||
      name.includes('3ª') ||
      name.includes('3a') ||
      name.includes('terceiro') ||
      name.includes('3 ano') ||
      name.includes('3ano')
    ) {
      return true;
    }
    if (/^3[\s\-_A-Za-z0-9]/.test(name) || name === '3') {
      return true;
    }
    return false;
  };

  async function fetchClasses() {
    setIsLoadingClasses(true);
    try {
      if (supabase) {
        const { data, error } = await supabase.from('classes').select('*').order('name');
        if (!error && data) {
          // Filtrar estritamente turmas do 3º ano para o Simulado ENEM
          const thirdYearClasses = data.filter(isThirdYearClass);
          setClasses(thirdYearClasses);
          if (thirdYearClasses.length > 0) {
            setSelectedClassId(thirdYearClasses[0].id);
          }
        }
      }
    } catch (err) {
      console.error('Erro ao buscar turmas:', err);
    } finally {
      setIsLoadingClasses(false);
    }
  }

  async function fetchStudents(classId: string) {
    setIsLoadingStudents(true);
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('students')
          .select('*')
          .eq('class_id', classId)
          .order('name');
        if (!error && data) {
          setStudents(data);
          if (data.length > 0) {
            setSelectedStudentId(data[0].id);
          } else {
            setSelectedStudentId('');
          }
        }
      }
    } catch (err) {
      console.error('Erro ao buscar alunos:', err);
    } finally {
      setIsLoadingStudents(false);
    }
  }

  // Estatísticas calculadas em tempo real para a correção atual
  const correctCount = Object.entries(currentAnswers).reduce((acc, [qNum, ans]) => {
    const num = Number(qNum);
    const official = simulation.official_answers[num];
    if (official === 'ANULADA' || (ans !== 'BLANK' && ans !== 'ANULADA' && ans === official)) {
      return acc + 1;
    }
    return acc;
  }, 0);

  const calculatedScore = calculateEnemScore(correctCount);

  // Alterar uma resposta individual na matriz
  const handleAnswerSelect = (questionNum: number, option: EnemAnswerOption) => {
    setCurrentAnswers(prev => ({
      ...prev,
      [questionNum]: prev[questionNum] === option ? 'BLANK' : option
    }));
  };

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
      setStatusMessage({
        text: 'Cartão lido com sucesso pela IA! Verifique as marcações abaixo antes de salvar.',
        type: 'success'
      });
    } catch (err: any) {
      setStatusMessage({
        text: err.message || 'Não foi possível ler com precisão. Você pode marcar as bolinhas manualmente.',
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
      total_correct: correctCount,
      score_points: calculatedScore,
      created_at: new Date().toISOString()
    };

    const updated = await saveStoredSubmission(newSub);
    setSubmissions(updated);
    setIsSaving(false);

    setStatusMessage({
      text: `Correção de "${studentObj.name}" salva com sucesso! (${correctCount}/45 acertos = ${calculatedScore.toFixed(1)} pts)`,
      type: 'success'
    });

    // Avançar automaticamente para o próximo aluno da turma se houver
    const currentIndex = students.findIndex(s => s.id === selectedStudentId);
    if (currentIndex >= 0 && currentIndex < students.length - 1) {
      setSelectedStudentId(students[currentIndex + 1].id);
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

  const selectedStudentObj = students.find(s => s.id === selectedStudentId);
  const selectedClassObj = classes.find(c => c.id === selectedClassId);

  // Submissões filtradas exclusivamente para as turmas de 3º ano
  const thirdYearClassIds = new Set(classes.map(c => c.id));
  const thirdYearSubmissions = submissions.filter(s => thirdYearClassIds.has(s.class_id));

  const filteredSubmissions = filterClassId === 'all' 
    ? thirdYearSubmissions 
    : thirdYearSubmissions.filter(s => s.class_id === filterClassId);

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
            <span className="text-xs text-slate-400 dark:text-slate-500">45 Questões</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-brand-blue-dark dark:text-white">
            {isReviewerMode ? 'Portal do Corretor' : 'Gestão do Simulado ENEM'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {isReviewerMode 
              ? `Conectado como: ${reviewerName} • Pontuação automática por faixas de acertos.`
              : 'Correção ótica com IA, gabarito oficial de 45 questões e pontuação por faixas.'
            }
          </p>
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna 1: Seleção de Turma, Aluno e Imagem */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
              <h2 className="text-lg font-serif font-bold text-brand-blue-dark dark:text-white flex items-center gap-2">
                <Users size={20} className="text-brand-blue dark:text-brand-yellow" />
                Dados do Aluno
              </h2>

              <div>
                <label className="text-xs font-bold uppercase text-slate-400 block mb-1">
                  Turma (Apenas 3º Ano)
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-brand-yellow"
                >
                  {classes.length === 0 ? (
                    <option value="">Nenhuma turma do 3º ano encontrada...</option>
                  ) : (
                    <>
                      <option value="">Selecione a turma do 3º ano...</option>
                      {classes.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </>
                  )}
                </select>
                {classes.length === 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                    Cadastre uma turma contendo "3º Ano" na aba Turmas para realizar o simulado.
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-slate-400 block mb-1">
                  Aluno {students.length > 0 && `(${students.length})`}
                </label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  disabled={!selectedClassId || students.length === 0}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-brand-yellow disabled:opacity-50"
                >
                  <option value="">Selecione o aluno...</option>
                  {students.map(s => {
                    const isAlreadyCorrected = submissions.some(
                      sub => sub.simulation_id === simulation.id && sub.student_id === s.id
                    );
                    return (
                      <option key={s.id} value={s.id}>
                        {s.roll_number ? `Nº ${s.roll_number} - ` : ''}{s.name} {isAlreadyCorrected ? '✓ (Corrigido)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {selectedStudentObj && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl text-xs space-y-1 text-slate-600 dark:text-slate-300">
                  <div className="font-semibold text-slate-800 dark:text-white">{selectedStudentObj.name}</div>
                  <div>Turma: {selectedClassObj?.name}</div>
                  {selectedStudentObj.roll_number && <div>Número: {selectedStudentObj.roll_number}</div>}
                </div>
              )}
            </div>

            {/* Captura / Foto do Cartão-Resposta */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
              <h2 className="text-lg font-serif font-bold text-brand-blue-dark dark:text-white flex items-center gap-2">
                <Camera size={20} className="text-brand-blue dark:text-brand-yellow" />
                Cartão-Resposta
              </h2>

              {capturedImage ? (
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black aspect-[3/4] max-h-60 flex items-center justify-center">
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
                        Lendo bolinhas com IA...
                      </>
                    ) : (
                      <>
                        <Sparkles size={18} className="text-brand-yellow" />
                        Reconhecer Bolinhas via IA
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={startCamera}
                    className="w-full py-3 px-4 bg-brand-blue text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-brand-blue-dark transition-all shadow-sm"
                  >
                    <Camera size={18} />
                    Tirar Foto do Cartão
                  </button>

                  <label className="w-full py-3 px-4 border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-brand-blue text-slate-600 dark:text-slate-300 rounded-xl font-medium flex items-center justify-center gap-2 cursor-pointer transition-all">
                    <Upload size={18} />
                    Carregar Foto da Galeria
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleImageUpload} 
                    />
                  </label>

                  <p className="text-xs text-slate-400 text-center">
                    Dica: Você também pode preencher as 45 questões diretamente na matriz ao lado sem foto.
                  </p>
                </div>
              )}
            </div>

            {/* Painel do Placar em Tempo Real */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-slate-400">Total de Acertos</span>
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 font-bold text-slate-600 dark:text-slate-300">
                  {correctCount} / 45
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-400 uppercase font-semibold">Pontuação Final</span>
                  <div className="text-3xl font-extrabold text-brand-blue-dark dark:text-white">
                    {calculatedScore.toFixed(1)} <span className="text-sm font-normal text-slate-400">pts</span>
                  </div>
                </div>
                <div className={`px-4 py-2 rounded-xl text-sm font-bold border ${getScoreBadgeColor(calculatedScore)}`}>
                  {calculatedScore === 0 ? 'Sem pontuação' : `Faixa ${calculatedScore.toFixed(1)}`}
                </div>
              </div>

              <button
                onClick={handleSaveSubmission}
                disabled={isSaving || !selectedStudentId}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Confirmar e Salvar Nota
              </button>
            </div>
          </div>

          {/* Coluna 2 e 3: A Matriz das 45 Questões */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-2">
                <div>
                  <h2 className="text-lg font-serif font-bold text-brand-blue-dark dark:text-white flex items-center gap-2">
                    <FileText size={20} className="text-brand-blue dark:text-brand-yellow" />
                    Cartão de Marcação (45 Questões)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Clique nas alternativas para marcar ou desmarcar. O gabarito oficial confere em tempo real.
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                    <span className="text-slate-500">Acerto</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                    <span className="text-slate-500">Erro</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                    <span className="text-slate-500">Em Branco</span>
                  </div>
                </div>
              </div>

              {/* Grid de 3 colunas de 15 questões cada */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                {[0, 1, 2].map((colIndex) => {
                  const startQ = colIndex * 15 + 1;
                  const endQ = startQ + 14;

                  return (
                    <div key={colIndex} className="space-y-2 bg-slate-50/50 dark:bg-slate-800/30 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <div className="text-center font-bold text-xs text-slate-400 border-b border-slate-200 dark:border-slate-700 pb-1 mb-2">
                        Questões {startQ} a {endQ}
                      </div>

                      {Array.from({ length: 15 }, (_, i) => {
                        const qNum = startQ + i;
                        const studentAns = currentAnswers[qNum] || 'BLANK';
                        const officialAns = simulation.official_answers[qNum] || 'A';
                        const isAnulada = officialAns === 'ANULADA';
                        const isCorrect = isAnulada || (studentAns !== 'BLANK' && studentAns !== 'ANULADA' && studentAns === officialAns);
                        const isWrong = studentAns !== 'BLANK' && !isCorrect;

                        return (
                          <div 
                            key={qNum} 
                            className={`flex items-center justify-between p-1.5 rounded-xl transition-all ${
                              studentAns === 'BLANK'
                                ? 'hover:bg-slate-100 dark:hover:bg-slate-750'
                                : isCorrect
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40'
                                : 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/40'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-[42px]">
                              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                {qNum.toString().padStart(2, '0')}
                              </span>
                              {studentAns !== 'BLANK' && (
                                isCorrect 
                                  ? <Check size={12} className="text-emerald-600 font-bold" />
                                  : <XCircle size={12} className="text-rose-600 font-bold" />
                              )}
                            </div>

                            {/* Bolinhas A, B, C, D, E */}
                            <div className="flex items-center gap-1">
                              {(['A', 'B', 'C', 'D', 'E'] as EnemAnswerOption[]).map((opt) => {
                                const isSelected = studentAns === opt;
                                const isOfficialGabarito = officialAns === opt;

                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => handleAnswerSelect(qNum, opt)}
                                    className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                                      isSelected
                                        ? isCorrect
                                          ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300'
                                          : 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-300'
                                        : isOfficialGabarito && isWrong
                                        ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-dashed border-amber-400'
                                        : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:border-brand-blue'
                                    }`}
                                  >
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Lista dos já corrigidos da turma selecionada */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-serif font-bold text-brand-blue-dark dark:text-white mb-3 flex items-center justify-between">
                <span>Alunos corrigidos nesta turma ({submissions.filter(s => s.class_id === selectedClassId).length})</span>
                <span className="text-xs font-normal text-slate-400">Salvos no sistema</span>
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase">
                      <th className="py-2">Aluno</th>
                      <th className="py-2 text-center">Acertos</th>
                      <th className="py-2 text-center">Nota</th>
                      <th className="py-2">Corretor</th>
                      <th className="py-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {submissions.filter(s => s.class_id === selectedClassId).map((sub) => (
                      <tr key={sub.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 font-medium text-slate-800 dark:text-slate-200">
                          {sub.roll_number ? `Nº ${sub.roll_number} - ` : ''}{sub.student_name}
                        </td>
                        <td className="py-2.5 text-center font-bold text-slate-700 dark:text-slate-300">
                          {sub.total_correct} / 45
                        </td>
                        <td className="py-2.5 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full font-bold border ${getScoreBadgeColor(sub.score_points)}`}>
                            {sub.score_points.toFixed(1)}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-500">
                          {sub.reviewer_name}
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            onClick={() => {
                              setSelectedStudentId(sub.student_id);
                              setCurrentAnswers(sub.answers);
                            }}
                            className="text-brand-blue dark:text-brand-yellow hover:underline mr-2"
                          >
                            Editar
                          </button>
                          {!isReviewerMode && (
                            <button
                              onClick={async () => {
                                if (confirm(`Deseja excluir a correção de ${sub.student_name}?`)) {
                                  const updated = await deleteStoredSubmission(sub.id);
                                  setSubmissions(updated);
                                }
                              }}
                              className="text-rose-600 hover:text-rose-700"
                            >
                              <Trash2 size={14} className="inline" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {submissions.filter(s => s.class_id === selectedClassId).length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-slate-400">
                          Nenhum aluno desta turma corrigido ainda.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
                onClick={() => window.print()}
                className="py-2.5 px-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 rounded-xl font-bold text-xs flex items-center gap-2 transition-all"
              >
                <Download size={14} />
                Imprimir / PDF
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
                  <th className="py-3 px-2 text-center">Acertos Brutos</th>
                  <th className="py-3 px-2 text-center">Nota no Simulado</th>
                  <th className="py-3 px-2">Corretor Responsável</th>
                  <th className="py-3 px-2 text-right">Data/Hora</th>
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
                      <td className="py-3 px-2 text-right text-xs text-slate-400">
                        {new Date(sub.created_at).toLocaleDateString('pt-BR')} {new Date(sub.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  );
                })}
                {filteredSubmissions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
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
    </div>
  );
}
