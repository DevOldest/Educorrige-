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
  Radio, 
  Code, 
  X,
  ExternalLink,
  ChevronRight,
  Filter,
  CheckCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { 
  WeeklyStudyMessage, 
  WeeklyMessageStatus, 
  ExtractedCampaign 
} from '../types';
import { 
  extractStudyScheduleFromPdf, 
  fetchWeeklyStudyMessages, 
  saveWeeklyStudyMessages, 
  updateWeeklyStudyMessage, 
  deleteWeeklyStudyMessage, 
  dispatchWhatsAppMessage,
  getSavedWhatsAppConfig,
  saveWhatsAppConfig,
  WhatsAppConfig,
  SQL_SCHEMA_SNIPPET 
} from '../lib/whatsappService';

export default function WhatsappAutomationView() {
  // Configurações do WhatsApp / Evolution API
  const [config, setConfig] = useState<WhatsAppConfig>(getSavedWhatsAppConfig());
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Estados de Upload & Extração com IA
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rascunho extraído dinamicamente da IA
  const [draftCampaignTitle, setDraftCampaignTitle] = useState<string>('');
  const [draftMessages, setDraftMessages] = useState<Array<Omit<WeeklyStudyMessage, 'id' | 'created_at'>>>([]);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Mensagens salvas no Cronograma (Supabase / Local)
  const [savedMessages, setSavedMessages] = useState<WeeklyStudyMessage[]>([]);
  const [storageSource, setStorageSource] = useState<'supabase' | 'local'>('local');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'todos' | WeeklyMessageStatus>('todos');

  // Controle de disparos individuais
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ id: string; success: boolean; text: string } | null>(null);

  // Carregar dados ao montar
  useEffect(() => {
    loadSavedMessages();
  }, []);

  async function loadSavedMessages() {
    setIsLoadingMessages(true);
    try {
      const res = await fetchWeeklyStudyMessages();
      setSavedMessages(res.data);
      setStorageSource(res.source);
    } catch (e) {
      console.error('Erro ao carregar mensagens:', e);
    } finally {
      setIsLoadingMessages(false);
    }
  }

  // Manipulação de Upload do PDF
  const handlePdfFile = async (file: File) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      setExtractError('Por favor, selecione um arquivo em formato PDF.');
      return;
    }

    setExtractError(null);
    setIsProcessingPdf(true);

    try {
      const result: ExtractedCampaign = await extractStudyScheduleFromPdf(file);
      setDraftCampaignTitle(result.campaign_title || file.name.replace('.pdf', ''));
      setDraftMessages(
        result.messages.map(m => ({
          semana_numero: m.semana_numero,
          data_envio: m.data_envio,
          horario_envio: m.horario_envio,
          mensagem_texto: m.mensagem_texto,
          status: 'agendado'
        }))
      );
    } catch (err: any) {
      console.error(err);
      setExtractError(err.message || 'Erro ao processar PDF com a IA.');
    } finally {
      setIsProcessingPdf(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handlePdfFile(e.dataTransfer.files[0]);
    }
  };

  // Edição dinâmica no Rascunho
  const updateDraftItem = (index: number, field: keyof (typeof draftMessages)[0], value: any) => {
    setDraftMessages(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const removeDraftItem = (index: number) => {
    setDraftMessages(prev => prev.filter((_, idx) => idx !== index));
  };

  const addManualDraftItem = () => {
    const nextWeek = draftMessages.length + 1;
    const lastDate = draftMessages[draftMessages.length - 1]?.data_envio;
    let nextDateStr = new Date().toISOString().split('T')[0];
    if (lastDate) {
      const d = new Date(lastDate);
      d.setDate(d.getDate() + 7);
      nextDateStr = d.toISOString().split('T')[0];
    }

    setDraftMessages(prev => [
      ...prev,
      {
        semana_numero: nextWeek,
        data_envio: nextDateStr,
        horario_envio: '08:00',
        mensagem_texto: `📚 *REVISÃO SEMANA ${nextWeek}* 🧪\n\n[Copie e cole este conteúdo diretamente no AlgoApp]\n- Tópico:\n- Resolução:`,
        status: 'agendado'
      }
    ]);
  };

  // Salvar Cronograma no Banco
  const handleSaveSchedule = async () => {
    if (draftMessages.length === 0) return;
    setIsSavingSchedule(true);
    try {
      const title = draftCampaignTitle.trim() || 'Cronograma de Estudos - WhatsApp';
      await saveWeeklyStudyMessages(draftMessages, title, config.groupJid);
      
      // Limpa rascunho e recarrega
      setDraftMessages([]);
      setDraftCampaignTitle('');
      await loadSavedMessages();
    } catch (e: any) {
      alert(`Falha ao salvar cronograma: ${e.message}`);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  // Disparo manual/teste
  const handleDispatchTest = async (message: WeeklyStudyMessage) => {
    setDispatchingId(message.id);
    setActionFeedback(null);
    try {
      const result = await dispatchWhatsAppMessage(message, config);
      if (result.success) {
        setActionFeedback({
          id: message.id,
          success: true,
          text: config.simulateDispatch 
            ? 'Disparo simulado com sucesso! Status atualizado para "Enviado".' 
            : `Enviado com sucesso via Evolution API! (ID: ${result.messageId})`
        });
        await loadSavedMessages();
      } else {
        setActionFeedback({
          id: message.id,
          success: false,
          text: result.error || 'Falha no disparo da mensagem.'
        });
        await loadSavedMessages();
      }
    } catch (e: any) {
      setActionFeedback({
        id: message.id,
        success: false,
        text: e.message || 'Erro inesperado no envio.'
      });
    } finally {
      setDispatchingId(null);
    }
  };

  // Deletar item do cronograma
  const handleDeleteSaved = async (id: string) => {
    if (confirm('Tem certeza que deseja remover esta mensagem agendada?')) {
      await deleteWeeklyStudyMessage(id);
      await loadSavedMessages();
    }
  };

  // Copiar texto para colar no AlgoApp / WhatsApp
  const handleCopyText = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SQL_SCHEMA_SNIPPET);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  // Salvar configurações
  const handleSaveConfig = () => {
    saveWhatsAppConfig(config);
    setIsConfigModalOpen(false);
  };

  // Filtragem
  const filteredMessages = savedMessages.filter(m => {
    if (statusFilter === 'todos') return true;
    return m.status === statusFilter;
  });

  return (
    <div className="space-y-8 pb-16">
      {/* Cabeçalho Superior */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shadow-sm">
              <MessageSquare size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-serif font-bold text-slate-800 dark:text-white flex items-center gap-2">
                Automação de Estudos • WhatsApp
                <span className="text-xs font-sans px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold uppercase tracking-wider">
                  Admin
                </span>
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Extração inteligente de PDFs de estudo via Gemini e agendamento de mensagens para o AlgoApp.
              </p>
            </div>
          </div>
        </div>

        {/* Botões de Ação Global / Configuração */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsSqlModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all border border-slate-300/60 dark:border-slate-700"
            title="Ver SQL para criar tabela no Supabase"
          >
            <Code size={16} />
            <span>SQL Supabase</span>
          </button>

          <button
            onClick={() => setIsConfigModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-brand-blue-dark dark:text-brand-yellow text-xs font-bold transition-all border border-slate-200 dark:border-slate-700 shadow-sm"
          >
            <Settings size={16} />
            <span>Configurar Grupo & API</span>
          </button>
        </div>
      </div>

      {/* Barra de Status do Grupo dos Líderes */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
          <div className="text-xs">
            <span className="text-slate-400">Destino Configurado:</span>{' '}
            <strong className="text-slate-700 dark:text-slate-200 font-mono">
              {config.groupJid || 'Nenhum grupo configurado'}
            </strong>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Modo de Disparo:</span>
          {config.simulateDispatch ? (
            <span className="px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40 font-medium">
              Simulado / Teste Seguro
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40 font-medium flex items-center gap-1.5">
              <Radio size={12} className="animate-pulse" />
              Evolution API Ativa
            </span>
          )}
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="text-slate-400">Armazenamento:</span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            {storageSource === 'supabase' ? 'Supabase DB' : 'Cache Local (Offline)'}
          </span>
        </div>
      </div>

      {/* ÁREA 1: Drag & Drop para Upload de PDF */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
        <div className="max-w-2xl mx-auto text-center space-y-4">
          <div className="inline-flex p-3 rounded-2xl bg-brand-yellow/20 text-brand-blue-dark dark:text-brand-yellow">
            <Sparkles size={28} />
          </div>
          <h2 className="text-xl font-bold font-serif text-slate-800 dark:text-white">
            Upload de Cronograma em PDF
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            O Gemini lerá dinamicamente qualquer quantidade de semanas (2, 3, 5 ou mais semanas) e extrairá os textos prontos para o WhatsApp e AlgoApp.
          </p>

          <input
            type="file"
            ref={fileInputRef}
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handlePdfFile(e.target.files[0]);
              }
            }}
          />

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isProcessingPdf && fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-3xl p-8 sm:p-12 transition-all cursor-pointer flex flex-col items-center justify-center gap-3",
              isDragging
                ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 scale-[0.99]"
                : "border-slate-300 dark:border-slate-700 hover:border-brand-yellow bg-slate-50/50 dark:bg-slate-850/40 hover:bg-slate-50 dark:hover:bg-slate-800/60",
              isProcessingPdf && "pointer-events-none opacity-80"
            )}
          >
            {isProcessingPdf ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <RefreshCw size={36} className="animate-spin text-emerald-600 dark:text-emerald-400" />
                <div className="space-y-1">
                  <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
                    Analisando PDF com Gemini...
                  </p>
                  <p className="text-xs text-slate-400">
                    Detectando datas, tópicos e estruturando mensagens de repetição espaçada.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 shadow-inner">
                  <Upload size={24} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Arraste o PDF aqui ou <span className="text-emerald-600 dark:text-emerald-400 underline">clique para selecionar</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    Suporta qualquer documento PDF com cronograma semanal de Química
                  </p>
                </div>
              </>
            )}
          </div>

          {extractError && (
            <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 text-xs text-left">
              <AlertCircle size={18} className="shrink-0" />
              <span>{extractError}</span>
            </div>
          )}
        </div>
      </div>

      {/* ÁREA 2: Painel Rascunho Dinâmico (Renderizado via .map) */}
      <AnimatePresence>
        {draftMessages.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white dark:bg-slate-900 rounded-3xl border-2 border-emerald-500/30 dark:border-emerald-500/20 p-6 sm:p-8 shadow-xl space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <h3 className="text-lg font-serif font-bold text-slate-800 dark:text-white">
                    Rascunho Extraído ({draftMessages.length} Semanas Identificadas)
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Revise ou edite datas, horários e textos das mensagens antes de gravar o agendamento definitivo.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addManualDraftItem}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all"
                >
                  <Plus size={15} />
                  <span>Adicionar Semana</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDraftMessages([])}
                  className="px-3 py-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-medium transition-all"
                >
                  Descartar
                </button>

                <button
                  type="button"
                  onClick={handleSaveSchedule}
                  disabled={isSavingSchedule}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50"
                >
                  {isSavingSchedule ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <CheckCheck size={16} />
                      <span>Salvar Cronograma</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Campo do Título da Campanha */}
            <div className="bg-slate-50 dark:bg-slate-850 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">
                Título do Cronograma:
              </label>
              <input
                type="text"
                value={draftCampaignTitle}
                onChange={(e) => setDraftCampaignTitle(e.target.value)}
                placeholder="Ex: Cronograma 3º Ano - 1º Bimestre"
                className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-1.5 text-xs text-slate-800 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Lista Dinâmica de Semanas via .map */}
            <div className="space-y-4">
              {draftMessages.map((item, index) => (
                <div
                  key={index}
                  className="p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-850/60 border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/40 transition-all space-y-4"
                >
                  {/* Linha Superior: Semana, Data, Horário e Ações */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold text-xs border border-emerald-500/20">
                        <span>Semana</span>
                        <input
                          type="number"
                          value={item.semana_numero}
                          onChange={(e) => updateDraftItem(index, 'semana_numero', parseInt(e.target.value) || (index + 1))}
                          className="w-10 bg-transparent text-center font-bold focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                        <Calendar size={14} className="text-slate-400" />
                        <input
                          type="date"
                          value={item.data_envio}
                          onChange={(e) => updateDraftItem(index, 'data_envio', e.target.value)}
                          className="bg-transparent text-slate-700 dark:text-slate-200 focus:outline-none font-medium"
                        />
                      </div>

                      <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                        <Clock size={14} className="text-slate-400" />
                        <input
                          type="time"
                          value={item.horario_envio}
                          onChange={(e) => updateDraftItem(index, 'horario_envio', e.target.value)}
                          className="bg-transparent text-slate-700 dark:text-slate-200 focus:outline-none font-medium"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyText(item.mensagem_texto, index)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 text-xs transition-colors"
                        title="Copiar texto para colar no AlgoApp / WhatsApp"
                      >
                        {copiedIndex === index ? (
                          <>
                            <Check size={13} className="text-emerald-500" />
                            <span className="text-emerald-600 font-semibold">Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy size={13} />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => removeDraftItem(index)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        title="Remover esta mensagem do rascunho"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Textarea da Mensagem para o WhatsApp/AlgoApp */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                      <span>Texto bruto para envio (WhatsApp & AlgoApp):</span>
                      <span>{item.mensagem_texto.length} caracteres</span>
                    </div>
                    <textarea
                      rows={4}
                      value={item.mensagem_texto}
                      onChange={(e) => updateDraftItem(index, 'mensagem_texto', e.target.value)}
                      placeholder="Texto da mensagem..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 leading-relaxed resize-y"
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ÁREA 3: Cronograma Salvo no Supabase / Fila de Agendamento */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <Calendar size={20} className="text-brand-yellow" />
              <h2 className="text-lg font-serif font-bold text-slate-800 dark:text-white">
                Fila de Agendamentos & Cronograma Salvo
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Mensagens gravadas no banco de dados prontas para envio automático ou disparo manual de teste.
            </p>
          </div>

          {/* Filtros de Status */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-medium">
            <button
              onClick={() => setStatusFilter('todos')}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-all",
                statusFilter === 'todos'
                  ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-xs font-bold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
              )}
            >
              Todos ({savedMessages.length})
            </button>
            <button
              onClick={() => setStatusFilter('agendado')}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-all",
                statusFilter === 'agendado'
                  ? "bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 shadow-xs font-bold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
              )}
            >
              Agendados ({savedMessages.filter(m => m.status === 'agendado').length})
            </button>
            <button
              onClick={() => setStatusFilter('enviado')}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-all",
                statusFilter === 'enviado'
                  ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 shadow-xs font-bold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
              )}
            >
              Enviados ({savedMessages.filter(m => m.status === 'enviado').length})
            </button>
            <button
              onClick={() => setStatusFilter('falha')}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-all",
                statusFilter === 'falha'
                  ? "bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 shadow-xs font-bold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
              )}
            >
              Falhas ({savedMessages.filter(m => m.status === 'falha').length})
            </button>
          </div>
        </div>

        {/* Feedback de Ação */}
        {actionFeedback && (
          <div
            className={cn(
              "p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 animate-in fade-in duration-200",
              actionFeedback.success
                ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300"
                : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-300"
            )}
          >
            <div className="flex items-center gap-2">
              {actionFeedback.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{actionFeedback.text}</span>
            </div>
            <button
              onClick={() => setActionFeedback(null)}
              className="p-1 hover:opacity-70 transition-opacity"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Lista de Mensagens Gravadas */}
        {isLoadingMessages ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
            <RefreshCw size={28} className="animate-spin text-brand-blue" />
            <p className="text-xs">Carregando mensagens agendadas...</p>
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="py-14 text-center space-y-2 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl">
            <FileText size={32} className="mx-auto text-slate-300 dark:text-slate-700" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
              Nenhuma mensagem encontrada neste filtro
            </p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Faça upload de um PDF com o cronograma acima para extrair e agendar os disparos semanais.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredMessages.map((msg, index) => {
              const isDispatching = dispatchingId === msg.id;

              return (
                <div
                  key={msg.id}
                  className="p-5 rounded-2xl bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-800 hover:shadow-md transition-all space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-brand-yellow/20 text-brand-blue-dark dark:text-brand-yellow font-bold text-xs flex items-center justify-center shadow-xs">
                        S{msg.semana_numero}
                      </span>

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800 dark:text-white">
                            Semana {msg.semana_numero}
                          </span>
                          {msg.campaign_title && (
                            <span className="text-[11px] text-slate-400 truncate max-w-xs">
                              • {msg.campaign_title}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1">
                            <Calendar size={13} className="text-slate-400" />
                            {msg.data_envio}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={13} className="text-slate-400" />
                            {msg.horario_envio}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status Badge & Ações */}
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5",
                          msg.status === 'enviado' && "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
                          msg.status === 'agendado' && "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
                          msg.status === 'falha' && "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
                          msg.status === 'rascunho' && "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        )}
                      >
                        {msg.status === 'enviado' && <CheckCircle2 size={12} />}
                        {msg.status === 'falha' && <AlertCircle size={12} />}
                        {msg.status === 'agendado' && <Clock size={12} />}
                        {msg.status}
                      </span>

                      {/* Botão Disparar Agora (Teste) */}
                      <button
                        type="button"
                        onClick={() => handleDispatchTest(msg)}
                        disabled={isDispatching}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-50"
                        title="Disparar esta mensagem agora no grupo para teste"
                      >
                        {isDispatching ? (
                          <RefreshCw size={13} className="animate-spin" />
                        ) : (
                          <Send size={13} />
                        )}
                        <span>Disparar Agora (Teste)</span>
                      </button>

                      {/* Botão Copiar */}
                      <button
                        type="button"
                        onClick={() => handleCopyText(msg.mensagem_texto, index + 1000)}
                        className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Copiar texto para colar no AlgoApp / WhatsApp"
                      >
                        <Copy size={15} />
                      </button>

                      {/* Botão Excluir */}
                      <button
                        type="button"
                        onClick={() => handleDeleteSaved(msg.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        title="Excluir mensagem agendada"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Prévia da Mensagem */}
                  <div className="bg-slate-50 dark:bg-slate-900/70 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
                    {msg.mensagem_texto}
                  </div>

                  {msg.last_error && (
                    <div className="text-[11px] text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/20 p-2 rounded-lg flex items-center gap-1.5">
                      <AlertCircle size={13} className="shrink-0" />
                      <span>Último erro: {msg.last_error}</span>
                    </div>
                  )}

                  {msg.sent_at && (
                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      <CheckCircle2 size={13} className="text-emerald-500" />
                      <span>Enviado em {new Date(msg.sent_at).toLocaleString('pt-BR')}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: Configurações do WhatsApp (Grupo dos Líderes & Gateway) */}
      <AnimatePresence>
        {isConfigModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Settings size={20} />
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-slate-800 dark:text-white text-base">
                      Configurações do WhatsApp
                    </h3>
                    <p className="text-xs text-slate-400">
                      Grupo dos líderes e conexão com a Evolution API / Baileys
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsConfigModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 text-xs">
                {/* JID do Grupo dos Líderes */}
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>ID do Grupo dos Líderes (Group JID):</span>
                    <span className="text-[10px] text-slate-400 font-normal">Ex: 120363028391823912@g.us</span>
                  </label>
                  <input
                    type="text"
                    value={config.groupJid}
                    onChange={(e) => setConfig({ ...config, groupJid: e.target.value })}
                    placeholder="120363028391823912@g.us"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-[11px] text-slate-400">
                    Todas as mensagens do cronograma serão enviadas unicamente para este grupo.
                  </p>
                </div>

                {/* Modo de Simulação */}
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-700 dark:text-slate-200">
                      Modo Simulado / Teste Seguro
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Simula o disparo com sucesso sem chamar um gateway real (ideal para testar o fluxo).
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.simulateDispatch}
                    onChange={(e) => setConfig({ ...config, simulateDispatch: e.target.checked })}
                    className="w-5 h-5 rounded-md accent-emerald-600 cursor-pointer"
                  />
                </div>

                {/* Evolution API Gateway (Opcional se não simulado) */}
                <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <p className="font-bold text-slate-700 dark:text-slate-200">
                    Dados da Evolution API (Disparo Real):
                  </p>

                  <div className="space-y-1">
                    <label className="text-slate-500 font-medium">URL do Servidor Evolution API:</label>
                    <input
                      type="text"
                      value={config.serverUrl || ''}
                      onChange={(e) => setConfig({ ...config, serverUrl: e.target.value })}
                      placeholder="https://api.seuservidor.com"
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-slate-500 font-medium">Nome da Instância:</label>
                      <input
                        type="text"
                        value={config.instanceName || ''}
                        onChange={(e) => setConfig({ ...config, instanceName: e.target.value })}
                        placeholder="lideres-sala"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-slate-500 font-medium">API Key (Token):</label>
                      <input
                        type="password"
                        value={config.apiKey || ''}
                        onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                        placeholder="••••••••••••"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={() => setIsConfigModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20"
                >
                  Salvar Configurações
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Script SQL do Supabase */}
      <AnimatePresence>
        {isSqlModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                    <Code size={20} />
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-slate-800 dark:text-white text-base">
                      Script SQL • Supabase
                    </h3>
                    <p className="text-xs text-slate-400">
                      Comando para criar a tabela weekly_study_messages no Supabase SQL Editor
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSqlModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="relative">
                <pre className="bg-slate-950 text-emerald-400 p-4 rounded-2xl text-xs font-mono overflow-x-auto leading-relaxed max-h-72 border border-slate-800">
                  {SQL_SCHEMA_SNIPPET}
                </pre>

                <button
                  type="button"
                  onClick={handleCopySql}
                  className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-all border border-slate-700"
                >
                  {copiedSql ? (
                    <>
                      <Check size={14} className="text-emerald-400" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>Copiar SQL</span>
                    </>
                  )}
                </button>
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <p>
                  💡 <strong>Nota:</strong> Mesmo se você ainda não executar este script, a aplicação já grava e funciona com persistência automática no navegador.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsSqlModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-bold text-xs"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
