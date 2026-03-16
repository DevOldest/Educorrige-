import React, { useState, useEffect } from 'react';
import { 
  CheckSquare, 
  Users, 
  Search, 
  Plus, 
  Minus, 
  Loader2, 
  Save,
  Calendar,
  BookOpen
} from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

export default function NotebookChecksView() {
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [checks, setChecks] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedClassId && selectedUnitId) {
      fetchStudentsAndChecks(selectedClassId, selectedUnitId);
    }
  }, [selectedClassId, selectedUnitId]);

  async function fetchInitialData() {
    if (!supabase) return;
    const [classesRes, unitsRes] = await Promise.all([
      supabase.from('classes').select('*'),
      supabase.from('units').select('*').order('name')
    ]);
    if (classesRes.data) setClasses(classesRes.data);
    if (unitsRes.data) {
      setUnits(unitsRes.data);
      if (unitsRes.data.length > 0) setSelectedUnitId(unitsRes.data[0].id);
    }
  }

  async function fetchStudentsAndChecks(classId: string, unitId: string) {
    if (!supabase) return;
    setIsLoading(true);
    
    // Fetch students
    const { data: studentsData } = await supabase
      .from('students')
      .select('*')
      .eq('class_id', classId)
      .order('name');
    
    if (studentsData) setStudents(studentsData);

    // Fetch existing checks from grades table
    const { data: gradesData } = await supabase
      .from('grades')
      .select('student_id, notebook_score')
      .eq('unit_id', unitId)
      .in('student_id', studentsData?.map(s => s.id) || []);

    const checksMap: Record<string, number> = {};
    gradesData?.forEach(g => {
      checksMap[g.student_id] = Math.round((g.notebook_score || 0) / 0.25);
    });
    
    setChecks(checksMap);
    setIsLoading(false);
  }

  const handleToggleCheck = (studentId: string, increment: boolean) => {
    const currentCount = checks[studentId] || 0;
    const newCount = increment ? Math.min(6, currentCount + 1) : Math.max(0, currentCount - 1);
    setChecks({ ...checks, [studentId]: newCount });
  };

  const handleSaveAll = async () => {
    if (!supabase || !selectedClassId || !selectedUnitId) return;
    setIsSaving(true);

    try {
      for (const studentId of Object.keys(checks)) {
        const count = checks[studentId];
        const score = count * 0.25;

        // Fetch existing grade to update or insert
        const { data: existingGrade } = await supabase
          .from('grades')
          .select('*')
          .eq('student_id', studentId)
          .eq('unit_id', selectedUnitId)
          .maybeSingle();

        const dataToSave: any = {
          student_id: studentId,
          unit_id: selectedUnitId,
          notebook_score: score
        };

        if (existingGrade) {
          const sum = (existingGrade.list1_score || 0) + 
                      (existingGrade.list2_score || 0) + 
                      (existingGrade.list3_score || 0) + 
                      (existingGrade.exam_score || 0) + 
                      score + 
                      (existingGrade.anki_score || 0);
          
          let average = Math.min(10, sum);
          if (existingGrade.recovery_score !== null) {
            if (sum < 5) {
              average = Math.min(5, Math.max(sum, existingGrade.recovery_score));
            } else {
              average = Math.min(10, sum + existingGrade.recovery_score);
            }
          }

          await supabase
            .from('grades')
            .update({ notebook_score: score, unit_average: average })
            .eq('id', existingGrade.id);
        } else {
          await supabase
            .from('grades')
            .insert([{ ...dataToSave, unit_average: score }]);
        }
      }
      alert('Vistos salvos e médias atualizadas com sucesso!');
    } catch (error) {
      console.error('Error saving checks:', error);
      alert('Erro ao salvar vistos.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-serif font-bold text-brand-blue-dark">Vistos do Caderno</h3>
          <p className="text-slate-500">Gerencie os vistos de caderno dos alunos por unidade.</p>
        </div>
        <button 
          onClick={handleSaveAll}
          disabled={isSaving || !selectedClassId}
          className="flex items-center gap-2 bg-brand-blue text-white px-6 py-3 rounded-xl font-bold hover:bg-brand-blue-dark transition-all shadow-lg disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
          Salvar Alterações
        </button>
      </div>

      {/* Selection Header */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-slate-400">Turma</label>
          <select 
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow"
          >
            <option value="">Selecionar Turma</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-slate-400">Unidade</label>
          <select 
            value={selectedUnitId}
            onChange={(e) => setSelectedUnitId(e.target.value)}
            className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow"
          >
            {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-brand-gold" size={40} />
        </div>
      ) : selectedClassId ? (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-sm font-bold text-brand-blue-dark">Nº</th>
                <th className="px-6 py-4 text-sm font-bold text-brand-blue-dark">Aluno</th>
                <th className="px-6 py-4 text-sm font-bold text-brand-blue-dark text-center">Vistos (Máx 6)</th>
                <th className="px-6 py-4 text-sm font-bold text-brand-blue-dark text-center">Nota Atual</th>
                <th className="px-6 py-4 text-sm font-bold text-brand-blue-dark text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {students.map((student) => {
                const count = checks[student.id] || 0;
                const score = count * 0.25;
                return (
                  <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-bold text-slate-400">{student.roll_number}</td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-brand-blue-dark">{student.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-1">
                        {[...Array(6)].map((_, i) => (
                          <div 
                            key={i} 
                            className={cn(
                              "w-3 h-3 rounded-full",
                              i < count ? "bg-brand-yellow" : "bg-slate-200"
                            )}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold text-brand-blue">{score.toFixed(2)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2">
                        <button 
                          onClick={() => handleToggleCheck(student.id, false)}
                          className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors"
                        >
                          <Minus size={16} />
                        </button>
                        <button 
                          onClick={() => handleToggleCheck(student.id, true)}
                          className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-emerald-50 hover:text-emerald-500 transition-colors"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-32 bg-white rounded-3xl border border-dashed border-slate-200">
          <Users size={64} className="mx-auto text-slate-200 mb-4" />
          <h4 className="text-xl font-serif font-bold text-brand-blue-dark">Selecione uma turma para lançar vistos</h4>
          <p className="text-slate-400">Escolha uma turma acima para visualizar a lista de alunos.</p>
        </div>
      )}
    </div>
  );
}
