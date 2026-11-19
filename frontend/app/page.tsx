import React from "react";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-slate-900 text-slate-100">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-950/80 p-8 shadow-2xl backdrop-blur">
        <div className="flex items-center space-x-3 pb-6 border-b border-slate-800">
          <div className="h-4 w-4 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
            System Online
          </span>
        </div>

        <div className="py-8 text-center space-y-4">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
            OJAPILOT Foundation Ready
          </h1>
          <p className="text-slate-400 text-base max-w-lg mx-auto">
            AI-first business and inventory copilot architecture initialized for SMEs.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-800 text-center">
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
            <span className="block text-xs text-slate-400 font-medium">Frontend</span>
            <span className="text-sm font-semibold text-slate-200">Next.js 14 App Router</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
            <span className="block text-xs text-slate-400 font-medium">Backend</span>
            <span className="text-sm font-semibold text-slate-200">FastAPI Modular Core</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
            <span className="block text-xs text-slate-400 font-medium">Database</span>
            <span className="text-sm font-semibold text-slate-200">Supabase RLS</span>
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          <div className="inline-flex items-center space-x-2 text-xs text-slate-500">
            <span>FastAPI Health Target:</span>
            <code className="bg-slate-900 px-2 py-1 rounded text-slate-300">
              GET /api/v1/health
            </code>
          </div>
        </div>
      </div>
    </main>
  );
}
