import React, {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronRight,
  Columns3,
  Download,
  Filter,
  FolderOpen,
  Grid2X2,
  Layers3,
  LogOut,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import {
  aggregate,
  applyQuery,
  createFields,
  displayValue,
  fieldSchema,
  fieldTypeSchema,
  templateLabels,
  validateFilter,
  valueMatchesField,
  type Cell,
  type Field,
  type FilterAST,
  type Item,
  type Project,
  type TemplateType,
} from '@sift/shared';
import {
  createRemote,
  demoBackfill,
  demoQuery,
  invoke,
  loadDemo,
  loadRemote,
  resetDemo,
  saveDemo,
  supabase,
  updateCell,
  type Workspace,
} from './data';
import { exportTable } from './exports';
import './style.css';

const empty: Workspace = { projects: [], fields: {}, items: [], sources: {} };
function Modal({
  title,
  children,
  onClose,
  wide = false,
  error,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  error?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      className={wide ? 'modal wide' : 'modal'}
      ref={ref}
      onCancel={onClose}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {children}
    </dialog>
  );
}
function App() {
  const [demo, setDemo] = useState(!supabase);
  const [signedIn, setSignedIn] = useState(false);
  const [data, setData] = useState<Workspace>(empty);
  const [selected, setSelected] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState(location.pathname === '/projects');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState<
    | 'create'
    | 'field'
    | 'columns'
    | 'filter'
    | 'export'
    | 'help'
    | 'rename'
    | 'manage-field'
    | null
  >(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [ast, setAst] = useState<FilterAST>({ filters: [] });
  const [hidden, setHidden] = useState<string[]>([]);
  const [editField, setEditField] = useState<Field | null>(null);
  const [managedField, setManagedField] = useState<Field | null>(null);
  const project = data.projects.find((p) => p.id === selected);
  const fields = project ? (data.fields[project.id] ?? []) : [];
  const projectItems = data.items.filter((i) => i.projectId === selected);
  let rows: Item[] = [];
  let queryError = '';
  try {
    rows = applyQuery(projectItems, fields, ast);
  } catch (e) {
    queryError = String(e);
  }
  const visible = fields.filter((f) => !hidden.includes(f.id));
  const item = data.items.find((i) => i.id === detail);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function choose(p: Project) {
    setSelected(p.id);
    setDashboard(false);
    setAst({ filters: [] });
    setQuery('');
    setHidden(
      (data.fields[p.id] ?? [])
        .filter(
          (f) =>
            ![
              'name',
              'company',
              'role',
              'make',
              'model',
              'program',
              'rent',
              'price',
              'nightly_rate',
              'bedrooms',
              'bathrooms',
              'parking',
              'laundry',
            ].includes(f.key),
        )
        .map((f) => f.id),
    );
    history.pushState({}, '', `/projects/${p.id}`);
  }
  async function refresh() {
    const next = demo ? loadDemo() : await loadRemote();
    setData(next);
    return next;
  }
  function commit(next: Workspace) {
    saveDemo(next);
    setData(next);
  }
  useEffect(() => {
    if (demo) {
      try {
        const next = loadDemo();
        setData(next);
        const p =
          next.projects.find((p) => location.pathname.endsWith(p.id)) ??
          next.projects[0];
        if (p) {
          setSelected(p.id);
          setHidden(
            (next.fields[p.id] ?? [])
              .filter(
                (f) =>
                  ![
                    'name',
                    'rent',
                    'bedrooms',
                    'bathrooms',
                    'parking',
                    'laundry',
                  ].includes(f.key),
              )
              .map((f) => f.id),
          );
        }
      } catch (e) {
        setError(String(e));
      }
      return;
    }
    if (!supabase) return;
    const load = async () => {
      const {
        data: { session },
      } = await supabase!.auth.getSession();
      setSignedIn(Boolean(session));
      if (session) {
        try {
          const next = await loadRemote();
          setData(next);
          setSelected((current) => current ?? next.projects[0]?.id ?? null);
        } catch (e) {
          setError(String(e));
        }
      }
    };
    void load();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => void load(), 0);
    });
    return () => subscription.unsubscribe();
  }, [demo]);
  useEffect(() => {
    const listener = () => {
      const match = data.projects.find((p) => location.pathname.endsWith(p.id));
      setSelected(match?.id ?? selected);
      setDashboard(location.pathname === '/projects');
    };
    window.addEventListener('popstate', listener);
    return () => window.removeEventListener('popstate', listener);
  }, [data.projects, selected]);
  useEffect(() => {
    if (demo || !signedIn) return;
    const timer = setInterval(() => {
      void loadRemote()
        .then(setData)
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [demo, signedIn]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    await run(async () => {
      const name = String(fd.get('name')).trim();
      const template = String(fd.get('template')) as TemplateType;
      let id: string;
      if (demo) {
        const now = new Date().toISOString();
        const p: Project = {
          id: crypto.randomUUID(),
          name,
          templateType: template,
          description: '',
          createdAt: now,
          updatedAt: now,
        };
        id = p.id;
        commit({
          ...data,
          projects: [...data.projects, p],
          fields: { ...data.fields, [id]: createFields(template) },
        });
      } else {
        id = await createRemote(name, template);
        await refresh();
      }
      setSelected(id);
      setDashboard(false);
      setAst({ filters: [] });
      setHidden([]);
      setModal(null);
      history.pushState({}, '', `/projects/${id}`);
    });
  }
  async function addField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    if (!project) return;
    await run(async () => {
      const label = String(fd.get('label')).trim();
      const key = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 64);
      const field = fieldSchema.parse({
        id: crypto.randomUUID(),
        key,
        label,
        dataType: fd.get('type'),
        position: fields.length,
        enumOptions: String(fd.get('options') ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      if (fields.some((f) => f.key === field.key))
        throw new Error('A field with this name already exists.');
      if (demo)
        commit({
          ...data,
          fields: { ...data.fields, [project.id]: [...fields, field] },
        });
      else {
        const { error } = await supabase!.from('project_fields').insert({
          id: field.id,
          project_id: project.id,
          key: field.key,
          label: field.label,
          data_type: field.dataType,
          enum_options_json: field.enumOptions,
          position: field.position,
        });
        if (error) throw error;
        await refresh();
      }
      setModal(null);
      setNotice(
        `“${field.label}” added. Open an item to populate it from its saved source.`,
      );
    });
  }
  async function deleteProject() {
    if (
      !project ||
      !confirm(`Delete “${project.name}” and all its saved comparisons?`)
    )
      return;
    await run(async () => {
      if (demo) {
        const next = {
          ...data,
          projects: data.projects.filter((p) => p.id !== project.id),
          fields: { ...data.fields },
          items: data.items.filter((i) => i.projectId !== project.id),
          sources: { ...data.sources },
        };
        delete next.fields[project.id];
        for (const i of projectItems) delete next.sources[i.id];
        commit(next);
      } else {
        await invoke('delete-project', { projectId: project.id });
        await refresh();
      }
      setSelected(null);
      setDashboard(true);
      setModal(null);
    });
  }
  async function deleteItem(target: Item) {
    if (!confirm(`Delete “${target.title}”?`)) return;
    await run(async () => {
      if (demo) {
        const next = {
          ...data,
          items: data.items.filter((i) => i.id !== target.id),
          sources: { ...data.sources },
        };
        delete next.sources[target.id];
        commit(next);
      } else {
        await invoke('delete-item', { itemId: target.id });
        await refresh();
      }
      setDetail(null);
    });
  }
  async function saveCell(field: Field, raw: string) {
    if (!item) return;
    await run(async () => {
      const value: Cell['value'] =
        raw === ''
          ? null
          : field.dataType === 'boolean'
            ? raw === 'true'
            : ['number', 'currency'].includes(field.dataType)
              ? Number(raw)
              : field.dataType === 'list'
                ? raw.split(',').map((s) => s.trim())
                : raw;
      if (!valueMatchesField(value, field))
        throw new Error('Enter a valid value for this field.');
      if (demo) {
        const cell: Cell = {
          value,
          currency: item.values[field.id]?.currency ?? null,
          unit: field.unit,
          confidence: null,
          evidence: [],
          manuallyEdited: true,
        };
        commit({
          ...data,
          items: data.items.map((i) =>
            i.id === item.id
              ? { ...i, values: { ...i.values, [field.id]: cell } }
              : i,
          ),
        });
      } else {
        await updateCell(item, field, value);
        await refresh();
      }
      setEditField(null);
    });
  }
  async function backfill(field: Field, target: Item) {
    await run(async () => {
      if (demo) {
        const cell = demoBackfill(target, field, data.sources[target.id]);
        commit({
          ...data,
          items: data.items.map((i) =>
            i.id === target.id
              ? { ...i, values: { ...i.values, [field.id]: cell } }
              : i,
          ),
        });
      } else {
        await invoke('backfill-field', {
          itemId: target.id,
          fieldId: field.id,
          requestId: crypto.randomUUID(),
        });
        await refresh();
      }
      setNotice(`Checked the saved source for ${field.label}.`);
    });
  }
  async function ask(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      if (!query.trim()) {
        setAst({ filters: [] });
        return;
      }
      const result = demo
        ? demoQuery(query, fields)
        : validateFilter(
            await invoke('interpret-query', {
              projectId: selected,
              query,
              requestId: crypto.randomUUID(),
            }),
            fields,
          );
      setAst(result);
    });
  }
  if (!demo && !signedIn)
    return (
      <Auth
        onDemo={() => {
          setDemo(true);
          setDashboard(false);
        }}
      />
    );
  return (
    <div className="app">
      <aside className="sidebar">
        <a
          className="brand"
          href="/projects"
          onClick={(e) => {
            e.preventDefault();
            setDashboard(true);
            history.pushState({}, '', '/projects');
          }}
        >
          <span className="brand-icon">
            <Layers3 size={23} />
          </span>
          <span>
            Sift<span className="brand-sub">SAVE · COMPARE · DECIDE</span>
          </span>
        </a>
        <div className="workspace-tag">
          <span className="avatar">M</span>
          <span>
            {demo ? 'Demo workspace' : 'My workspace'}
            <small>Personal research</small>
          </span>
        </div>
        <button
          className={`nav-item ${dashboard ? 'active' : ''}`}
          onClick={() => {
            setDashboard(true);
            history.pushState({}, '', '/projects');
          }}
        >
          <Grid2X2 size={18} />
          All projects<span className="nav-count">{data.projects.length}</span>
        </button>
        <div className="section-label">
          YOUR PROJECTS
          <button
            className="icon"
            title="New project"
            onClick={() => setModal('create')}
          >
            <Plus size={16} />
          </button>
        </div>
        <nav>
          {data.projects.map((p) => (
            <button
              key={p.id}
              className={`nav-item ${!dashboard && p.id === selected ? 'active' : ''}`}
              onClick={() => choose(p)}
            >
              <FolderOpen size={17} />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </nav>
        <button className="new-project" onClick={() => setModal('create')}>
          <Plus size={17} />
          New project
        </button>
        <div className="sidebar-bottom">
          <div className="capture-tip">
            <span className="tiny-icon">
              <Layers3 size={17} />
            </span>
            <strong>Found something worth saving?</strong>
            <p>Capture a page with the Chrome extension. Compare it here.</p>
            <button onClick={() => setModal('help')}>
              Set up the extension <ArrowUpRight size={15} />
            </button>
          </div>
          <button className="nav-item" onClick={() => setModal('help')}>
            <Settings2 size={17} />
            Setup & help
          </button>
          {!demo ? (
            <button
              className="nav-item"
              onClick={() => void supabase!.auth.signOut()}
            >
              <LogOut size={17} />
              Sign out
            </button>
          ) : (
            <button
              className="nav-item"
              onClick={() => {
                if (confirm('Reset all demo changes?')) {
                  const next = resetDemo();
                  setData(next);
                  setSelected(next.projects[0]?.id ?? null);
                  setAst({ filters: [] });
                  setHidden([]);
                }
              }}
            >
              Reset demo
            </button>
          )}
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div>
            <span className="muted">Workspace</span>
            <ChevronRight size={14} />
            <span>
              {dashboard ? 'All projects' : (project?.name ?? 'Projects')}
            </span>
          </div>
          <span className="private">
            <ShieldCheck size={15} />
            Private workspace
          </span>
        </header>
        {demo && (
          <div className="demo-banner">
            <span>
              <strong>Demo mode</strong> · Fictional listings, saved in this
              browser. No AI calls or cloud sync.
            </span>
            {supabase && (
              <button
                onClick={() => {
                  setDemo(false);
                  setData(empty);
                }}
              >
                Sign in to your account <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        )}
        {(error || queryError) && (
          <div role="alert" className="alert error">
            {error || queryError}
            <button
              className="icon"
              aria-label="Dismiss error"
              onClick={() => {
                setError('');
                setAst({ filters: [] });
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div role="status" className="alert notice">
            {notice}
            <button
              className="icon"
              aria-label="Dismiss notification"
              onClick={() => setNotice('')}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {dashboard || !project ? (
          <section className="content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">YOUR RESEARCH, IN ONE PLACE</div>
                <h1>
                  All projects<span className="heading-dot">.</span>
                </h1>
                <p>Build a shortlist. Keep the facts together.</p>
              </div>
              <button className="primary" onClick={() => setModal('create')}>
                <Plus size={18} />
                New project
              </button>
            </div>
            <div className="project-grid">
              {data.projects.map((p) => (
                <button
                  className="project-card"
                  key={p.id}
                  onClick={() => choose(p)}
                >
                  <span className="project-symbol">
                    <FolderOpen size={25} />
                  </span>
                  <span className="template-label">
                    {templateLabels[p.templateType]}
                  </span>
                  <h2>{p.name}</h2>
                  <p>
                    {data.items.filter((i) => i.projectId === p.id).length}{' '}
                    saved items · {data.fields[p.id]?.length ?? 0} fields
                  </p>
                  <div>
                    Open comparison
                    <ArrowUpRight size={18} />
                  </div>
                </button>
              ))}
              <button
                className="project-card add-card"
                onClick={() => setModal('create')}
              >
                <Plus size={28} />
                <h2>Start a new comparison</h2>
                <p>Apartments, jobs, products, or anything else.</p>
              </button>
            </div>
          </section>
        ) : (
          <section className="content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  <span className="eyebrow-square" />
                  {templateLabels[project.templateType]} research
                </div>
                <h1>{project.name}</h1>
                <p>
                  Every option. The details that matter. The source behind each
                  fact.
                </p>
              </div>
              <div className="heading-actions">
                <button
                  className="button"
                  onClick={() => setModal('rename')}
                  aria-label="Project settings"
                >
                  <Settings2 size={17} />
                </button>
                <button className="primary" onClick={() => setModal('help')}>
                  <Plus size={18} />
                  Save a page
                </button>
              </div>
            </div>
            <div className="summary-strip">
              <div>
                <strong>
                  {projectItems.length.toString().padStart(2, '0')}
                </strong>
                <span>Saved options</span>
              </div>
              <div>
                <strong>{fields.length}</strong>
                <span>Comparison fields</span>
              </div>
              <div className="summary-note">
                <ShieldCheck size={19} />
                <span>
                  Follow the evidence
                  <small>Click any value to inspect its source.</small>
                </span>
              </div>
            </div>
            <form className="ask-bar" onSubmit={ask}>
              <Sparkles size={21} />
              <input
                aria-label="Ask or filter"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask or filter… try “under $1,300 with parking”"
              />
              <button disabled={busy} type="submit">
                {busy ? 'Working…' : 'Apply'}
                <ArrowUpRight size={16} />
              </button>
            </form>
            <div className="table-toolbar">
              <div className="view-tab">
                <Table2 size={17} />
                Comparison<span>{rows.length}</span>
              </div>
              <div className="table-tools">
                <button
                  className="text-button"
                  onClick={() => setModal('filter')}
                >
                  <Filter size={16} />
                  Filters{ast.filters.length > 0 && <b>{ast.filters.length}</b>}
                </button>
                <button
                  className="text-button"
                  onClick={() => setModal('columns')}
                >
                  <Columns3 size={16} />
                  Columns
                </button>
                <button
                  className="text-button"
                  onClick={() => setModal('field')}
                >
                  <Plus size={16} />
                  Add field
                </button>
                <span className="divider" />
                <button
                  className="text-button"
                  onClick={() => setModal('export')}
                >
                  <Download size={16} />
                  Export
                </button>
              </div>
            </div>
            {(ast.filters.length > 0 || ast.sort || ast.search) && (
              <div className="filter-chips">
                {ast.filters.map((f, i) => (
                  <span key={i}>
                    {fields.find((v) => v.id === f.fieldId)?.label} {f.operator}{' '}
                    {String(f.value ?? 'Unknown')}
                  </span>
                ))}
                {ast.sort && <span>Sorted {ast.sort.direction}</span>}
                <button
                  onClick={() => {
                    setAst({ filters: [] });
                    setQuery('');
                  }}
                >
                  Clear all
                </button>
              </div>
            )}
            <div className="table-shell">
              <table className="comparison">
                <thead>
                  <tr>
                    <th className="row-number">#</th>
                    {visible.map((f) => (
                      <th key={f.id}>
                        <button
                          onClick={() =>
                            setAst({
                              ...ast,
                              sort: {
                                fieldId: f.id,
                                direction:
                                  ast.sort?.fieldId === f.id &&
                                  ast.sort.direction === 'asc'
                                    ? 'desc'
                                    : 'asc',
                              },
                            })
                          }
                        >
                          <span>{f.label}</span>
                          {ast.sort?.fieldId === f.id ? (
                            ast.sort.direction === 'asc' ? (
                              <ArrowUp size={14} />
                            ) : (
                              <ArrowDown size={14} />
                            )
                          ) : (
                            <span className="sort-hint">↕</span>
                          )}
                        </button>
                      </th>
                    ))}
                    <th>
                      <span className="source-heading">Source</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, index) => (
                    <tr key={r.id}>
                      <td className="row-number">
                        {String(index + 1).padStart(2, '0')}
                      </td>
                      {visible.map((f, fi) => {
                        const cell = r.values[f.id];
                        return (
                          <td
                            key={f.id}
                            className={fi === 0 ? 'title-cell' : undefined}
                          >
                            <button
                              className={`cell ${fi === 0 ? 'first-cell' : ''}`}
                              onClick={() => {
                                setDetail(r.id);
                                setEditField(null);
                              }}
                            >
                              {cell?.value == null ? (
                                <span className="unknown">
                                  — <small>Unknown</small>
                                </span>
                              ) : typeof cell.value === 'boolean' ? (
                                <span
                                  className={
                                    cell.value ? 'badge yes' : 'badge no'
                                  }
                                >
                                  {cell.value && <Check size={12} />}{' '}
                                  {displayValue(cell)}
                                </span>
                              ) : (
                                <span>{displayValue(cell)}</span>
                              )}
                              {cell?.manuallyEdited && (
                                <span
                                  className="edited-dot"
                                  title="Manually edited"
                                />
                              )}
                              {cell?.confidence === 'low' && (
                                <small className="review-label">Verify</small>
                              )}
                            </button>
                            {fi === 0 && (
                              <span className="row-status">
                                {r.extractionStatus !== 'complete'
                                  ? r.extractionStatus
                                  : demo
                                    ? 'Sample listing'
                                    : new URL(r.sourceUrl).hostname}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td>
                        <a
                          className="source-link"
                          href={r.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open source for ${r.title}`}
                        >
                          <ArrowUpRight size={17} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && (
                <div className="empty-state">
                  <Search size={30} />
                  <h3>
                    {projectItems.length
                      ? 'No matches yet'
                      : 'Your shortlist starts here'}
                  </h3>
                  <p>
                    {projectItems.length
                      ? 'Adjust your filters to see more options.'
                      : 'Save your first listing with the Chrome extension.'}
                  </p>
                  <button
                    className="button"
                    onClick={() =>
                      projectItems.length
                        ? setAst({ filters: [] })
                        : setModal('help')
                    }
                  >
                    {projectItems.length
                      ? 'Clear filters'
                      : 'Set up the extension'}
                  </button>
                </div>
              )}
            </div>
            <div className="table-footer">
              <span>
                {rows.length} of {projectItems.length} options
                <span className="dot">·</span>
                {visible.length} visible fields
              </span>
              <span>
                <span className="status-dot" />
                {demo
                  ? 'Demo changes saved locally'
                  : 'Connected to your workspace'}
              </span>
            </div>
            {ast.aggregate && (
              <div className="aggregate-result">
                {ast.aggregate.operation} ·{' '}
                {fields.find((f) => f.id === ast.aggregate?.fieldId)?.label}:{' '}
                <strong>{aggregate(rows, ast.aggregate) ?? 'Unknown'}</strong>
              </div>
            )}
            <div className="bottom-note">
              <ShieldCheck size={16} />
              <p>“Unknown” means the source didn’t say. It never means “No.”</p>
            </div>
          </section>
        )}
      </main>
      {modal === 'create' && (
        <Modal
          error={error}
          title="New research project"
          onClose={() => setModal(null)}
        >
          <form onSubmit={create}>
            <label>
              Project name
              <input
                name="name"
                placeholder="e.g. Edmonton Apartments"
                required
                maxLength={120}
                autoFocus
              />
            </label>
            <label>
              Start with a template
              <select name="template">
                {Object.entries(templateLabels).map(([key, label]) => (
                  <option value={key} key={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">
              You can add fields and adjust your comparison at any time.
            </p>
            <button className="primary full" disabled={busy}>
              Create project
            </button>
          </form>
        </Modal>
      )}
      {modal === 'field' && (
        <Modal
          error={error}
          title="Add a comparison field"
          onClose={() => setModal(null)}
        >
          <form onSubmit={addField}>
            <label>
              Field name
              <input
                name="label"
                required
                maxLength={100}
                placeholder="e.g. Utilities"
                autoFocus
              />
            </label>
            <label>
              Type
              <select name="type">
                {fieldTypeSchema.options.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              Options for an enum
              <input
                name="options"
                placeholder="Separate choices with commas"
              />
            </label>
            <p className="muted">
              Open a saved item to populate this field from its original source.
            </p>
            <button className="primary full" disabled={busy}>
              Add field
            </button>
          </form>
        </Modal>
      )}
      {modal === 'columns' && (
        <Modal
          error={error}
          title="Visible columns"
          onClose={() => setModal(null)}
        >
          <div className="column-list">
            {fields.map((f) => (
              <label key={f.id} className="check-label">
                <input
                  type="checkbox"
                  checked={!hidden.includes(f.id)}
                  onChange={() =>
                    setHidden(
                      hidden.includes(f.id)
                        ? hidden.filter((id) => id !== f.id)
                        : [...hidden, f.id],
                    )
                  }
                />
                {f.label}
                <button
                  type="button"
                  className="icon"
                  aria-label={`Manage ${f.label}`}
                  onClick={() => {
                    setManagedField(f);
                    setModal('manage-field');
                  }}
                >
                  <Settings2 size={14} />
                </button>
              </label>
            ))}
          </div>
        </Modal>
      )}
      {modal === 'manage-field' && managedField && project && (
        <Modal
          error={error}
          title={`Manage ${managedField.label}`}
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const label = String(
                new FormData(e.currentTarget).get('label'),
              ).trim();
              void run(async () => {
                if (demo)
                  commit({
                    ...data,
                    fields: {
                      ...data.fields,
                      [project.id]: fields.map((f) =>
                        f.id === managedField.id ? { ...f, label } : f,
                      ),
                    },
                  });
                else {
                  const { error } = await supabase!
                    .from('project_fields')
                    .update({ label })
                    .eq('id', managedField.id);
                  if (error) throw error;
                  await refresh();
                }
                setModal(null);
              });
            }}
          >
            <label>
              Field label
              <input
                name="label"
                required
                maxLength={100}
                defaultValue={managedField.label}
              />
            </label>
            <p className="muted">
              Type: {managedField.dataType}. The extraction key stays the same
              when you rename a field.
            </p>
            <button className="primary" disabled={busy}>
              Save label
            </button>
          </form>
          <hr />
          <p>
            Populate this field for existing items. Manual corrections are
            preserved.
          </p>
          <button
            className="button full"
            disabled={busy || !projectItems.length}
            onClick={() =>
              void run(async () => {
                const targets = projectItems.filter(
                  (i) => !i.values[managedField.id]?.manuallyEdited,
                );
                if (demo) {
                  const updated = new Map(
                    targets.map((i) => [
                      i.id,
                      demoBackfill(i, managedField, data.sources[i.id]),
                    ]),
                  );
                  commit({
                    ...data,
                    items: data.items.map((i) =>
                      updated.has(i.id)
                        ? {
                            ...i,
                            values: {
                              ...i.values,
                              [managedField.id]: updated.get(i.id)!,
                            },
                          }
                        : i,
                    ),
                  });
                } else {
                  try {
                    for (const target of targets) {
                      await invoke('backfill-field', {
                        itemId: target.id,
                        fieldId: managedField.id,
                        requestId: crypto.randomUUID(),
                      });
                    }
                  } finally {
                    await refresh();
                  }
                }
                setNotice(
                  `Checked ${targets.length} saved sources for ${managedField.label}.`,
                );
                setModal(null);
              })
            }
          >
            Populate existing items
          </button>
          <button
            className="danger"
            disabled={busy}
            onClick={() => {
              if (
                !confirm(
                  `Delete the ${managedField.label} field and its values?`,
                )
              )
                return;
              void run(async () => {
                if (demo) {
                  commit({
                    ...data,
                    fields: {
                      ...data.fields,
                      [project.id]: fields.filter(
                        (f) => f.id !== managedField.id,
                      ),
                    },
                    items: data.items.map((i) => {
                      const values = { ...i.values };
                      delete values[managedField.id];
                      return { ...i, values };
                    }),
                  });
                } else {
                  const { error } = await supabase!
                    .from('project_fields')
                    .delete()
                    .eq('id', managedField.id);
                  if (error) throw error;
                  await refresh();
                }
                setAst({ filters: [] });
                setModal(null);
              });
            }}
          >
            <Trash2 size={16} />
            Delete field
          </button>
        </Modal>
      )}
      {modal === 'filter' && (
        <Modal
          error={error}
          title="Filter your comparison"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const field = fields.find((f) => f.id === fd.get('field'))!;
              const operator = String(
                fd.get('operator'),
              ) as FilterAST['filters'][number]['operator'];
              const raw = String(fd.get('value'));
              const value =
                operator === 'is_unknown'
                  ? null
                  : field.dataType === 'boolean'
                    ? raw.toLowerCase() === 'true'
                      ? true
                      : raw.toLowerCase() === 'false'
                        ? false
                        : raw
                    : ['number', 'currency'].includes(field.dataType)
                      ? raw.trim()
                        ? Number(raw)
                        : null
                      : raw;
              try {
                setError('');
                setAst(
                  validateFilter(
                    {
                      ...ast,
                      filters: [
                        ...ast.filters,
                        { fieldId: field.id, operator, value },
                      ],
                    },
                    fields,
                  ),
                );
                setModal(null);
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            <label>
              Field
              <select name="field">
                {fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Condition
              <select name="operator">
                <option value="eq">Equals</option>
                <option value="neq">Does not equal</option>
                <option value="lt">Less than</option>
                <option value="lte">At most</option>
                <option value="gt">Greater than</option>
                <option value="gte">At least</option>
                <option value="contains">Contains</option>
                <option value="is_unknown">Is unknown</option>
              </select>
            </label>
            <label>
              Value
              <input
                name="value"
                placeholder="For yes/no fields, enter true or false"
              />
            </label>
            <button className="primary full">Apply filter</button>
          </form>
        </Modal>
      )}
      {modal === 'export' && (
        <Modal
          error={error}
          title="Export comparison"
          onClose={() => setModal(null)}
        >
          <p>
            Export {rows.length} visible rows and {visible.length} fields, with
            a source URL for every item. Unknown values stay blank.
          </p>
          <div className="export-options">
            {(['xlsx', 'csv'] as const).map((format) => (
              <button
                key={format}
                className="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await exportTable(
                      format,
                      project?.name ?? 'Comparison',
                      visible,
                      rows,
                    );
                    setModal(null);
                    setNotice('Your comparison was exported.');
                  })
                }
              >
                <Download size={18} />
                {format.toUpperCase()}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {modal === 'help' && (
        <Modal
          error={error}
          title="Connect Sift"
          onClose={() => setModal(null)}
        >
          <ol className="setup-list">
            <li>
              <strong>Connect your backend</strong>
              <p>
                Configure the Supabase project URL and public key, apply the
                database migrations, and set the Gemini key in backend secrets.
              </p>
            </li>
            <li>
              <strong>Load the Chrome extension</strong>
              <p>
                Open Chrome’s Extensions page, enable Developer mode, choose
                “Load unpacked”, and select <code>apps/extension/dist</code>{' '}
                from this project.
              </p>
            </li>
            <li>
              <strong>Save your first page</strong>
              <p>
                Sign in, visit a listing, click the extension icon, choose a
                project, and select “Save current page”.
              </p>
            </li>
          </ol>
          <p className="privacy-note">
            Only the page you choose is captured. Saved content is sent to your
            backend and AI provider for extraction. Passwords, forms, unrelated
            tabs, and browsing history are excluded.
          </p>
        </Modal>
      )}
      {modal === 'rename' && project && (
        <Modal
          error={error}
          title="Project settings"
          onClose={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(
                new FormData(e.currentTarget).get('name'),
              ).trim();
              void run(async () => {
                if (demo)
                  commit({
                    ...data,
                    projects: data.projects.map((p) =>
                      p.id === project.id ? { ...p, name } : p,
                    ),
                  });
                else {
                  const { error } = await supabase!
                    .from('projects')
                    .update({ name })
                    .eq('id', project.id);
                  if (error) throw error;
                  await refresh();
                }
                setModal(null);
              });
            }}
          >
            <label>
              Project name
              <input
                name="name"
                defaultValue={project.name}
                required
                maxLength={120}
              />
            </label>
            <button className="primary" disabled={busy}>
              Save name
            </button>
          </form>
          <hr />
          <button
            className="danger"
            disabled={busy}
            onClick={() => void deleteProject()}
          >
            <Trash2 size={16} />
            Delete project
          </button>
        </Modal>
      )}
      {item && (
        <Modal
          error={error}
          title={item.title}
          wide
          onClose={() => {
            setDetail(null);
            setEditField(null);
          }}
        >
          <div className="item-source">
            <a href={item.sourceUrl} target="_blank" rel="noreferrer">
              Open original source <ArrowUpRight size={16} />
            </a>
            <span className="template-label">{item.extractionStatus}</span>
          </div>
          {item.error && <p className="error-text">{item.error}</p>}
          <div className="field-details">
            {fields.map((f) => {
              const cell = item.values[f.id];
              return (
                <section key={f.id} className="field-detail">
                  <div className="field-detail-heading">
                    <h3>{f.label}</h3>
                    <div>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => setEditField(f)}
                      >
                        Edit
                      </button>
                      {!cell?.manuallyEdited && (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => void backfill(f, item)}
                        >
                          Check source
                        </button>
                      )}
                    </div>
                  </div>
                  {editField?.id === f.id ? (
                    <form
                      className="inline-edit"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveCell(
                          f,
                          String(new FormData(e.currentTarget).get('value')),
                        );
                      }}
                    >
                      {f.dataType === 'boolean' ? (
                        <select
                          name="value"
                          defaultValue={
                            cell?.value == null ? '' : String(cell.value)
                          }
                        >
                          <option value="">Unknown</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      ) : (
                        <input
                          aria-label={`Edit ${f.label}`}
                          name="value"
                          defaultValue={
                            cell?.value == null
                              ? ''
                              : Array.isArray(cell.value)
                                ? cell.value.join(', ')
                                : String(cell.value)
                          }
                        />
                      )}
                      <button className="button" disabled={busy}>
                        Save
                      </button>
                    </form>
                  ) : (
                    <strong className="detail-value">
                      {displayValue(cell)}
                    </strong>
                  )}
                  {cell?.manuallyEdited ? (
                    <p className="muted">
                      Manually edited · source evidence cleared for this value.
                    </p>
                  ) : cell?.evidence.length ? (
                    cell.evidence.map((e, index) => (
                      <blockquote key={index}>
                        “{e.quote}”
                        <a href={e.sourceUrl} target="_blank" rel="noreferrer">
                          {new URL(e.sourceUrl).hostname}
                          <ArrowUpRight size={12} />
                        </a>
                      </blockquote>
                    ))
                  ) : (
                    <p className="muted">No supporting information found.</p>
                  )}
                  {cell?.confidence && (
                    <small className="confidence">
                      {cell.confidence} confidence · qualitative assessment
                    </small>
                  )}
                </section>
              );
            })}
          </div>
          <button
            className="danger"
            disabled={busy}
            onClick={() => void deleteItem(item)}
          >
            <Trash2 size={16} />
            Delete saved item
          </button>
        </Modal>
      )}
    </div>
  );
}
function Auth({ onDemo }: { onDemo: () => void }) {
  const [signup, setSignup] = useState(location.pathname === '/sign-up');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const credentials = {
        email: String(fd.get('email')),
        password: String(fd.get('password')),
      };
      const { error } = signup
        ? await supabase!.auth.signUp(credentials)
        : await supabase!.auth.signInWithPassword(credentials);
      if (error) throw error;
      if (signup)
        setMessage(
          'Account created. Check your email if confirmation is required.',
        );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <div className="auth-card">
        <span className="brand-icon">
          <Layers3 size={25} />
        </span>
        <div className="eyebrow">SIFT</div>
        <h1>{signup ? 'Make room for your research.' : 'Welcome back.'}</h1>
        <p>Save the options. Compare the facts.</p>
        <form onSubmit={submit}>
          <label>
            Email
            <input type="email" name="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete={signup ? 'new-password' : 'current-password'}
              minLength={8}
              required
            />
          </label>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
          <button className="primary full" disabled={busy}>
            {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setSignup(!signup);
            history.pushState({}, '', signup ? '/sign-in' : '/sign-up');
          }}
        >
          {signup
            ? 'Already have an account? Sign in'
            : 'New here? Create an account'}
        </button>
        <hr />
        <button className="button full" onClick={onDemo}>
          Explore the demo
        </button>
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
