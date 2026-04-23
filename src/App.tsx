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
  AlertTriangle,
  BookOpen,
  Loader2,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { supabase } from './lib/supabase';

// Views
import Dashboard from './views/Dashboard';
import ClassesView from './views/ClassesView';
import AnswerKeysView from './views/AnswerKeysView';
import GradingView from './views/GradingView';
import ReportsView from './views/ReportsView';
import ManagementView from './views/ManagementView';
import NotebookChecksView from './views/NotebookChecksView';
import SystemTestsView from './views/SystemTestsView';
import Login from './components/Login';

type View = 'dashboard' | 'classes' | 'answer-keys' | 'grading' | 'reports' | 'management' | 'notebook-checks' | 'tests';

export default function App() {
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const isSupabaseConfigured = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY;

  useEffect(() => {
    if (isSupabaseConfigured && supabase) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        setIsAuthLoading(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
      });

      seedUnits();

      return () => {
        subscription.unsubscribe();
      };
    } else {
      setIsAuthLoading(false);
    }
  }, [isSupabaseConfigured]);

  async function seedUnits() {
    if (!supabase) return;

    const { data: existingUnits } = await supabase.from('units').select('*');
    if (existingUnits && existingUnits.length === 0) {
      await supabase.from('units').insert([
        { name: 'Unidade 1' },
        { name: 'Unidade 2' },
        { name: 'Unidade 3' }
      ]);
    }
  }

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-brand-blue" size={40} />
      </div>
    );
  }

  if (!session) {
    return <Login onLogin={() => {}} />;
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'classes', label: 'Turmas', icon: Users },
    { id: 'answer-keys', label: 'Gabaritos', icon: FileText },
    { id: 'grading', label: 'Correção', icon: CheckSquare },
    { id: 'notebook-checks', label: 'Vistos', icon: BookOpen },
    { id: 'reports', label: 'Relatórios', icon: BarChart3 },
    { id: 'management', label: 'Gestão', icon: GraduationCap },
    { id: 'tests', label: 'Testes', icon: AlertTriangle },
  ];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden relative">
      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ 
          width: isSidebarOpen ? 280 : (window.innerWidth < 1024 ? 0 : 80),
          x: isSidebarOpen ? 0 : (window.innerWidth < 1024 ? -280 : 0)
        }}
        className={cn(
          "bg-brand-blue-dark text-white flex flex-col shadow-2xl z-40 fixed lg:relative h-full transition-all duration-300",
          !isSidebarOpen && window.innerWidth < 1024 && "pointer-events-none"
        )}
      >
        <div className="p-6 flex items-center justify-between">
          {(isSidebarOpen || window.innerWidth >= 1024) && (
            <motion.h1 
              initial={{ opacity: 0 }}
              animate={{ opacity: isSidebarOpen ? 1 : 0 }}
              className={cn(
                "text-xl font-serif font-bold tracking-tight text-brand-yellow truncate",
                !isSidebarOpen && "hidden"
              )}
            >
              3 em 1 Correções
            </motion.h1>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveView(item.id as View);
                if (window.innerWidth < 1024) setIsSidebarOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-4 p-3 rounded-xl transition-all duration-200 group",
                activeView === item.id 
                  ? "bg-brand-yellow text-brand-blue-dark font-semibold shadow-lg" 
                  : "hover:bg-white/5 text-brand-gray"
              )}
            >
              <item.icon size={22} className={cn(activeView === item.id ? "text-brand-blue-dark" : "group-hover:text-white")} />
              {(isSidebarOpen || (window.innerWidth < 1024 && isSidebarOpen)) && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(!isSidebarOpen && "lg:hidden")}
                >
                  {item.label}
                </motion.span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className={cn("flex items-center gap-3 p-2", !isSidebarOpen && "justify-center")}>
            <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center border-2 border-brand-yellow shadow-inner shrink-0">
              <img 
                src="/perfil.jpg" 
                alt="Átila Alves"
                className="w-full h-full object-cover"
              />
            </div>
            {isSidebarOpen && (
              <div className="overflow-hidden">
                <p className="text-sm font-medium truncate">Átila Alves</p>
                <p className="text-xs text-brand-gray truncate">Professor</p>
              </div>
            )}
          </div>
          <div className="p-4 border-t border-white/10">
            <button 
              onClick={() => supabase?.auth.signOut()}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-white/5 hover:text-white transition-all"
            >
              <LogOut size={20} />
              {isSidebarOpen && <span>Sair</span>}
            </button>
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative w-full">
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200 p-4 sm:p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-slate-100 rounded-lg lg:hidden"
            >
              <Menu size={20} className="text-brand-blue-dark" />
            </button>
            <h2 className="text-lg sm:text-xl font-serif font-bold text-brand-blue-dark">
              {navItems.find(i => i.id === activeView)?.label}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            {!isSupabaseConfigured && (
              <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm animate-pulse">
                <AlertTriangle size={18} />
                <span>Configuração pendente</span>
              </div>
            )}
          </div>
        </header>

        <div className="p-4 sm:p-8 max-w-7xl mx-auto">
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
              {activeView === 'notebook-checks' && <NotebookChecksView />}
              {activeView === 'tests' && <SystemTestsView />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
