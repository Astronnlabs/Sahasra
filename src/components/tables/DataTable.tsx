import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, MoreHorizontal, Search, X, type LucideIcon } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Pagination } from './Pagination';

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right' | 'center';
  className?: string;
  hideable?: boolean;
  defaultHidden?: boolean;
  /** Excluded from the mobile card layout. */
  hideOnMobile?: boolean;
}

export interface TableFilter<T> {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  predicate: (row: T, value: string) => boolean;
}

export interface RowAction<T> {
  label: string;
  icon?: LucideIcon;
  onSelect: (row: T) => void;
  destructive?: boolean;
  hidden?: (row: T) => boolean;
}

interface DataTableProps<T> {
  data: T[] | undefined;
  columns: Column<T>[];
  getRowId: (row: T) => string;
  isLoading?: boolean;
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  initialSearch?: string;
  /** Filter values to apply (by filter id); changing it re-applies them, e.g. from a clicked summary card. */
  initialFilters?: Record<string, string>;
  filters?: TableFilter<T>[];
  rowActions?: RowAction<T>[];
  onRowClick?: (row: T) => void;
  pageSize?: number;
  empty: ReactNode;
  toolbar?: ReactNode;
  initialSort?: { id: string; dir: 'asc' | 'desc' };
  className?: string;
  /** Hide the search/filter toolbar entirely (embedded tables). */
  bare?: boolean;
}

const ALL = '__all';
const NO_FILTERS: TableFilter<never>[] = [];

export function DataTable<T>({
  data,
  columns,
  getRowId,
  isLoading,
  searchText,
  searchPlaceholder = 'Search…',
  initialSearch = '',
  initialFilters,
  filters = NO_FILTERS as TableFilter<T>[],
  rowActions,
  onRowClick,
  pageSize = 10,
  empty,
  toolbar,
  initialSort,
  className,
  bare,
}: DataTableProps<T>) {
  const [query, setQuery] = useState(initialSearch);
  const deferredQuery = useDeferredValue(query);
  const [filterValues, setFilterValues] = useState<Record<string, string>>(initialFilters ?? {});
  const filtersKey = JSON.stringify(initialFilters ?? {});
  useEffect(() => {
    if (initialFilters) setFilterValues(initialFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);
  const [sort, setSort] = useState(initialSort ?? null);
  const [page, setPage] = useState(1);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.id)));

  useEffect(() => setQuery(initialSearch), [initialSearch]);
  useEffect(() => setPage(1), [deferredQuery, filterValues, sort]);

  const visibleColumns = columns.filter((c) => !hidden.has(c.id));

  const rows = useMemo(() => {
    if (!data) return [];
    let out = data;
    const q = deferredQuery.trim().toLowerCase();
    if (q && searchText) out = out.filter((r) => searchText(r).toLowerCase().includes(q));
    for (const f of filters) {
      const v = filterValues[f.id];
      if (v && v !== ALL) out = out.filter((r) => f.predicate(r, v));
    }
    if (sort) {
      const col = columns.find((c) => c.id === sort.id);
      if (col?.sortValue) {
        const get = col.sortValue;
        out = [...out].sort((a, b) => {
          const va = get(a);
          const vb = get(b);
          const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
          return sort.dir === 'asc' ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [data, deferredQuery, searchText, filters, filterValues, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const filtersActive = deferredQuery.trim() !== '' || Object.values(filterValues).some((v) => v && v !== ALL);

  const toggleSort = (id: string) =>
    setSort((s) => (s?.id !== id ? { id, dir: 'desc' } : s.dir === 'desc' ? { id, dir: 'asc' } : null));

  const resetFilters = () => {
    setQuery('');
    setFilterValues({});
  };

  const actionsFor = (row: T) => rowActions?.filter((a) => !a.hidden?.(row)) ?? [];

  const renderActions = (row: T) => {
    const actions = actionsFor(row);
    if (actions.length === 0) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Row actions" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
          {actions.map((a, i) => (
            <div key={a.label}>
              {a.destructive && i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem destructive={a.destructive} onSelect={() => a.onSelect(row)}>
                {a.icon && <a.icon />}
                {a.label}
              </DropdownMenuItem>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const isEmpty = !isLoading && data && data.length === 0;
  const noMatches = !isLoading && data && data.length > 0 && rows.length === 0;

  return (
    <div className={cn('rounded-2xl border border-border bg-card shadow-card', className)}>
      {!bare && !isEmpty && (
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {searchText && (
              <div className="w-full sm:w-72">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  leftIcon={<Search />}
                  aria-label={searchPlaceholder}
                  rightSlot={
                    query ? (
                      <button type="button" className="rounded p-1 text-subtle hover:text-foreground" onClick={() => setQuery('')} aria-label="Clear search">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : undefined
                  }
                />
              </div>
            )}
            {filters.map((f) => (
              <Select
                key={f.id}
                value={filterValues[f.id] ?? ALL}
                onValueChange={(v) => setFilterValues((s) => ({ ...s, [f.id]: v }))}
                options={[{ value: ALL, label: `All ${f.label.toLowerCase()}` }, ...f.options]}
                ariaLabel={`Filter by ${f.label}`}
                triggerClassName="min-w-[140px]"
              />
            ))}
            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <X /> Reset
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {toolbar}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="md" className="hidden md:inline-flex" aria-label="Toggle columns">
                  <Columns3 /> Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-52">
                <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                {columns
                  .filter((c) => c.hideable !== false && c.header)
                  .map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.id}
                      checked={!hidden.has(c.id)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(checked) =>
                        setHidden((h) => {
                          const next = new Set(h);
                          if (checked) next.delete(c.id);
                          else next.add(c.id);
                          return next;
                        })
                      }
                    >
                      {c.header}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {isEmpty ? (
        empty
      ) : (
        <>
          {/* Desktop table */}
          <div className="scrollbar-thin hidden overflow-x-auto md:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface/60">
                  {visibleColumns.map((c) => {
                    const sorted = sort?.id === c.id ? sort.dir : null;
                    return (
                      <th
                        key={c.id}
                        scope="col"
                        aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                        className={cn(
                          'whitespace-nowrap px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-subtle first:pl-5',
                          c.align === 'right' && 'text-right',
                          c.align === 'center' && 'text-center',
                        )}
                      >
                        {c.sortValue ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.id)}
                            className={cn('inline-flex items-center gap-1 uppercase transition-colors hover:text-foreground', sorted && 'text-primary')}
                          >
                            {c.header}
                            {sorted === 'asc' ? <ArrowUp className="h-3 w-3" /> : sorted === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-50" />}
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    );
                  })}
                  {rowActions && <th className="w-12 px-4 py-2.5"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 6 }, (_, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        {visibleColumns.map((c) => (
                          <td key={c.id} className="px-4 py-3.5 first:pl-5">
                            <Skeleton className="h-4 w-full max-w-[140px]" />
                          </td>
                        ))}
                        {rowActions && <td />}
                      </tr>
                    ))
                  : pageRows.map((row) => (
                      <tr
                        key={getRowId(row)}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                        className={cn(
                          'border-b border-border transition-colors last:border-0 hover:bg-primary-soft/60',
                          onRowClick && 'cursor-pointer',
                        )}
                      >
                        {visibleColumns.map((c) => (
                          <td
                            key={c.id}
                            className={cn(
                              'whitespace-nowrap px-4 py-3 first:pl-5',
                              c.align === 'right' && 'tabular text-right',
                              c.align === 'center' && 'text-center',
                              c.className,
                            )}
                          >
                            {c.cell(row)}
                          </td>
                        ))}
                        {rowActions && <td className="px-3 py-2 text-right">{renderActions(row)}</td>}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="divide-y divide-border md:hidden">
            {isLoading
              ? Array.from({ length: 4 }, (_, i) => (
                  <li key={i} className="space-y-2 p-4">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </li>
                ))
              : pageRows.map((row) => {
                  const [first, ...rest] = visibleColumns.filter((c) => !c.hideOnMobile);
                  return (
                    <li
                      key={getRowId(row)}
                      className={cn('p-4', onRowClick && 'cursor-pointer active:bg-surface')}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">{first?.cell(row)}</div>
                        {renderActions(row)}
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                        {rest.map((c) => (
                          <div key={c.id} className="min-w-0">
                            <dt className="text-2xs uppercase tracking-wider text-subtle">{c.header}</dt>
                            <dd className="mt-0.5 truncate text-[13px]">{c.cell(row)}</dd>
                          </div>
                        ))}
                      </dl>
                    </li>
                  );
                })}
          </ul>

          {noMatches && (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <Search className="h-8 w-8 text-subtle" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-medium">No results match your filters</p>
              <p className="mt-1 text-xs text-muted-foreground">Try a different search term or clear the filters.</p>
              <Button variant="secondary" size="sm" className="mt-4" onClick={resetFilters}>
                Clear filters
              </Button>
            </div>
          )}

          {!isLoading && rows.length > 0 && (
            <Pagination page={page} pageCount={pageCount} total={rows.length} pageSize={pageSize} onPageChange={setPage} />
          )}
        </>
      )}
    </div>
  );
}
