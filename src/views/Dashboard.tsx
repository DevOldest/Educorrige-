import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  CheckSquare, 
  TrendingUp,
  AlertCircle,
  Loader2,
  Filter,
  BarChart3,
  Search,
  BookOpen,
  PieChart as PieChartIcon,
  ChevronRight,
  ChevronDown,
  LayoutGrid,
  Presentation,
  Download,
  Activity
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  Cell,
  Legend
} from 'recharts';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';

export default function Dashboard() {
  const [stats, setStats] = useState([
    { label: 'Média de Proficiência', value: '0.0', icon: TrendingUp, color: 'bg-brand-blue' },
  ]);

  const [isLoading, setIsLoading] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'overview' | 'skills-grid'>('overview');
  const [selectedSkillForSummary, setSelectedSkillForSummary] = useState<any>(null);

  const getSkillDescription = (code: string) => {
    const descriptions: Record<string, string> = {
      'EM13LP01': 'Relacionar o texto com seu contexto de produção e sua recepção.',
      'EM13LP02': 'Estabelecer relações entre partes de um texto e entre textos.',
      'EM13LP03': 'Analisar o funcionamento das linguagens para interpretar discursos.',
      'EM13LP04': 'Compreender as línguas como fenômeno geopolítico e cultural.',
      'EM13LP35': 'Utilizar criticamente linguagens e mídias na produção de sentidos.',
      'EM13LPA35': 'Utilizar criticamente linguagens e mídias na produção de sentidos (Linguagens).',
      'EM13LPA36': 'Explorar tecnologias digitais para produção e análise de conteúdos.',
      'EM13LPL03': 'Analisar criticamente o funcionamento das linguagens e discursos.',
      'EM13LPL04': 'Compreender o fenômeno das línguas em contextos de uso diversos.',
      'EM13CNT101': 'Analisar e interpretar resultados de investigações experimentais, as condições de evolução de sistemas com foco na conservação da matéria e da energia.',
      'EM13CNT102': 'Avaliar os riscos e os benefícios derivados da aplicação de tecnologias e do uso de materiais radioativos.',
      'EM13CNT103': 'Formular hipóteses, prever tendências e estimar valores relativos a processos químicos, biológicos e físicos.',
      'EM13CNT104': 'Avaliar os benefícios e os riscos à saúde e ao ambiente, considerando a composição, toxicidade e reatividade de materiais.',
      'EM13CNT105': 'Analisar os ciclos biogeoquímicos e os impactos decorrentes da interferência humana neles.',
      'EM13CNT201': 'Analisar e discutir modelos, teorias e leis propostos em diferentes épocas e culturas para comparar a estrutura da matéria.',
      'EM13CNT203': 'Avaliar e prever os efeitos de intervenções humanas nos ecossistemas e seus impactos na saúde pública.',
      'EM13CNT206': 'Discutir a importância da preservação e conservação da biodiversidade e as propriedades de substâncias orgânicas.',
      'EM13CNT301': 'Avaliar a eficiência de diferentes fontes de energia e os impactos ambientais e socioeconômicos de sua produção.',
      'EM13CNT302': 'Comunicar resultados de análises de dados sobre a presença de substâncias nocivas e propor ações de mitigação de riscos.',
      'EM13CNT303': 'Interpretar e avaliar textos de divulgação científica sobre temas como aquecimento global e acidificação dos oceanos.',
      'EM13CNT306': 'Avaliar os riscos e os benefícios de processos e produtos da indústria química e biotecnologia.',
      'EM13CNT307': 'Analisar as propriedades dos materiais para avaliar o potencial de flexibilidade, durabilidade, condutibilidade térmica e elétrica.',
      'EM13CNT309': 'Analisar as propriedades dos materiais e propor soluções tecnológicas para o descarte e reciclagem.',
      'EM13CNT310': 'Investigar e analisar os efeitos de substâncias químicas e poluentes no funcionamento do organismo humano e ecossistemas.',
      'LP12': 'Análise de gêneros textuais e produção de discursos acadêmicos.',
      'MA15': 'Resolução de problemas complexos envolvendo grandezas e medidas.',
    };
    
    const standardCode = code.replace(/^HGV/, '');
    return descriptions[standardCode] || descriptions[code] || 'Esta habilidade foca no desenvolvimento de competências analíticas e produtivas dentro da Base Nacional Comum Curricular.';
  };

  const [rawClasses, setRawClasses] = useState<any[]>([]);
  const [rawResults, setRawResults] = useState<any[]>([]);
  const [rawAnswers, setRawAnswers] = useState<any[]>([]);
  const [rawQuestions, setRawQuestions] = useState<any[]>([]);
  const [rawStudents, setRawStudents] = useState<any[]>([]);
  const [rawGrades, setRawGrades] = useState<any[]>([]);
  const [rawUnits, setRawUnits] = useState<any[]>([]);

  const [isMounted, setIsMounted] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    fetchDashboardData();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          setDarkMode(document.documentElement.classList.contains('dark'));
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
    setDarkMode(document.documentElement.classList.contains('dark'));

    return () => observer.disconnect();
  }, []);

  async function fetchDashboardData() {
    if (!supabase) return;
    setIsLoading(true);
    try {
      const [classesRes, resultsRes, answersRes, questionsRes, studentsRes, gradesRes, unitsRes] = await Promise.all([
        supabase.from('classes').select('*').order('name'),
        supabase.from('assessment_results').select('*, assessments(title, type, unit_id)'),
        supabase.from('student_answers').select('score, question_id, student_id, assessment_id'),
        supabase.from('questions').select('id, question_number, max_score, bncc_skills'),
        supabase.from('students').select('*, classes(name)'),
        supabase.from('grades').select('*'),
        supabase.from('units').select('*').order('name')
      ]);

      if (classesRes.data) setRawClasses(classesRes.data);
      if (resultsRes.data) setRawResults(resultsRes.data);
      if (answersRes.data) setRawAnswers(answersRes.data);
      if (questionsRes.data) setRawQuestions(questionsRes.data);
      if (studentsRes.data) setRawStudents(studentsRes.data);
      if (gradesRes.data) setRawGrades(gradesRes.data);
      if (unitsRes.data) setRawUnits(unitsRes.data);

      // Update basic stats
      const totalResults = resultsRes.data?.length || 0;
      const skillsSet = new Set();
      questionsRes.data?.forEach(q => q.bncc_skills?.forEach((s: string) => skillsSet.add(s)));

      // Calculate global proficiency (0-10 scale)
      // Including assessment results and general grades
      let sumOfAverages = 0;
      let count = 0;

      // From Assessment Results
      resultsRes.data?.forEach(r => {
        if (r.max_score > 0) {
          sumOfAverages += (r.total_score / r.max_score) * 10;
          count++;
        }
      });

      // From Grades Table (Notebook, Behavior, etc concatenated in unit_average)
      gradesRes.data?.forEach(g => {
        if (g.unit_average !== undefined && g.unit_average !== null) {
          sumOfAverages += g.unit_average;
          count++;
        }
      });

      const avgProficiency = count > 0 ? (sumOfAverages / count).toFixed(1) : '0.0';

      setStats([
        { label: 'Média de Proficiência', value: avgProficiency, icon: TrendingUp, color: 'bg-brand-blue' },
      ]);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  // Calculate skill mastery percentages
  const masteryData = useMemo(() => {
    const data: any = {
      skills: {} as Record<string, { totalScore: number, maxScore: number, occurrences: number }>,
      students: {} as Record<string, any>,
      classes: {} as Record<string, any>
    };

    // Index questions by ID
    const questionMap = new Map();
    rawQuestions.forEach(q => questionMap.set(q.id, q));

    // Calculate per answer
    rawAnswers.forEach(ans => {
      const q = questionMap.get(ans.question_id);
      if (!q || !q.bncc_skills) return;

      const student = rawStudents.find(s => s.id === ans.student_id);
      if (!student) return;

      q.bncc_skills.forEach((skill: string) => {
        // Global
        if (!data.skills[skill]) data.skills[skill] = { totalScore: 0, maxScore: 0, occurrences: 0 };
        data.skills[skill].totalScore += ans.score || 0;
        data.skills[skill].maxScore += q.max_score || 0;
        data.skills[skill].occurrences += 1;

        // Per Student
        if (!data.students[ans.student_id]) {
          data.students[ans.student_id] = { 
            name: student.name, 
            classId: student.class_id,
            className: student.classes?.name,
            skills: {} 
          };
        }
        if (!data.students[ans.student_id].skills[skill]) {
          data.students[ans.student_id].skills[skill] = { totalScore: 0, maxScore: 0 };
        }
        data.students[ans.student_id].skills[skill].totalScore += ans.score || 0;
        data.students[ans.student_id].skills[skill].maxScore += q.max_score || 0;

        // Per Class
        if (!data.classes[student.class_id]) {
          data.classes[student.class_id] = { name: student.classes?.name, skills: {} };
        }
        if (!data.classes[student.class_id].skills[skill]) {
          data.classes[student.class_id].skills[skill] = { totalScore: 0, maxScore: 0 };
        }
        data.classes[student.class_id].skills[skill].totalScore += ans.score || 0;
        data.classes[student.class_id].skills[skill].maxScore += q.max_score || 0;
      });
    });

    return data;
  }, [rawAnswers, rawQuestions, rawStudents, rawClasses]);

  // Filtered data for charts/tables
  const filteredSkills = useMemo(() => {
    let skillList = Object.entries(masteryData.skills).map(([code, meta]: any) => ({
      code,
      name: code,
      percentage: (meta.totalScore / meta.maxScore) * 100
    }));

    if (searchTerm) {
      skillList = skillList.filter(s => s.code.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    return skillList.sort((a, b) => b.percentage - a.percentage);
  }, [masteryData.skills, searchTerm]);

  const studentDetailedGrid = useMemo(() => {
    // Only show students if a class is selected
    if (!selectedClassId) return [];

    const baseStudents = rawStudents.filter(s => s.class_id === selectedClassId);
    
    if (!rawStudents || rawStudents.length === 0) return [];
    
    let list = baseStudents.map((s: any) => {
      const studentMastery = masteryData.students[s.id] || { skills: {} };
      const skillsValues = Object.values(studentMastery.skills).map((sk: any) => (sk.totalScore / sk.maxScore) * 100);
      const avg = skillsValues.length > 0 ? skillsValues.reduce((a, b) => a + b, 0) / skillsValues.length : 0;
      return { 
        ...s, 
        className: s.classes?.name,
        skills: studentMastery.skills,
        globalAverage: avg 
      };
    });
    
    if (searchTerm) {
      list = list.filter((s: any) => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    return list.sort((a: any, b: any) => a.name.localeCompare(b.name));
  }, [masteryData.students, rawStudents, selectedClassId, searchTerm]);

  // Calculate evolution data
  const evolutionData = useMemo(() => {
    if (!rawUnits.length) return [];

    return rawUnits.map(unit => {
      let sum = 0;
      let count = 0;

      // Filter by selected student or class
      const filteredResults = rawResults.filter(r => {
        const matchesClass = selectedClassId ? r.class_id === selectedClassId : true;
        const matchesStudent = searchTerm ? rawStudents.find(s => s.id === r.student_id)?.name.toLowerCase().includes(searchTerm.toLowerCase()) : true;
        return matchesClass && matchesStudent && r.assessments?.unit_id === unit.id;
      });

      filteredResults.forEach(r => {
        if (r.max_score > 0) {
          sum += (r.total_score / r.max_score) * 10;
          count++;
        }
      });

      const filteredGrades = rawGrades.filter(g => {
        const matchesClass = selectedClassId ? rawStudents.find(s => s.id === g.student_id)?.class_id === selectedClassId : true;
        const matchesStudent = searchTerm ? rawStudents.find(s => s.id === g.student_id)?.name.toLowerCase().includes(searchTerm.toLowerCase()) : true;
        return matchesClass && matchesStudent && g.unit_id === unit.id;
      });

      filteredGrades.forEach(g => {
        if (g.unit_average) {
          sum += g.unit_average;
          count++;
        }
      });

      return {
        name: unit.name,
        media: count > 0 ? Number((sum / count).toFixed(1)) : null
      };
    });
  }, [rawUnits, rawResults, rawGrades, selectedClassId, searchTerm, rawStudents]);

  const exportToExcel = (data: any[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  const handleExportGeneral = () => {
    const data = [
      { Métrica: 'Média de Proficiência', Valor: stats[0].value }
    ];
    exportToExcel(data, 'Visao_Geral_Dashboard');
  };

  const handleExportSkills = () => {
    const data = filteredSkills.map(s => ({
      Codigo: s.code,
      Descricao: getSkillDescription(s.code),
      Proficiencia: `${s.percentage.toFixed(1)}%`
    }));
    exportToExcel(data, 'Mapa_de_Calor_Habilidades');
  };

  const handleExportHeatmap = () => {
    const data = studentDetailedGrid.map(student => {
      const row: any = {
        Estudante: student.name,
        'Média Geral': `${student.globalAverage.toFixed(1)}%`
      };
      
      filteredSkills.slice(0, 10).forEach(skill => {
        const mastery = student.skills[skill.code];
        const pct = mastery ? (mastery.totalScore / mastery.maxScore) * 100 : null;
        row[skill.code] = pct !== null ? `${pct.toFixed(0)}%` : 'N/A';
      });
      
      return row;
    });
    exportToExcel(data, 'Mapa_de_Calor_Estudantes');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <div className="text-center space-y-4">
          <Loader2 className="animate-spin text-brand-gold mx-auto" size={48} />
          <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">Processando Metragem BNCC...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      {/* Header & Main Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-black text-brand-blue-dark dark:text-brand-yellow transition-colors">Dashboard Analítico BNCC</h1>
          <p className="text-slate-400 dark:text-slate-500 text-sm font-medium">Acompanhamento e evolução das habilidades por turma e série</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-white dark:bg-slate-900 p-1.5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex gap-1 transition-colors">
            <button 
              onClick={() => setViewMode('overview')}
              className={cn(
                "px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2",
                viewMode === 'overview' ? "bg-brand-blue text-white shadow-lg shadow-brand-blue/20" : "text-slate-500 hover:bg-slate-50"
              )}
            >
              <Presentation size={16} /> Visão Geral
            </button>
            <button 
              onClick={() => setViewMode('skills-grid')}
              className={cn(
                "px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2",
                viewMode === 'skills-grid' ? "bg-brand-blue text-white shadow-lg shadow-brand-blue/20" : "text-slate-500 hover:bg-slate-50"
              )}
            >
              <LayoutGrid size={16} /> Mapa de Calor por Aluno
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:flex md:justify-center gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-8 rounded-[2.5rem] bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/50 dark:shadow-black/20 border border-slate-100 dark:border-slate-800 flex flex-col items-center text-center gap-4 w-full md:max-w-[350px] relative group transition-colors"
          >
            <button 
              onClick={handleExportGeneral}
              className="absolute top-4 right-4 p-2 bg-slate-50 dark:bg-slate-800 rounded-xl text-slate-400 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/5 transition-all opacity-0 group-hover:opacity-100"
              title="Exportar Visão Geral"
            >
              <Download size={16} />
            </button>
            <div className={cn("p-5 rounded-3xl text-white shadow-lg", stat.color)}>
              <stat.icon size={32} />
            </div>
            <div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-[0.2em] leading-none mb-2">{stat.label}</p>
              <p className="text-5xl font-black text-brand-blue-dark dark:text-brand-yellow tabular-nums transition-colors">{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {viewMode === 'overview' ? (
          <motion.div 
            key="overview"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* Left Column: Charts */}
            <div className="lg:col-span-2 space-y-8">
              {/* Performance by Skill */}
              <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden relative transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl text-indigo-600 dark:text-indigo-400">
                      <BarChart3 size={24} />
                    </div>
                    <div>
                      <h3 className="font-black text-brand-blue-dark dark:text-brand-yellow transition-colors">Proficiência por Habilidade</h3>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Média por código BNCC</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button 
                      onClick={handleExportSkills}
                      className="flex items-center gap-2 px-5 py-2.5 bg-brand-blue/5 dark:bg-brand-blue/10 text-brand-blue dark:text-brand-yellow rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-blue hover:text-white transition-all shadow-sm"
                    >
                      <Download size={14} /> Exportar Excel
                    </button>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600" size={16} />
                      <input 
                        type="text" 
                        placeholder="Buscar habilidade..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-11 pr-5 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl text-xs font-bold focus:ring-2 focus:ring-brand-blue w-full sm:w-64 transition-all dark:text-slate-200 dark:placeholder-slate-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="h-[400px] sm:h-[500px] relative w-full overflow-hidden">
                  {isMounted && (
                    <ResponsiveContainer width="100%" height="100%" minHeight={0}>
                      <BarChart 
                        layout="vertical" 
                        data={filteredSkills.slice(0, 10)}
                        margin={{ left: -20, right: 20, bottom: 20 }}
                      >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis 
                        type="number"
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fontWeight: 900, fill: '#64748b' }} 
                        domain={[0, 100]}
                        tickFormatter={(val) => `${val}%`}
                      />
                      <YAxis 
                        dataKey="code"
                        type="category"
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fontWeight: 900, fill: '#64748b' }}
                        width={100}
                      />
                      <Bar 
                        dataKey="percentage" 
                        radius={[0, 12, 12, 0]} 
                        barSize={24}
                        onClick={(data) => setSelectedSkillForSummary(data)}
                        className="cursor-pointer"
                      >
                        {filteredSkills.slice(0, 10).map((entry: any, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={entry.percentage >= 70 ? '#10b981' : entry.percentage >= 50 ? '#f59e0b' : '#ef4444'} 
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

                <AnimatePresence>
                  {selectedSkillForSummary && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-8 p-6 bg-slate-50 rounded-3xl border border-slate-100 relative"
                    >
                      <button 
                        onClick={() => setSelectedSkillForSummary(null)}
                        className="absolute top-4 right-4 p-2 hover:bg-white rounded-xl text-slate-400 transition-colors"
                      >
                        <ChevronDown size={20} />
                      </button>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-white rounded-2xl shadow-sm text-brand-blue">
                          <BookOpen size={24} />
                        </div>
                        <div>
                          <h4 className="font-black text-brand-blue-dark">Resumo: {selectedSkillForSummary.code}</h4>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Detalhamento da Competência</p>
                        </div>
                      </div>
                      <div className="bg-white p-5 rounded-3xl mb-6 shadow-sm border border-slate-100">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-2 italic">Definição Pedagógica</p>
                        <p className="text-sm text-slate-600 font-medium leading-relaxed">{getSkillDescription(selectedSkillForSummary.code)}</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white p-4 rounded-2xl shadow-sm">
                          <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Proficiência</p>
                          <p className="text-xl font-black text-brand-blue-dark">{selectedSkillForSummary.percentage.toFixed(1)}%</p>
                        </div>
                        <div className="bg-white p-4 rounded-2xl shadow-sm">
                          <p className="text-[10px] text-slate-400 font-black uppercase mb-1">Status BNCC</p>
                          <p className={cn(
                            "text-xl font-black",
                            selectedSkillForSummary.percentage >= 70 ? "text-emerald-500" : 
                            selectedSkillForSummary.percentage >= 50 ? "text-amber-500" : 
                            "text-red-500"
                          )}>
                            {selectedSkillForSummary.percentage >= 70 ? 'Atingida' : selectedSkillForSummary.percentage >= 50 ? 'Em Desenvolvimento' : 'Crítico'}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Evolution Chart */}
              <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-800 transition-colors">
                <div className="flex items-center gap-3 mb-10">
                  <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/30 rounded-2xl text-indigo-600 dark:text-indigo-400">
                    <Activity size={24} />
                  </div>
                  <div>
                    <h3 className="font-black text-brand-blue-dark dark:text-brand-yellow transition-colors">Acompanhamento de Evolução</h3>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Progresso consolidado por unidade</p>
                  </div>
                </div>

                <div className="h-[350px] relative w-full overflow-hidden">
                  {isMounted && (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={evolutionData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={darkMode ? "#334155" : "#f1f5f9"} />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 900, fill: darkMode ? '#94a3b8' : '#64748b' }}
                          dy={10}
                        />
                        <YAxis 
                          domain={[0, 10]} 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fontWeight: 900, fill: darkMode ? '#94a3b8' : '#64748b' }}
                          dx={-10}
                        />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              return (
                                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 transition-colors">
                                  <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase mb-1">{payload[0].payload.name}</p>
                                  <p className="text-xl font-black text-brand-blue-dark dark:text-brand-yellow transition-colors">{payload[0].value}</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="media" 
                          stroke={darkMode ? "#E3B364" : "#0A2540"} 
                          strokeWidth={4} 
                          dot={{ r: 6, fill: darkMode ? '#E3B364' : '#0A2540', strokeWidth: 0 }} 
                          activeDot={{ r: 8, strokeWidth: 0 }}
                          connectNulls
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Alerts & Skill List */}
            <div className="space-y-8">
              <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col h-full sticky top-8 transition-colors">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 rounded-2xl text-amber-600 dark:text-amber-400">
                    <Filter size={24} />
                  </div>
                  <h3 className="font-black text-brand-blue-dark dark:text-brand-yellow transition-colors italic">Habilidades Rank</h3>
                </div>

                <div className="space-y-4 flex-1 overflow-y-auto pr-3 max-h-[800px] custom-scrollbar scroll-smooth">
                  {filteredSkills.map((skill, idx) => (
                    <div key={skill.code} className="p-5 rounded-3xl bg-slate-50/50 dark:bg-slate-800/30 border border-transparent hover:border-slate-100 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-800 hover:shadow-xl hover:shadow-slate-100/50 transition-all duration-300 group">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-black shadow-sm group-hover:scale-110 transition-transform",
                            skill.percentage >= 70 ? "bg-emerald-500 text-white" : 
                            skill.percentage >= 50 ? "bg-amber-500 text-white" : 
                            "bg-red-500 text-white"
                          )}>
                            {idx + 1}
                          </div>
                          <div>
                            <p className="text-sm font-black text-brand-blue-dark dark:text-brand-yellow tracking-tight transition-colors">{skill.code}</p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Base curricular</p>
                          </div>
                        </div>
                        <span className="text-xl font-black text-brand-blue-dark dark:text-brand-yellow tabular-nums transition-colors">{skill.percentage.toFixed(0)}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden p-0.5">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${skill.percentage}%` }}
                          className={cn(
                            "h-full rounded-full",
                            skill.percentage >= 70 ? "bg-emerald-500" : 
                            skill.percentage >= 50 ? "bg-amber-500" : 
                            "bg-red-500"
                          )}
                        />
                      </div>
                    </div>
                  ))}
                  {filteredSkills.length === 0 && (
                    <div className="py-20 text-center space-y-3">
                      <div className="p-4 bg-slate-50 inline-block rounded-full text-slate-300">
                        <Search size={32} />
                      </div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Busca sem resultados</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="skills-grid"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="bg-white dark:bg-slate-900 rounded-[3rem] shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden transition-colors"
          >
            {/* Grid Header / Filters */}
            <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-6 bg-slate-50/30 dark:bg-slate-800/10 transition-colors">
              <div className="flex flex-wrap items-center gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Turma</label>
                  <select 
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="pl-5 pr-10 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-black focus:ring-2 focus:ring-brand-blue shadow-sm appearance-none min-w-[180px] dark:text-slate-200"
                  >
                    <option value="">Todas Turmas</option>
                    {rawClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Estudante</label>
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600" size={16} />
                    <input 
                      type="text" 
                      placeholder="Buscar por nome..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-11 pr-5 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-brand-blue shadow-sm w-64 dark:text-slate-200 dark:placeholder-slate-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={handleExportHeatmap}
                  className="flex items-center gap-2 px-5 py-3 bg-brand-blue text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-brand-blue-dark transition-all shadow-lg shadow-brand-blue/20"
                >
                  <Download size={14} /> Exportar Matriz
                </button>
                <div className="flex items-center gap-4 bg-white dark:bg-slate-800 px-5 py-3 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-inner transition-colors">
                <span className="flex items-center gap-2 text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase transition-colors">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm" /> Brilhante
                </span>
                <span className="flex items-center gap-2 text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase transition-colors">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm" /> Regular
                </span>
                <span className="flex items-center gap-2 text-[10px] font-black text-red-600 dark:text-red-400 uppercase transition-colors">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-sm" /> Alerta
                </span>
              </div>
              </div>
            </div>

            {/* Grid Table */}
            <div className="overflow-x-auto custom-scrollbar -mx-4 sm:mx-0">
              {!selectedClassId ? (
                <div className="py-20 sm:py-32 text-center px-6">
                  <div className="w-20 h-20 bg-brand-blue/5 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-brand-blue">
                    <Filter size={40} />
                  </div>
                  <h3 className="text-lg font-black text-brand-blue-dark uppercase tracking-tight">Aguardando Seleção</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-2">Escolha uma turma acima para visualizar o mapa de calor</p>
                </div>
              ) : (
                <>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 transition-colors">
                        <th className="py-6 px-8 text-[11px] font-black uppercase text-slate-400 dark:text-slate-500 min-w-[280px] sticky left-0 bg-white dark:bg-slate-900 z-20 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)] transition-colors">
                          Estudante
                        </th>
                        <th className="py-6 px-1 text-[11px] font-black uppercase text-brand-blue dark:text-brand-yellow text-center min-w-[110px] transition-colors">
                          <div className="bg-brand-blue/5 dark:bg-brand-blue/10 py-3 rounded-2xl">
                            Média Geral
                          </div>
                        </th>
                        {filteredSkills.slice(0, 10).map(skill => (
                          <th key={skill.code} className="py-6 px-1 text-[11px] font-black uppercase text-slate-400 dark:text-slate-500 text-center min-w-[110px] transition-colors">
                            <div className="bg-slate-50/50 dark:bg-slate-800/50 py-3 rounded-2xl truncate px-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-help" title={skill.code}>
                              {skill.code}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50 transition-colors">
                      {studentDetailedGrid.map((student: any, sIdx: number) => (
                        <motion.tr 
                          key={student.id || student.name} 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: sIdx * 0.05 }}
                          className="group transition-all hover:bg-slate-50/30 dark:hover:bg-slate-800/10"
                        >
                          <td className="py-5 px-8 sticky left-0 bg-white dark:bg-slate-900 z-10 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)] group-hover:bg-slate-50/30 dark:group-hover:bg-slate-800/10 transition-colors">
                            <p className="text-sm font-black text-brand-blue-dark dark:text-brand-yellow transition-colors">{student.name}</p>
                          </td>
                          <td className="py-5 px-1 text-center font-black text-brand-blue dark:text-brand-yellow transition-colors">
                            <div className="bg-brand-blue/5 dark:bg-brand-blue/10 py-2 rounded-2xl text-xs">
                              {student.globalAverage.toFixed(1)}%
                            </div>
                          </td>
                          {filteredSkills.slice(0, 10).map(skill => {
                            const mastery = student.skills[skill.code];
                            const pct = mastery ? (mastery.totalScore / mastery.maxScore) * 100 : null;
                            
                            return (
                              <td key={skill.code} className="py-5 px-1 text-center">
                                {pct !== null ? (
                                  <div className={cn(
                                    "mx-auto w-16 py-2 rounded-2xl text-xs font-black shadow-sm transform transition-transform group-hover:scale-105",
                                    pct >= 70 ? "bg-emerald-500 text-white" : 
                                    pct >= 50 ? "bg-amber-500 text-white" : 
                                    "bg-red-500 text-white"
                                  )}>
                                    {pct.toFixed(0)}%
                                  </div>
                                ) : (
                                  <div className="w-8 h-1 bg-slate-100 rounded-full mx-auto" title="Sem dados para esta habilidade" />
                                )}
                              </td>
                            );
                          })}
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                  {studentDetailedGrid.length === 0 && (
                    <div className="py-32 text-center">
                      <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-slate-200">
                        <Users size={40} />
                      </div>
                      <p className="text-sm font-black text-slate-400 uppercase tracking-widest italic">Nenhum rastro de atividade encontrado</p>
                      <p className="text-xs text-slate-300 mt-2">Ajuste os filtros ou verifique se as atividades possuem BNCC vinculada.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          height: 10px;
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: ${darkMode ? '#0f172a' : '#f8fafc'};
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: ${darkMode ? '#334155' : '#e2e8f0'};
          border-radius: 20px;
          border: 2px solid ${darkMode ? '#0f172a' : '#f8fafc'};
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: ${darkMode ? '#475569' : '#cbd5e1'};
        }
        .letter-spacing-widest {
          letter-spacing: 0.1em;
        }
      `}</style>
    </div>
  );
}
