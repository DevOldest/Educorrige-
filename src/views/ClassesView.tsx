import React, { useState, useEffect } from 'react';
import { Upload, Users, Plus, Trash2, Edit2, FileUp, Loader2, X, Search } from 'lucide-react';
import { motion } from 'motion/react';
import { useDropzone, DropzoneOptions } from 'react-dropzone';
import { supabase } from '../lib/supabase';
import { ai, GEMINI_MODEL } from '../lib/gemini';
import { cn } from '../lib/utils';
import CustomModal from '../components/CustomModal';

export default function ClassesView() {
  const [classes, setClasses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [previewData, setPreviewData] = useState<{ 
    className: string; 
    schoolYear: number;
    students: { name: string; rollNumber: number }[] 
  } | null>(null);

  const [selectedClass, setSelectedClass] = useState<any | null>(null);
  const [showStudentsModal, setShowStudentsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editClassName, setEditClassName] = useState('');
  const [editClassYear, setEditClassYear] = useState(0);
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [isAddingStudent, setIsAddingStudent] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [studentSearchResults, setStudentSearchResults] = useState<any[]>([]);
  const [isSearchingStudents, setIsSearchingStudents] = useState(false);

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
    if (searchTerm.trim().length > 2) {
      handleSearchStudents();
    } else {
      setStudentSearchResults([]);
    }
  }, [searchTerm]);

  const handleSearchStudents = async () => {
    if (!supabase || searchTerm.trim().length <= 2) return;
    setIsSearchingStudents(true);
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*, classes(name)')
        .ilike('name', `%${searchTerm.trim()}%`)
        .limit(10);
      
      if (error) throw error;
      setStudentSearchResults(data || []);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearchingStudents(false);
    }
  };

  async function fetchClasses() {
    if (!supabase) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase
      .from('classes')
      .select('*, students(count)')
      .order('name', { ascending: true });
    
    if (data) setClasses(data);
    setIsLoading(false);
  }

  async function fetchClassStudents(classId: string) {
    if (!supabase) return;
    setIsLoadingStudents(true);
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('class_id', classId)
      .order('roll_number', { ascending: true });
    
    if (data) setClassStudents(data);
    setIsLoadingStudents(false);
  }

  const handleViewStudents = (cls: any) => {
    setSelectedClass(cls);
    fetchClassStudents(cls.id);
    setShowStudentsModal(true);
    setNewStudentName('');
  };

  const handleEditClick = (cls: any) => {
    setSelectedClass(cls);
    setEditClassName(cls.name);
    setEditClassYear(cls.school_year);
    setShowEditModal(true);
  };

  async function handleUpdateClass() {
    if (!supabase || !selectedClass) return;
    try {
      const { error } = await supabase
        .from('classes')
        .update({ name: editClassName, school_year: editClassYear })
        .eq('id', selectedClass.id);

      if (error) throw error;
      
      setShowEditModal(false);
      fetchClasses();
      setModal({
        isOpen: true,
        title: 'Sucesso',
        message: 'Turma atualizada com sucesso!',
        type: 'success'
      });
    } catch (error) {
      console.error('Error updating class:', error);
      setModal({
        isOpen: true,
        title: 'Erro',
        message: 'Erro ao atualizar turma.',
        type: 'error'
      });
    }
  }

  async function handleDeleteClass(classId: string, className: string) {
    if (!supabase) return;
    
    setModal({
      isOpen: true,
      title: 'Confirmar Exclusão',
      message: `Deseja realmente excluir a turma "${className}"? Todos os alunos, notas e atividades associadas serão removidos permanentemente.`,
      type: 'confirm',
      onConfirm: async () => {
        try {
          // 1. Get all students of this class
          const { data: students } = await supabase.from('students').select('id').eq('class_id', classId);
          const studentIds = students?.map(s => s.id) || [];

          // 2. Get all assessments of this class
          const { data: assessments } = await supabase.from('assessments').select('id').eq('class_id', classId);
          const assessmentIds = assessments?.map(a => a.id) || [];

          // 3. Delete AI Corrections (linked to student_answers)
          if (studentIds.length > 0) {
            const { data: answers } = await supabase
              .from('student_answers')
              .select('id')
              .in('student_id', studentIds);
            
            const answerIds = answers?.map(a => a.id) || [];
            if (answerIds.length > 0) {
              await supabase.from('ai_corrections').delete().in('student_answer_id', answerIds);
            }
          }

          // 4. Delete Student Answers
          if (studentIds.length > 0) {
            await supabase.from('student_answers').delete().in('student_id', studentIds);
          }
          if (assessmentIds.length > 0) {
            await supabase.from('student_answers').delete().in('assessment_id', assessmentIds);
          }

          // 5. Delete Assessment Results
          if (studentIds.length > 0) {
            await supabase.from('assessment_results').delete().in('student_id', studentIds);
          }
          if (assessmentIds.length > 0) {
            await supabase.from('assessment_results').delete().in('assessment_id', assessmentIds);
          }

          // 6. Delete Questions
          if (assessmentIds.length > 0) {
            await supabase.from('questions').delete().in('assessment_id', assessmentIds);
          }

          // 7. Delete Assessments
          await supabase.from('assessments').delete().eq('class_id', classId);

          // 8. Delete Grades
          if (studentIds.length > 0) {
            await supabase.from('grades').delete().in('student_id', studentIds);
          }

          // 9. Delete Students
          await supabase.from('students').delete().eq('class_id', classId);

          // 10. Delete Class
          const { error } = await supabase.from('classes').delete().eq('id', classId);

          if (error) throw error;

          setClasses(classes.filter(c => c.id !== classId));
          setModal({
            isOpen: true,
            title: 'Sucesso',
            message: 'Turma excluída com sucesso!',
            type: 'success'
          });
        } catch (error) {
          console.error('Error deleting class:', error);
          setModal({
            isOpen: true,
            title: 'Erro',
            message: 'Erro ao excluir turma.',
            type: 'error'
          });
        }
      }
    });
  }

  async function handleDeleteStudent(studentId: string) {
    if (!supabase) return;
    
    setModal({
      isOpen: true,
      title: 'Confirmar Exclusão',
      message: 'Deseja realmente excluir este aluno? Todas as notas e atividades associadas serão removidas.',
      type: 'confirm',
      onConfirm: async () => {
        try {
          const { data: answers } = await supabase
            .from('student_answers')
            .select('id')
            .eq('student_id', studentId);
          
          const answerIds = answers?.map(a => a.id) || [];
          if (answerIds.length > 0) {
            await supabase.from('ai_corrections').delete().in('student_answer_id', answerIds);
          }
          
          await supabase.from('student_answers').delete().eq('student_id', studentId);
          await supabase.from('assessment_results').delete().eq('student_id', studentId);
          await supabase.from('grades').delete().eq('student_id', studentId);
          
          const { error } = await supabase.from('students').delete().eq('id', studentId);
          if (error) throw error;

          setClassStudents(classStudents.filter(s => s.id !== studentId));
          fetchClasses();
        } catch (error) {
          console.error('Error deleting student:', error);
          setModal({
            isOpen: true,
            title: 'Erro',
            message: 'Erro ao excluir aluno.',
            type: 'error'
          });
        }
      }
    });
  }

  async function handleAddStudent() {
    if (!supabase || !selectedClass || !newStudentName.trim()) return;
    setIsAddingStudent(true);
    try {
      const nextRollNumber = classStudents.length > 0 
        ? Math.max(...classStudents.map(s => s.roll_number)) + 1 
        : 1;

      const { data, error } = await supabase
        .from('students')
        .insert([{
          class_id: selectedClass.id,
          name: newStudentName.trim(),
          roll_number: nextRollNumber
        }])
        .select()
        .single();

      if (error) throw error;

      setClassStudents([...classStudents, data].sort((a, b) => a.roll_number - b.roll_number));
      setNewStudentName('');
      fetchClasses();
    } catch (error) {
      console.error('Error adding student:', error);
      setModal({
        isOpen: true,
        title: 'Erro',
        message: 'Erro ao adicionar aluno.',
        type: 'error'
      });
    } finally {
      setIsAddingStudent(false);
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
          if (!ai) throw new Error("IA não configurada.");
          const response = await ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{
              role: 'user',
              parts: [
                { text: prompt },
                { inlineData: { mimeType: "application/pdf", data: base64 } }
              ]
            }],
            config: {
              responseMimeType: "application/json"
            }
          });

          const responseText = response.text || '';
          const data = JSON.parse(responseText);
          
          // Add roll numbers based on order
          const studentsWithRoll = data.students.map((s: any, index: number) => ({
            name: s.name,
            rollNumber: index + 1
          }));

          setPreviewData({
            className: data.className || 'Nova Turma',
            schoolYear: new Date().getFullYear(),
            students: studentsWithRoll
          });
        } catch (err) {
          console.error('AI Processing Error:', err);
          setModal({
            isOpen: true,
            title: 'Erro de Processamento',
            message: 'Erro ao processar o PDF com IA. Verifique se o arquivo é um PDF válido e tente novamente.',
            type: 'error'
          });
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
          school_year: previewData.schoolYear,
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
      setModal({
        isOpen: true,
        title: 'Sucesso',
        message: 'Turma e alunos salvos com sucesso!',
        type: 'success'
      });
    } catch (error) {
      console.error('Error saving class:', error);
      setModal({
        isOpen: true,
        title: 'Erro',
        message: 'Erro ao salvar a turma no banco de dados.',
        type: 'error'
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-2xl font-serif font-bold text-brand-blue-dark">Minhas Turmas</h3>
          <p className="text-slate-500">Gerencie suas turmas e alunos cadastrados.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch gap-3 w-full sm:w-auto">
          <div className="relative group min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-blue transition-colors" size={18} />
            <input 
              type="text"
              placeholder="Buscar aluno por nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-blue focus:border-transparent outline-none transition-all shadow-sm text-sm"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button 
            onClick={() => setShowUploadModal(true)}
            className="flex items-center justify-center gap-2 bg-brand-blue text-white px-6 py-3 rounded-xl font-bold hover:bg-brand-blue-dark transition-all shadow-lg whitespace-nowrap"
          >
            <Plus size={20} />
            Nova Turma (PDF)
          </button>
        </div>
      </div>

      {searchTerm.trim().length > 2 ? (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
            <h4 className="font-bold text-brand-blue-dark flex items-center gap-2">
              <Search size={18} className="text-brand-gold" />
              Resultados da Busca
            </h4>
            <span className="text-xs text-slate-400 font-bold uppercase">
              {studentSearchResults.length} Encontrado(s)
            </span>
          </div>
          <div className="divide-y divide-slate-50">
            {isSearchingStudents ? (
              <div className="p-8 flex justify-center">
                <Loader2 className="animate-spin text-brand-gold" size={24} />
              </div>
            ) : studentSearchResults.length > 0 ? (
              studentSearchResults.map((student) => (
                <div key={student.id} className="p-4 hover:bg-slate-50 transition-colors flex justify-between items-center">
                  <div>
                    <p className="font-bold text-brand-blue-dark">{student.name}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                      <span className="bg-brand-blue/10 text-brand-blue px-2 py-0.5 rounded-full font-bold">
                        Chamada: {student.roll_number}
                      </span>
                      <span>•</span>
                      <span className="font-medium">Turma: {student.classes?.name}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      const cls = classes.find(c => c.id === student.class_id);
                      if (cls) handleViewStudents(cls);
                      setSearchTerm('');
                    }}
                    className="px-4 py-2 text-xs font-bold text-brand-blue hover:bg-brand-blue/5 rounded-lg transition-colors border border-brand-blue/20"
                  >
                    Ver Turma
                  </button>
                </div>
              ))
            ) : (
              <div className="p-10 text-center text-slate-400 italic">
                Nenhum aluno encontrado com este nome.
              </div>
            )}
          </div>
        </div>
      ) : isLoading ? (
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
                  <button 
                    onClick={() => handleEditClick(cls)}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-brand-blue"
                  >
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
              <button 
                onClick={() => handleViewStudents(cls)}
                className="w-full py-2 bg-slate-50 text-brand-blue-dark font-semibold rounded-lg hover:bg-brand-yellow transition-colors"
              >
                Ver Alunos
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Custom Modal */}
      <CustomModal
        isOpen={modal.isOpen}
        onClose={() => setModal({ ...modal, isOpen: false })}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={modal.onConfirm}
      />

      {/* Edit Class Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-serif font-bold text-brand-blue-dark">Editar Turma</h3>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-brand-black">
                <X size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-brand-blue-dark">Nome da Turma</label>
                <input 
                  type="text" 
                  value={editClassName}
                  onChange={(e) => setEditClassName(e.target.value)}
                  className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow font-bold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-brand-blue-dark">Ano Letivo</label>
                <input 
                  type="number" 
                  value={editClassYear}
                  onChange={(e) => setEditClassYear(parseInt(e.target.value))}
                  className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow font-bold"
                />
              </div>
              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleUpdateClass}
                  className="flex-1 py-3 bg-brand-blue text-white rounded-xl font-bold hover:bg-brand-blue-dark shadow-lg"
                >
                  Salvar Alterações
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* View Students Modal */}
      {showStudentsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl max-h-[90vh] flex flex-col"
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-2xl font-serif font-bold text-brand-blue-dark">{selectedClass?.name}</h3>
                <p className="text-slate-500">Lista de Alunos Cadastrados</p>
              </div>
              <button onClick={() => setShowStudentsModal(false)} className="text-slate-400 hover:text-brand-black">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2">
              {isLoadingStudents ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="animate-spin text-brand-gold" size={32} />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Add Student Input */}
                  <div className="flex gap-2 p-2 bg-slate-50 rounded-2xl border border-slate-100">
                    <input 
                      type="text" 
                      placeholder="Nome do novo aluno..."
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddStudent()}
                      className="flex-1 p-2 bg-transparent border-none focus:ring-0 text-sm font-medium"
                    />
                    <button 
                      onClick={handleAddStudent}
                      disabled={isAddingStudent || !newStudentName.trim()}
                      className="p-2 bg-brand-blue text-white rounded-xl hover:bg-brand-blue-dark transition-all disabled:opacity-50"
                    >
                      {isAddingStudent ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    {classStudents.map((student) => (
                      <div key={student.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl group">
                        <div className="flex items-center gap-4">
                          <span className="w-8 h-8 flex items-center justify-center bg-brand-blue/10 text-brand-blue rounded-lg font-bold text-sm">
                            {student.roll_number}
                          </span>
                          <span className="font-medium text-brand-blue-dark">{student.name}</span>
                        </div>
                        <button 
                          onClick={() => handleDeleteStudent(student.id)}
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          title="Excluir Aluno"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {classStudents.length === 0 && (
                      <p className="text-center py-10 text-slate-400 italic">Nenhum aluno cadastrado nesta turma.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6">
              <button 
                onClick={() => setShowStudentsModal(false)}
                className="w-full py-3 bg-slate-100 text-brand-blue-dark rounded-xl font-bold hover:bg-slate-200 transition-colors"
              >
                Fechar
              </button>
            </div>
          </motion.div>
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
                <div className="grid grid-cols-2 gap-4">
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
                    <label className="text-sm font-bold text-brand-blue-dark">Ano Letivo</label>
                    <input 
                      type="number" 
                      value={previewData.schoolYear}
                      onChange={(e) => setPreviewData({ ...previewData, schoolYear: parseInt(e.target.value) })}
                      className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow font-bold"
                    />
                  </div>
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

