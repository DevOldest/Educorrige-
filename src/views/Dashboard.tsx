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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-lg font-bold text-brand-blue-dark flex items-center gap-2">
            <Clock size={20} className="text-brand-gold" />
            Atividades Recentes
          </h3>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {recentActivities.length > 0 ? (
              recentActivities.map((activity, i) => (
                <div key={activity.id} className="p-4 border-b border-slate-50 last:border-0 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-brand-blue">
                      <FileText size={20} />
                    </div>
                    <div>
                      <p className="font-medium text-brand-blue-dark">{activity.assessments?.title}</p>
                      <p className="text-xs text-slate-500">
                        {activity.students?.name} • {activity.students?.classes?.name}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-600">Nota: {activity.total_score}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(activity.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-500">
                Nenhuma atividade recente encontrada.
              </div>
            )}
          </div>
        </div>

        {/* Alerts/Notifications */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-brand-blue-dark flex items-center gap-2">
            <AlertCircle size={20} className="text-brand-gold" />
            Avisos
          </h3>
          <div className="space-y-4">
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
