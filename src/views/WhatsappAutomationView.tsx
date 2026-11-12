import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  Send, 
  Upload, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Copy, 
  Check, 
  Plus, 
  RefreshCw, 
  Settings, 
  FileText, 
  Sparkles, 
  ChevronRight, 
  GraduationCap, 
  Users, 
  Phone, 
  UserCheck, 
  Edit3, 
  ExternalLink,
  BookOpen,
  Award,
  Filter,
  Eye,
  CheckCheck,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { 
  Class, 
  Student, 
  Grade, 
  WeeklyStudyMessage, 
  ExtractedCampaign, 
  WeeklyMessageStatus 
} from '../types';
import { 
  cleanPhoneNumber, 
  formatPhoneDisplay, 
  generateWhatsAppUrl, 
  openWhatsAppChat, 
  getClassLeader, 
  saveClassLeader, 
  getStudentGuardian, 
  saveStudentGuardian, 
  recordMessageSent, 
  getMessageSentDate, 
  formatLeaderStudyMessage, 
  formatStudentReportMessage, 
  formatGeneralNoticeMessage, 
  extractStudyScheduleFromPdf, 
  fetchWeeklyStudyMessages, 
  saveWeeklyStudyMessages, 
  updateWeeklyStudyMessage, 
  deleteWeeklyStudyMessage 
} from '../lib/whatsappService';
import CustomModal from '../components/CustomModal';

type ActiveTab = 'lideres' | 'boletins' | 'gestao_lideres';

export default function WhatsappAutomationView() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('lideres');

  // Dados do sistema (Turmas, Alunos, Notas)
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Record<string, Grade[]>>({}); // student_id -> grades[]
  const [isLoadingClasses, setIsLoadingClasses] = useState(true);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);

  // Modal genérico
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

  // Modal de Preview de Mensagem
  const [previewModal, setPreviewModal] = useState<{
    isOpen: boolean;
    title: string;
    recipientName: string;
    recipientPhone: string;
    messageText: string;
    trackingKey?: string;
  } | null>(null);

  // Modal para Editar Líder da Turma
  const [editLeaderModal, setEditLeaderModal] = useState<{
    isOpen: boolean;
    classId: string;
    className: string;
    leaderName: string;
    leaderPhone: string;
  } | null>(null);

  // Estados de Envio / Feedback
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // ==========================================
  // ESTADOS DA ABA 1: LÍDERES & ESTUDO ESPAÇADO
  // ==========================================
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scheduleSource, setScheduleSource] = useState<'pdf' | 'manual' | 'modelos'>('pdf');

  const [campaignTitle, setCampaignTitle] = useState('Cronograma de Estudos - Química');
  const [draftWeeks, setDraftWeeks] = useState<Array<{
    semana_numero: number;
    data_envio: string;
    horario_envio: string;
    mensagem_texto: string;
    status: WeeklyMessageStatus;
  }>>([
    {
      semana_numero: 1,
      data_envio: new Date().toISOString().split('T')[0],
      horario_envio: '08:00',
      mensagem_texto: `*Semana 1 - Estrutura Atômica e Tabela Periódica*\n• Questão 1: Qual é a diferença fundamental entre número atômico (Z) e número de massa (A)?\n• Resolução: Z representa o total de prótons no núcleo; A representa a soma de prótons e nêutrons (A = Z + N).\n• Cartão Anki/AlgoApp: Frente: "Definição de Isótopos" / Verso: "Átomos com o mesmo número atômico (Z) e diferentes números de massa (A)".`,
      status: 'agendado'
    }
  ]);
  const [savedCronograma, setSavedCronograma] = useState<WeeklyStudyMessage[]>([]);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  // ==========================================
  // ESTADOS DA ABA 2: BOLETIM & PAIS
  // ==========================================
  const [selectedUnit, setSelectedUnit] = useState<number>(1);
  const [reportTemplate, setReportTemplate] = useState<'completo' | 'alerta' | 'parabens' | 'custom'>('completo');
  const [customTeacherNote, setCustomTeacherNote] = useState('');
  const [studentPhones, setStudentPhones] = useState<Record<string, string>>({});
  const [savingPhoneId, setSavingPhoneId] = useState<string | null>(null);

  // Carregar turmas no início
  useEffect(() => {
    loadClasses();
    loadSavedCronograma();
  }, []);

  // Quando seleciona turma, carregar alunos e notas
  useEffect(() => {
    if (selectedClassId) {
      loadStudentsAndGrades(selectedClassId);
    } else {
      setStudents([]);
    }
  }, [selectedClassId]);

  async function loadClasses() {
    setIsLoadingClasses(true);
    try {
      if (supabase) {
        const { data, error } = await supabase.from('classes').select('*').order('name');
        if (!error && data) {
          setClasses(data as Class[]);
          if (data.length > 0 && !selectedClassId) {
            setSelectedClassId(data[0].id);
          }
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar turmas:', e);
    } finally {
      setIsLoadingClasses(false);
    }
  }

  async function loadSavedCronograma() {
    try {
      const res = await fetchWeeklyStudyMessages();
      setSavedCronograma(res.data);
    } catch (e) {
      console.warn('Erro ao carregar cronograma:', e);
    }
  }

  async function loadStudentsAndGrades(classId: string) {
    setIsLoadingStudents(true);
    try {
      if (supabase) {
        // Carrega alunos
        const { data: stdData, error: stdErr } = await supabase
          .from('students')
          .select('*')
          .eq('class_id', classId)
          .order('roll_number', { ascending: true });

        if (!stdErr && stdData) {
          setStudents(stdData as Student[]);
          
          // Preenche telefones locais
          const phoneMap: Record<string, string> = {};
          stdData.forEach((st: Student) => {
            const guardian = getStudentGuardian(st.id, {
              guardian_name: st.guardian_name,
              guardian_phone: st.guardian_phone || st.phone
            });
            if (guardian.guardianPhone) {
              phoneMap[st.id] = guardian.guardianPhone;
            }
          });
          setStudentPhones(phoneMap);

          // Carrega notas dos alunos
          const studentIds = stdData.map(s => s.id);
          if (studentIds.length > 0) {
            const { data: grData, error: grErr } = await supabase
              .from('grades')
              .select('*')
              .in('student_id', studentIds);

            if (!grErr && grData) {
              const grouped: Record<string, Grade[]> = {};
              grData.forEach((g: Grade) => {
                if (!grouped[g.student_id]) grouped[g.student_id] = [];
                grouped[g.student_id].push(g);
              });
              setGrades(grouped);
            }
          }
        }
      }
    } catch (e) {
      console.error('Erro ao buscar alunos e notas:', e);
    } finally {
      setIsLoadingStudents(false);
    }
  }

  // Obter líder atual da turma selecionada
  const currentClass = classes.find(c => c.id === selectedClassId);
  const currentLeader = selectedClassId 
    ? getClassLeader(selectedClassId, {
        leader_name: currentClass?.leader_name,
        leader_phone: currentClass?.leader_phone
      })
    : { leaderName: '', leaderPhone: '' };

  // Copiar texto para o Clipboard com animação
  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Abrir chat do WhatsApp e registrar como enviado
  const handleSendWhatsApp = (phone: string, text: string, trackingKey?: string) => {
    if (!phone || cleanPhoneNumber(phone).length < 10) {
      setModal({
        isOpen: true,
        title: 'Número Inválido',
        message: 'Por favor, informe um número de telefone WhatsApp válido com DDD (ex: 11 98765-4321).',
        type: 'warning'
      });
      return;
    }

    const opened = openWhatsAppChat(phone, text);
    if (opened && trackingKey) {
      recordMessageSent(trackingKey);
      setRefreshTrigger(prev => prev + 1);
    }
  };

  // Salvar Líder de Turma
  const handleSaveLeader = async () => {
    if (!editLeaderModal) return;
    await saveClassLeader(
      editLeaderModal.classId,
      editLeaderModal.leaderName,
      editLeaderModal.leaderPhone
    );
    setEditLeaderModal(null);
    setRefreshTrigger(prev => prev + 1);
    setModal({
      isOpen: true,
      title: 'Líder Salvo com Sucesso',
      message: 'Os dados do líder foram atualizados e já estão prontos para envio.',
      type: 'success'
    });
  };

  // Salvar telefone do responsável pelo aluno inline
  const handleSaveGuardianPhone = async (studentId: string, phone: string) => {
    setSavingPhoneId(studentId);
    try {
      const guardian = getStudentGuardian(studentId);
      await saveStudentGuardian(studentId, guardian.guardianName || 'Responsável', phone);
      setStudentPhones(prev => ({ ...prev, [studentId]: phone }));
    } catch (e) {
      console.error(e);
    } finally {
      setSavingPhoneId(null);
    }
  };

  // Processamento do PDF via Gemini
  const handlePdfUpload = async (file: File) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      setExtractError('Por favor, selecione um arquivo em formato PDF.');
      return;
    }

    setExtractError(null);
    setIsProcessingPdf(true);

    try {
      const result: ExtractedCampaign = await extractStudyScheduleFromPdf(file);
      setCampaignTitle(result.campaign_title || file.name.replace('.pdf', ''));
      setDraftWeeks(
        result.messages.map(m => ({
          semana_numero: m.semana_numero,
          data_envio: m.data_envio,
          horario_envio: m.horario_envio,
          mensagem_texto: m.mensagem_texto,
          status: 'agendado'
        }))
      );
      setModal({
        isOpen: true,
        title: 'Cronograma Extraído com Sucesso!',
        message: `Identificamos ${result.messages.length} semanas de estudo no seu PDF. Revise os textos e clique em enviar para o líder quando quiser!`,
        type: 'success'
      });
    } catch (err: any) {
      console.error(err);
      setExtractError(err.message || 'Falha ao processar PDF.');
    } finally {
      setIsProcessingPdf(false);
    }
  };

  // Adicionar semana de estudo manual
  const handleAddManualWeek = () => {
    const nextNum = draftWeeks.length + 1;
    const lastDate = draftWeeks.length > 0 ? draftWeeks[draftWeeks.length - 1].data_envio : new Date().toISOString().split('T')[0];
    const nextDate = new Date(new Date(lastDate).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    setDraftWeeks(prev => [
      ...prev,
      {
        semana_numero: nextNum,
        data_envio: nextDate,
        horario_envio: '08:00',
        mensagem_texto: `*Semana ${nextNum} - Roteiro de Química*\n• Tópico principal:\n• Questão de fixação:\n• Bloco AlgoApp/Anki:`,
        status: 'agendado'
      }
    ]);
  };

  // Aplicar modelo pedagógico
  const applyPresetTemplate = (type: 'quimica_geral' | 'organica' | 'enem') => {
    if (type === 'quimica_geral') {
      setCampaignTitle('Química Geral & Inorgânica - 1º Ano');
      setDraftWeeks([
        {
          semana_numero: 1,
          data_envio: new Date().toISOString().split('T')[0],
          horario_envio: '08:00',
          mensagem_texto: `*Semana 1 - Modelos Atômicos e Distribuição Eletrônica*\n1. Dalton: Esfera maciça e indivisível ("Bola de bilhar").\n2. Thomson: Descoberta do elétron, esfera positiva com cargas negativas ("Pudim de passas").\n3. Rutherford: Núcleo denso e positivo, eletrosfera vazia ("Sistema planetário").\n4. Bohr: Níveis quantizados de energia e saltos quânticos.\n\n*Cartão AlgoApp:* F: "Postulado de Bohr sobre fótons" / V: "Quando o elétron salta para uma camada mais externa absorve energia; ao retornar emite luz/fóton".`,
          status: 'agendado'
        },
        {
          semana_numero: 2,
          data_envio: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          horario_envio: '08:00',
          mensagem_texto: `*Semana 2 - Propriedades Periódicas*\n• Raio Atômico: Cresce para a esquerda e para baixo na tabela.\n• Eletronegatividade: Capacidade de atrair elétrons em uma ligação (F > O > N > Cl > Br > I > S > C > P > H).\n• Energia de Ionização: Energia necessária para retirar 1 elétron no estado gasoso.\n\n*Cartão AlgoApp:* F: "Elemento mais eletronegativo" / V: "Flúor (F)".`,
          status: 'agendado'
        },
        {
          semana_numero: 3,
          data_envio: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          horario_envio: '08:00',
          mensagem_texto: `*Semana 3 - Ligações Químicas*\n• Ligação Iônica: Metal + Ametal (transferência de elétrons, formação de retículo cristalino).\n• Ligação Covalente: Ametal + Ametal (compartilhamento de pares de elétrons).\n• Ligação Metálica: Metal + Metal ("mar de elétrons", alta condutibilidade térmica e elétrica).`,
          status: 'agendado'
        }
      ]);
    } else if (type === 'organica') {
      setCampaignTitle('Química Orgânica - Funções e Nomenclatura');
      setDraftWeeks([
        {
          semana_numero: 1,
          data_envio: new Date().toISOString().split('T')[0],
          horario_envio: '08:00',
          mensagem_texto: `*Semana 1 - Funções Oxigenadas Essenciais*\n• Álcool: Hidroxila (-OH) ligada a carbono saturado (sufixo -OL).\n• Aldeído: Carbonila na extremidade da cadeia (sufixo -AL).\n• Cetona: Carbonila entre dois carbonos (sufixo -ONA).\n• Ácido Carboxílico: Carboxila (-COOH) na ponta (Ácido ... -ÓICO).`,
          status: 'agendado'
        },
        {
          semana_numero: 2,
          data_envio: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          horario_envio: '08:00',
          mensagem_texto: `*Semana 2 - Funções Nitrogenadas e Isomeria*\n• Amina: Derivado da amônia (NH3) substituindo hidrogênios por radicais carbônicos.\n• Amida: Nitrogênio diretamente ligado a uma carbonila (-CO-NH2).\n• Isomeria Plana: Cadeia, Posição, Função, Compensação e Tautomeria.`,
          status: 'agendado'
        }
      ]);
    } else {
      setCampaignTitle('Revisão Estratégica ENEM - Química');
      setDraftWeeks([
        {
          semana_numero: 1,
          data_envio: new Date().toISOString().split('T')[0],
          horario_envio: '08:00',
          mensagem_texto: `*Semana 1 - Estequiometria sem mistério (Top 1 ENEM)*\nPasso 1: Escrever e balancear a equação química completa.\nPasso 2: Identificar as substâncias citadas no enunciado.\nPasso 3: Relacionar grandezas (Massa molar, Mol = 6,02x10²³, Volume molar = 22,4 L na CNTP).\nPasso 4: Montar a regra de três considerando pureza e rendimento se houver!`,
          status: 'agendado'
        }
      ]);
    }
  };

  // Salvar no cronograma persistente
  const handleSaveDraftToSchedule = async () => {
    setIsSavingSchedule(true);
    try {
      await saveWeeklyStudyMessages(draftWeeks, campaignTitle);
      await loadSavedCronograma();
      setModal({
        isOpen: true,
        title: 'Cronograma Salvo!',
        message: 'As mensagens foram armazenadas com sucesso no seu banco de dados.',
        type: 'success'
      });
    } catch (e: any) {
      setModal({
        isOpen: true,
        title: 'Erro ao Salvar',
        message: e.message || 'Falha ao salvar cronograma.',
        type: 'error'
      });
    } finally {
      setIsSavingSchedule(false);
    }
  };

  // Remover semana salva
  const handleDeleteSavedMessage = async (id: string) => {
    await deleteWeeklyStudyMessage(id);
    loadSavedCronograma();
  };

  // ==========================================
  // HELPERS DE BOLETIM E RESUMO DE NOTAS
  // ==========================================
  const getStudentGradeForUnit = (studentId: string, unitNum: number): Grade | undefined => {
    const list = grades[studentId] || [];
    return list.find(g => Number(g.unit) === Number(unitNum));
  };

  const getStudentAnnualAverage = (studentId: string): number | null => {
    const list = grades[studentId] || [];
    if (list.length === 0) return null;
    const sum = list.reduce((acc, curr) => acc + (Number(curr.unit_average) || 0), 0);
    return Number((sum / list.length).toFixed(1));
  };

  return (
    <div className="space-y-6">
      {/* CABEÇALHO PRINCIPAL */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/80 dark:border-slate-800 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-72 h-72 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2 border border-emerald-200/60 dark:border-emerald-800">
              <MessageSquare size={13} />
              Comunicação Direta WhatsApp (100% Gratuito)
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900 dark:text-white tracking-tight">
              WhatsApp & Líderes de Sala
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Envie roteiros pedagógicos com blocos prontos para o <strong>AlgoApp</strong> para o líder da sala no privado, ou dispare <strong>boletins de notas</strong> com 1 clique para os responsáveis. Sem custos e sem risco de banimento.
            </p>
          </div>

          {/* Abas Principais */}
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 self-start md:self-center shrink-0">
            <button
              onClick={() => setActiveTab('lideres')}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all",
                activeTab === 'lideres'
                  ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <Users size={16} />
              <span>Líderes (Estudo & AlgoApp)</span>
            </button>

            <button
              onClick={() => setActiveTab('boletins')}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all",
                activeTab === 'boletins'
                  ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <GraduationCap size={16} />
              <span>Boletins & Pais</span>
            </button>

            <button
              onClick={() => setActiveTab('gestao_lideres')}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all",
                activeTab === 'gestao_lideres'
                  ? "bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              )}
            >
              <Phone size={16} />
              <span>Contatos dos Líderes</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ABA 1: LÍDERES DE SALA (ESTUDO ESPAÇADO & ALGOAPP) */}
      {/* ========================================================================= */}
      {activeTab === 'lideres' && (
        <div className="space-y-6">
          {/* Card Seletor de Turma & Líder Atual */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4 w-full md:w-auto">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 border border-emerald-100 dark:border-emerald-900">
                <Users size={24} />
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                  Turma de Destino:
                </label>
                <select
                  value={selectedClassId}
                  onChange={e => setSelectedClassId(e.target.value)}
                  className="mt-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Informações do Líder */}
            <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700/80 w-full md:w-auto">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <UserCheck size={18} />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-semibold">Líder Atual da Turma:</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white">
                  {currentLeader.leaderName || 'Nenhum líder cadastrado'}
                  {currentLeader.leaderPhone && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium ml-2">
                      {formatPhoneDisplay(currentLeader.leaderPhone)}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => {
                  if (currentClass) {
                    setEditLeaderModal({
                      isOpen: true,
                      classId: currentClass.id,
                      className: currentClass.name,
                      leaderName: currentLeader.leaderName,
                      leaderPhone: currentLeader.leaderPhone
                    });
                  }
                }}
                className="ml-auto p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all"
                title="Editar Líder da Turma"
              >
                <Edit3 size={16} />
              </button>
            </div>
          </div>

          {/* Seletor de Modo de Criação das Mensagens */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <BookOpen size={20} className="text-emerald-500" />
                  Roteiro de Repetição Espaçada & AlgoApp
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Escolha como deseja alimentar as mensagens das semanas de estudo.
                </p>
              </div>

              <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  onClick={() => setScheduleSource('pdf')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    scheduleSource === 'pdf' ? "bg-white dark:bg-slate-900 text-emerald-600 shadow-sm" : "text-slate-500"
                  )}
                >
                  Subir PDF
                </button>
                <button
                  onClick={() => setScheduleSource('manual')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    scheduleSource === 'manual' ? "bg-white dark:bg-slate-900 text-emerald-600 shadow-sm" : "text-slate-500"
                  )}
                >
                  Digitar Semanas
                </button>
                <button
                  onClick={() => setScheduleSource('modelos')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    scheduleSource === 'modelos' ? "bg-white dark:bg-slate-900 text-emerald-600 shadow-sm" : "text-slate-500"
                  )}
                >
                  Modelos Prontos
                </button>
              </div>
            </div>

            {/* Opção 1: Upload de PDF */}
            {scheduleSource === 'pdf' && (
              <div className="space-y-4">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all",
                    "border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 bg-slate-50/50 dark:bg-slate-850"
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        handlePdfUpload(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
                    {isProcessingPdf ? (
                      <RefreshCw className="animate-spin" size={26} />
                    ) : (
                      <Upload size={26} />
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {isProcessingPdf ? "Extraindo semanas do PDF com Inteligência Artificial..." : "Clique para selecionar o PDF do Cronograma de Estudos"}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                    O sistema detecta dinamicamente a quantidade de semanas, datas sugeridas e formata o bloco pronto para copiar e colar no AlgoApp.
                  </p>
                </div>

                {extractError && (
                  <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl flex items-start gap-3">
                    <AlertCircle className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={18} />
                    <div className="text-xs text-amber-800 dark:text-amber-300">
                      <p className="font-bold">Aviso na leitura do PDF:</p>
                      <p>{extractError}</p>
                      <p className="mt-1 font-semibold text-slate-600 dark:text-slate-400">
                        👉 Dica: Você pode usar a aba <strong>"Digitar Semanas"</strong> ou <strong>"Modelos Prontos"</strong> logo acima para continuar 100% sem IA e sem depender de créditos!
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Opção 2: Modelos Prontos */}
            {scheduleSource === 'modelos' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button
                  onClick={() => applyPresetTemplate('quimica_geral')}
                  className="p-5 text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:border-emerald-500 transition-all group"
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center mb-3">
                    <BookOpen size={18} />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-500">
                    Química Geral (3 Semanas)
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Modelos Atômicos, Tabela Periódica e Ligações Químicas com perguntas para o AlgoApp.
                  </p>
                </button>

                <button
                  onClick={() => applyPresetTemplate('organica')}
                  className="p-5 text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:border-emerald-500 transition-all group"
                >
                  <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 flex items-center justify-center mb-3">
                    <Sparkles size={18} />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-teal-500">
                    Química Orgânica (2 Semanas)
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Funções Oxigenadas e Nitrogenadas + Isomeria plana com cards Anki.
                  </p>
                </button>

                <button
                  onClick={() => applyPresetTemplate('enem')}
                  className="p-5 text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 hover:border-emerald-500 transition-all group"
                >
                  <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center mb-3">
                    <Award size={18} />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-amber-500">
                    Estratégia ENEM
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Passo a passo definitivo para resolver qualquer questão de cálculo estequiométrico.
                  </p>
                </button>
              </div>
            )}

            {/* Título da Campanha / Roteiro */}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Título do Roteiro de Estudos:
              </label>
              <input
                type="text"
                value={campaignTitle}
                onChange={e => setCampaignTitle(e.target.value)}
                placeholder="Ex: Roteiro de Estudos de Química - 1º Bimestre"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Lista Dinâmica de Semanas */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Mensagens Programadas ({draftWeeks.length})</span>
                </h3>

                <button
                  onClick={handleAddManualWeek}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold text-xs hover:bg-emerald-100 transition-all border border-emerald-200 dark:border-emerald-800"
                >
                  <Plus size={14} />
                  <span>Adicionar Semana</span>
                </button>
              </div>

              {draftWeeks.map((week, idx) => {
                const trackingKey = `leader-${selectedClassId}-week-${week.semana_numero}`;
                const sentDate = getMessageSentDate(trackingKey);
                const fullMsg = formatLeaderStudyMessage({
                  className: currentClass?.name || 'Turma',
                  leaderName: currentLeader.leaderName,
                  semanaNumero: week.semana_numero,
                  dataEnvio: week.data_envio,
                  horarioEnvio: week.horario_envio,
                  studyText: week.mensagem_texto
                });

                return (
                  <motion.div
                    key={idx}
                    layout
                    className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 shadow-sm space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-emerald-500 text-white font-bold text-xs flex items-center justify-center">
                          {week.semana_numero}
                        </span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          Semana {week.semana_numero}
                        </span>
                        {sentDate && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                            <CheckCheck size={12} />
                            Enviado em {new Date(sentDate).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Calendar size={14} />
                          <input
                            type="date"
                            value={week.data_envio}
                            onChange={e => {
                              const val = e.target.value;
                              setDraftWeeks(prev => prev.map((w, i) => i === idx ? { ...w, data_envio: val } : w));
                            }}
                            className="bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-2 py-1 text-xs font-semibold text-slate-900 dark:text-white"
                          />
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Clock size={14} />
                          <input
                            type="time"
                            value={week.horario_envio}
                            onChange={e => {
                              const val = e.target.value;
                              setDraftWeeks(prev => prev.map((w, i) => i === idx ? { ...w, horario_envio: val } : w));
                            }}
                            className="bg-slate-100 dark:bg-slate-800 border-none rounded-lg px-2 py-1 text-xs font-semibold text-slate-900 dark:text-white"
                          />
                        </div>

                        {draftWeeks.length > 1 && (
                          <button
                            onClick={() => setDraftWeeks(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-all"
                            title="Remover Semana"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Caixa de Texto editável */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Conteúdo do Estudo / Bloco AlgoApp:
                      </label>
                      <textarea
                        rows={5}
                        value={week.mensagem_texto}
                        onChange={e => {
                          const val = e.target.value;
                          setDraftWeeks(prev => prev.map((w, i) => i === idx ? { ...w, mensagem_texto: val } : w));
                        }}
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed"
                      />
                    </div>

                    {/* Barra de Ações Rápidas */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyToClipboard(week.mensagem_texto, `draft-raw-${idx}`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                        >
                          {copiedKey === `draft-raw-${idx}` ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                          <span>Copiar só AlgoApp</span>
                        </button>

                        <button
                          onClick={() => setPreviewModal({
                            isOpen: true,
                            title: `Visualização - Semana ${week.semana_numero}`,
                            recipientName: currentLeader.leaderName || 'Líder da Turma',
                            recipientPhone: currentLeader.leaderPhone,
                            messageText: fullMsg,
                            trackingKey
                          })}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                        >
                          <Eye size={14} />
                          <span>Ver Mensagem Formatada</span>
                        </button>
                      </div>

                      {/* Botão de Envio Direto ao WhatsApp do Líder */}
                      <button
                        onClick={() => {
                          if (!currentLeader.leaderPhone) {
                            if (currentClass) {
                              setEditLeaderModal({
                                isOpen: true,
                                classId: currentClass.id,
                                className: currentClass.name,
                                leaderName: currentLeader.leaderName,
                                leaderPhone: ''
                              });
                            }
                            return;
                          }
                          handleSendWhatsApp(currentLeader.leaderPhone, fullMsg, trackingKey);
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm hover:shadow transition-all"
                      >
                        <Send size={14} />
                        <span>
                          {currentLeader.leaderPhone ? `Enviar para o Líder (${currentLeader.leaderName || 'Líder'})` : 'Cadastrar Tel. do Líder & Enviar'}
                        </span>
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Ação de Salvar no Banco / Cronograma */}
            <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={handleSaveDraftToSchedule}
                disabled={isSavingSchedule}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold text-xs hover:opacity-90 transition-all shadow-sm disabled:opacity-50"
              >
                {isSavingSchedule ? <RefreshCw className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                <span>Salvar Cronograma na Aplicação</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 2: BOLETINS & COMUNICADOS PARA PAIS / RESPONSÁVEIS */}
      {/* ========================================================================= */}
      {activeTab === 'boletins' && (
        <div className="space-y-6">
          {/* Barra de Filtros e Seleção */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                {/* Seletor de Turma */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Turma:
                  </label>
                  <select
                    value={selectedClassId}
                    onChange={e => setSelectedClassId(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {classes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Seletor de Unidade */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Período / Unidade:
                  </label>
                  <select
                    value={selectedUnit}
                    onChange={e => setSelectedUnit(Number(e.target.value))}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value={1}>1ª Unidade</option>
                    <option value={2}>2ª Unidade</option>
                    <option value={3}>3ª Unidade</option>
                    <option value={4}>4ª Unidade</option>
                  </select>
                </div>

                {/* Modelo de Mensagem */}
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Tipo de Comunicado:
                  </label>
                  <select
                    value={reportTemplate}
                    onChange={e => setReportTemplate(e.target.value as any)}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="completo">Boletim Completo de Notas</option>
                    <option value="alerta">Alerta de Desempenho / Recuperação</option>
                    <option value="parabens">Felicitações por Alto Desempenho</option>
                    <option value="custom">Aviso Personalizado do Professor</option>
                  </select>
                </div>
              </div>

              <div className="text-right">
                <span className="text-xs font-semibold text-slate-400 block">Total de Alunos</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white">
                  {students.length} matriculados
                </span>
              </div>
            </div>

            {/* Recado Personalizado Opcional */}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Recado Adicional do Professor (Anexado a todos os boletins):
              </label>
              <input
                type="text"
                value={customTeacherNote}
                onChange={e => setCustomTeacherNote(e.target.value)}
                placeholder="Ex: Lembrando que o prazo final para entrega dos cadernos da 2ª chamada é sexta-feira."
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Lista de Alunos e Envio Individual */}
          {isLoadingStudents ? (
            <div className="p-12 text-center text-slate-400">
              <RefreshCw className="animate-spin mx-auto mb-2" size={24} />
              <p className="text-xs">Carregando alunos e notas da turma...</p>
            </div>
          ) : students.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-800">
              <Users className="mx-auto text-slate-300 dark:text-slate-700 mb-3" size={40} />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Nenhum aluno cadastrado nesta turma</h3>
              <p className="text-xs text-slate-400 mt-1">Acesse o menu "Turmas" para matricular alunos ou importar a lista.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {students.map(student => {
                const gradeData = getStudentGradeForUnit(student.id, selectedUnit);
                const avg = gradeData?.unit_average ?? null;
                const phone = studentPhones[student.id] || '';
                const trackingKey = `bulletin-${student.id}-u${selectedUnit}`;
                const sentDate = getMessageSentDate(trackingKey);

                // Montar texto do boletim
                const studentMsg = formatStudentReportMessage({
                  studentName: student.name,
                  className: currentClass?.name || 'Turma',
                  periodName: `${selectedUnit}ª Unidade`,
                  guardianName: student.guardian_name,
                  grades: gradeData ? {
                    notebookScore: gradeData.notebook_score,
                    ankiScore: gradeData.anki_score,
                    listsAverage: ((Number(gradeData.list1_score) || 0) + (Number(gradeData.list2_score) || 0) + (Number(gradeData.list3_score) || 0)) / 3,
                    examScore: gradeData.exam_score,
                    recoveryScore: gradeData.recovery_score,
                    unitAverage: gradeData.unit_average
                  } : undefined,
                  customNote: customTeacherNote
                });

                return (
                  <div
                    key={student.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all hover:border-slate-300 dark:hover:border-slate-700"
                  >
                    {/* Aluno & Média */}
                    <div className="flex items-center gap-3.5 min-w-[240px]">
                      <span className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs flex items-center justify-center shrink-0">
                        {student.roll_number || '•'}
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          {student.name}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          {avg !== null ? (
                            <span className={cn(
                              "text-xs font-bold px-2 py-0.5 rounded-lg",
                              avg >= 6.0 
                                ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400" 
                                : "bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400"
                            )}>
                              Média: {avg.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">Sem nota lançada</span>
                          )}

                          {sentDate && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCheck size={13} />
                              Enviado
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Campo de Telefone do Responsável com salvamento rápido */}
                    <div className="flex items-center gap-2 w-full md:w-auto">
                      <div className="relative flex-1 md:w-56">
                        <Phone className="absolute left-3 top-2.5 text-slate-400" size={14} />
                        <input
                          type="text"
                          value={phone}
                          placeholder="WhatsApp do Responsável"
                          onChange={e => {
                            const val = e.target.value;
                            setStudentPhones(prev => ({ ...prev, [student.id]: val }));
                          }}
                          onBlur={e => handleSaveGuardianPhone(student.id, e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                      {savingPhoneId === student.id && (
                        <RefreshCw className="animate-spin text-emerald-500" size={14} />
                      )}
                    </div>

                    {/* Ações de Envio */}
                    <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                      <button
                        onClick={() => copyToClipboard(studentMsg, `bulletin-${student.id}`)}
                        className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                        title="Copiar Mensagem"
                      >
                        {copiedKey === `bulletin-${student.id}` ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                      </button>

                      <button
                        onClick={() => setPreviewModal({
                          isOpen: true,
                          title: `Boletim - ${student.name}`,
                          recipientName: student.name,
                          recipientPhone: phone,
                          messageText: studentMsg,
                          trackingKey
                        })}
                        className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                        title="Visualizar Boletim Formatado"
                      >
                        <Eye size={16} />
                      </button>

                      <button
                        onClick={() => handleSendWhatsApp(phone, studentMsg, trackingKey)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm hover:shadow transition-all"
                      >
                        <Send size={13} />
                        <span>Enviar Boletim</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ABA 3: GESTÃO RÁPIDA DOS LÍDERES DE SALA */}
      {/* ========================================================================= */}
      {activeTab === 'gestao_lideres' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users size={20} className="text-emerald-500" />
                Quadro de Líderes das Turmas
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Defina o nome e o WhatsApp do líder de cada sala para que o envio dos estudos seja automático em 1 clique.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {classes.map(c => {
              const leader = getClassLeader(c.id, {
                leader_name: c.leader_name,
                leader_phone: c.leader_phone
              });

              return (
                <div
                  key={c.id}
                  className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850 flex flex-col justify-between gap-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-sm">
                        {c.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          {c.name}
                        </h4>
                        <span className="text-xs text-slate-400">Ano Letivo: {c.school_year}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => setEditLeaderModal({
                        isOpen: true,
                        classId: c.id,
                        className: c.name,
                        leaderName: leader.leaderName,
                        leaderPhone: leader.leaderPhone
                      })}
                      className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-emerald-600 transition-all"
                      title="Editar Líder"
                    >
                      <Edit3 size={15} />
                    </button>
                  </div>

                  <div className="bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700 text-xs space-y-1">
                    <p className="text-slate-400 font-semibold">Líder Representante:</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {leader.leaderName || <span className="text-amber-500 font-normal italic">Não cadastrado</span>}
                    </p>
                    {leader.leaderPhone ? (
                      <p className="text-emerald-600 dark:text-emerald-400 font-medium">
                        📱 {formatPhoneDisplay(leader.leaderPhone)}
                      </p>
                    ) : (
                      <p className="text-slate-400 italic">Sem número de WhatsApp</p>
                    )}
                  </div>

                  {leader.leaderPhone && (
                    <button
                      onClick={() => {
                        const testMsg = `Olá, *${leader.leaderName || 'Líder'}*! 👋 Aqui é o Professor de Química. Estou testando nosso canal oficial de comunicação para envio dos cronogramas e conteúdos do AlgoApp para a turma ${c.name}.`;
                        handleSendWhatsApp(leader.leaderPhone, testMsg);
                      }}
                      className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-950/40 text-slate-700 hover:text-emerald-700 dark:text-slate-300 dark:hover:text-emerald-400 font-bold text-xs transition-all flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700"
                    >
                      <Send size={13} />
                      <span>Testar Conversa no WhatsApp</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PREVIEW DE MENSAGEM COM ENVIO */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {previewModal?.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {previewModal.title}
                </h3>
                <button
                  onClick={() => setPreviewModal(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="bg-emerald-50/50 dark:bg-emerald-950/20 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/50 text-xs">
                <p className="font-bold text-emerald-800 dark:text-emerald-300">
                  Destinatário: {previewModal.recipientName}
                </p>
                <p className="text-slate-500 dark:text-slate-400">
                  WhatsApp: {previewModal.recipientPhone ? formatPhoneDisplay(previewModal.recipientPhone) : 'Não informado'}
                </p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Texto Exato a ser Enviado:
                </label>
                <textarea
                  readOnly
                  rows={10}
                  value={previewModal.messageText}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 text-xs font-mono text-slate-800 dark:text-slate-200 leading-relaxed focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  onClick={() => copyToClipboard(previewModal.messageText, 'preview-copy')}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-200 transition-all"
                >
                  {copiedKey === 'preview-copy' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  <span>Copiar Texto</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewModal(null)}
                    className="px-4 py-2.5 rounded-xl text-slate-500 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                  >
                    Fechar
                  </button>

                  <button
                    onClick={() => {
                      handleSendWhatsApp(previewModal.recipientPhone, previewModal.messageText, previewModal.trackingKey);
                      setPreviewModal(null);
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all"
                  >
                    <Send size={14} />
                    <span>Abrir no WhatsApp</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL: EDITAR LÍDER DA TURMA */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {editLeaderModal?.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Líder da Turma: {editLeaderModal.className}
                </h3>
                <button
                  onClick={() => setEditLeaderModal(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Nome Completo do Líder:
                  </label>
                  <input
                    type="text"
                    value={editLeaderModal.leaderName}
                    onChange={e => setEditLeaderModal({ ...editLeaderModal, leaderName: e.target.value })}
                    placeholder="Ex: Lucas Silva"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    WhatsApp com DDD (Somente números ou formatado):
                  </label>
                  <input
                    type="text"
                    value={editLeaderModal.leaderPhone}
                    onChange={e => setEditLeaderModal({ ...editLeaderModal, leaderPhone: e.target.value })}
                    placeholder="Ex: (11) 98765-4321"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Exemplo: 11 98765-4321. O código de país (55) é adicionado automaticamente.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setEditLeaderModal(null)}
                  className="px-4 py-2 rounded-xl text-slate-500 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveLeader}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all"
                >
                  Salvar Líder
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL GENÉRICO DE FEEDBACK */}
      <CustomModal
        isOpen={modal.isOpen}
        onClose={() => setModal({ ...modal, isOpen: false })}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={modal.onConfirm}
      />
    </div>
  );
}
