"use client";

import { useState } from "react";
import { Check, Pencil } from "lucide-react";

import { saveLegalPageAction } from "@/actions/legal-pages";
import { Button } from "@/components/ui/button";
import type { LegalPage } from "@/lib/data/legal-pages";

const INPUT =
  "w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-violet-neon dark:border-white/10 dark:bg-white/5 dark:text-white";

export function LegalPagesPanel({ pages }: { pages: LegalPage[] }) {
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);

  function startEdit(page: LegalPage) {
    setEditingSlug(page.slug);
    setTitle(page.title);
    setContent(page.content);
    setIsPublished(page.isPublished);
    setError(null);
    setSavedSlug(null);
  }

  function cancelEdit() {
    setEditingSlug(null);
    setError(null);
  }

  async function handleSave() {
    if (!editingSlug) return;
    setSaving(true);
    setError(null);
    const result = await saveLegalPageAction(editingSlug, title, content, isPublished);
    if (result.error) {
      setError(result.error);
    } else {
      setSavedSlug(editingSlug);
      setEditingSlug(null);
      setTimeout(() => setSavedSlug(null), 3000);
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black tracking-tight">Legal Pages</h1>
      <p className="text-sm text-muted">
        Edit the content of your legal and policy pages. Changes go live immediately.
      </p>

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
                <Button type="button" onClick={handleSave} disabled={saving}>
                  <Check className="h-4 w-4" />
                  {saving ? "Saving…" : "Save"}
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
              <Button variant="secondary" size="sm" onClick={() => startEdit(page)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
