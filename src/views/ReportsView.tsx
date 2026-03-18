import React, { useState, useEffect } from 'react';
import { Search, Filter, FileText, Download, User, Calendar, ChevronRight, BarChart3, Users, CheckCircle2, Trash2, Loader2, Printer } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ReportsView() {
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  
  const [filters, setFilters] = useState({
    search: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    if (!supabase) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const { data } = await supabase
      .from('assessment_results')
      .select('*, students(name, classes(name)), assessments(title, type)')
      .order('created_at', { ascending: false });

    if (data) setResults(data);
    setIsLoading(false);
  }

  const filteredResults = results.filter(r => {
    if (!filters.search) return true;
    const searchLower = filters.search.toLowerCase();
    return r.students?.name?.toLowerCase().includes(searchLower);
  });

  const handleClearFilters = () => {
    setFilters({ search: '' });
  };

  const exportToPDF = (result: any) => {
    if (!result) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFontSize(20);
    doc.setTextColor(10, 37, 64); // brand-blue-dark
    doc.text('Relatório de Correção', pageWidth / 2, 20, { align: 'center' });

    // Student Info
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Aluno: ${result.students?.name}`, 20, 35);
    doc.text(`Turma: ${result.students?.classes?.name}`, 20, 42);
    doc.text(`Atividade: ${result.assessments?.title}`, 20, 49);
    doc.text(`Data: ${new Date(result.created_at).toLocaleDateString()}`, 20, 56);

    // Score
    doc.setFontSize(16);
    doc.setTextColor(10, 37, 64);
    doc.text(`Nota: ${result.total_score} / ${result.max_score} (${Math.round(result.percentage)}%)`, pageWidth - 20, 45, { align: 'right' });

    // Overall Feedback
    if (result.overall_feedback) {
      doc.setFontSize(12);
      doc.setTextColor(10, 37, 64);
      doc.text('Feedback Geral:', 20, 70);
      doc.setFontSize(10);
      doc.setTextColor(80);
      const splitFeedback = doc.splitTextToSize(result.overall_feedback, pageWidth - 40);
      doc.text(splitFeedback, 20, 77);
    }

    // Table of corrections
    const tableData = result.corrections.map((corr: any) => [
      corr.questions?.question_number,
      corr.questions?.question_type,
      corr.answer_text || 'Sem resposta',
      corr.ai_corrections?.[0]?.correction_feedback || '',
      `${corr.score} / ${corr.questions?.max_score}`
    ]);

    autoTable(doc, {
      startY: result.overall_feedback ? 100 : 70,
      head: [['Nº', 'Tipo', 'Resposta do Aluno', 'Feedback da IA', 'Pontos']],
      body: tableData,
      headStyles: { fillColor: [10, 37, 64] },
      styles: { fontSize: 8 },
      columnStyles: {
        2: { cellWidth: 40 },
        3: { cellWidth: 60 }
      }
    });

    doc.save(`Relatorio_${result.students?.name}_${result.assessments?.title}.pdf`);
  };

  const fetchResultDetails = async (result: any) => {
    if (!supabase) return;
    setIsFetchingDetails(true);
    try {
      const { data: corrections } = await supabase
        .from('student_answers')
        .select('*, questions(*), ai_corrections(*)')
        .eq('student_id', result.student_id)
        .eq('assessment_id', result.assessment_id);
      
      setSelectedResult({ ...result, corrections });
    } catch (error) {
      console.error('Error fetching result details:', error);
    } finally {
      setIsFetchingDetails(false);
    }
  };

  const handleDeleteResult = async (result: any) => {
    if (!supabase) return;
    if (!confirm(`Deseja realmente excluir a correção de ${result.students?.name}? Esta ação não pode ser desfeita.`)) return;

    setIsDeleting(result.id);
    try {
      // 1. Delete AI Corrections and student_answers
      const { data: answers } = await supabase
        .from('student_answers')
        .select('id')
        .eq('assessment_id', result.assessment_id)
        .eq('student_id', result.student_id);
      
      const answerIds = answers?.map(a => a.id) || [];
      if (answerIds.length > 0) {
        await supabase.from('ai_corrections').delete().in('student_answer_id', answerIds);
      }

      await supabase.from('student_answers').delete().eq('assessment_id', result.assessment_id).eq('student_id', result.student_id);
      
      // 2. Delete assessment_result
      await supabase.from('assessment_results').delete().eq('id', result.id);

      // 3. Update grade in Management
      const { data: assessment } = await supabase.from('assessments').select('type, unit_id').eq('id', result.assessment_id).single();
      
      if (assessment) {
        const { data: grade } = await supabase
          .from('grades')
          .select('*')
          .eq('student_id', result.student_id)
          .eq('unit_id', assessment.unit_id)
          .maybeSingle();

        if (grade) {
          const fieldToUpdate = 
            assessment.type === 'prova' ? 'exam_score' : 
            assessment.type === 'lista2' ? 'list2_score' : 
            assessment.type === 'lista3' ? 'list3_score' : 
            'list1_score';
            
          const updatedGrade = { ...grade, [fieldToUpdate]: 0 };
          
          // Recalculate average
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

          await supabase.from('grades').update({ [fieldToUpdate]: 0, unit_average: average }).eq('id', grade.id);
        }
      }

      setResults(results.filter(r => r.id !== result.id));
      alert('Correção excluída e nota atualizada com sucesso!');
    } catch (error) {
      console.error('Error deleting result:', error);
      alert('Erro ao excluir correção.');
    } finally {
      setIsDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-serif font-bold text-brand-blue-dark">Relatórios de Correção</h3>
          <p className="text-slate-500">Acompanhe o histórico de todas as atividades corrigidas.</p>
        </div>
      </div>

      {/* Simplified Search Bar */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="relative max-w-2xl mx-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={24} />
          <input 
            type="text"
            placeholder="Digite o nome do aluno para ver seus relatórios..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="w-full pl-14 pr-12 py-5 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-brand-yellow text-lg shadow-inner"
          />
          {filters.search && (
            <button 
              onClick={handleClearFilters}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-brand-blue-dark transition-colors"
            >
              <Trash2 size={20} />
            </button>
          )}
        </div>
        <p className="text-center text-xs text-slate-400 mt-3">
          Os resultados serão filtrados automaticamente conforme você digita.
        </p>
      </div>

      {/* Results List */}
      <div className="space-y-4">
        {filteredResults.map((result, i) => (
          <motion.div
            key={result.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-brand-yellow transition-all"
          >
            <div className="flex items-center gap-6">
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center text-white font-bold",
                result.percentage >= 50 ? "bg-emerald-500" : "bg-red-500"
              )}>
                {Math.round(result.percentage)}%
              </div>
              <div>
                <h4 className="font-bold text-brand-blue-dark flex items-center gap-2">
                  {result.students?.name}
                  <ChevronRight size={14} className="text-slate-300" />
                  <span className="text-slate-400 font-medium">{result.assessments?.title}</span>
                </h4>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Users size={12} /> {result.students?.classes?.name}
                  </span>
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Calendar size={12} /> {new Date(result.created_at).toLocaleDateString()}
                  </span>
                  <span className={cn(
                    "text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                    result.assessments?.type === 'prova' ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                  )}>
                    {result.assessments?.type === 'prova' ? 'Prova' : 
                     result.assessments?.type === 'lista1' ? 'Lista 1' :
                     result.assessments?.type === 'lista2' ? 'Lista 2' :
                     result.assessments?.type === 'lista3' ? 'Lista 3' : 'Atividade'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right mr-4">
                <p className="text-lg font-bold text-brand-blue-dark">{result.total_score} / {result.max_score}</p>
                <p className="text-xs text-slate-400">Pontuação Final</p>
              </div>
              <button 
                onClick={() => fetchResultDetails(result)}
                className="p-3 bg-slate-50 text-brand-blue rounded-xl hover:bg-brand-blue hover:text-white transition-all"
                title="Ver Detalhes"
              >
                <FileText size={20} />
              </button>
              <button 
                onClick={async () => {
                  setIsFetchingDetails(true);
                  try {
                    const { data: corrections } = await supabase
                      .from('student_answers')
                      .select('*, questions(*), ai_corrections(*)')
                      .eq('student_id', result.student_id)
                      .eq('assessment_id', result.assessment_id);
                    
                    exportToPDF({ ...result, corrections });
                  } finally {
                    setIsFetchingDetails(false);
                  }
                }}
                className="p-3 bg-slate-50 text-brand-gold rounded-xl hover:bg-brand-gold hover:text-white transition-all"
                title="Baixar PDF"
              >
                <Download size={20} />
              </button>
              <button 
                onClick={() => handleDeleteResult(result)}
                disabled={isDeleting === result.id}
                className="p-3 bg-slate-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                title="Excluir"
              >
                {isDeleting === result.id ? <Loader2 className="animate-spin" size={20} /> : <Trash2 size={20} />}
              </button>
            </div>
          </motion.div>
        ))}

        {filteredResults.length === 0 && !isLoading && (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
            <BarChart3 size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium">Nenhum resultado encontrado com os filtros selecionados.</p>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {selectedResult && (
        <div className="fixed inset-0 bg-brand-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-4xl max-height-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
          >
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-brand-blue-dark text-white">
              <div>
                <h3 className="text-xl font-bold">{selectedResult.students?.name}</h3>
                <p className="text-brand-gray text-sm">{selectedResult.assessments?.title}</p>
              </div>
              <button 
                onClick={() => setSelectedResult(null)}
                className="p-2 hover:bg-white/10 rounded-full transition-all"
              >
                <ChevronRight className="rotate-90" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-50 p-4 rounded-2xl text-center">
                  <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Nota Final</p>
                  <p className="text-3xl font-bold text-brand-blue-dark">{selectedResult.total_score} / {selectedResult.max_score}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl text-center">
                  <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Aproveitamento</p>
                  <p className="text-3xl font-bold text-emerald-600">{Math.round(selectedResult.percentage)}%</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-2xl text-center">
                  <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Data</p>
                  <p className="text-xl font-bold text-brand-blue-dark">{new Date(selectedResult.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Overall Feedback */}
              {selectedResult.overall_feedback && (
                <div className="bg-brand-yellow/10 p-6 rounded-2xl border border-brand-yellow/20">
                  <h4 className="font-bold text-brand-blue-dark mb-2 flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-brand-yellow" />
                    Feedback Geral da IA
                  </h4>
                  <p className="text-slate-700 text-sm leading-relaxed italic">
                    "{selectedResult.overall_feedback}"
                  </p>
                </div>
              )}

              {/* Corrections List */}
              <div className="space-y-4">
                <h4 className="font-bold text-brand-blue-dark flex items-center gap-2">
                  <FileText size={18} className="text-brand-gold" />
                  Detalhamento por Questão
                </h4>
                <div className="space-y-4">
                  {selectedResult.corrections?.map((corr: any, i: number) => (
                    <div key={i} className="border border-slate-100 rounded-2xl p-5 space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 bg-brand-blue-dark text-white rounded-full flex items-center justify-center font-bold text-sm">
                            {corr.questions?.question_number}
                          </span>
                          <div>
                            <p className="font-bold text-brand-blue-dark">Questão {corr.questions?.question_number}</p>
                            <p className="text-[10px] uppercase text-slate-400 font-bold">{corr.questions?.question_type}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-brand-blue-dark">{corr.score} / {corr.questions?.max_score}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Pontos</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="bg-slate-50 p-3 rounded-xl">
                          <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Resposta do Aluno</p>
                          <p className="text-slate-700">{corr.answer_text || 'Sem resposta'}</p>
                        </div>
                        <div className="bg-emerald-50 p-3 rounded-xl">
                          <p className="text-[10px] font-bold uppercase text-emerald-600 mb-1">Feedback da IA</p>
                          <p className="text-slate-700">{corr.ai_corrections?.[0]?.correction_feedback}</p>
                        </div>
                      </div>

                      {/* Skills */}
                      {(corr.ai_corrections?.[0]?.skills_mastered?.length > 0 || corr.ai_corrections?.[0]?.skills_to_improve?.length > 0) && (
                        <div className="flex flex-wrap gap-2">
                          {corr.ai_corrections?.[0]?.skills_mastered?.map((skill: string) => (
                            <span key={skill} className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">
                              ✓ {skill}
                            </span>
                          ))}
                          {corr.ai_corrections?.[0]?.skills_to_improve?.map((skill: string) => (
                            <span key={skill} className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                              ⚠ {skill}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-between">
              <button 
                onClick={() => exportToPDF(selectedResult)}
                className="flex items-center gap-2 px-6 py-3 bg-brand-gold text-white rounded-xl font-bold hover:bg-brand-gold/90 transition-all"
              >
                <Printer size={20} />
                Exportar PDF
              </button>
              <button 
                onClick={() => setSelectedResult(null)}
                className="px-8 py-3 bg-brand-blue-dark text-white rounded-xl font-bold hover:bg-brand-black transition-all"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
