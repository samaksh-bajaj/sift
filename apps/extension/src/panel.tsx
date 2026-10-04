import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient, type Session } from '@supabase/supabase-js';
import { capturePage, prepareDocument } from '@sift/shared/capture';
import { publicEnvSchema, z } from '@sift/shared';
import './style.css';
const env = publicEnvSchema.safeParse(import.meta.env);
const client = env.success
  ? createClient(
      env.data.VITE_SUPABASE_URL,
      env.data.VITE_SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          storage: {
            async getItem(key) {
              const data = await chrome.storage.local.get(key);
              return typeof data[key] === 'string' ? data[key] : null;
            },
            async setItem(key, value) {
              await chrome.storage.local.set({ [key]: value });
            },
            async removeItem(key) {
              await chrome.storage.local.remove(key);
            },
          },
        },
      },
    )
  : null;
const projectsSchema = z.array(
  z.object({ id: z.string().uuid(), name: z.string() }),
);
const itemSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  extraction_status: z.string().optional(),
  error: z.string().nullable().optional(),
});
type ItemSummary = z.infer<typeof itemSummarySchema>;
const resultSchema = z.object({
  item: itemSummarySchema.optional(),
  duplicate: z.boolean().optional(),
  captured: z.boolean().optional(),
  queued: z.boolean().optional(),
  error: z.string().optional(),
});
function Panel() {
  const [session, setSession] = useState<Session | null>(null);
  const [projects, setProjects] = useState<z.infer<typeof projectsSchema>>([]);
  const [project, setProject] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<ItemSummary[]>([]);
  const [activeCapture, setActiveCapture] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [pending, setPending] = useState<
    Awaited<ReturnType<typeof prepareDocument>>['document'] | null
  >(null);
  useEffect(() => {
    if (!client) return;
    void client.auth.getSession().then((r) => setSession(r.data.session));
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session || !client) return;
    void client
      .from('projects')
      .select('id,name')
      .order('created_at')
      .then(async (r) => {
        if (r.error) {
          setError(r.error.message);
          return;
        }
        try {
          const rows = projectsSchema.parse(r.data);
          setProjects(rows);
          const saved = await chrome.storage.local.get('selectedProject');
          setProject(
            rows.find((p) => p.id === saved.selectedProject)?.id ??
              rows[0]?.id ??
              '',
          );
        } catch {
          setError('Project data could not be loaded.');
        }
      });
  }, [session]);
  useEffect(() => {
    if (!project || !client || !session) return;
    let disposed = false;
    async function refreshRecent() {
      const result = await client!
        .from('items')
        .select('id,title,extraction_status,error')
        .eq('project_id', project)
        .order('created_at', { ascending: false })
        .limit(5);
      if (!disposed && !result.error)
        setRecent(z.array(itemSummarySchema).parse(result.data));
    }
    void refreshRecent();
    const timer = setInterval(() => void refreshRecent(), 3000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [project, session]);
  useEffect(() => {
    if (!activeCapture) return;
    const item = recent.find((candidate) => candidate.id === activeCapture);
    if (!item || item.extraction_status === 'processing') return;
    setActiveCapture(null);
    if (item.extraction_status === 'failed') {
      setStatus('Page captured. AI extraction needs a retry.');
      setError(item.error ?? 'AI extraction failed. Please retry.');
      return;
    }
    setStatus(`Finished: ${item.title}`);
  }, [activeCapture, recent]);
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await client!.auth.signInWithPassword({
      email: String(fd.get('email')),
      password: String(fd.get('password')),
    });
    setError(error?.message ?? '');
    setBusy(false);
  }
  async function save(mode: 'default' | 'update' | 'duplicate' = 'default') {
    setBusy(true);
    setError('');
    setStatus('Preparing this page…');
    try {
      if (!client || !project) throw new Error('Choose a project first.');
      let document = pending;
      if (!document || mode === 'default') {
        const saved = await chrome.storage.session.get('invokedTabId');
        if (typeof saved.invokedTabId !== 'number')
          throw new Error(
            'Click the extension icon on the page you want to save.',
          );
        const { data: fields, error } = await client
          .from('project_fields')
          .select('label')
          .eq('project_id', project);
        if (error) throw error;
        const labels = z
          .array(z.object({ label: z.string() }))
          .parse(fields)
          .map((f) => f.label);
        let results: chrome.scripting.InjectionResult[];
        try {
          results = await chrome.scripting.executeScript({
            target: { tabId: saved.invokedTabId },
            func: capturePage,
            args: [labels, 60000],
          });
        } catch {
          throw new Error(
            'Open a regular webpage and click the extension icon again to grant access.',
          );
        }
        const prepared = await prepareDocument(results[0]?.result);
        document = prepared.document;
        if (!document.cleanedText && !document.jsonLd.length)
          throw new Error('No readable content was found.');
        setPending(document);
      }
      setStatus('Extracting source-backed facts…');
      const { data, error } = await client.functions.invoke('extract-item', {
        body: {
          projectId: project,
          document,
          mode,
          requestId: crypto.randomUUID(),
        },
      });
      if (error) {
        const detail = await error.context?.json().catch(() => null);
        throw new Error(detail?.error ?? error.message);
      }
      const result = resultSchema.parse(data);
      if (result.error) throw new Error(result.error);
      if (result.duplicate && result.item) {
        setDuplicate(result.item);
        setStatus('This page is already in your project.');
        return;
      }
      if (!result.item)
        throw new Error('The server did not return a saved item.');
      setRecent((previous) =>
        [
          result.item!,
          ...previous.filter((i) => i.id !== result.item!.id),
        ].slice(0, 5),
      );
      if (result.captured && result.queued) {
        setActiveCapture(result.item.id);
        setStatus(
          'Page captured — safe to move on. Extracting in the background…',
        );
      } else {
        setStatus(`Saved: ${result.item.title}`);
      }
      setDuplicate(null);
      setPending(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'The save failed. Please retry.',
      );
      setStatus('');
    } finally {
      setBusy(false);
    }
  }
  const web = env.success ? env.data.VITE_WEB_URL : 'http://localhost:5173';
  return (
    <main>
      <header>
        <span className="logo">S</span>
        <div>
          <strong>Sift</strong>
          <small>SAVE. COMPARE. DECIDE.</small>
        </div>
      </header>
      {!client ? (
        <section>
          <h1>Connect your workspace</h1>
          <p>
            Configure the Supabase URL and public key in the extension’s
            environment file, rebuild, and reload the extension.
          </p>
          <a href={web} target="_blank" rel="noreferrer">
            Open workspace ↗
          </a>
        </section>
      ) : !session ? (
        <section>
          <h1>Bring your research together.</h1>
          <p>Sign in with your workspace account.</p>
          <form onSubmit={login}>
            <label>
              Email
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </label>
            <button className="primary" disabled={busy}>
              Sign in
            </button>
          </form>
          <a href={`${web}/sign-up`} target="_blank" rel="noreferrer">
            Create an account ↗
          </a>
        </section>
      ) : (
        <>
          <section>
            <label>
              Save to project
              <select
                value={project}
                onChange={(e) => {
                  setProject(e.target.value);
                  setDuplicate(null);
                  setPending(null);
                  void chrome.storage.local.set({
                    selectedProject: e.target.value,
                  });
                }}
              >
                {!projects.length && (
                  <option value="">Create a project in the workspace</option>
                )}
                {projects.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              disabled={busy || !project}
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : '+ Save current page'}
            </button>
            <p className="privacy">
              Only the page you choose is sent to your backend and AI provider.
              Forms and passwords are excluded.
            </p>
            {status && (
              <p className="status" role="status">
                {status}
              </p>
            )}
            {duplicate && (
              <div className="duplicate">
                <strong>{duplicate.title}</strong>
                <a
                  href={`${web}/projects/${project}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open existing ↗
                </a>
                <button disabled={busy} onClick={() => void save('update')}>
                  Update extraction
                </button>
                <button disabled={busy} onClick={() => void save('duplicate')}>
                  Save duplicate anyway
                </button>
              </div>
            )}
          </section>
          <section>
            <h2>Recent saves</h2>
            {recent.length ? (
              recent.map((i) => {
                const state =
                  i.extraction_status === 'processing'
                    ? 'Extracting…'
                    : i.extraction_status === 'failed'
                      ? 'Needs retry'
                      : 'Ready';
                const icon =
                  i.extraction_status === 'processing'
                    ? '…'
                    : i.extraction_status === 'failed'
                      ? '!'
                      : '✓';
                return (
                  <a
                    className={`recent ${i.extraction_status ?? ''}`}
                    key={i.id}
                    href={`${web}/projects/${project}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span aria-hidden="true">{icon}</span>
                    <span className="recent-name">
                      {i.title}
                      <small>{state}</small>
                    </span>
                    <span>↗</span>
                  </a>
                );
              })
            ) : (
              <p>Your saved pages will appear here.</p>
            )}
          </section>
          <footer>
            <a
              href={`${web}/projects/${project}`}
              target="_blank"
              rel="noreferrer"
            >
              Open full workspace ↗
            </a>
            <button onClick={() => void client.auth.signOut()}>Sign out</button>
          </footer>
        </>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Panel />);
