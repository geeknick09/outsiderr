"use client";

import { useEffect, useState } from "react";
import { Check, Eye, History, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";

import { deleteLegalPageAction, saveLegalPageAction, listLegalPageVersionsAction, restoreLegalPageVersionAction } from "../actions/legal-pages";
import { formatDateTime } from "@/modules/shared";
import { Button } from "@/modules/shared";
import { LegalPage } from "../data/legal-pages";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function LegalPagesPanel({ pages }: { pages: LegalPage[] }) {
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);

  function startEdit(page: LegalPage) {
    setEditingSlug(page.slug);
    setIsNew(false);
    setSlug(page.slug);
    setTitle(page.title);
    setContent(page.content);
    setIsPublished(page.isPublished);
    setError(null);
    setSavedSlug(null);
  }

  function startNew() {
    setEditingSlug("__new__");
    setIsNew(true);
    setSlug("");
    setTitle("");
    setContent("");
    setIsPublished(true);
    setError(null);
    setSavedSlug(null);
  }

  function cancelEdit() {
    setEditingSlug(null);
    setIsNew(false);
    setError(null);
  }

  async function handleSave() {
    if (!title) { setError("Title is required."); return; }
    if (!content) { setError("Content is required."); return; }
    const saveSlug = isNew ? slug.trim().toLowerCase().replace(/\s+/g, "-") : editingSlug;
    if (!saveSlug) { setError("Slug is required."); return; }
    setSaving(true);
    setError(null);
    const result = await saveLegalPageAction(saveSlug, title, content, isPublished);
    if (result.error) {
      setError(result.error);
    } else {
      setSavedSlug(saveSlug);
      setEditingSlug(null);
      setIsNew(false);
      setTimeout(() => setSavedSlug(null), 3000);
    }
    setSaving(false);
  }

  async function handleDelete(pageSlug: string) {
    if (!confirm(`Delete "${pageSlug}"? This cannot be undone.`)) return;
    const result = await deleteLegalPageAction(pageSlug);
    if (result.error) alert(result.error);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Legal Pages</h1>
          <p className="text-sm text-muted">
            Edit the content of your legal and policy pages. Changes go live immediately.
          </p>
        </div>
        <Button type="button" size="sm" onClick={startNew}>
          <Plus className="h-4 w-4" />
          New Page
        </Button>
      </div>

      {/* New page form */}
      {isNew && editingSlug === "__new__" ? (
        <div className="glass space-y-3 rounded-3xl border border-violet-neon/30 p-5">
          <h3 className="text-sm font-bold">Create New Legal Page</h3>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Slug (URL)</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. community-guidelines"
              className={INPUT}
            />
            <span className="text-xs text-muted">Will be accessible at /legal/{slug || "..."}</span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Community Guidelines"
              className={INPUT}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Content (Markdown)
            </span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              placeholder="# Community Guidelines\n\n..."
              className={`${INPUT} font-mono text-xs`}
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="h-4 w-4 accent-violet-neon"
            />
            <span className="text-sm">Published (visible to public)</span>
          </label>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="button" onClick={handleSave} loading={saving} loadingText="Creating…">
              <Check className="h-4 w-4" />
              Create Page
            </Button>
            <Button type="button" variant="secondary" onClick={cancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {pages.map((page) => (
        <div key={page.slug} className="glass rounded-3xl p-5">
          {editingSlug === page.slug ? (
            <div className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">Title</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={INPUT}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Content (Markdown)
                </span>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={12}
                  className={`${INPUT} font-mono text-xs`}
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="h-4 w-4 accent-violet-neon"
                />
                <span className="text-sm">Published (visible to public)</span>
              </label>
              {error ? <p className="text-sm text-red-500">{error}</p> : null}
              <div className="flex gap-2">
                <Button type="button" onClick={handleSave} loading={saving} loadingText="Saving…">
                  <Check className="h-4 w-4" />
                  Save
                </Button>
                <Button type="button" variant="secondary" onClick={cancelEdit}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold">{page.title}</h3>
                  {savedSlug === page.slug ? (
                    <span className="text-xs font-semibold text-emerald-500">✓ Saved</span>
                  ) : null}
                  {!page.isPublished ? (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-600">
                      Draft
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryFor(page.slug)}
                  title="Version history"
                  className="mt-1 inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] font-bold text-muted transition-colors hover:border-violet-neon hover:text-violet-neon dark:border-white/10"
                >
                  <History className="h-3 w-3" /> v{page.version}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => startEdit(page)}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleDelete(page.slug)}
                  className="hover:border-red-400 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
      {historyFor ? (
        <VersionHistory
          slug={historyFor}
          currentVersion={pages.find((p) => p.slug === historyFor)?.version ?? 0}
          onClose={() => setHistoryFor(null)}
        />
      ) : null}
    </div>
  );
}

function VersionHistory({
  slug,
  currentVersion,
  onClose,
}: {
  slug: string;
  currentVersion: number;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<
    { id: string; version: number; title: string; content: string; isPublished: boolean; createdAt: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void listLegalPageVersionsAction(slug).then((r) => {
      setVersions(r.versions);
      setLoading(false);
    });
  }, [slug]);

  async function restore(version: number) {
    if (!confirm(`Restore version ${version}? It becomes the new live copy.`)) return;
    setBusy(true);
    const r = await restoreLegalPageVersionAction(slug, version);
    setBusy(false);
    if (r.error) alert(r.error);
    else onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h3 className="text-lg font-black">Version history</h3>
            <p className="text-xs text-muted">/legal/{slug} · live v{currentVersion}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[65vh] overflow-auto p-5">
          {loading ? (
            <p className="py-10 text-center text-sm text-muted">Loading…</p>
          ) : versions.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              No saved versions yet - the next save starts the history.
            </p>
          ) : (
            <div className="space-y-2">
              {versions.map((v) => (
                <div key={v.id} className="rounded-2xl border border-white/10 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-violet-neon/15 px-2.5 py-0.5 text-xs font-bold text-violet-neon">
                      v{v.version}
                    </span>
                    {v.version === currentVersion ? (
                      <span className="rounded-full bg-lime-neon/15 px-2 py-0.5 text-[10px] font-bold text-lime-neon">
                        LIVE
                      </span>
                    ) : null}
                    {!v.isPublished ? (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                        DRAFT
                      </span>
                    ) : null}
                    <span className="text-xs text-muted">{formatDateTime(v.createdAt)}</span>
                    <div className="ml-auto flex gap-2">
                      <button
                        type="button"
                        onClick={() => setViewing(viewing === v.id ? null : v.id)}
                        className="flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold text-muted hover:text-foreground"
                      >
                        <Eye className="h-3 w-3" /> {viewing === v.id ? "Hide" : "View"}
                      </button>
                      {v.version !== currentVersion ? (
                        <button
                          type="button"
                          onClick={() => restore(v.version)}
                          disabled={busy}
                          className="flex items-center gap-1 rounded-full border border-violet-neon/40 px-2.5 py-1 text-xs font-bold text-violet-neon hover:bg-violet-neon/10 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" /> Restore
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {viewing === v.id ? (
                    <pre className="mt-3 max-h-60 overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 font-mono text-xs text-muted">
                      {v.content}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
