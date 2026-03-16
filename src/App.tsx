import React, { useState, useEffect } from 'react';
import { 
  Users, 
  FileText, 
  CheckSquare, 
  BarChart3, 
  Settings, 
  GraduationCap,
  PlusCircle,
  Upload,
  Search,
  ChevronRight,
  Menu,
  X,
  LayoutDashboard,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// Views
import Dashboard from './views/Dashboard';
import ClassesView from './views/ClassesView';
import AnswerKeysView from './views/AnswerKeysView';
import GradingView from './views/GradingView';
import ReportsView from './views/ReportsView';
import ManagementView from './views/ManagementView';

type View = 'dashboard' | 'classes' | 'answer-keys' | 'grading' | 'reports' | 'management';

export default function App() {
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const isSupabaseConfigured = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'classes', label: 'Turmas', icon: Users },
    { id: 'answer-keys', label: 'Gabaritos', icon: FileText },
    { id: 'grading', label: 'Correção', icon: CheckSquare },
    { id: 'reports', label: 'Relatórios', icon: BarChart3 },
    { id: 'management', label: 'Gestão', icon: GraduationCap },
  ];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 80 }}
        className="bg-brand-blue-dark text-white flex flex-col shadow-2xl z-20"
      >
        <div className="p-6 flex items-center justify-between">
          {isSidebarOpen && (
            <motion.h1 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-2xl font-serif font-bold tracking-tight text-brand-yellow"
            >
              Educorrige
            </motion.h1>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id as View)}
              className={cn(
                "w-full flex items-center gap-4 p-3 rounded-xl transition-all duration-200 group",
                activeView === item.id 
                  ? "bg-brand-yellow text-brand-blue-dark font-semibold shadow-lg" 
                  : "hover:bg-white/5 text-brand-gray"
              )}
            >
              <item.icon size={22} className={cn(activeView === item.id ? "text-brand-blue-dark" : "group-hover:text-white")} />
              {isSidebarOpen && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                >
                  {item.label}
                </motion.span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className={cn("flex items-center gap-3 p-2", !isSidebarOpen && "justify-center")}>
            <div className="w-10 h-10 rounded-full bg-brand-gold flex items-center justify-center font-bold text-brand-blue-dark">
              AA
            </div>
            {isSidebarOpen && (
              <div className="overflow-hidden">
                <p className="text-sm font-medium truncate">Átila Alves</p>
                <p className="text-xs text-brand-gray truncate">Professor de Química</p>
              </div>
            )}
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-bottom border-slate-200 p-6 flex items-center justify-between">
          <h2 className="text-xl font-serif font-bold text-brand-blue-dark">
            {navItems.find(i => i.id === activeView)?.label}
          </h2>
          <div className="flex items-center gap-4">
            {!isSupabaseConfigured && (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm animate-pulse">
                <AlertTriangle size={18} />
                <span>Configuração do Supabase pendente</span>
              </div>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Buscar..." 
                className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm focus:ring-2 focus:ring-brand-yellow w-64 transition-all"
              />
            </div>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.2 }}
            >
              {activeView === 'dashboard' && <Dashboard />}
              {activeView === 'classes' && <ClassesView />}
              {activeView === 'answer-keys' && <AnswerKeysView />}
              {activeView === 'grading' && <GradingView />}
              {activeView === 'reports' && <ReportsView />}
              {activeView === 'management' && <ManagementView />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
