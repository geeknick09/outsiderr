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
        <div className="space-y-4 text-sm leading-relaxed text-muted">
          <MarkdownLite content={page.content} />
        </div>
      </div>
      <p className="text-xs text-muted">
        Version {page.version} · Last updated{" "}
        {new Date(page.updatedAt).toLocaleDateString()}
      </p>
    </div>
  );
}

/**
 * Minimal markdown renderer for legal pages.
 * Supports: # h1, ## h2, - bullet lists, plain paragraphs.
 * Handles both real newlines and literal \n escape sequences
 * (PostgreSQL standard string literals don't interpret \n).
 */
function MarkdownLite({ content }: { content: string }) {
  // Convert literal \n sequences to real newlines
  const normalized = content.replace(/\\n/g, "\n");
  const lines = normalized.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];

  function flushList(key: number) {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`ul-${key}`} className="list-disc space-y-1.5 pl-5">
        {listItems.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>,
    );
    listItems = [];
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("## ")) {
      flushList(idx);
      blocks.push(
        <h2 key={idx} className="text-lg font-bold text-zinc-900 dark:text-white">
          {trimmed.slice(3)}
        </h2>,
      );
    } else if (trimmed.startsWith("# ")) {
      flushList(idx);
      blocks.push(
        <h2 key={idx} className="text-lg font-bold text-zinc-900 dark:text-white">
          {trimmed.slice(2)}
        </h2>,
      );
    } else if (trimmed.startsWith("- ")) {
      listItems.push(trimmed.slice(2));
    } else if (trimmed === "") {
      flushList(idx);
    } else {
      flushList(idx);
      blocks.push(
        <p key={idx} className="text-sm leading-relaxed">
          {trimmed}
        </p>,
      );
    }
  });

  flushList(lines.length);

  return <>{blocks}</>;
}
