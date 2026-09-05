"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";

import { deleteLegalPageAction, saveLegalPageAction } from "@/actions/legal-pages";
import { Button } from "@/components/ui/button";
import type { LegalPage } from "@/lib/data/legal-pages";

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
                <p className="text-xs text-muted">/legal/{page.slug} · v{page.version}</p>
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
    </div>
  );
}
