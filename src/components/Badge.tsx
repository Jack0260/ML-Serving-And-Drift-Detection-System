import { cn } from '@/lib/utils';

interface BadgeProps {
  severity?: 'stable' | 'warning' | 'critical';
  status?: string;
  stage?: string;
  className?: string;
  children: React.ReactNode;
}

const severityStyles: Record<string, string> = {
  stable: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  critical: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
};

const statusStyles: Record<string, string> = {
  completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  running: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  queued: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
  failed: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
};

const stageStyles: Record<string, string> = {
  production: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  challenger: 'bg-violet-500/10 text-violet-300 border-violet-500/30',
  staging: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  archived: 'bg-slate-600/20 text-slate-400 border-slate-600/30',
};

export function Badge({ severity, status, stage, className, children }: BadgeProps) {
  let style = 'bg-slate-700/30 text-slate-300 border-slate-600/30';
  if (severity && severityStyles[severity]) style = severityStyles[severity];
  if (status && statusStyles[status]) style = statusStyles[status];
  if (stage && stageStyles[stage]) style = stageStyles[stage];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        style,
        className
      )}
    >
      {children}
    </span>
  );
}
