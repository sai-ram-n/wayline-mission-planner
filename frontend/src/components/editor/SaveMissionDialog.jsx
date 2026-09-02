import { useEffect, useState } from 'react';
import { LuX } from 'react-icons/lu';
import ErrorBanner from '../ui/ErrorBanner.jsx';

/** Name + description prompt shown when saving a mission for the first time. */
export default function SaveMissionDialog({ open, initialName, initialDescription, saving, error, onSave, onClose }) {
  const [name, setName] = useState(initialName ?? '');
  const [description, setDescription] = useState(initialDescription ?? '');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialName ?? '');
      setDescription(initialDescription ?? '');
      setTouched(false);
    }
  }, [open, initialName, initialDescription]);

  if (!open) return null;

  const nameError = touched && !name.trim() ? 'A name is required' : null;

  const submit = (event) => {
    event.preventDefault();
    setTouched(true);
    if (!name.trim()) return;
    onSave({ name: name.trim(), description: description.trim() });
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4">
      <form onSubmit={submit} className="panel w-full max-w-md shadow-2xl">
        <div className="panel-header">
          <h2 className="text-sm font-semibold text-slate-100">Save wayline</h2>
          <button type="button" onClick={onClose} className="btn-ghost p-1" aria-label="Close">
            <LuX className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <ErrorBanner message={error} />

          <div>
            <label className="label" htmlFor="wayline-name">Name</label>
            <input
              id="wayline-name"
              className="input"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="Warehouse perimeter inspection"
              maxLength={120}
            />
            {nameError && <p className="field-error">{nameError}</p>}
          </div>

          <div>
            <label className="label" htmlFor="wayline-description">Description</label>
            <textarea
              id="wayline-description"
              className="input min-h-[72px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about this mission"
              maxLength={2000}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-panel-700 px-4 py-3">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
