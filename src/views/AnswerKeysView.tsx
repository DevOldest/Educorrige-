import React, { useState, useEffect } from 'react';
import { Plus, FileText, Search, Trash2, Edit2, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

export default function AnswerKeysView() {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    class_id: '',
    unit_id: '',
    type: 'prova',
    questions: [{ question_number: 1, question_type: 'objetiva', expected_answer: '', max_score: 1 }]
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setIsLoading(true);
    const [assessmentsRes, classesRes, unitsRes] = await Promise.all([
      supabase.from('assessments').select('*, classes(name), units(name)').order('created_at', { ascending: false }),
      supabase.from('classes').select('*'),
      supabase.from('units').select('*')
    ]);

    if (assessmentsRes.data) setAssessments(assessmentsRes.data);
    if (classesRes.data) setClasses(classesRes.data);
    if (unitsRes.data) setUnits(unitsRes.data);
    setIsLoading(false);
  }

  const addQuestion = () => {
    setFormData({
      ...formData,
      questions: [
        ...formData.questions,
        { question_number: formData.questions.length + 1, question_type: 'objetiva', expected_answer: '', max_score: 1 }
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
      alert('Preencha todos os campos obrigatórios.');
      return;
    }

    const { data: assessment, error: assessmentError } = await supabase
      .from('assessments')
      .insert([{
        title: formData.title,
        class_id: formData.class_id,
        unit_id: formData.unit_id,
        type: formData.type,
        total_questions: formData.questions.length
      }])
      .select()
      .single();

    if (assessmentError) {
      console.error(assessmentError);
      return;
    }

    const questionsToInsert = formData.questions.map(q => ({
      assessment_id: assessment.id,
      ...q
    }));

    const { error: questionsError } = await supabase
      .from('questions')
      .insert(questionsToInsert);

    if (questionsError) {
      console.error(questionsError);
      return;
    }

    setShowAddModal(false);
    fetchData();
    setFormData({
      title: '',
      class_id: '',
      unit_id: '',
      type: 'prova',
      questions: [{ question_number: 1, question_type: 'objetiva', expected_answer: '', max_score: 1 }]
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
                    <button className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500">
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
            className="bg-white rounded-3xl p-8 max-w-4xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-serif font-bold text-brand-blue-dark">Novo Gabarito</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-brand-black">
                <X size={24} />
              </button>
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
                <h4 className="text-lg font-bold text-brand-blue-dark">Questões</h4>
                <button 
                  onClick={addQuestion}
                  className="text-brand-blue font-bold text-sm flex items-center gap-1 hover:text-brand-blue-dark"
                >
                  <Plus size={16} /> Adicionar Questão
                </button>
              </div>

              <div className="space-y-4">
                {formData.questions.map((q, i) => (
                  <div key={i} className="p-4 bg-slate-50 rounded-2xl grid grid-cols-12 gap-4 items-end">
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
                      <label className="text-[10px] font-bold uppercase text-slate-400">Resposta Correta / Critério</label>
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

function X({ size, className }: { size?: number, className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size || 24} 
      height={size || 24} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
    </svg>
  );
}
