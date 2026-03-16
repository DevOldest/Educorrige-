import React, { useState, useEffect } from 'react';
import { Plus, FileText, Search, Trash2, Edit2, CheckCircle2, AlertCircle, FileUp, Loader2, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import { supabase } from '../lib/supabase';
import { ai } from '../lib/gemini';
import { cn } from '../lib/utils';

export default function AnswerKeysView() {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    class_id: '',
    unit_id: '',
    type: 'prova',
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

    if (assessmentsRes.data) setAssessments(assessmentsRes.data);
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
    if (!confirm(`Deseja realmente excluir o gabarito "${title}"? Todas as correções e notas associadas serão removidas permanentemente.`)) return;

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
          const fieldToUpdate = assessment.type === 'prova' ? 'exam_score' : 'list1_score'; // Simplified
          
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
            await supabase.from('grades').update({ [fieldToUpdate]: 0, unit_average: average }).eq('id', grade.id);
          }
        }
      }

      // 3. Delete assessment_results and student_answers
      await supabase.from('assessment_results').delete().eq('assessment_id', assessmentId);
      await supabase.from('student_answers').delete().eq('assessment_id', assessmentId);
      
      // 4. Delete questions
      await supabase.from('questions').delete().eq('assessment_id', assessmentId);

      // 5. Delete assessment
      const { error } = await supabase.from('assessments').delete().eq('id', assessmentId);

      if (error) throw error;

      setAssessments(assessments.filter(a => a.id !== assessmentId));
      alert('Gabarito excluído e notas atualizadas com sucesso!');
    } catch (error) {
      console.error('Error deleting assessment:', error);
      alert('Erro ao excluir gabarito.');
    }
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
          Analise este PDF de uma prova ou atividade escolar e extraia as questões, seus critérios de correção e as habilidades da BNCC relacionadas.
          Retorne um JSON no formato:
          {
            "title": "Título Sugerido da Atividade",
            "questions": [
              {
                "question_number": 1,
                "question_type": "objetiva" ou "dissertativa",
                "expected_answer": "Resposta correta ou palavras-chave",
                "max_score": 1.0,
                "criteria": "Critério detalhado de correção",
                "bncc_skills": ["EF01MA01", "EF01MA02"]
              },
              ...
            ]
          }
        `;

        try {
          const result = await ai.models.generateContent({
            model: "gemini-3.1-pro-preview",
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inlineData: { mimeType: "application/pdf", data: base64 } }
                ]
              }
            ],
            config: {
              responseMimeType: "application/json"
            }
          });

          const responseText = result.text || '';
          const data = JSON.parse(responseText);
          
          setFormData({
            ...formData,
            title: data.title || formData.title,
            questions: data.questions.map((q: any) => ({
              ...q,
              max_score: q.max_score || 1,
              bncc_skills: q.bncc_skills || []
            }))
          });
        } catch (err) {
          console.error('AI Processing Error:', err);
          alert('Erro ao processar o PDF com IA. Tente novamente.');
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

  const handleSave = async () => {
    if (!formData.title || !formData.class_id || !formData.unit_id) {
      alert('Preencha todos os campos obrigatórios (Título, Turma e Unidade).');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .insert([{
        title: formData.title,
        class_id: formData.class_id,
        unit_id: formData.unit_id,
        type: formData.type,
        total_questions: formData.questions.length,
        user_id: user?.id
      }])
      .select()
      .single();

    if (assessmentError) {
      console.error(assessmentError);
      alert('Erro ao salvar atividade.');
      return;
    }

    const questionsToInsert = formData.questions.map(q => ({
      assessment_id: assessment.id,
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

    if (questionsError) {
      console.error(questionsError);
      alert('Erro ao salvar questões.');
      return;
    }

    setShowAddModal(false);
    fetchData();
    setFormData({
      title: '',
      class_id: '',
      unit_id: '',
      type: 'prova',
      questions: [{ question_number: 1, question_type: 'objetiva', expected_answer: '', max_score: 1, criteria: '', bncc_skills: [] }]
    });
  };

  return (
    <div className="space-y-6">
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
              <th className="px-6 py-4 text-sm font-bold text-brand-blue-dark">Turma</th>
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
                <td className="px-6 py-4 text-sm text-slate-600">{assessment.classes?.name}</td>
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
                    <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-brand-blue">
                      <Edit2 size={16} />
                    </button>
                    <button 
                      onClick={() => handleDeleteAssessment(assessment.id, assessment.title)}
                      className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500"
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
              <h3 className="text-2xl font-serif font-bold text-brand-blue-dark">Novo Gabarito</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-brand-black">
                <X size={24} />
              </button>
            </div>

            {/* PDF Upload Section */}
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
                  <option value="lista">Lista</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-brand-blue-dark">Turma</label>
                <select 
                  value={formData.class_id}
                  onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
                  className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow"
                >
                  <option value="">Selecionar Turma</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
    </div>
  );
}
