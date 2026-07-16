// Large Files finder (P1): filter bar + results table + export footer.
import { useMemo, type MouseEvent } from "react";
import type { SortBy } from "../api/tauri";
import { useAppStore } from "../store/useAppStore";
import type { FileCategory, FileHit } from "../types/model";
import { formatBytes, formatDate, truncateMiddle, truncatePath } from "../utils/format";
import { CATEGORY_META, CATEGORY_ORDER, CategoryIcon } from "./categoryMeta";
import { DownloadIcon } from "./icons";

const MIN_SIZE_OPTIONS: { label: string; value: number }[] = [
  { label: "10 MB", value: 10e6 },
  { label: "100 MB", value: 100e6 },
  { label: "500 MB", value: 500e6 },
  { label: "1 GB", value: 1e9 },
  { label: "5 GB", value: 5e9 },
];

const OLDER_THAN_OPTIONS: { label: string; value: number }[] = [
  { label: "Any time", value: 0 },
  { label: "6 months", value: 182 },
  { label: "1 year", value: 365 },
  { label: "2 years", value: 730 },
];

// Default direction when a column becomes the active sort key.
const DEFAULT_ASC: Record<SortBy, boolean> = { name: true, size: false, mtime: false };

function SortableTh({
  column,
  label,
  className,
}: {
  column: SortBy;
  label: string;
  className: string;
}) {
  const sortBy = useAppStore((s) => s.filesQuery.sortBy);
  const ascending = useAppStore((s) => s.filesQuery.ascending);
  const setQuery = useAppStore((s) => s.setFilesQuery);
  const active = sortBy === column;

  const onClick = () => {
    if (active) {
      setQuery({ ascending: !ascending });
    } else {
      setQuery({ sortBy: column, ascending: DEFAULT_ASC[column] });
    }
  };

  return (
    <th
      className={`${className} th-sortable${active ? " sorted" : ""}`}
      onClick={onClick}
      role="button"
      aria-sort={active ? (ascending ? "ascending" : "descending") : "none"}
      title={`Sort by ${label.toLowerCase()}`}
    >
      {label}
      <span className="sort-arrow" aria-hidden="true">
        {active ? (ascending ? "▲" : "▼") : ""}
      </span>
    </th>
  );
}

export default function FilesView() {
  const query = useAppStore((s) => s.filesQuery);
  const result = useAppStore((s) => s.filesResult);
  const loading = useAppStore((s) => s.filesLoading);
  const setQuery = useAppStore((s) => s.setFilesQuery);
  const exportFiles = useAppStore((s) => s.exportFiles);
  const openContextMenu = useAppStore((s) => s.openContextMenu);

  const totalBytes = useMemo(() => result.reduce((sum, f) => sum + f.size, 0), [result]);

  const toggleCategory = (cat: FileCategory) => {
    const has = query.categories.includes(cat);
    setQuery({
      categories: has
        ? query.categories.filter((c) => c !== cat)
        : [...query.categories, cat],
    });
  };

  const onRowContext = (e: MouseEvent, f: FileHit) => {
    e.preventDefault();
    openContextMenu({ id: f.id, name: f.name, kind: "file", size: f.size, x: e.clientX, y: e.clientY });
  };

  const allActive = query.categories.length === 0;

  return (
    <div className="panel-full files-view">
      <div className="filter-bar">
        <div className="chip-row" role="group" aria-label="File categories">
          <button
            className={`chip${allActive ? " active" : ""}`}
            onClick={() => setQuery({ categories: [] })}
          >
            All
          </button>
          {CATEGORY_ORDER.map((cat) => {
            const active = query.categories.includes(cat);
            return (
              <button
                key={cat}
                className={`chip${active ? " active" : ""}`}
                onClick={() => toggleCategory(cat)}
                aria-pressed={active}
              >
                <CategoryIcon category={cat} size={14} />
                {CATEGORY_META[cat].label}
              </button>
            );
          })}
        </div>

        <div className="filter-controls">
          <label className="filter-field">
            <span>Min size</span>
            <select
              value={query.minSize}
              onChange={(e) => setQuery({ minSize: Number(e.target.value) })}
            >
              {MIN_SIZE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="filter-field">
            <span>Older than</span>
            <select
              value={query.olderThanDays}
              onChange={(e) => setQuery({ olderThanDays: Number(e.target.value) })}
            >
              {OLDER_THAN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

        </div>
      </div>

      <div className="files-table-wrap">
        {loading && result.length === 0 ? (
          <div className="empty">Searching…</div>
        ) : result.length === 0 ? (
          <div className="empty">No files match the current filters</div>
        ) : (
          <table className="files-table">
            <thead>
              <tr>
                <SortableTh column="name" label="Name" className="col-name" />
                <th className="col-path">Path</th>
                <SortableTh column="size" label="Size" className="col-size" />
                <SortableTh column="mtime" label="Modified" className="col-mtime" />
              </tr>
            </thead>
            <tbody>
              {result.map((f) => (
                <tr key={f.id} onContextMenu={(e) => onRowContext(e, f)}>
                  <td className="col-name">
                    <span className="cell-icon">
                      <CategoryIcon category={f.category} size={15} />
                    </span>
                    <span className="cell-name" title={f.name}>
                      {truncateMiddle(f.name, 40)}
                    </span>
                  </td>
                  <td className="col-path" title={f.path}>
                    {truncatePath(f.path, 5)}
                  </td>
                  <td className="col-size tabnum">{formatBytes(f.size)}</td>
                  <td className="col-mtime tabnum">{formatDate(f.mtimeMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="files-footer">
        <span className="files-summary tabnum">
          {result.length} files · {formatBytes(totalBytes)} total
        </span>
        <div className="files-footer-actions">
          <button onClick={() => exportFiles("csv")} disabled={result.length === 0}>
            <DownloadIcon size={14} /> Export CSV
          </button>
          <button onClick={() => exportFiles("json")} disabled={result.length === 0}>
            <DownloadIcon size={14} /> Export JSON
          </button>
        </div>
      </div>
    </div>
  );
}
