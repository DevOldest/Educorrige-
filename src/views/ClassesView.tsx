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

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file || !ai) return;

    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        
        const prompt = `
          Analise esta lista de alunos em PDF e extraia os nomes e números de chamada.
          Retorne um JSON no formato:
          {
            "className": "Nome Sugerido da Turma",
            "students": [
              { "name": "Nome do Aluno", "rollNumber": 1 },
              ...
            ]
          }
        `;

        try {
          const result = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
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
          try {
            const data = JSON.parse(responseText);
            await saveClassAndStudents(data);
          } catch (parseErr) {
            console.error('JSON Parse Error:', parseErr, responseText);
            // Fallback to regex if JSON mode fails for some reason
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const data = JSON.parse(jsonMatch[0]);
              await saveClassAndStudents(data);
            } else {
              throw new Error('Could not parse AI response');
            }
          }
        } catch (err) {
          console.error('AI Processing Error:', err);
          alert('Erro ao processar o PDF com IA. Tente novamente.');
        } finally {
          setIsProcessing(false);
          setShowUploadModal(false);
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

  async function saveClassAndStudents(data: any) {
    const { data: classData, error: classError } = await supabase
      .from('classes')
      .insert([{ name: data.className, school_year: new Date().getFullYear() }])
      .select()
      .single();

    if (classError) throw classError;

    const studentsToInsert = data.students.map((s: any) => ({
      class_id: classData.id,
      name: s.name,
      roll_number: s.rollNumber
    }));

    const { error: studentsError } = await supabase
      .from('students')
      .insert(studentsToInsert);

    if (studentsError) throw studentsError;

    fetchClasses();
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
                  <button className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500">
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
              <h3 className="text-2xl font-serif font-bold text-brand-blue-dark">Importar Turma</h3>
              <button onClick={() => setShowUploadModal(false)} className="text-slate-400 hover:text-brand-black">
                <X size={24} />
              </button>
            </div>

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
          </motion.div>
        </div>
      )}
    </div>
  );
}

