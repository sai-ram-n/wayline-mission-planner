/**
 * Hierarchical folder tree — docs/feature-reference.md §2.
 *
 * The new-folder button creates a subfolder of the selected folder;
 * Shift+click creates a sibling instead. Deleting warns that the folder's
 * routes and subfolders go with it, which is what the backend actually does.
 */
import { useMemo, useState } from 'react';
import { LuChevronRight, LuFolder, LuFolderOpen, LuFolderPlus, LuInfo, LuTrash2 } from 'react-icons/lu';

/** Nest a flat folder list into a tree. */
function buildTree(folders) {
  const byParent = new Map();
  for (const folder of folders) {
    const key = folder.parent_id ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(folder);
  }
  const attach = (parentId) =>
    (byParent.get(parentId) ?? []).map((folder) => ({
      ...folder,
      children: attach(folder.id),
    }));
  return attach(null);
}

function FolderRow({ folder, depth, selectedId, expanded, onToggle, onSelect, onDelete, counts }) {
  const isOpen = expanded.has(folder.id);
  const hasChildren = folder.children.length > 0;
  const selected = selectedId === folder.id;

  return (
    <>
      <div
        role="treeitem"
        aria-selected={selected}
        aria-expanded={hasChildren ? isOpen : undefined}
        tabIndex={0}
        onClick={() => onSelect(folder.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(folder.id);
          }
        }}
        style={{ paddingLeft: 6 + depth * 12 }}
        className={`group flex cursor-pointer items-center gap-1 rounded py-1 pr-1 text-xs transition-colors ${
          selected ? 'bg-panel-700 text-slate-100' : 'text-slate-300 hover:bg-panel-800'
        }`}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(folder.id);
          }}
          className={`shrink-0 p-0.5 text-slate-500 ${hasChildren ? '' : 'invisible'}`}
        >
          <LuChevronRight className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        </button>

        {isOpen && hasChildren ? (
          <LuFolderOpen className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        ) : (
          <LuFolder className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        )}

        <span className="min-w-0 flex-1 truncate">{folder.name}</span>
        {counts?.[folder.id] > 0 && (
          <span className="shrink-0 font-mono text-[10px] text-slate-500">
            {counts[folder.id]}
          </span>
        )}

        <button
          type="button"
          aria-label={`Delete ${folder.name}`}
          title="Delete folder"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(folder);
          }}
          className="shrink-0 rounded p-0.5 text-slate-600 opacity-0 transition hover:bg-red-950 hover:text-red-400 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <LuTrash2 className="h-3 w-3" />
        </button>
      </div>

      {isOpen &&
        folder.children.map((child) => (
          <FolderRow
            key={child.id}
            folder={child}
            depth={depth + 1}
            selectedId={selectedId}
            expanded={expanded}
            onToggle={onToggle}
            onSelect={onSelect}
            onDelete={onDelete}
            counts={counts}
          />
        ))}
    </>
  );
}

export default function FolderTree({
  folders = [],
  counts = {},
  selectedId,
  onSelect,
  onCreate,
  onDelete,
  totalCount = 0,
}) {
  const tree = useMemo(() => buildTree(folders), [folders]);
  const [expanded, setExpanded] = useState(() => new Set(folders.map((f) => f.id)));

  const toggle = (id) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-panel-800 px-2 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Folder
        </span>
        <span
          title="Shift + click the new-folder button to create a sibling instead of a subfolder"
          className="text-slate-600"
        >
          <LuInfo className="h-3 w-3" />
        </span>
        <button
          type="button"
          onClick={(event) => onCreate(event.shiftKey)}
          title="Create Subfolder — Shift + click for Create Sibling Folder"
          aria-label="Create folder"
          className="btn-ghost ml-auto p-1"
        >
          <LuFolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div role="tree" className="min-h-0 flex-1 overflow-y-auto p-1">
        <div
          role="treeitem"
          aria-selected={selectedId === null}
          tabIndex={0}
          onClick={() => onSelect(null)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onSelect(null);
            }
          }}
          className={`flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors ${
            selectedId === null ? 'bg-panel-700 text-slate-100' : 'text-slate-300 hover:bg-panel-800'
          }`}
        >
          <LuFolderOpen className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span className="min-w-0 flex-1 truncate">All routes</span>
          <span className="shrink-0 font-mono text-[10px] text-slate-500">{totalCount}</span>
        </div>

        {tree.map((folder) => (
          <FolderRow
            key={folder.id}
            folder={folder}
            depth={0}
            selectedId={selectedId}
            expanded={expanded}
            onToggle={toggle}
            onSelect={onSelect}
            onDelete={onDelete}
            counts={counts}
          />
        ))}
      </div>
    </div>
  );
}
