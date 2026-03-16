import React, { useState, useEffect } from 'react';
import { Search, Filter, FileText, Download, User, Calendar, ChevronRight, BarChart3, Users } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

export default function ReportsView() {
  const [results, setResults] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [filters, setFilters] = useState({
    classId: '',
    studentName: '',
    type: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    if (!supabase) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const [resultsRes, classesRes] = await Promise.all([
      supabase
        .from('assessment_results')
        .select('*, students(name, classes(name)), assessments(title, type)')
        .order('created_at', { ascending: false }),
      supabase.from('classes').select('*')
    ]);

    if (resultsRes.data) setResults(resultsRes.data);
    if (classesRes.data) setClasses(classesRes.data);
    setIsLoading(false);
  }

  const filteredResults = results.filter(r => {
    const matchesClass = filters.classId ? r.students?.classes?.id === filters.classId : true;
    const matchesName = filters.studentName ? r.students?.name.toLowerCase().includes(filters.studentName.toLowerCase()) : true;
    const matchesType = filters.type ? r.assessments?.type === filters.type : true;
    return matchesClass && matchesName && matchesType;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-serif font-bold text-brand-blue-dark">Relatórios de Correção</h3>
          <p className="text-slate-500">Acompanhe o histórico de todas as atividades corrigidas.</p>
        </div>
        <button className="flex items-center gap-2 bg-white border border-slate-200 text-brand-blue-dark px-6 py-3 rounded-xl font-bold hover:bg-slate-50 transition-all">
          <Download size={20} />
          Exportar Tudo
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Nome do aluno..." 
            value={filters.studentName}
            onChange={(e) => setFilters({ ...filters, studentName: e.target.value })}
            className="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow text-sm"
          />
        </div>
        <select 
          value={filters.classId}
          onChange={(e) => setFilters({ ...filters, classId: e.target.value })}
          className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow text-sm"
        >
          <option value="">Todas as Turmas</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select 
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          className="w-full p-3 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-yellow text-sm"
        >
          <option value="">Todos os Tipos</option>
          <option value="prova">Provas</option>
          <option value="lista">Listas</option>
        </select>
        <button 
          onClick={() => setFilters({ classId: '', studentName: '', type: '' })}
          className="text-brand-blue font-bold text-sm hover:underline"
        >
          Limpar Filtros
        </button>
      </div>

      {/* Results List */}
      <div className="space-y-4">
        {filteredResults.map((result, i) => (
          <motion.div
            key={result.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-brand-yellow transition-all"
          >
            <div className="flex items-center gap-6">
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center text-white font-bold",
                result.percentage >= 50 ? "bg-emerald-500" : "bg-red-500"
              )}>
                {Math.round(result.percentage)}%
              </div>
              <div>
                <h4 className="font-bold text-brand-blue-dark flex items-center gap-2">
                  {result.students?.name}
                  <ChevronRight size={14} className="text-slate-300" />
                  <span className="text-slate-400 font-medium">{result.assessments?.title}</span>
                </h4>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Users size={12} /> {result.students?.classes?.name}
                  </span>
                  <span className="text-xs text-slate-500 flex items-center gap-1">
                    <Calendar size={12} /> {new Date(result.created_at).toLocaleDateString()}
                  </span>
                  <span className={cn(
                    "text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                    result.assessments?.type === 'prova' ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                  )}>
                    {result.assessments?.type}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right mr-4">
                <p className="text-lg font-bold text-brand-blue-dark">{result.total_score} / {result.max_score}</p>
                <p className="text-xs text-slate-400">Pontuação Final</p>
              </div>
              <button className="p-3 bg-slate-50 text-brand-blue rounded-xl hover:bg-brand-blue hover:text-white transition-all">
                <FileText size={20} />
              </button>
            </div>
          </motion.div>
        ))}

        {filteredResults.length === 0 && !isLoading && (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
            <BarChart3 size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium">Nenhum resultado encontrado com os filtros selecionados.</p>
          </div>
        )}
      </div>
    </div>
  );
}
