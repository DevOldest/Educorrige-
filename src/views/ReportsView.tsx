import React, { useState, useEffect } from 'react';
import { Search, Filter, FileText, Download, User, Calendar, ChevronRight, BarChart3, Users, CheckCircle2, Trash2, Loader2, Printer } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CustomModal from '../components/CustomModal';

export default function ReportsView() {
  const [results, setResults] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  const [isGeneratingDetailed, setIsGeneratingDetailed] = useState(false);
  
  const [filters, setFilters] = useState({
    search: '',
    classId: '',
    activityType: ''
  });

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
    fetchClasses();
  }, []);

  useEffect(() => {
    if (filters.search.length >= 3 || filters.classId || filters.activityType) {
      fetchData();
    } else if (!filters.search && !filters.classId && !filters.activityType) {
      setResults([]);
    }
  }, [filters.search, filters.classId, filters.activityType]);

  async function fetchClasses() {
    if (!supabase) return;
    const { data } = await supabase.from('classes').select('*').order('name');
    if (data) setClasses(data);
  }

  async function fetchData() {
    if (!supabase) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    
    let query = supabase
      .from('assessment_results')
      .select('*, students!inner(name, class_id, classes(name)), assessments!inner(title, type)')
      .order('created_at', { ascending: false });

    if (filters.search) {
      query = query.ilike('students.name', `%${filters.search}%`);
    }

    if (filters.classId) {
      query = query.eq('students.class_id', filters.classId);
    }

    if (filters.activityType) {
      query = query.eq('assessments.type', filters.activityType);
    }

    const { data, error } = await query.limit(50);

    if (error) {
      console.error('Error fetching data:', error);
    } else if (data) {
      setResults(data);
    }
    setIsLoading(false);
  }

  const handleClearFilters = () => {
    setFilters({ search: '', classId: '', activityType: '' });
    setResults([]);
  };

  const exportToPDF = (result: any, doc?: jsPDF, isLast?: boolean, detailed: boolean = false) => {
    if (!result) return;
    const currentDoc = doc || new jsPDF();
    const pageWidth = currentDoc.internal.pageSize.getWidth();

    // Header
    currentDoc.setFontSize(20);
    currentDoc.setTextColor(10, 37, 64);
    currentDoc.text(detailed ? 'Relatório Pedagógico Detalhado' : 'Relatório de Desempenho', pageWidth / 2, 20, { align: 'center' });

    // Student Info
    currentDoc.setFontSize(12);
    currentDoc.setTextColor(100);
    currentDoc.text(`Aluno: ${result.students?.name}`, 20, 35);
    currentDoc.text(`Turma: ${result.students?.classes?.name}`, 20, 42);
    currentDoc.text(`Atividade: ${result.assessments?.title}`, 20, 49);
    currentDoc.text(`Data: ${new Date(result.created_at).toLocaleDateString()}`, 20, 56);

    // Score
    currentDoc.setFontSize(16);
    currentDoc.setTextColor(10, 37, 64);
    currentDoc.text(`Nota: ${result.total_score.toFixed(1)} / ${result.max_score}`, pageWidth - 20, 45, { align: 'right' });

    let currentY = 65;

    // 1. BNCC Skills Section (Moved up)
    if (detailed && result.bncc_descriptions && result.bncc_descriptions.length > 0) {
      currentDoc.setFontSize(12);
      currentDoc.setTextColor(10, 37, 64);
      currentDoc.setFont('helvetica', 'bold');
      currentDoc.text('Habilidades BNCC Abordadas:', 20, currentY);
      
      let skillY = currentY + 8;
      result.bncc_descriptions.forEach((skill: any) => {
        if (skillY > currentDoc.internal.pageSize.getHeight() - 30) {
          currentDoc.addPage();
          skillY = 20;
        }
        currentDoc.setFontSize(9);
        currentDoc.setFont('helvetica', 'bold');
        currentDoc.text(`${skill.codigo}:`, 20, skillY);
        currentDoc.setFont('helvetica', 'normal');
        const splitDesc = currentDoc.splitTextToSize(skill.descricao, pageWidth - 65);
        currentDoc.text(splitDesc, 45, skillY);
        skillY += (splitDesc.length * 5) + 3;
      });
      currentY = skillY + 5;
    }

    // 2. Table of corrections (Question by Question Analysis)
    currentDoc.setFontSize(12);
    currentDoc.setTextColor(10, 37, 64);
    currentDoc.setFont('helvetica', 'bold');
    if (detailed) {
      currentDoc.text('Análise por Questão:', 20, currentY);
      currentY += 5;
    }

    let headers = ['Questão Nº', 'Resultado (Status)'];
    if (detailed) headers = ['Nº', 'Resposta do Aluno', 'Resposta Esperada', 'Status', 'Feedback / Nota'];

    const tableData = [...result.corrections]
      .sort((a, b) => (a.questions?.question_number || 0) - (b.questions?.question_number || 0))
      .map((corr: any) => {
      const isCorrect = corr.score >= (corr.questions?.max_score || 0);
      const resultText = isCorrect ? 'ACERTO' : corr.score > 0 ? 'PARCIAL' : 'ERRO';
      
      if (detailed) {
        const feedback = corr.ai_corrections?.[0]?.justification || corr.ai_corrections?.[0]?.correction_feedback || '-';
        return [
          corr.questions?.question_number,
          corr.answer_text || 'Sem resposta',
          corr.questions?.expected_answer || '-',
          resultText,
          `${feedback}\n(Nota: ${corr.score.toFixed(1)})`
        ];
      }

      return [corr.questions?.question_number, resultText];
    });

    autoTable(currentDoc, {
      startY: currentY,
      head: [headers],
      body: tableData,
      headStyles: { fillColor: [10, 37, 64] },
      styles: { fontSize: detailed ? 8 : 10, halign: detailed ? 'left' : 'center' },
      columnStyles: detailed ? {
        0: { cellWidth: 10 },
        1: { cellWidth: 35 },
        2: { cellWidth: 35 },
        3: { cellWidth: 20 },
        4: { cellWidth: 70 }
      } : {
        0: { cellWidth: 40 },
        1: { cellWidth: 80 }
      },
      didDrawPage: (data) => {
        currentY = data.cursor.y;
      }
    });

    // 3. Overall Feedback (Moved to end)
    if (detailed && result.overall_feedback) {
      const lastTable = (currentDoc as any).lastAutoTable;
      const finalY = (lastTable && lastTable.finalY) ? lastTable.finalY + 15 : currentY + 15;
      
      if (finalY > currentDoc.internal.pageSize.getHeight() - 40) {
        currentDoc.addPage();
        currentDoc.setFontSize(12);
        currentDoc.setTextColor(10, 37, 64);
        currentDoc.setFont('helvetica', 'bold');
        currentDoc.text('Parecer Pedagógico Geral:', 20, 20);
        currentDoc.setFontSize(10);
        currentDoc.setTextColor(80);
        currentDoc.setFont('helvetica', 'italic');
        const splitFeedback = currentDoc.splitTextToSize(result.overall_feedback, pageWidth - 40);
        currentDoc.text(splitFeedback, 20, 30);
      } else {
        currentDoc.setFontSize(12);
        currentDoc.setTextColor(10, 37, 64);
        currentDoc.setFont('helvetica', 'bold');
        currentDoc.text('Parecer Pedagógico Geral:', 20, finalY);
        currentDoc.setFontSize(10);
        currentDoc.setTextColor(80);
        currentDoc.setFont('helvetica', 'italic');
        const splitFeedback = currentDoc.splitTextToSize(result.overall_feedback, pageWidth - 40);
        currentDoc.text(splitFeedback, 20, finalY + 8);
      }
    }

    if (!doc) {
      currentDoc.save(`Relatorio_${detailed ? 'Detalhado_' : ''}${result.students?.name}.pdf`);
    } else if (!isLast) {
      currentDoc.addPage();
    }
    
    return currentDoc;
  };

  const handleBulkSimpleReports = async () => {
    if (selectedIds.size === 0) return;
    
    setIsBulkDownloading(true);
    try {
      const doc = new jsPDF();
      const selectedResults = results.filter(r => selectedIds.has(r.id));
      
      for (let i = 0; i < selectedResults.length; i++) {
        const result = selectedResults[i];
        const { data: corrections } = await supabase!
          .from('student_answers')
          .select('*, questions(*), ai_corrections(*)')
          .eq('student_id', result.student_id)
          .eq('assessment_id', result.assessment_id)
          .order('questions(question_number)', { ascending: true });
        
        exportToPDF({ ...result, corrections }, doc, i === selectedResults.length - 1, false);
      }
      
      const className = classes.find(c => c.id === filters.classId)?.name || 'Selecao';
      doc.save(`Relatorios_Simples_${className}_${new Date().toLocaleDateString()}.pdf`);
      
      setModal({
        isOpen: true,
        title: 'Sucesso!',
        message: `${selectedIds.size} relatórios simples foram gerados com sucesso.`,
        type: 'success'
      });
    } catch (error) {
      console.error('Error in bulk simple reports:', error);
      setModal({ isOpen: true, title: 'Erro', message: 'Erro ao gerar relatórios simples.', type: 'error' });
    } finally {
      setIsBulkDownloading(false);
    }
  };

  const handleBulkCompleteReports = async () => {
    if (selectedIds.size === 0) return;
    
    setIsGeneratingDetailed(true);
    try {
      const doc = new jsPDF();
      const selectedResults = results.filter(r => selectedIds.has(r.id));
      
      for (let i = 0; i < selectedResults.length; i++) {
        let result = selectedResults[i];
        
        // Fetch corrections
        const { data: corrections } = await supabase!
          .from('student_answers')
          .select('*, questions(*), ai_corrections(*)')
          .eq('student_id', result.student_id)
          .eq('assessment_id', result.assessment_id)
          .order('questions(question_number)', { ascending: true });
        
        let resultWithCorrections = { ...result, corrections };

        // If overall_feedback is missing, generate it via AI (Internal helper without alerts)
        if (!result.overall_feedback) {
          const enriched = await generateAIDataOnly(resultWithCorrections);
          if (enriched) resultWithCorrections = enriched;
        }
        
        exportToPDF(resultWithCorrections, doc, i === selectedResults.length - 1, true);
      }
      
      const className = classes.find(c => c.id === filters.classId)?.name || 'Selecao';
      doc.save(`Relatorios_Completos_${className}_${new Date().toLocaleDateString()}.pdf`);
      
      setModal({
        isOpen: true,
        title: 'Relatórios Completos Gerados!',
        message: `${selectedIds.size} relatórios detalhados com IA foram processados e baixados.`,
        type: 'success'
      });
    } catch (error: any) {
      console.error('Error in bulk complete reports:', error);
      setModal({ isOpen: true, title: 'Erro', message: error.message, type: 'error' });
    } finally {
      setIsGeneratingDetailed(false);
    }
  };

  const generateAIDataOnly = async (result: any) => {
    if (!supabase) return null;
    const { ai, GEMINI_MODEL } = await import('../lib/gemini');
    
    const prompt = `
      Como Especialista Pedagógico e Analista de BNCC, gere um relatório detalhado e humanizado.
      Aluno: ${result.students?.name} | Nota: ${result.total_score} / ${result.max_score}
      
      RESPOSTAS:
      ${result.corrections.map((c: any) => `- Q${c.questions?.question_number}: ${c.answer_text} (Gabarito: ${c.questions?.expected_answer})`).join('\n')}
      
      RETORNE APENAS JSON:
      {
        "parecer_geral": "string",
        "questoes": [{"n_questao": number, "comentario": "string"}],
        "habilidades_bncc": [{"codigo": "string", "descricao": "string"}]
      }
    `;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      const responseText = response.text || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const payload = JSON.parse(jsonMatch[0]);
        await supabase.from('assessment_results').update({ overall_feedback: payload.parecer_geral }).eq('id', result.id);
        
        for (const item of payload.questoes) {
          const corr = result.corrections.find((c: any) => c.questions?.question_number === item.n_questao);
          if (corr && corr.ai_corrections?.[0]) {
            await supabase.from('ai_corrections').update({ justification: item.comentario, correction_feedback: item.comentario }).eq('id', corr.ai_corrections[0].id);
          }
        }
        return { ...result, overall_feedback: payload.parecer_geral, bncc_descriptions: payload.habilidades_bncc };
      }
    } catch (e) {
      console.error('Data generation error for ID:', result.id, e);
    }
    return null;
  };

  const generateDetailedAIReport = async (result: any) => {
    if (!supabase) return;
    setIsGeneratingDetailed(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { ai, GEMINI_MODEL } = await import('../lib/gemini');
      
      const prompt = `
        Como Especialista Pedagógico e Analista de BNCC, gere um relatório detalhado e humanizado para este aluno.
        
        INFORMAÇÕES DA ATIVIDADE:
        Aluno: ${result.students?.name}
        Nota: ${result.total_score} / ${result.max_score}
        
        RESPOSTAS POR QUESTÃO:
        ${result.corrections.map((c: any) => `
          - Questão ${c.questions?.question_number} (${c.questions?.question_type}):
            Gabarito: ${c.questions?.expected_answer}
            Resposta do Aluno: ${c.answer_text}
            Nota: ${c.score}/${c.questions?.max_score}
            Habilidades: ${c.questions?.bncc_skills?.join(', ')}
        `).join('\n')}
        
        REQUISITOS DO RELATÓRIO:
        1. Para cada questão, escreva um "comentario_pedagogico" (curto e direto) explicando por que o aluno acertou, errou ou teve nota parcial.
        2. Para cada Habilidade BNCC mencionada em toda a atividade, forneça uma "descricao_curta" (máx 150 caracteres) precisa conforme a base oficial.
        3. Escreva um "parecer_geral" (comentário geral) sobre o desempenho, dificuldades e pontos fortes.
        4. O tom deve ser profissional porém encorajador.

        RETORNE APENAS JSON:
        {
          "parecer_geral": "string",
          "questoes": [
            {
              "n_questao": number,
              "comentario": "string",
              "status": "acerto" | "erro" | "parcial"
            }
          ],
          "habilidades_bncc": [
            {
              "codigo": "string",
              "descricao": "string"
            }
          ]
        }
      `;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      const responseText = response.text || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const payload = JSON.parse(jsonMatch[0]);
        
        // Transform and save to DB
        // We'll store the richer data in assessment_results.overall_feedback as a JSON string for now
        // or just update existing fields. Let's update the records.
        
        await supabase.from('assessment_results')
          .update({ 
            overall_feedback: payload.parecer_geral,
            // We can store the BNCC list in a separate field if needed, 
            // but for now let's use the UI state to handle the display
          })
          .eq('id', result.id);
          
        for (const item of payload.questoes) {
          const corr = result.corrections.find((c: any) => c.questions?.question_number === item.n_questao);
          if (corr && corr.ai_corrections?.[0]) {
            await supabase.from('ai_corrections')
              .update({ 
                justification: item.comentario,
                correction_feedback: item.comentario 
              })
              .eq('id', corr.ai_corrections[0].id);
          }
        }

        // Attach the BNCC skills to the result object for the PDF export immediate use
        const enrichedResult = { ...result, bncc_descriptions: payload.habilidades_bncc };

        // Refresh list if needed (optional)
        fetchData();
        
        // Automatically trigger PDF export with the enriched data
        exportToPDF(enrichedResult, undefined, false, true);

        setModal({
          isOpen: true,
          title: 'Relatório Completo Gerado!',
          message: 'A análise pedagógica foi concluída e o PDF detalhado foi baixado.',
          type: 'success'
        });
      }
    } catch (error: any) {
      console.error('Error generating detailed report:', error);
      setModal({ isOpen: true, title: 'Erro', message: error.message, type: 'error' });
    } finally {
      setIsGeneratingDetailed(false);
    }
  };
  const handleCompleteReport = async (result: any) => {
    if (!supabase) return;
    setIsFetchingDetails(true);
    try {
      const { data: corrections } = await supabase
        .from('student_answers')
        .select('*, questions(*), ai_corrections(*)')
        .eq('student_id', result.student_id)
        .eq('assessment_id', result.assessment_id)
        .order('questions(question_number)', { ascending: true });
      
      const resultWithCorrections = { ...result, corrections };

      // If already has overall feedback, just download, otherwise generate
      if (result.overall_feedback) {
        exportToPDF(resultWithCorrections, undefined, false, true);
      } else {
        await generateDetailedAIReport(resultWithCorrections);
      }
    } catch (error) {
      console.error('Error in complete report:', error);
    } finally {
      setIsFetchingDetails(false);
    }
  };

  const handleDeleteResult = async (result: any) => {
    if (!supabase) return;
    
    setModal({
      isOpen: true,
      title: 'Confirmar Exclusão',
      message: `Deseja realmente excluir a correção de ${result.students?.name}? Esta ação não pode ser desfeita e a nota será removida da gestão.`,
      type: 'confirm',
      onConfirm: async () => {
        setIsDeleting(result.id);
        try {
          await performDeleteResults([result]);
          setResults(results.filter(r => r.id !== result.id));
          setSelectedIds(prev => {
            const next = new Set(prev);
            next.delete(result.id);
            return next;
          });
          setModal({
            isOpen: true,
            title: 'Sucesso',
            message: 'Correção excluída e nota atualizada com sucesso!',
            type: 'success'
          });
        } catch (error) {
          console.error('Error deleting result:', error);
          setModal({
            isOpen: true,
            title: 'Erro',
            message: 'Erro ao excluir correção.',
            type: 'error'
          });
        } finally {
          setIsDeleting(null);
        }
      }
    });
  };

  const performDeleteResults = async (resultsToDelete: any[]) => {
    for (const result of resultsToDelete) {
      // 1. Delete AI Corrections and student_answers
      const { data: answers } = await supabase!
        .from('student_answers')
        .select('id')
        .eq('assessment_id', result.assessment_id)
        .eq('student_id', result.student_id);
      
      const answerIds = answers?.map(a => a.id) || [];
      if (answerIds.length > 0) {
        await supabase!.from('ai_corrections').delete().in('student_answer_id', answerIds);
      }

      await supabase!.from('student_answers').delete().eq('assessment_id', result.assessment_id).eq('student_id', result.student_id);
      
      // 2. Delete assessment_result
      await supabase!.from('assessment_results').delete().eq('id', result.id);

      // 3. Update grade in Management
      const { data: assessment } = await supabase!.from('assessments').select('type, unit_id').eq('id', result.assessment_id).single();
      
      if (assessment) {
        const { data: grade } = await supabase!
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

          await supabase!.from('grades').update({ [fieldToUpdate]: 0, unit_average: Number(average.toFixed(1)) }).eq('id', grade.id);
        }
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    setModal({
      isOpen: true,
      title: 'Confirmar Exclusão em Massa',
      message: `Deseja realmente excluir ${selectedIds.size} correções selecionadas? Esta ação não pode ser desfeita e todas as notas serão zeradas.`,
      type: 'confirm',
      onConfirm: async () => {
        setIsBulkDeleting(true);
        try {
          const resultsToDelete = results.filter(r => selectedIds.has(r.id));
          await performDeleteResults(resultsToDelete);
          
          setResults(results.filter(r => !selectedIds.has(r.id)));
          setSelectedIds(new Set());
          
          setModal({
            isOpen: true,
            title: 'Sucesso',
            message: `${resultsToDelete.length} correções foram excluídas e as notas foram resetadas.`,
            type: 'success'
          });
        } catch (error) {
          console.error('Bulk delete error:', error);
          setModal({
            isOpen: true,
            title: 'Erro',
            message: 'Ocorreu um erro durante a exclusão em massa.',
            type: 'error'
          });
        } finally {
          setIsBulkDeleting(false);
        }
      }
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === results.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(results.map(r => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-serif font-bold text-brand-blue-dark dark:text-brand-yellow transition-colors">Relatórios de Correção</h3>
          <p className="text-slate-500 dark:text-slate-400 transition-colors">Acompanhe o histórico de todas as atividades corrigidas.</p>
        </div>
      </div>

      {/* Simplified Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 space-y-4 transition-colors">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={20} />
            <input 
              type="text"
              placeholder="Nome do aluno (mín. 3 letras)..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow text-base shadow-inner dark:text-white transition-colors"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filters.classId}
              onChange={(e) => setFilters({ ...filters, classId: e.target.value })}
              className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow text-base shadow-inner dark:text-white transition-colors"
            >
              <option value="">Todas as Turmas</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <select
              value={filters.activityType}
              onChange={(e) => setFilters({ ...filters, activityType: e.target.value })}
              className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow text-base shadow-inner dark:text-white transition-colors"
            >
              <option value="">Todas as Atividades</option>
              <option value="prova">Prova</option>
              <option value="lista1">Lista 1</option>
              <option value="lista2">Lista 2</option>
              <option value="lista3">Lista 3</option>
            </select>
            <button 
              onClick={handleClearFilters}
              className="px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="Limpar Filtros"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-50 dark:border-slate-800">
          <div className="flex items-center gap-4">
            <p className="text-xs text-slate-400 dark:text-slate-500 transition-colors">
              {results.length > 0 ? `${results.length} resultados encontrados.` : 'Use os filtros para buscar relatórios.'}
            </p>
            {results.length > 0 && (
              <label className="flex items-center gap-2 cursor-pointer group">
                <input 
                  type="checkbox" 
                  checked={selectedIds.size === results.length && results.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-brand-blue dark:text-brand-yellow focus:ring-brand-yellow bg-white dark:bg-slate-800"
                />
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 group-hover:text-brand-blue dark:group-hover:text-brand-yellow transition-colors">Selecionar Tudo</span>
              </label>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {selectedIds.size > 0 && (
              <>
                <button
                  onClick={handleBulkDelete}
                  disabled={isBulkDeleting}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 text-red-500 border border-red-100 rounded-xl font-bold hover:bg-red-500 hover:text-white transition-all text-xs"
                >
                  {isBulkDeleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                  Excluir ({selectedIds.size})
                </button>
                <div className="w-px h-8 bg-slate-100 hidden sm:block" />
                <button
                  onClick={handleBulkSimpleReports}
                  disabled={isBulkDownloading}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-brand-blue text-white rounded-xl font-bold hover:bg-brand-blue-dark transition-all shadow-md disabled:opacity-50 text-xs"
                >
                  {isBulkDownloading ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                  Relatório Simples
                </button>
                <button
                  onClick={handleBulkCompleteReports}
                  disabled={isGeneratingDetailed}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-brand-gold text-white rounded-xl font-bold hover:opacity-90 transition-all shadow-md disabled:opacity-50 text-xs"
                >
                  {isGeneratingDetailed ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
                  Relatório Completo (IA)
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Results List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-brand-gold" size={40} />
          </div>
        ) : results.map((result, i) => (
          <motion.div
            key={result.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={cn(
              "bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-2xl shadow-sm border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 group transition-all",
              selectedIds.has(result.id) 
                ? "border-brand-blue dark:border-brand-yellow bg-brand-blue/5 dark:bg-brand-yellow/5" 
                : "border-slate-100 dark:border-slate-800 hover:border-brand-yellow dark:hover:border-brand-yellow/50"
            )}
          >
            <div className="flex items-center gap-4 sm:gap-6 w-full sm:w-auto">
              <input 
                type="checkbox"
                checked={selectedIds.has(result.id)}
                onChange={() => toggleSelect(result.id)}
                className="w-5 h-5 rounded border-slate-300 dark:border-slate-700 text-brand-blue dark:text-brand-yellow focus:ring-brand-yellow bg-white dark:bg-slate-800 transition-colors"
              />
              <div className={cn(
                "w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center text-white font-bold shrink-0 shadow-sm",
                result.percentage >= 50 ? "bg-emerald-500" : "bg-red-500"
              )}>
                {Math.round(result.percentage)}%
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-brand-blue-dark dark:text-brand-yellow flex flex-wrap items-center gap-x-2 transition-colors">
                  <span className="truncate">{result.students?.name}</span>
                  <ChevronRight size={14} className="text-slate-300 dark:text-slate-700 hidden sm:inline transition-colors" />
                  <span className="text-slate-400 dark:text-slate-500 font-medium truncate transition-colors">{result.assessments?.title}</span>
                </h4>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 transition-colors">
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 transition-colors">
                    <Users size={12} /> {result.students?.classes?.name}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 transition-colors">
                    <Calendar size={12} /> {new Date(result.created_at).toLocaleDateString()}
                  </span>
                  <span className={cn(
                    "text-[10px] font-bold uppercase px-2 py-0.5 rounded transition-colors",
                    result.assessments?.type === 'prova' ? "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400" : "bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400"
                  )}>
                    {result.assessments?.type === 'prova' ? 'Prova' : 
                     result.assessments?.type === 'lista1' ? 'Lista 1' :
                     result.assessments?.type === 'lista2' ? 'Lista 2' :
                     result.assessments?.type === 'lista3' ? 'Lista 3' : 'Atividade'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 w-full sm:w-auto pt-4 sm:pt-0 border-t sm:border-t-0 border-slate-50 dark:border-slate-800 transition-colors">
              <div className="text-right hidden sm:block mr-4">
                <p className="text-lg font-bold text-brand-blue-dark dark:text-brand-yellow transition-colors">{result.total_score.toFixed(1)} / {result.max_score}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase transition-colors">Nota Final</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleDeleteResult(result)}
                  disabled={isDeleting === result.id}
                  className="p-2.5 bg-slate-50 dark:bg-slate-800 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all disabled:opacity-50 transition-colors"
                  title="Excluir"
                >
                  {isDeleting === result.id ? <Loader2 className="animate-spin" size={18} /> : <Trash2 size={18} />}
                </button>
              </div>
            </div>
          </motion.div>
        ))}

        {results.length === 0 && !isLoading && (
          <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 transition-colors">
            <BarChart3 size={48} className="mx-auto text-slate-300 dark:text-slate-700 mb-4 transition-colors" />
            <p className="text-slate-500 dark:text-slate-400 font-medium transition-colors">
              {filters.search || filters.classId 
                ? 'Nenhum resultado encontrado com os filtros selecionados.' 
                : 'Busque por nome ou selecione uma turma para ver os relatórios.'}
            </p>
          </div>
        )}
      </div>

      {/* Custom Modal */}
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
