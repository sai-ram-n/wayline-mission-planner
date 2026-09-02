import { LuTriangleAlert, LuX } from 'react-icons/lu';

export default function ErrorBanner({ message, onDismiss, className = '' }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-md border border-red-900/60 bg-red-950/60 px-3 py-2 text-sm text-red-200 ${className}`}
    >
      <LuTriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-red-300 hover:text-red-100" aria-label="Dismiss">
          <LuX className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
