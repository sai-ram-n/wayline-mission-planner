export default function Spinner({ label = 'Loading', className = '' }) {
  return (
    <div className={`flex items-center gap-2 text-sm text-slate-400 ${className}`} role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-panel-600 border-t-accent" />
      <span>{label}</span>
    </div>
  );
}
