import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getLegalPage } from "@/lib/data/legal-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const page = await getLegalPage((await params).slug);
  if (!page) return { title: "Not Found — Outsiderr" };
  return { title: `${page.title} — Outsiderr` };
}

export default async function LegalPageView({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await getLegalPage(slug);
  if (!page || !page.isPublished) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10">
      <h1 className="text-3xl font-black tracking-tight">{page.title}</h1>
      <div className="glass rounded-3xl p-6">
        <article className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed text-muted">
          {page.content}
        </article>
      </div>
      <p className="text-xs text-muted">Version {page.version} · Last updated {new Date(page.updatedAt).toLocaleDateString()}</p>
    </div>
  );
}
