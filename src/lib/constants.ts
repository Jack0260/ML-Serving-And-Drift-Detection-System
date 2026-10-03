export const PSI_WARNING_THRESHOLD = 0.1;
export const PSI_CRITICAL_THRESHOLD = 0.25;

export const FEATURE_LABELS: Record<string, string> = {
  mean_radius: 'Mean Radius',
  mean_texture: 'Mean Texture',
  mean_perimeter: 'Mean Perimeter',
  mean_area: 'Mean Area',
  mean_smoothness: 'Mean Smoothness',
  mean_compactness: 'Mean Compactness',
  mean_concavity: 'Mean Concavity',
  mean_concave_points: 'Mean Concave Points',
  mean_symmetry: 'Mean Symmetry',
  mean_fractal_dimension: 'Mean Fractal Dimension',
};

export function formatFeatureName(name: string): string {
  return FEATURE_LABELS[name] ?? name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export function severityFromPsi(psi: number): 'stable' | 'warning' | 'critical' {
  if (psi >= PSI_CRITICAL_THRESHOLD) return 'critical';
  if (psi >= PSI_WARNING_THRESHOLD) return 'warning';
  return 'stable';
}
