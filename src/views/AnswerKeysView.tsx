import React, { useState, useEffect } from 'react';
import { Plus, FileText, Search, Trash2, Edit2, CheckCircle2, AlertCircle, FileUp, Loader2, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '../lib/supabase';
import { ai } from '../lib/gemini';
import { cn } from '../lib/utils';
import CustomModal from '../components/CustomModal';

export default function AnswerKeysView() {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importMode, setImportMode] = useState<'pdf' | 'latex'>('pdf');
  const [latexText, setLatexText] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<any>(null);
  const [newAssessmentName, setNewAssessmentName] = useState('');

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

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    unit_id: '',
    type: 'prova' as 'prova' | 'lista1' | 'lista2' | 'lista3',
    questions: [{ question_number: 1, question_type: 'objetiva', expected_answer: '', max_score: 1, criteria: '', bncc_skills: [] as string[] }]
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    const [assessmentsRes, classesRes, unitsRes] = await Promise.all([
      supabase.from('assessments').select('*, classes(name), units(name)').order('created_at', { ascending: false }),
      supabase.from('classes').select('*').order('name'),
      supabase.from('units').select('*').order('name')
    ]);

    if (assessmentsRes.data) {
      // Filter out special notebook settings records
      setAssessments(assessmentsRes.data.filter(a => !a.title.startsWith('__notebook_settings_')));
    }
    if (classesRes.data) setClasses(classesRes.data);
    if (unitsRes.data) {
      // Remove potential duplicates by name just in case
      const uniqueUnits = unitsRes.data.filter((unit, index, self) =>
        index === self.findIndex((t) => t.name === unit.name)
      );
      setUnits(uniqueUnits);
    }
    setIsLoading(false);
  }

  async function handleDeleteAssessment(assessmentId: string, title: string) {
    if (!supabase) return;
    
    setModal({
      isOpen: true,
      title: 'Excluir Gabarito',
      message: `Deseja realmente excluir o gabarito "${title}"? Todas as correções e notas associadas serão removidas permanentemente.`,
      type: 'confirm',
      onConfirm: async () => {
        try {
          // 1. Get assessment info before deleting
          const { data: assessment } = await supabase.from('assessments').select('*').eq('id', assessmentId).single();
          
          if (assessment) {
            // 2. Update grades for all students in this class/unit
            const { data: grades } = await supabase
              .from('grades')
              .select('*')
              .eq('unit_id', assessment.unit_id);
            
            if (grades && grades.length > 0) {
              const fieldToUpdate = 
                assessment.type === 'prova' ? 'exam_score' : 
                assessment.type === 'lista2' ? 'list2_score' : 
                assessment.type === 'lista3' ? 'list3_score' : 
                'list1_score';
              
              for (const grade of grades) {
                const updatedGrade = { ...grade, [fieldToUpdate]: 0 };
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
                await supabase.from('grades').update({ [fieldToUpdate]: 0, unit_average: Number(average.toFixed(1)) }).eq('id', grade.id);
              }
            }
          }

          // 3. Delete AI Corrections, assessment_results and student_answers
          const { data: answers } = await supabase.from('student_answers').select('id').eq('assessment_id', assessmentId);
          const answerIds = answers?.map(a => a.id) || [];
          
          if (answerIds.length > 0) {
            await supabase.from('ai_corrections').delete().in('student_answer_id', answerIds);
          }

          await supabase.from('assessment_results').delete().eq('assessment_id', assessmentId);
          await supabase.from('student_answers').delete().eq('assessment_id', assessmentId);
          
          // 4. Delete questions
          await supabase.from('questions').delete().eq('assessment_id', assessmentId);

          // 5. Delete assessment
          const { error } = await supabase.from('assessments').delete().eq('id', assessmentId);

          if (error) throw error;

          setAssessments(assessments.filter(a => a.id !== assessmentId));
          setModal({
            isOpen: true,
            title: 'Sucesso',
            message: 'Gabarito excluído e notas atualizadas com sucesso!',
            type: 'success'
          });
        } catch (error) {
          console.error('Error deleting assessment:', error);
          setModal({
            isOpen: true,
            title: 'Erro',
            message: 'Erro ao excluir gabarito.',
            type: 'error'
          });
        }
      }
    });
  }

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file || !ai) return;

    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        
        const prompt = `
          Analise este PDF de um gabarito escolar e extraia os dados estritamente no formato JSON abaixo.
          
          OBJETIVO:
          - Identificar o título da atividade.
          - Listar todas as questões com seu número, tipo (objetiva ou dissertativa) e a resposta correta.
          
          REGRAS DE EXTRAÇÃO:
          1. Se o gabarito indicar apenas uma letra (ex: "1. A"), o tipo é "objetiva".
          2. Se o gabarito tiver um texto explicativo ou critérios, o tipo é "dissertativa".
          3. Remova carácteres especiais e limpe as respostas.
          
          FORMATO DE RETORNO (JSON PURO):
          {
            "title": "NOME DA ATIVIDADE",
            "questions": [
              {
                "question_number": 1,
                "question_type": "objetiva",
                "expected_answer": "A",
                "max_score": 1.0,
                "criteria": "Critério de correção",
                "bncc_skills": []
              }
            ]
          }

          Retorne APENAS o JSON, sem explicações.
        `;

        try {
          if (!ai) throw new Error("IA não configurada.");
          const response = await ai.models.generateContent({
            model: "gemini-1.5-flash",
            contents: {
              parts: [
                { text: prompt },
                { inlineData: { mimeType: "application/pdf", data: base64 } }
              ]
            }
          });

          const responseText = response.text || '';
          console.log('Raw AI Response for Answer Key:', responseText);
          
          // Robust JSON extraction
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            console.error('No JSON match found in:', responseText);
            throw new Error("A IA não retornou um formato de dados válido. Tente enviar o gabarito novamente.");
          }
          
          try {
            const data = JSON.parse(jsonMatch[0]);
            
            if (!data.questions || !Array.isArray(data.questions)) {
              throw new Error("O gabarito extraído está incompleto.");
            }

            setFormData({
              ...formData,
              title: data.title || formData.title,
              questions: data.questions.map((q: any) => ({
                question_number: q.question_number || (formData.questions.length + 1),
                question_type: q.question_type === 'dissertativa' ? 'dissertativa' : 'objetiva',
                expected_answer: String(q.expected_answer || ''),
                max_score: q.max_score || 1,
                criteria: q.criteria || '',
                bncc_skills: q.bncc_skills || []
              }))
            });
            
            setModal({
              isOpen: true,
              title: 'Sucesso',
              message: `Gabarito extraído com ${data.questions.length} questões.`,
              type: 'success'
            });
          } catch (parseError: any) {
            console.error('JSON Parse Error:', parseError);
            throw new Error(`Erro ao ler os dados do gabarito: ${parseError.message}`);
          }
        } catch (err) {
          console.error('AI Processing Error:', err);
          setModal({
            isOpen: true,
            title: 'Erro de Processamento',
            message: 'Erro ao processar o PDF com IA. Tente novamente.',
            type: 'error'
          });
        } finally {
          setIsProcessing(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error reading file:', error);
      setIsProcessing(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false
  } as any);

  const handleProcessLatex = async () => {
    if (!latexText.trim() || !ai) return;

    setIsProcessing(true);
    try {
      const prompt = `
        Analise o seguinte código LaTeX ou texto de um gabarito escolar e extraia os dados estritamente no formato JSON abaixo.
        
        TEXTO DO GABARITO:
        ${latexText}
        
        OBJETIVO:
        - Identificar o título da atividade.
        - Listar todas as questões com seu número, tipo (objetiva ou dissertativa) e a resposta correta.
        
        REGRAS DE EXTRAÇÃO:
        1. Se o gabarito indicar apenas uma letra (ex: "1. A"), o tipo é "objetiva".
        2. Se o gabarito tiver um texto explicativo ou critérios, o tipo é "dissertativa".
        3. No caso de LaTeX, ignore comandos de formatação e foque no conteúdo da questão e resposta.
        
        FORMATO DE RETORNO (JSON PURO):
        {
          "title": "NOME DA ATIVIDADE",
          "questions": [
            {
              "question_number": 1,
              "question_type": "objetiva",
              "expected_answer": "A",
              "max_score": 1.0,
              "criteria": "Critério de correção",
              "bncc_skills": []
            }
          ]
        }

        Retorne APENAS o JSON, sem explicações.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash",
        contents: {
          parts: [
            { text: prompt }
          ]
        }
      });

      const responseText = response.text || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error("A IA não retornou um formato de dados válido.");
      }

      const data = JSON.parse(jsonMatch[0]);
      
      setFormData({
        ...formData,
        title: data.title || formData.title,
        questions: data.questions.map((q: any) => ({
          question_number: q.question_number || (formData.questions.length + 1),
          question_type: q.question_type === 'dissertativa' ? 'dissertativa' : 'objetiva',
          expected_answer: String(q.expected_answer || ''),
          max_score: q.max_score || 1,
          criteria: q.criteria || '',
          bncc_skills: q.bncc_skills || []
        }))
      });
      
      setLatexText('');
      setModal({
        isOpen: true,
        title: 'Sucesso',
        message: `Gabarito extraído com ${data.questions.length} questões do texto.`,
        type: 'success'
      });
    } catch (err: any) {
      console.error('Text Processing Error:', err);
      setModal({
        isOpen: true,
        title: 'Erro de Processamento',
        message: 'Erro ao processar o texto com IA: ' + err.message,
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const addQuestion = () => {
    setFormData({
      ...formData,
      questions: [
        ...formData.questions,
        { question_number: formData.questions.length + 1, question_type: 'objetiva', expected_answer: '', max_score: 1, criteria: '', bncc_skills: [] }
      ]
    });
  };

  const updateQuestion = (index: number, field: string, value: any) => {
    const newQuestions = [...formData.questions];
    newQuestions[index] = { ...newQuestions[index], [field]: value };
    setFormData({ ...formData, questions: newQuestions });
  };

  const removeQuestion = (index: number) => {
    const newQuestions = formData.questions.filter((_, i) => i !== index).map((q, i) => ({ ...q, question_number: i + 1 }));
    setFormData({ ...formData, questions: newQuestions });
  };

  const handleEditName = (assessment: any) => {
    setEditingAssessment(assessment);
    setNewAssessmentName(assessment.title);
    setShowEditNameModal(true);
  };

  const handleUpdateName = async () => {
    if (!supabase || !editingAssessment || !newAssessmentName.trim()) return;
    
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('assessments')
        .update({ title: newAssessmentName.trim() })
        .eq('id', editingAssessment.id);

      if (error) throw error;
      
      setAssessments(assessments.map(a => 
        a.id === editingAssessment.id ? { ...a, title: newAssessmentName.trim() } : a
      ));
      setShowEditNameModal(false);
      setEditingAssessment(null);
      setModal({
        isOpen: true,
        title: 'Sucesso',
        message: 'Nome do gabarito atualizado com sucesso!',
        type: 'success'
      });
    } catch (error) {
      console.error('Error updating assessment name:', error);
      setModal({
        isOpen: true,
        title: 'Erro',
        message: 'Erro ao atualizar o nome do gabarito.',
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditClick = async (assessment: any) => {
    setIsLoading(true);
    try {
      const { data: questions, error } = await supabase
        .from('questions')
        .select('*')
        .eq('assessment_id', assessment.id)
        .order('question_number');
      
      if (error) throw error;

      setEditingAssessment(assessment);
      setFormData({
        title: assessment.title,
        unit_id: assessment.unit_id,
        type: assessment.type,
        questions: questions || []
      });
      setShowAddModal(true);
    } catch (error) {
      console.error('Error fetching questions for edit:', error);
      setModal({
        isOpen: true,
        title: 'Erro',
        message: 'Erro ao carregar dados para edição.',
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title || !formData.unit_id) {
      setModal({
        isOpen: true,
        title: 'Campos Obrigatórios',
        message: 'Preencha todos os campos obrigatórios (Título e Unidade).',
        type: 'warning'
      });
      return;
    }

    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    try {
      let assessmentId = editingAssessment?.id;

      if (editingAssessment) {
        // Update existing assessment
        const { error: assessmentError } = await supabase
          .from('assessments')
          .update({
            title: formData.title,
            unit_id: formData.unit_id,
            type: formData.type,
            total_questions: formData.questions.length
          })
          .eq('id', editingAssessment.id);

        if (assessmentError) throw assessmentError;

        // For questions, we delete and re-insert to ensure sync, 
        // BUT the user wants to KEEP corrections. 
        // If we delete questions, student_answers (which point to question_id) might break if there's a cascade.
        // Let's check existing questions and only update/insert/delete as needed to preserve IDs.
        
        const { data: existingQuestions } = await supabase
          .from('questions')
          .select('id, question_number')
          .eq('assessment_id', editingAssessment.id);

        const existingMap = new Map((existingQuestions || []).map(q => [q.question_number, q.id]));

        for (const q of formData.questions) {
          const questionId = existingMap.get(q.question_number);
          if (questionId) {
            // Update
            await supabase.from('questions').update({
              question_type: q.question_type,
              expected_answer: q.expected_answer,
              max_score: q.max_score,
              criteria: q.criteria,
              bncc_skills: q.bncc_skills
            }).eq('id', questionId);
            existingMap.delete(q.question_number);
          } else {
            // Insert
            await supabase.from('questions').insert({
              assessment_id: editingAssessment.id,
              question_number: q.question_number,
              question_type: q.question_type,
              expected_answer: q.expected_answer,
              max_score: q.max_score,
              criteria: q.criteria,
              bncc_skills: q.bncc_skills
            });
          }
        }

        // Delete removed questions
        if (existingMap.size > 0) {
          const idsToDelete = Array.from(existingMap.values());
          await supabase.from('questions').delete().in('id', idsToDelete);
        }

      } else {
        // Create new
        const { data: assessment, error: assessmentError } = await supabase
          .from('assessments')
          .insert([{
            title: formData.title,
            unit_id: formData.unit_id,
            type: formData.type,
            total_questions: formData.questions.length,
            user_id: user?.id
          }])
          .select()
          .single();

        if (assessmentError) throw assessmentError;
        assessmentId = assessment.id;

        const questionsToInsert = formData.questions.map(q => ({
          assessment_id: assessmentId,
          question_number: q.question_number,
          question_type: q.question_type,
          expected_answer: q.expected_answer,
          max_score: q.max_score,
          criteria: q.criteria,
          bncc_skills: q.bncc_skills
        }));

        const { error: questionsError } = await supabase
          .from('questions')
          .insert(questionsToInsert);

        if (questionsError) throw questionsError;
      }

      setShowAddModal(false);
      setEditingAssessment(null);
      fetchData();
      setFormData({
        title: '',
        unit_id: '',
        type: 'prova',
        questions: [{ question_number: 1, question_type: 'objetiva', expected_answer: '', max_score: 1, criteria: '', bncc_skills: [] }]
      });

      setModal({
        isOpen: true,
        title: 'Sucesso',
        message: editingAssessment ? 'Gabarito atualizado com sucesso!' : 'Gabarito criado com sucesso!',
        type: 'success'
      });
    } catch (error: any) {
      console.error('Error saving assessment:', error);
      setModal({
        isOpen: true,
        title: 'Erro',
        message: 'Erro ao salvar atividade: ' + error.message,
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
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

      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-serif font-bold text-brand-blue-dark">Gabaritos</h3>
          <p className="text-slate-500">Cadastre e gerencie os gabaritos das atividades.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 bg-brand-blue text-white px-6 py-3 rounded-xl font-bold hover:bg-brand-blue-dark transition-all shadow-lg"
        >
          <Plus size={20} />
          Novo Gabarito
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 text-sm font-bold text-brand-blue-dark">Título</th>
              <th className="px-6 py-4 text-sm font-bold text-brand-blue-dark">Unidade</th>
              <th className="px-6 py-4 text-sm font-bold text-brand-blue-dark">Tipo</th>
              <th className="px-6 py-4 text-sm font-bold text-brand-blue-dark">Questões</th>
              <th className="px-6 py-4 text-sm font-bold text-brand-blue-dark">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {assessments.map((assessment) => (
              <tr key={assessment.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-brand-yellow/10 text-brand-yellow rounded-lg">
                      <FileText size={18} />
                    </div>
                    <span className="font-medium text-brand-blue-dark">{assessment.title}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">{assessment.units?.name}</td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold uppercase",
                    assessment.type === 'prova' ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                  )}>
                    {assessment.type}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">{assessment.total_questions}</td>
                <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleEditClick(assessment)}
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-brand-blue"
                        title="Editar Gabarito"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleEditName(assessment)}
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-brand-gold"
                        title="Mudar Nome"
                      >
                        <FileText size={16} />
                      </button>
                      <button 
                        onClick={() => handleDeleteAssessment(assessment.id, assessment.title)}
                        className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500"
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-5xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-serif font-bold text-brand-blue-dark">
                {editingAssessment ? 'Editar Gabarito' : 'Novo Gabarito'}
              </h3>
              <button onClick={() => {
                setShowAddModal(false);
                setEditingAssessment(null);
                setLatexText('');
                setImportMode('pdf');
                setFormData({
                  title: '',
                  unit_id: '',
                  type: 'prova',
                  questions: [{ question_number: 1, question_type: 'objetiva', expected_answer: '', max_score: 1, criteria: '', bncc_skills: [] }]
                });
              }} className="text-slate-400 hover:text-brand-black">
                <X size={24} />
              </button>
            </div>

            {/* Import Mode Toggle */}
            <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
              <button
                onClick={() => setImportMode('pdf')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded-lg transition-all",
                  importMode === 'pdf' ? "bg-white text-brand-blue shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <FileUp size={16} />
                Via PDF (OCR)
              </button>
              <button
                onClick={() => setImportMode('latex')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-bold rounded-lg transition-all",
                  importMode === 'latex' ? "bg-white text-brand-blue shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <FileText size={16} />
                Via Texto / LaTeX
              </button>
            </div>

            {/* Import Content */}
            {importMode === 'pdf' ? (
              <div 
                {...getRootProps()} 
                className={cn(
                  "mb-8 border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer",
                  isDragActive ? "border-brand-yellow bg-brand-yellow/5" : "border-slate-200 hover:border-brand-gold hover:bg-slate-50"
                )}
              >
                <input {...getInputProps()} />
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="animate-spin text-brand-gold" size={32} />
                    <p className="text-brand-blue-dark font-medium">A IA está extraindo as questões do PDF...</p>
                  </div>
                ) : (
                  <>
                    <div className="p-3 bg-brand-gold/10 rounded-full text-brand-gold">
                      <FileUp size={24} />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-brand-blue-dark">Importar Gabarito via PDF</p>
                      <p className="text-xs text-slate-500">Arraste a prova em PDF para extrair questões e critérios automaticamente</p>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="mb-8 space-y-4">
                <div className="bg-brand-blue/5 p-4 rounded-2xl border border-brand-blue/10">
                  <div className="flex items-center gap-2 text-brand-blue font-bold text-sm mb-2">
                    <FileText size={18} />
                    Modo Texto / LaTeX Direto
                  </div>
                  <p className="text-xs text-brand-blue/70 mb-4">
                    Cole o código LaTeX ou o texto corrido do gabarito. A IA identificará o título e as questões instantaneamente.
                  </p>
                  <textarea
                    value={latexText}
                    onChange={(e) => setLatexText(e.target.value)}
                    placeholder="Cole aqui o conteúdo LaTeX ou texto do gabarito..."
                    className="w-full h-48 p-4 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-brand-blue resize-none"
                  />
                </div>
                <button
                  onClick={handleProcessLatex}
                  disabled={isProcessing || !latexText.trim()}
                  className="w-full flex items-center justify-center gap-2 p-4 bg-brand-blue text-white rounded-xl font-bold hover:bg-brand-blue-dark transition-all disabled:opacity-50"
                >
                  {isProcessing ? <Loader2 size={20} className="animate-spin" /> : <FileText size={20} />}
                  {isProcessing ? 'Processando...' : 'Extrair Gabarito do Texto'}
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="space-y-2">
                <label className="text-sm font-bold text-brand-blue-dark">Título da Atividade</label>
                <input 
                  type="text" 
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ex: Prova de Química - Unidade II"
                  className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-brand-blue-dark">Tipo</label>
                <select 
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                  className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow"
                >
                  <option value="prova">Prova</option>
                  <option value="lista1">Lista 1</option>
                  <option value="lista2">Lista 2</option>
                  <option value="lista3">Lista 3</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-brand-blue-dark">Unidade</label>
                <select 
                  value={formData.unit_id}
                  onChange={(e) => setFormData({ ...formData, unit_id: e.target.value })}
                  className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow"
                >
                  <option value="">Selecionar Unidade</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-lg font-bold text-brand-blue-dark">Questões Extraídas/Cadastradas</h4>
                <button 
                  onClick={addQuestion}
                  className="text-brand-blue font-bold text-sm flex items-center gap-1 hover:text-brand-blue-dark"
                >
                  <Plus size={16} /> Adicionar Questão Manualmente
                </button>
              </div>

              <div className="space-y-4">
                {formData.questions.map((q, i) => (
                  <div key={i} className="p-6 bg-slate-50 rounded-2xl space-y-4">
                    <div className="grid grid-cols-12 gap-4 items-end">
                      <div className="col-span-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Nº</label>
                        <div className="p-3 font-bold text-brand-blue-dark">{q.question_number}</div>
                      </div>
                      <div className="col-span-3">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Tipo</label>
                        <select 
                          value={q.question_type}
                          onChange={(e) => updateQuestion(i, 'question_type', e.target.value)}
                          className="w-full p-2 bg-white border-none rounded-lg text-sm"
                        >
                          <option value="objetiva">Objetiva</option>
                          <option value="dissertativa">Dissertativa</option>
                        </select>
                      </div>
                      <div className="col-span-5">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Resposta Esperada</label>
                        <input 
                          type="text" 
                          value={q.expected_answer}
                          onChange={(e) => updateQuestion(i, 'expected_answer', e.target.value)}
                          placeholder={q.question_type === 'objetiva' ? "A, B, C..." : "Palavras-chave..."}
                          className="w-full p-2 bg-white border-none rounded-lg text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Pontos</label>
                        <input 
                          type="number" 
                          value={q.max_score}
                          onChange={(e) => updateQuestion(i, 'max_score', parseFloat(e.target.value))}
                          className="w-full p-2 bg-white border-none rounded-lg text-sm"
                        />
                      </div>
                      <div className="col-span-1 flex justify-center pb-2">
                        <button 
                          onClick={() => removeQuestion(i)}
                          className="text-red-400 hover:text-red-600"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Critério de Correção (IA)</label>
                        <textarea 
                          value={q.criteria}
                          onChange={(e) => updateQuestion(i, 'criteria', e.target.value)}
                          className="w-full p-2 bg-white border-none rounded-lg text-xs h-16 resize-none"
                          placeholder="Descreva o que a IA deve considerar para dar a pontuação..."
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-slate-400">Habilidades BNCC</label>
                        <input 
                          type="text" 
                          value={q.bncc_skills.join(', ')}
                          onChange={(e) => updateQuestion(i, 'bncc_skills', e.target.value.split(',').map((s: string) => s.trim()))}
                          className="w-full p-2 bg-white border-none rounded-lg text-xs"
                          placeholder="Ex: EF01MA01, EF01MA02"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-10 flex gap-4">
              <button 
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-4 border border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSave}
                className="flex-1 py-4 bg-brand-blue text-white rounded-2xl font-bold hover:bg-brand-blue-dark shadow-lg"
              >
                Salvar Gabarito
              </button>
            </div>
          </motion.div>
        </div>
      )}
      {/* Edit Name Modal */}
      {showEditNameModal && (
        <div className="fixed inset-0 bg-brand-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
          >
            <h3 className="text-2xl font-serif font-bold text-brand-blue-dark mb-6">Editar Nome do Gabarito</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-slate-400">Novo Nome</label>
                <input 
                  type="text"
                  value={newAssessmentName}
                  onChange={(e) => setNewAssessmentName(e.target.value)}
                  className="w-full p-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-brand-yellow"
                  placeholder="Ex: Prova de Matemática - 1º Bimestre"
                />
              </div>
              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setShowEditNameModal(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleUpdateName}
                  disabled={isLoading || !newAssessmentName.trim()}
                  className="flex-1 py-3 bg-brand-blue text-white rounded-xl font-bold hover:bg-brand-blue-dark transition-all disabled:opacity-50"
                >
                  {isLoading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
