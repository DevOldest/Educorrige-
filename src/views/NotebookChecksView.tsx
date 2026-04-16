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
import CustomModal from '../components/CustomModal';

export default function NotebookChecksView() {
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [checks, setChecks] = useState<Record<string, number>>({});
  const [maxStamps, setMaxStamps] = useState(6);
  const [isSaving, setIsSaving] = useState(false);

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
    
    try {
      // 1. Fetch maxStamps from special assessment record
      const { data: settingsData } = await supabase
        .from('assessments')
        .select('total_questions')
        .eq('unit_id', unitId)
        .eq('title', `__notebook_settings_${classId}__`)
        .maybeSingle();

      if (settingsData) {
        setMaxStamps(settingsData.total_questions || 6);
      } else {
        setMaxStamps(6);
      }

      // 2. Fetch students
      const { data: studentsData } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', classId)
        .order('name');
      
      if (studentsData) setStudents(studentsData);

      // 3. Fetch existing checks from grades table
      const { data: gradesData } = await supabase
        .from('grades')
        .select('student_id, notebook_score')
        .eq('unit_id', unitId)
        .in('student_id', studentsData?.map(s => s.id) || []);

      const checksMap: Record<string, number> = {};
      
      gradesData?.forEach(g => {
        // Use the loaded maxStamps to reverse the score to a count
        // Score = (count / maxStamps) * 1.5 => count = (Score * maxStamps) / 1.5
        const currentMax = settingsData?.total_questions || 6;
        const count = Math.round(((g.notebook_score || 0) * currentMax) / 1.5);
        checksMap[g.student_id] = count;
      });
      
      setChecks(checksMap);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  const handleRecalculateMax = () => {
    const counts = Object.values(checks);
    if (counts.length > 0) {
      const newMax = Math.max(...counts as number[], 1);
      setMaxStamps(newMax);
    }
  };

  const handleToggleCheck = (studentId: string, increment: boolean) => {
    const currentCount = checks[studentId] || 0;
    const newCount = increment ? currentCount + 1 : Math.max(0, currentCount - 1);
    setChecks({ ...checks, [studentId]: newCount });
  };

  const handleSaveAll = async () => {
    if (!supabase || !selectedClassId || !selectedUnitId) return;
    setIsSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Save maxStamps setting
      const settingsTitle = `__notebook_settings_${selectedClassId}__`;
      const { data: existingSettings } = await supabase
        .from('assessments')
        .select('id')
        .eq('unit_id', selectedUnitId)
        .eq('title', settingsTitle)
        .maybeSingle();

      if (existingSettings) {
        await supabase
          .from('assessments')
          .update({ total_questions: maxStamps })
          .eq('id', existingSettings.id);
      } else {
        await supabase
          .from('assessments')
          .insert([{
            title: settingsTitle,
            unit_id: selectedUnitId,
            type: 'lista1', // Using an existing type
            total_questions: maxStamps,
            user_id: user?.id,
            class_id: selectedClassId
          }]);
      }

      // 2. Save student scores
      for (const studentId of Object.keys(checks)) {
        const count = checks[studentId];
        // Dynamic score: (count / maxStamps) * 1.5
        const score = maxStamps > 0 ? (count / maxStamps) * 1.5 : 0;
        const roundedScore = Math.round(score * 10) / 10;

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
          notebook_score: roundedScore
        };

        if (existingGrade) {
          const sum = (existingGrade.list1_score || 0) + 
                      (existingGrade.list2_score || 0) + 
                      (existingGrade.list3_score || 0) + 
                      (existingGrade.exam_score || 0) + 
                      roundedScore + 
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
            .update({ notebook_score: roundedScore, unit_average: Math.round(average * 10) / 10 })
            .eq('id', existingGrade.id);
        } else {
          await supabase
            .from('grades')
            .insert([{ ...dataToSave, unit_average: roundedScore }]);
        }
      }
      setModal({
        isOpen: true,
        title: 'Sucesso',
        message: 'Vistos salvos e médias atualizadas com sucesso!',
        type: 'success'
      });
    } catch (error) {
      console.error('Error saving checks:', error);
      setModal({
        isOpen: true,
        title: 'Erro',
        message: 'Erro ao salvar vistos.',
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Custom Modal */}
      <CustomModal
        isOpen={modal.isOpen}
        onClose={() => setModal({ ...modal, isOpen: false })}
        title={modal.title}
        message={modal.message}
        type={modal.type}
        onConfirm={modal.onConfirm}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-2xl font-serif font-bold text-brand-blue-dark">Vistos do Caderno</h3>
          <p className="text-slate-500">Gerencie os vistos de caderno dos alunos por unidade.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-100 w-full sm:w-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100">
            <label className="text-[10px] font-bold uppercase text-slate-400">Total de Vistos</label>
            <input 
              type="number" 
              min="1"
              value={maxStamps}
              onChange={(e) => setMaxStamps(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-10 bg-transparent border-none p-0 text-center font-bold text-brand-blue focus:ring-0"
            />
          </div>
          <button 
            onClick={handleRecalculateMax}
            className="px-3 py-1.5 bg-brand-yellow/10 text-brand-blue-dark text-xs font-bold uppercase rounded-xl hover:bg-brand-yellow/30 transition-colors"
            title="Ajustar o total pelo aluno que tem mais vistos"
          >
            Sincronizar Maior
          </button>
          <button 
            onClick={handleSaveAll}
            disabled={isSaving || !selectedClassId}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-brand-blue text-white px-4 py-2 rounded-xl font-bold hover:bg-brand-blue-dark transition-all shadow-md disabled:opacity-50 text-sm"
          >
            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Salvar
          </button>
        </div>
      </div>

      {/* Selection Header */}
      <div className="bg-white p-4 sm:p-6 rounded-3xl shadow-sm border border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
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
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-x-auto -mx-4 sm:mx-0">
          <div className="inline-block min-w-full align-middle px-4 sm:px-0">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-4 text-xs font-bold text-brand-blue-dark uppercase">Nº</th>
                  <th className="px-4 py-4 text-xs font-bold text-brand-blue-dark uppercase">Aluno</th>
                  <th className="px-4 py-4 text-xs font-bold text-brand-blue-dark uppercase text-center">Vistos ({maxStamps})</th>
                  <th className="px-4 py-4 text-xs font-bold text-brand-blue-dark uppercase text-center">Nota</th>
                  <th className="px-4 py-4 text-xs font-bold text-brand-blue-dark uppercase text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {students.map((student) => {
                  const count = checks[student.id] || 0;
                  const score = maxStamps > 0 ? (count / maxStamps) * 1.5 : 0;
                  return (
                    <tr key={student.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-4 text-sm font-bold text-slate-400">{student.roll_number}</td>
                      <td className="px-4 py-4">
                        <span className="font-bold text-brand-blue-dark block truncate max-w-[120px] sm:max-w-[200px] md:max-w-none">{student.name}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-center flex-wrap gap-1 max-w-[120px] mx-auto">
                          {[...Array(maxStamps)].map((_, i) => (
                            <div 
                              key={i} 
                              className={cn(
                                "w-2.5 h-2.5 rounded-full transition-all duration-300",
                                i < count ? "bg-brand-gold shadow-[0_0_8px_rgba(212,175,55,0.4)]" : "bg-slate-200"
                              )}
                            />
                          ))}
                          {count > maxStamps && (
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-red-500 animate-pulse">+{count - maxStamps}</span>
                              <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-mono font-bold text-brand-blue">{score.toFixed(1)}</span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-center gap-1 sm:gap-2">
                          <button 
                            onClick={() => handleToggleCheck(student.id, false)}
                            className="p-1.5 sm:p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-red-50 hover:text-red-500 transition-colors"
                          >
                            <Minus size={14} />
                          </button>
                          <button 
                            onClick={() => handleToggleCheck(student.id, true)}
                            className="p-1.5 sm:p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-emerald-50 hover:text-emerald-500 transition-colors"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
