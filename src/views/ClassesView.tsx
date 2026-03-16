import React, { useState, useEffect } from 'react';
import { Upload, Users, Plus, Trash2, Edit2, FileUp, Loader2, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useDropzone, DropzoneOptions } from 'react-dropzone';
import { supabase } from '../lib/supabase';
import { ai } from '../lib/gemini';
import { cn } from '../lib/utils';

export default function ClassesView() {
  const [classes, setClasses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [previewData, setPreviewData] = useState<{ className: string; students: { name: string; rollNumber: number }[] } | null>(null);

  useEffect(() => {
    fetchClasses();
  }, []);

  async function fetchClasses() {
    if (!supabase) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase
      .from('classes')
      .select('*, students(count)')
      .order('created_at', { ascending: false });
    
    if (data) setClasses(data);
    setIsLoading(false);
  }

  async function handleDeleteClass(classId: string, className: string) {
    if (!supabase) return;
    if (!confirm(`Deseja realmente excluir a turma "${className}"? Todos os alunos e notas associadas serão removidos permanentemente.`)) return;

    try {
      // 1. Delete students (grades should cascade if set up, but let's be safe)
      const { data: students } = await supabase.from('students').select('id').eq('class_id', classId);
      if (students && students.length > 0) {
        const studentIds = students.map(s => s.id);
        await supabase.from('grades').delete().in('student_id', studentIds);
        await supabase.from('assessment_results').delete().in('student_id', studentIds);
        await supabase.from('student_answers').delete().in('student_id', studentIds);
      }
      
      await supabase.from('students').delete().eq('class_id', classId);
      
      // 2. Delete assessments related to this class
      await supabase.from('assessments').delete().eq('class_id', classId);

      // 3. Delete class
      const { error } = await supabase.from('classes').delete().eq('id', classId);

      if (error) throw error;

      setClasses(classes.filter(c => c.id !== classId));
      alert('Turma excluída com sucesso!');
    } catch (error) {
      console.error('Error deleting class:', error);
      alert('Erro ao excluir turma.');
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
          Analise esta lista de alunos em PDF e extraia o nome da turma e a lista de alunos (apenas os nomes).
          Ignore números de chamada se houver, mas mantenha a ordem se possível.
          Retorne um JSON estritamente no formato:
          {
            "className": "Nome da Turma Encontrado",
            "students": [
              { "name": "NOME COMPLETO DO ALUNO" },
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
          
          // Add roll numbers based on order
          const studentsWithRoll = data.students.map((s: any, index: number) => ({
            name: s.name,
            rollNumber: index + 1
          }));

          setPreviewData({
            className: data.className || 'Nova Turma',
            students: studentsWithRoll
          });
        } catch (err) {
          console.error('AI Processing Error:', err);
          alert('Erro ao processar o PDF com IA. Verifique se o arquivo é um PDF válido e tente novamente.');
        } finally {
          setIsProcessing(false);
        }
      };
      reader.readAsDataURL(file);

    } catch (error) {
      console.error('Error processing PDF:', error);
      setIsProcessing(false);
    }
  };

  const dropzoneOptions: any = {
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false
  };

  // @ts-ignore
  const { getRootProps, getInputProps, isDragActive } = useDropzone(dropzoneOptions);

  async function handleSave() {
    if (!previewData || !supabase) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .insert([{ 
          name: previewData.className, 
          school_year: new Date().getFullYear(),
          user_id: user?.id 
        }])
        .select()
        .single();

      if (classError) throw classError;

      const studentsToInsert = previewData.students.map((s: any) => ({
        class_id: classData.id,
        name: s.name,
        roll_number: s.rollNumber
      }));

      const { error: studentsError } = await supabase
        .from('students')
        .insert(studentsToInsert);

      if (studentsError) throw studentsError;

      setPreviewData(null);
      setShowUploadModal(false);
      fetchClasses();
      alert('Turma e alunos salvos com sucesso!');
    } catch (error) {
      console.error('Error saving class:', error);
      alert('Erro ao salvar a turma no banco de dados.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-serif font-bold text-brand-blue-dark">Minhas Turmas</h3>
          <p className="text-slate-500">Gerencie suas turmas e alunos cadastrados.</p>
        </div>
        <button 
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 bg-brand-blue text-white px-6 py-3 rounded-xl font-bold hover:bg-brand-blue-dark transition-all shadow-lg"
        >
          <Plus size={20} />
          Nova Turma (PDF)
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-brand-gold" size={40} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map((cls) => (
            <motion.div
              key={cls.id}
              whileHover={{ y: -5 }}
              className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-brand-yellow/20 rounded-xl text-brand-blue">
                  <Users size={24} />
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-brand-blue">
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => handleDeleteClass(cls.id, cls.name)}
                    className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <h4 className="text-xl font-bold text-brand-blue-dark mb-1">{cls.name}</h4>
              <p className="text-sm text-slate-500 mb-4">{cls.school_year} • {cls.students?.[0]?.count || 0} Alunos</p>
              <button className="w-full py-2 bg-slate-50 text-brand-blue-dark font-semibold rounded-lg hover:bg-brand-yellow transition-colors">
                Ver Alunos
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-serif font-bold text-brand-blue-dark">
                {previewData ? 'Revisar Turma' : 'Importar Turma'}
              </h3>
              <button 
                onClick={() => {
                  setShowUploadModal(false);
                  setPreviewData(null);
                }} 
                className="text-slate-400 hover:text-brand-black"
              >
                <X size={24} />
              </button>
            </div>

            {previewData ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-brand-blue-dark">Nome da Turma</label>
                  <input 
                    type="text" 
                    value={previewData.className}
                    onChange={(e) => setPreviewData({ ...previewData, className: e.target.value })}
                    className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow font-bold"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-brand-blue-dark">Lista de Alunos ({previewData.students.length})</label>
                  <div className="max-h-60 overflow-y-auto border border-slate-100 rounded-xl p-2 space-y-1">
                    {previewData.students.map((student, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg text-sm">
                        <span className="w-6 text-slate-400 font-bold">{student.rollNumber}</span>
                        <input 
                          type="text" 
                          value={student.name}
                          onChange={(e) => {
                            const newStudents = [...previewData.students];
                            newStudents[idx].name = e.target.value;
                            setPreviewData({ ...previewData, students: newStudents });
                          }}
                          className="flex-1 bg-transparent border-none p-0 focus:ring-0"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setPreviewData(null)}
                    className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Voltar
                  </button>
                  <button 
                    onClick={handleSave}
                    className="flex-1 py-3 bg-brand-blue text-white rounded-xl font-bold hover:bg-brand-blue-dark shadow-lg"
                  >
                    Salvar Turma
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div 
                  {...getRootProps()} 
                  className={cn(
                    "border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer",
                    isDragActive ? "border-brand-yellow bg-brand-yellow/5" : "border-slate-200 hover:border-brand-gold hover:bg-slate-50"
                  )}
                >
                  <input {...getInputProps()} />
                  {isProcessing ? (
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="animate-spin text-brand-gold" size={48} />
                      <p className="text-brand-blue-dark font-medium">A IA está lendo o PDF...</p>
                    </div>
                  ) : (
                    <>
                      <div className="p-4 bg-brand-gold/10 rounded-full text-brand-gold">
                        <FileUp size={40} />
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-brand-blue-dark">Arraste o PDF da lista de alunos</p>
                        <p className="text-sm text-slate-500">ou clique para selecionar o arquivo</p>
                      </div>
                    </>
                  )}
                </div>

                <div className="mt-6 flex gap-4">
                  <button 
                    onClick={() => setShowUploadModal(false)}
                    className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}

