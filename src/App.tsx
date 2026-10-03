import { useState } from 'react';
import {
  Activity,
  BarChart3,
  GitBranch,
  Layers,
  Gauge,
  RotateCw,
  Brain,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { OverviewView } from '@/views/OverviewView';
import { DriftView } from '@/views/DriftView';
import { ModelsView } from '@/views/ModelsView';
import { RoutingView } from '@/views/RoutingView';
import { PredictionsView } from '@/views/PredictionsView';
import { RetrainingView } from '@/views/RetrainingView';

type ViewId = 'overview' | 'drift' | 'models' | 'routing' | 'predictions' | 'retraining';

interface NavItem {
  id: ViewId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'drift', label: 'Drift Monitor', icon: Activity },
  { id: 'models', label: 'Model Versions', icon: Layers },
  { id: 'routing', label: 'Routing', icon: GitBranch },
  { id: 'predictions', label: 'Predictions', icon: BarChart3 },
  { id: 'retraining', label: 'Retraining', icon: RotateCw },
];

function App() {
  const [activeView, setActiveView] = useState<ViewId>('overview');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col fixed h-full z-10">
        <div className="px-5 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight">ML Ops Center</h1>
              <p className="text-[11px] text-slate-500">Train-to-Serve Platform</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            System Online
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64 min-h-screen">
        <div className="p-8 max-w-7xl">
          {activeView === 'overview' && <OverviewView onNavigate={setActiveView} />}
          {activeView === 'drift' && <DriftView />}
          {activeView === 'models' && <ModelsView />}
          {activeView === 'routing' && <RoutingView />}
          {activeView === 'predictions' && <PredictionsView />}
          {activeView === 'retraining' && <RetrainingView />}
        </div>
      </main>
    </div>
  );
}

export default App;
