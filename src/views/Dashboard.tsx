import React from 'react';
import { motion } from 'motion/react';
import { 
  Users, 
  FileText, 
  CheckSquare, 
  TrendingUp,
  AlertCircle,
  Clock
} from 'lucide-react';

export default function Dashboard() {
  const stats = [
    { label: 'Turmas Ativas', value: '12', icon: Users, color: 'bg-blue-500' },
    { label: 'Provas Corrigidas', value: '1,284', icon: CheckSquare, color: 'bg-emerald-500' },
    { label: 'Gabaritos Salvos', value: '45', icon: FileText, color: 'bg-amber-500' },
    { label: 'Média Geral', value: '7.4', icon: TrendingUp, color: 'bg-purple-500' },
  ];

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
            {[1, 2, 3, 4, 5].map((_, i) => (
              <div key={i} className="p-4 border-b border-slate-50 last:border-0 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-brand-blue">
                    <FileText size={20} />
                  </div>
                  <div>
                    <p className="font-medium text-brand-blue-dark">Prova de Química - Unidade II</p>
                    <p className="text-xs text-slate-500">Turma 3º Ano A • 32 alunos</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-emerald-600">Concluído</p>
                  <p className="text-xs text-slate-400">Há 2 horas</p>
                </div>
              </div>
            ))}
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
              <p className="font-bold mb-1">Recuperação Unidade I</p>
              <p>5 alunos da Turma 1º Ano B estão abaixo da média e precisam de atenção.</p>
            </div>
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-blue-800 text-sm">
              <p className="font-bold mb-1">Novo Gabarito</p>
              <p>O gabarito da Lista de Exercícios 03 foi processado com sucesso.</p>
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
