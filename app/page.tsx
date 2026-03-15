import React from 'react';

export default function Page() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-8">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-4 tracking-tight">
          EduAssess AI Platform
        </h1>
        <p className="text-slate-600 mb-8 text-lg">
          Educational assessment platform powered by Google Gemini and Supabase.
        </p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <h2 className="font-semibold text-slate-800 mb-2">API Health</h2>
            <p className="text-sm text-slate-500 mb-3">Check system connectivity and environment.</p>
            <a 
              href="/api/health" 
              className="text-indigo-600 text-sm font-medium hover:underline"
            >
              View Health →
            </a>
          </div>
          
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <h2 className="font-semibold text-slate-800 mb-2">Connection Test</h2>
            <p className="text-sm text-slate-500 mb-3">Verify database and AI integration.</p>
            <a 
              href="/api/test" 
              className="text-indigo-600 text-sm font-medium hover:underline"
            >
              Run Test →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
