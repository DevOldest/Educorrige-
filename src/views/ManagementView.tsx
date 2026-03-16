import React, { useState, useEffect } from 'react';
import { 
  GraduationCap, 
  Users, 
  Search, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  Plus, 
  Save,
  Calculator,
  BookOpen,
  Trophy,
  Loader2,
  CheckSquare
} from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

export default function ManagementView() {
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentNameSearch, setStudentNameSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [grades, setGrades] = useState<any[]>([]);
  const [currentUnit, setCurrentUnit] = useState(1);

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      fetchStudents(selectedClassId);
    }
  }, [selectedClassId]);

  useEffect(() => {
    if (selectedStudentId) {
      fetchGrades(selectedStudentId);
    }
  }, [selectedStudentId]);

  async function fetchClasses() {
    if (!supabase) return;
    const { data } = await supabase.from('classes').select('*');
    if (data) setClasses(data);
  }

  async function fetchStudents(classId: string) {
    if (!supabase) return;
    const { data } = await supabase
      .from('students')
      .select('*')
      .eq('class_id', classId)
      .order('name');
    if (data) setStudents(data);
  }

  async function fetchGrades(studentId: string) {
    if (!supabase) {
      setGrades([]);
      return;
    }
    setIsLoading(true);
    const { data } = await supabase
      .from('grades')
      .select('*')
      .eq('student_id', studentId);
    
    if (data) setGrades(data);
    else setGrades([]);
    setIsLoading(false);
  }

  const calculateUnitAverage = (grade: any) => {
    // Rules: 3 lists (1pt each) + 1 exam (4pts) + notebook (1.5pts) + anki (1.5pts) = 10pts
    const sum = (grade.list1_score || 0) + 
                (grade.list2_score || 0) + 
                (grade.list3_score || 0) + 
                (grade.exam_score || 0) + 
                (grade.notebook_score || 0) + 
                (grade.anki_score || 0);
    
    // Recovery logic:
    // If recovery exists:
    // Case 1: Student was below 5. New grade is MAX(original, recovery), max 5.
    // Case 2: Student was 5 or above. New grade is original + recovery, max 10.
    if (grade.recovery_score !== undefined && grade.recovery_score !== null) {
      if (sum < 5) {
        return Math.min(5, Math.max(sum, grade.recovery_score));
      } else {
        return Math.min(10, sum + grade.recovery_score);
      }
    }
    
    return Math.min(10, sum);
  };

  const handleSaveGrade = async (unitData: any) => {
    const average = calculateUnitAverage(unitData);
    const dataToSave = {
      ...unitData,
      student_id: selectedStudentId,
      unit_average: average
    };

    let res;
    if (unitData.id) {
      res = await supabase.from('grades').update(dataToSave).eq('id', unitData.id);
    } else {
      res = await supabase.from('grades').insert([dataToSave]);
    }

    if (!res.error) {
      fetchGrades(selectedStudentId);
      alert('Notas salvas com sucesso!');
    }
  };

  const getUnitGrade = (unit: number) => {
    return grades.find(g => g.unit === unit) || {
      unit,
      list1_score: 0,
      list2_score: 0,
      list3_score: 0,
      exam_score: 0,
      notebook_score: 0,
      anki_score: 0,
      recovery_score: null
    };
  };

  const calculateYearlyAverage = () => {
    const avg = grades.length > 0 
      ? grades.reduce((acc, g) => acc + g.unit_average, 0) / 3 
      : 0;
    
    // Yearly recovery logic
    const yearlyRecovery = grades.find(g => g.unit === 4); // Use unit 4 as yearly recovery
    if (yearlyRecovery && yearlyRecovery.recovery_score !== null) {
      if (avg < 5) {
        return Math.max(avg, yearlyRecovery.recovery_score);
      } else {
        return Math.min(10, avg + yearlyRecovery.recovery_score);
      }
    }
    return avg;
  };

  const finalAverage = calculateYearlyAverage();

  return (
    <div className="space-y-8">
      {/* Selection Header */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-6">
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
          <label className="text-xs font-bold uppercase text-slate-400">Buscar Aluno</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Nome do aluno..." 
              value={studentNameSearch}
              onChange={(e) => setStudentNameSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow text-sm"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-slate-400">Selecionar Aluno</label>
          <select 
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow"
          >
            <option value="">Selecionar Aluno</option>
            {students
              .filter(s => s.name.toLowerCase().includes(studentNameSearch.toLowerCase()))
              .map(s => <option key={s.id} value={s.id}>{s.roll_number}. {s.name}</option>)}
          </select>
        </div>
      </div>

      {selectedStudentId ? (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Summary Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-brand-blue-dark text-white p-8 rounded-3xl shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Trophy size={80} />
              </div>
              <p className="text-brand-gray text-sm font-medium mb-1">Média Final</p>
              <h4 className="text-5xl font-bold mb-4">{finalAverage.toFixed(1)}</h4>
              <div className={cn(
                "inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold uppercase",
                finalAverage >= 5 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
              )}>
                {finalAverage >= 5 ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {finalAverage >= 5 ? 'Aprovado' : 'Reprovado'}
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
              <h5 className="font-bold text-brand-blue-dark mb-4 flex items-center gap-2">
                <TrendingUp size={18} className="text-brand-gold" />
                Progresso por Unidade
              </h5>
              <div className="space-y-4">
                {[1, 2, 3].map(u => {
                  const g = getUnitGrade(u);
                  const avg = g.unit_average || 0;
                  return (
                    <div key={u} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-500">Unidade {u}</span>
                        <span className={avg >= 5 ? "text-emerald-600" : "text-red-500"}>{avg.toFixed(1)}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${avg * 10}%` }}
                          className={cn("h-full", avg >= 5 ? "bg-emerald-500" : "bg-red-500")}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Grading Tabs */}
          <div className="lg:col-span-3 space-y-6">
            <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl w-fit">
              {[1, 2, 3, 4].map(u => (
                <button
                  key={u}
                  onClick={() => setCurrentUnit(u)}
                  className={cn(
                    "px-8 py-3 rounded-xl font-bold transition-all",
                    currentUnit === u ? "bg-white text-brand-blue shadow-md" : "text-slate-500 hover:text-brand-blue"
                  )}
                >
                  {u === 4 ? 'Recup. Final' : `Unidade ${u}`}
                </button>
              ))}
            </div>

            {currentUnit === 4 ? (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100"
              >
                <h4 className="text-2xl font-serif font-bold text-brand-blue-dark mb-6">Recuperação Final do Ano</h4>
                <div className="p-6 bg-amber-50 rounded-2xl border border-amber-100 space-y-6">
                  <p className="text-amber-800">
                    A recuperação final é aplicada sobre a média das 3 unidades. 
                    Se a média for inferior a 5, a nota da recuperação substitui se for maior.
                    Se a média for 5 ou mais, a nota é acrescida (máximo 10).
                  </p>
                  <div className="flex items-center justify-between max-w-xs">
                    <span className="font-bold text-amber-900">Nota da Recuperação Final</span>
                    <input 
                      type="number" 
                      step="0.1"
                      value={getUnitGrade(4).recovery_score || ''}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        handleSaveGrade({ ...getUnitGrade(4), recovery_score: val, unit: 4 });
                      }}
                      className="w-24 p-3 bg-white border border-amber-200 rounded-xl text-center font-bold text-amber-900"
                    />
                  </div>
                </div>
              </motion.div>
            ) : (
              <UnitGradeForm 
                unit={currentUnit} 
                grade={getUnitGrade(currentUnit)} 
                onSave={handleSaveGrade}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-32 bg-white rounded-3xl border border-dashed border-slate-200">
          <Users size={64} className="mx-auto text-slate-200 mb-4" />
          <h4 className="text-xl font-serif font-bold text-brand-blue-dark">Selecione um aluno para gerenciar</h4>
          <p className="text-slate-400">Escolha uma turma e um aluno acima para visualizar o boletim.</p>
        </div>
      )}
    </div>
  );
}

function UnitGradeForm({ unit, grade, onSave }: { unit: number, grade: any, onSave: (data: any) => void }) {
  const [localGrade, setLocalGrade] = useState(grade);

  useEffect(() => {
    setLocalGrade(grade);
  }, [grade]);

  const handleChange = (field: string, value: string) => {
    const num = parseFloat(value) || 0;
    setLocalGrade({ ...localGrade, [field]: num });
  };

  return (
    <motion.div 
      key={unit}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100"
    >
      <div className="flex justify-between items-center mb-8">
        <h4 className="text-2xl font-serif font-bold text-brand-blue-dark">Lançamento de Notas - Unidade {unit}</h4>
        <div className="px-4 py-2 bg-brand-yellow/10 text-brand-blue-dark rounded-xl font-bold flex items-center gap-2">
          <Calculator size={18} />
          Média: {grade.unit_average?.toFixed(1) || '0.0'}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Listas */}
        <div className="space-y-4">
          <h5 className="text-sm font-bold text-brand-blue-dark uppercase flex items-center gap-2">
            <BookOpen size={16} className="text-brand-gold" />
            Listas (1.0 cada)
          </h5>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-sm font-medium text-slate-600">Lista {i}</span>
                <input 
                  type="number" 
                  step="0.1"
                  max="1"
                  value={localGrade[`list${i}_score`]}
                  onChange={(e) => handleChange(`list${i}_score`, e.target.value)}
                  className="w-16 p-1 bg-white border border-slate-200 rounded text-center font-bold"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Prova e Outros */}
        <div className="space-y-4">
          <h5 className="text-sm font-bold text-brand-blue-dark uppercase flex items-center gap-2">
            <CheckSquare size={16} className="text-brand-gold" />
            Avaliações
          </h5>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <span className="text-sm font-medium text-slate-600">Prova (4.0)</span>
              <input 
                type="number" 
                step="0.1"
                max="4"
                value={localGrade.exam_score}
                onChange={(e) => handleChange('exam_score', e.target.value)}
                className="w-16 p-1 bg-white border border-slate-200 rounded text-center font-bold"
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <span className="text-sm font-medium text-slate-600">Caderno (1.5)</span>
              <input 
                type="number" 
                step="0.1"
                max="1.5"
                value={localGrade.notebook_score}
                onChange={(e) => handleChange('notebook_score', e.target.value)}
                className="w-16 p-1 bg-white border border-slate-200 rounded text-center font-bold"
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <span className="text-sm font-medium text-slate-600">Anki (1.5)</span>
              <input 
                type="number" 
                step="0.1"
                max="1.5"
                value={localGrade.anki_score}
                onChange={(e) => handleChange('anki_score', e.target.value)}
                className="w-16 p-1 bg-white border border-slate-200 rounded text-center font-bold"
              />
            </div>
          </div>
        </div>

        {/* Recuperação */}
        <div className="space-y-4">
          <h5 className="text-sm font-bold text-brand-blue-dark uppercase flex items-center gap-2 text-amber-600">
            <AlertTriangle size={16} />
            Recuperação
          </h5>
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 space-y-4">
            <p className="text-xs text-amber-800">
              A nota de recuperação será somada à média (se aprovado, max 10) ou substituirá a média (se reprovado, max 5).
            </p>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-amber-900">Nota Final</span>
              <input 
                type="number" 
                step="0.1"
                value={localGrade.recovery_score || ''}
                onChange={(e) => handleChange('recovery_score', e.target.value)}
                placeholder="-"
                className="w-20 p-2 bg-white border border-amber-200 rounded-lg text-center font-bold text-amber-900"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 pt-6 border-t border-slate-100 flex justify-end">
        <button 
          onClick={() => onSave(localGrade)}
          className="flex items-center gap-2 bg-brand-blue text-white px-8 py-3 rounded-xl font-bold hover:bg-brand-blue-dark shadow-lg transition-all"
        >
          <Save size={20} />
          Salvar Notas da Unidade
        </button>
      </div>
    </motion.div>
  );
}
