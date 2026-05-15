import { DirectoryInput } from '@/components/DirectoryInput';
import { GitBranch } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center gap-10 w-full max-w-2xl">
        {/* Logo + tagline */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
              <GitBranch className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">CodeViz</h1>
          </div>
          <p className="text-slate-500 text-base max-w-md">
            Visualize any codebase as an interactive diagram. Explore, understand, and edit your
            app&apos;s architecture with drag-and-drop.
          </p>
        </div>

        {/* Features row */}
        <div className="grid grid-cols-3 gap-4 w-full text-center text-xs text-slate-500">
          <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-1">
            <div className="text-lg">🏗️</div>
            <div className="font-medium text-slate-700">Architecture</div>
            <div>Components & services map</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-1">
            <div className="text-lg">🔄</div>
            <div className="font-medium text-slate-700">Data Flow</div>
            <div>How data moves end-to-end</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-3 space-y-1">
            <div className="text-lg">✏️</div>
            <div className="font-medium text-slate-700">Visual Editing</div>
            <div>Drag-and-drop code changes</div>
          </div>
        </div>

        {/* Input */}
        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <DirectoryInput />
        </div>

        <p className="text-xs text-slate-400">
          Powered by Claude AI · Reads local files · Changes require approval before writing
        </p>
      </div>
    </main>
  );
}
