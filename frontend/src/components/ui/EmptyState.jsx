export default function EmptyState({ icon: Icon, title, message, action }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      {Icon && <Icon aria-hidden className="h-10 w-10 text-panel-600" />}
      <div>
        <p className="text-sm font-medium text-slate-300">{title}</p>
        {message && <p className="mt-1 max-w-sm text-xs text-slate-500">{message}</p>}
      </div>
      {action}
    </div>
  );
}
