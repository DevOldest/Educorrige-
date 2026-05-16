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
  CheckSquare,
  FileSpreadsheet,
  Download,
  Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import CustomModal from '../components/CustomModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ManagementView() {
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [grades, setGrades] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [unitClosingData, setUnitClosingData] = useState<any[]>([]);
  const [isGeneratingClosing, setIsGeneratingClosing] = useState(false);
  const [showClosingModal, setShowClosingModal] = useState(false);
  const [isGeneratingAllClosing, setIsGeneratingAllClosing] = useState(false);

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
    if (selectedClassId) {
      fetchStudents(selectedClassId);
    }
  }, [selectedClassId]);

  useEffect(() => {
    if (selectedStudentId) {
      fetchGrades(selectedStudentId);
    }
  }, [selectedStudentId]);

  async function fetchInitialData() {
    if (!supabase) return;
    const [classesRes, unitsRes] = await Promise.all([
      supabase.from('classes').select('*').order('name'),
      supabase.from('units').select('*').order('name')
    ]);
    if (classesRes.data) setClasses(classesRes.data);
    if (unitsRes.data) {
      setUnits(unitsRes.data);
      if (unitsRes.data.length > 0) setSelectedUnitId(unitsRes.data[0].id);
    }
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
        return Math.round(Math.min(5, Math.max(sum, grade.recovery_score)) * 10) / 10;
      } else {
        return Math.round(Math.min(10, sum + grade.recovery_score) * 10) / 10;
      }
    }
    
    return Math.round(Math.min(10, sum) * 10) / 10;
  };

  const handleGenerateUnitClosing = async () => {
    if (!selectedClassId || !selectedUnitId || !supabase) return;
    
    setIsGeneratingClosing(true);
    try {
      // 1. Fetch all students in class
      const { data: studentsList } = await supabase
        .from('students')
        .select('*')
        .eq('class_id', selectedClassId)
        .order('roll_number');

      if (!studentsList) return;

      // 2. Fetch all grades for this unit and class students
      const studentIds = studentsList.map(s => s.id);
      const { data: unitGrades } = await supabase
        .from('grades')
        .select('*')
        .eq('unit_id', selectedUnitId)
        .in('student_id', studentIds);

      // 3. Compile data
      const report = studentsList.map(student => {
        const grade = unitGrades?.find(g => g.student_id === student.id);
        const avg = grade ? (grade.unit_average || calculateUnitAverage(grade)) : 0;
        return {
          id: student.id,
          name: student.name,
          rollNumber: student.roll_number,
          average: avg,
          status: avg >= 5 ? 'Aprovado' : 'Recuperação',
          details: grade || null
        };
      });

      setUnitClosingData(report);
      setShowClosingModal(true);
    } catch (error) {
      console.error('Error generating closing:', error);
    } finally {
      setIsGeneratingClosing(false);
    }
  };

  const exportClosingToPDF = () => {
    if (unitClosingData.length === 0) return;

    const doc = new jsPDF();
    const className = classes.find(c => c.id === selectedClassId)?.name || 'Turma';
    const unitName = units.find(u => u.id === selectedUnitId)?.name || 'Unidade';

    doc.setFontSize(18);
    doc.setTextColor(10, 37, 64);
    doc.text(`Fechamento de Unidade - ${unitName}`, 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.text(`Turma: ${className}`, 20, 30);
    doc.text(`Data: ${new Date().toLocaleDateString()}`, 190, 30, { align: 'right' });

    const tableData = unitClosingData.map(item => [
      item.rollNumber,
      item.name,
      item.average.toFixed(1),
      item.status
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['Nº', 'Aluno', 'Média', 'Situação']],
      body: tableData,
      headStyles: { fillColor: [10, 37, 64] },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 30, halign: 'center' },
        3: { cellWidth: 40, halign: 'center' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 3) {
          if (data.cell.text[0] === 'Recuperação') {
            data.cell.styles.textColor = [220, 38, 38];
          } else {
            data.cell.styles.textColor = [5, 150, 105];
          }
        }
      }
    });

    doc.save(`Fechamento_${className}_${unitName}.pdf`);
  };

  const handleGenerateAllClassesClosing = async () => {
    if (!selectedUnitId || classes.length === 0 || !supabase) return;

    setIsGeneratingAllClosing(true);
    try {
      const doc = new jsPDF();
      const unitName = units.find(u => u.id === selectedUnitId)?.name || 'Unidade';
      
      for (let i = 0; i < classes.length; i++) {
        const currentClass = classes[i];
        
        // 1. Fetch students for this class
        const { data: studentsList } = await supabase
          .from('students')
          .select('*')
          .eq('class_id', currentClass.id)
          .order('roll_number');

        if (!studentsList || studentsList.length === 0) continue;

        // 2. Fetch grades for these students
        const studentIds = studentsList.map(s => s.id);
        const { data: unitGrades } = await supabase
          .from('grades')
          .select('*')
          .eq('unit_id', selectedUnitId)
          .in('student_id', studentIds);

        // 3. Compile class data
        const tableData = studentsList.map(student => {
          const grade = unitGrades?.find(g => g.student_id === student.id);
          const avg = grade ? (grade.unit_average || calculateUnitAverage(grade)) : 0;
          return [
            student.roll_number,
            student.name,
            avg.toFixed(1),
            avg >= 5 ? 'Aprovado' : 'Recuperação'
          ];
        });

        // 4. Add page to PDF
        if (i > 0) doc.addPage();
        
        doc.setFontSize(18);
        doc.setTextColor(10, 37, 64);
        doc.text(`Fechamento: ${unitName}`, 105, 20, { align: 'center' });
        
        doc.setFontSize(14);
        doc.text(`Turma: ${currentClass.name}`, 20, 32);
        doc.setFontSize(10);
        doc.text(`Data de Emissão: ${new Date().toLocaleDateString()}`, 190, 32, { align: 'right' });

        autoTable(doc, {
          startY: 40,
          head: [['Nº', 'Aluno', 'Média', 'Situação']],
          body: tableData,
          headStyles: { fillColor: [10, 37, 64] },
          columnStyles: {
            0: { cellWidth: 15 },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 30, halign: 'center' },
            3: { cellWidth: 40, halign: 'center' }
          },
          didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 3) {
              if (data.cell.text[0] === 'Recuperação') {
                data.cell.styles.textColor = [220, 38, 38];
              } else {
                data.cell.styles.textColor = [5, 150, 105];
              }
            }
          }
        });
      }

      doc.save(`Fechamento_Geral_${unitName}_${new Date().toLocaleDateString()}.pdf`);
      
      setModal({
        isOpen: true,
        title: 'Sucesso',
        message: 'O relatório de fechamento de todas as turmas foi gerado com sucesso.',
        type: 'success'
      });
    } catch (error) {
      console.error('Error in global closing:', error);
      setModal({ isOpen: true, title: 'Erro', message: 'Erro ao gerar relatório geral.', type: 'error' });
    } finally {
      setIsGeneratingAllClosing(false);
    }
  };

  const handleSaveGrade = async (unitData: any) => {
    const average = calculateUnitAverage(unitData);
    const dataToSave = {
      ...unitData,
      list1_score: Math.round((unitData.list1_score || 0) * 10) / 10,
      list2_score: Math.round((unitData.list2_score || 0) * 10) / 10,
      list3_score: Math.round((unitData.list3_score || 0) * 10) / 10,
      exam_score: Math.round((unitData.exam_score || 0) * 10) / 10,
      notebook_score: Math.round((unitData.notebook_score || 0) * 10) / 10,
      anki_score: Math.round((unitData.anki_score || 0) * 10) / 10,
      recovery_score: unitData.recovery_score !== null ? Math.round((unitData.recovery_score || 0) * 10) / 10 : null,
      student_id: selectedStudentId,
      unit_id: selectedUnitId,
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
      setModal({
        isOpen: true,
        title: 'Sucesso',
        message: 'Notas salvas com sucesso!',
        type: 'success'
      });
    } else {
      setModal({
        isOpen: true,
        title: 'Erro',
        message: 'Erro ao salvar notas.',
        type: 'error'
      });
    }
  };

  const getUnitGrade = (unitId: string) => {
    return grades.find(g => g.unit_id === unitId) || {
      unit_id: unitId,
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
      ? grades.reduce((acc, g) => acc + (g.unit_average || 0), 0) / 3 
      : 0;
    
    return avg;
  };

  const finalAverage = calculateYearlyAverage();

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

      {/* Selection Header */}
      <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-6 items-end transition-colors">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-slate-400">Turma</label>
          <select 
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow dark:text-white"
          >
            <option value="">Selecionar Turma</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-slate-400">Selecionar Aluno</label>
          <select 
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            className="w-full p-3 bg-slate-50 dark:bg-slate-800 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow dark:text-white"
            disabled={!selectedClassId}
          >
            <option value="">Selecionar Aluno</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.roll_number}. {s.name}</option>)}
          </select>
        </div>

        <button
          onClick={handleGenerateUnitClosing}
          disabled={!selectedClassId || !selectedUnitId || isGeneratingClosing}
          className="flex items-center justify-center gap-2 bg-brand-gold text-white p-3 rounded-xl font-bold hover:opacity-90 transition-all disabled:opacity-50 h-[48px] text-xs"
        >
          {isGeneratingClosing ? <Loader2 className="animate-spin" size={18} /> : <FileSpreadsheet size={18} />}
          Relatório Turma
        </button>

        <button
          onClick={handleGenerateAllClassesClosing}
          disabled={!selectedUnitId || isGeneratingAllClosing || classes.length === 0}
          className="flex items-center justify-center gap-2 bg-emerald-600 text-white p-3 rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 h-[48px] text-xs"
        >
          {isGeneratingAllClosing ? <Loader2 className="animate-spin" size={18} /> : <Printer size={18} />}
          Relatório de Todas as Turmas
        </button>
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

            <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
              <h5 className="font-bold text-brand-blue-dark dark:text-brand-yellow mb-4 flex items-center gap-2 transition-colors">
                <TrendingUp size={18} className="text-brand-gold" />
                Progresso por Unidade
              </h5>
              <div className="space-y-4">
                {units.map(u => {
                  const g = getUnitGrade(u.id);
                  const avg = g.unit_average || 0;
                  return (
                    <div key={u.id} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-500 dark:text-slate-400 uppercase">{u.name}</span>
                        <span className={avg >= 5 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}>{avg.toFixed(1)}</span>
                      </div>
                      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden transition-colors">
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
            <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl w-fit transition-colors">
              {units.map(u => (
                <button
                  key={u.id}
                  onClick={() => setSelectedUnitId(u.id)}
                  className={cn(
                    "px-8 py-3 rounded-xl font-bold transition-all",
                    selectedUnitId === u.id ? "bg-white dark:bg-slate-900 text-brand-blue dark:text-brand-yellow shadow-md" : "text-slate-500 dark:text-slate-400 hover:text-brand-blue dark:hover:text-brand-yellow"
                  )}
                >
                  {u.name}
                </button>
              ))}
            </div>

            <UnitGradeForm 
              unitName={units.find(u => u.id === selectedUnitId)?.name || ''} 
              grade={getUnitGrade(selectedUnitId)} 
              onSave={handleSaveGrade}
            />
          </div>
        </div>
      ) : (
        <div className="text-center py-32 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 transition-colors">
          <Users size={64} className="mx-auto text-slate-200 dark:text-slate-800 mb-4 transition-colors" />
          <h4 className="text-xl font-serif font-bold text-brand-blue-dark dark:text-brand-yellow transition-colors">Selecione um aluno para gerenciar</h4>
          <p className="text-slate-400 dark:text-slate-500 transition-colors">Escolha uma turma e um aluno acima para visualizar o boletim.</p>
        </div>
      )}

      {/* Unit Closing Modal */}
      <AnimatePresence>
        {showClosingModal && (
          <div className="fixed inset-0 bg-brand-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col transition-colors border dark:border-slate-800"
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-brand-blue-dark dark:bg-brand-black text-white transition-colors">
                <div>
                  <h3 className="text-xl font-bold">Fechamento de Unidade</h3>
                  <p className="text-brand-gray dark:text-slate-400 text-sm">
                    {classes.find(c => c.id === selectedClassId)?.name} - {units.find(u => u.id === selectedUnitId)?.name}
                  </p>
                </div>
                <button 
                  onClick={() => setShowClosingModal(false)}
                  className="p-2 hover:bg-white/10 rounded-full transition-all"
                >
                  <Users className="rotate-90" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-xs uppercase font-bold text-slate-400 dark:text-slate-500 transition-colors">
                        <th className="py-4 px-2">Nº</th>
                        <th className="py-4 px-2">Aluno</th>
                        <th className="py-4 px-2 text-center">Média</th>
                        <th className="py-4 px-2 text-center">Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unitClosingData.map((item) => (
                        <tr key={item.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors transition-colors">
                          <td className="py-4 px-2 font-bold text-slate-400 dark:text-slate-600">{item.rollNumber}</td>
                          <td className="py-4 px-2 font-bold text-brand-blue-dark dark:text-brand-yellow">{item.name}</td>
                          <td className="py-4 px-2 text-center font-black">
                            <span className={cn(
                              "px-3 py-1 rounded-lg",
                              item.average >= 5 ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20" : "text-red-500 bg-red-50 dark:bg-red-950/20"
                            )}>
                              {item.average.toFixed(1)}
                            </span>
                          </td>
                          <td className="py-4 px-2 text-center">
                            <span className={cn(
                              "text-[10px] font-black uppercase px-3 py-1 rounded-full",
                              item.status === 'Aprovado' ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                            )}>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex gap-4 justify-between transition-colors">
                <button 
                  onClick={exportClosingToPDF}
                  className="flex items-center gap-2 px-6 py-3 bg-brand-blue text-white rounded-xl font-bold hover:bg-brand-blue-dark shadow-md transition-all"
                >
                  <Printer size={18} />
                  Imprimir PDF
                </button>
                <button 
                  onClick={() => setShowClosingModal(false)}
                  className="px-8 py-3 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition-all transition-colors"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UnitGradeForm({ unitName, grade, onSave }: { unitName: string, grade: any, onSave: (data: any) => void }) {
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
      key={unitName}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 transition-colors"
    >
      <div className="flex justify-between items-center mb-8">
        <h4 className="text-2xl font-serif font-bold text-brand-blue-dark dark:text-brand-yellow">Lançamento de Notas - {unitName}</h4>
        <div className="px-4 py-2 bg-brand-yellow/10 dark:bg-brand-yellow/5 text-brand-blue-dark dark:text-brand-yellow rounded-xl font-bold flex items-center gap-2 transition-colors">
          <Calculator size={18} />
          Média: {grade.unit_average?.toFixed(1) || '0.0'}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8">
        {/* Listas */}
        <div className="space-y-4">
          <h5 className="text-sm font-bold text-brand-blue-dark dark:text-brand-yellow uppercase flex items-center gap-2 transition-colors">
            <BookOpen size={16} className="text-brand-gold" />
            Listas (1.0 cada)
          </h5>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl transition-colors">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Lista {i}</span>
                <input 
                  type="number" 
                  step="0.1"
                  max="1"
                  value={localGrade[`list${i}_score`]}
                  onChange={(e) => handleChange(`list${i}_score`, e.target.value)}
                  className="w-16 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-center font-bold dark:text-white transition-colors"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Prova e Outros */}
        <div className="space-y-4">
          <h5 className="text-sm font-bold text-brand-blue-dark dark:text-brand-yellow uppercase flex items-center gap-2 transition-colors">
            <CheckSquare size={16} className="text-brand-gold" />
            Avaliações
          </h5>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl transition-colors">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Prova (4.0)</span>
              <input 
                type="number" 
                step="0.1"
                max="4"
                value={localGrade.exam_score}
                onChange={(e) => handleChange('exam_score', e.target.value)}
                className="w-16 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-center font-bold dark:text-white transition-colors"
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl transition-colors transition-colors">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Caderno (1.5)</span>
              <input 
                type="number" 
                step="0.1"
                max="1.5"
                value={localGrade.notebook_score}
                onChange={(e) => handleChange('notebook_score', e.target.value)}
                className="w-16 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-center font-bold dark:text-white transition-colors"
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl transition-colors">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Anki (1.5)</span>
              <input 
                type="number" 
                step="0.1"
                max="1.5"
                value={localGrade.anki_score}
                onChange={(e) => handleChange('anki_score', e.target.value)}
                className="w-16 p-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-center font-bold dark:text-white transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Recuperação */}
        <div className="space-y-4 md:col-span-3 lg:col-span-1">
          <h5 className="text-sm font-bold text-brand-blue-dark dark:text-brand-yellow uppercase flex items-center gap-2 text-amber-600 dark:text-amber-500 transition-colors">
            <AlertTriangle size={16} />
            Recuperação
          </h5>
          <div className="p-4 bg-amber-50 dark:bg-amber-950/10 rounded-2xl border border-amber-100 dark:border-amber-900/30 space-y-4 transition-colors">
            <p className="text-xs text-amber-800 dark:text-amber-600">
              A nota de recuperação será somada à média (se aprovado, max 10) ou substituirá a média (se reprovado, max 5).
            </p>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-amber-900 dark:text-amber-500 transition-colors">Nota Final</span>
              <input 
                type="number" 
                step="0.1"
                value={localGrade.recovery_score || ''}
                onChange={(e) => handleChange('recovery_score', e.target.value)}
                placeholder="-"
                className="w-20 p-2 bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900 rounded-lg text-center font-bold text-amber-900 dark:text-brand-yellow transition-colors"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800 flex justify-end transition-colors">
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
