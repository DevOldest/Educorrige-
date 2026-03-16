import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  FileText, 
  CheckSquare, 
  TrendingUp,
  AlertCircle,
  Clock,
  Loader2
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Dashboard() {
  const [stats, setStats] = useState([
    { label: 'Turmas Ativas', value: '0', icon: Users, color: 'bg-blue-500' },
    { label: 'Provas Corrigidas', value: '0', icon: CheckSquare, color: 'bg-emerald-500' },
    { label: 'Gabaritos Salvos', value: '0', icon: FileText, color: 'bg-amber-500' },
    { label: 'Média Geral', value: '0.0', icon: TrendingUp, color: 'bg-purple-500' },
  ]);
  const [recentActivities, setRecentActivities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    if (!supabase) return;
    setIsLoading(true);
    try {
      const [classesCount, resultsCount, assessmentsCount, avgGrade, recentRes] = await Promise.all([
        supabase.from('classes').select('*', { count: 'exact', head: true }),
        supabase.from('assessment_results').select('*', { count: 'exact', head: true }),
        supabase.from('assessments').select('*', { count: 'exact', head: true }),
        supabase.from('assessment_results').select('total_score'),
        supabase.from('assessment_results')
          .select('*, students(name, classes(name)), assessments(title)')
          .order('created_at', { ascending: false })
          .limit(5)
      ]);

      const totalGrades = avgGrade.data?.reduce((acc, curr) => acc + (curr.total_score || 0), 0) || 0;
      const average = avgGrade.data?.length ? (totalGrades / avgGrade.data.length).toFixed(1) : '0.0';

      setStats([
        { label: 'Turmas Ativas', value: String(classesCount.count || 0), icon: Users, color: 'bg-blue-500' },
        { label: 'Provas Corrigidas', value: String(resultsCount.count || 0), icon: CheckSquare, color: 'bg-emerald-500' },
        { label: 'Gabaritos Salvos', value: String(assessmentsCount.count || 0), icon: FileText, color: 'bg-amber-500' },
        { label: 'Média Geral', value: average, icon: TrendingUp, color: 'bg-purple-500' },
      ]);

      if (recentRes.data) setRecentActivities(recentRes.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-20">
        <Loader2 className="animate-spin text-brand-gold" size={48} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className="p-6 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center gap-4"
          >
            <div className={cn("p-3 rounded-xl text-white", stat.color)}>
              <stat.icon size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">{stat.label}</p>
              <p className="text-2xl font-bold text-brand-blue-dark">{stat.value}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Alerts/Notifications */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-brand-blue-dark flex items-center gap-2">
            <AlertCircle size={20} className="text-brand-gold" />
            Avisos
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-sm">
              <p className="font-bold mb-1">Recuperação</p>
              <p>O sistema monitora automaticamente alunos com desempenho abaixo do esperado.</p>
            </div>
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-blue-800 text-sm">
              <p className="font-bold mb-1">Dica da IA</p>
              <p>Importe seus gabaritos em PDF para economizar tempo no cadastro de questões.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper for Dashboard
function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
