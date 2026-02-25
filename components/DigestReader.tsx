import React from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

interface DigestReaderProps {
  digestRunId: string;
  itemIndex: number;
}

function formatPublishedDate(date?: string): string | null {
  if (!date) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function DigestReader({ digestRunId, itemIndex }: DigestReaderProps) {
  const publicApi = api as any;
  const digest = useQuery(publicApi.publicDigests.getDigestRun, { digestRunId });

  if (digest === undefined) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center text-ink-muted">
        Loading article...
      </div>
    );
  }

  if (digest === null) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-serif text-ink mb-3">Reader link not found</h1>
          <p className="text-ink-muted">This digest item may no longer be available.</p>
        </div>
      </div>
    );
  }

  if (itemIndex < 0 || itemIndex >= digest.items.length) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-serif text-ink mb-3">Item not found</h1>
          <p className="text-ink-muted mb-4">That digest item index is out of range.</p>
          <a href={`/digest/${digestRunId}`} className="text-reader-active hover:underline">
            Open digest overview
          </a>
        </div>
      </div>
    );
  }

  const item = digest.items[itemIndex];
  const previousHref = itemIndex > 0 ? `/read/${digestRunId}/${itemIndex - 1}` : null;
  const nextHref = itemIndex < digest.items.length - 1 ? `/read/${digestRunId}/${itemIndex + 1}` : null;
  const publishedDate = formatPublishedDate(item.publishedAt);
  const contentParagraphs = (item.fullContent || "")
    .split(/\n{2,}/)
    .map((paragraph: string) => paragraph.trim())
    .filter(Boolean);

  return (
    <main className="min-h-screen bg-cream px-4 py-8 sm:px-8">
      <article className="mx-auto max-w-3xl rounded-lg border border-border bg-surface p-6 sm:p-8">
        <nav className="flex flex-wrap items-center justify-between gap-3 text-sm mb-6">
          <a href={`/digest/${digestRunId}`} className="text-reader-active hover:underline">
            ← Back to digest
          </a>
          <div className="flex gap-4">
            {previousHref ? (
              <a href={previousHref} className="text-ink-muted hover:text-ink hover:underline">
                Previous
              </a>
            ) : (
              <span className="text-ink-muted/50">Previous</span>
            )}
            {nextHref ? (
              <a href={nextHref} className="text-ink-muted hover:text-ink hover:underline">
                Next
              </a>
            ) : (
              <span className="text-ink-muted/50">Next</span>
            )}
          </div>
        </nav>

        <header className="border-b border-border pb-5 mb-6">
          <p className="text-xs uppercase tracking-wide text-ink-muted mb-2">
            {item.sourceName}
            {publishedDate ? ` · ${publishedDate}` : ""}
          </p>
          <h1 className="font-serif text-4xl text-ink leading-tight mb-4">{item.title}</h1>
          <p className="text-lg text-ink-soft leading-relaxed">{item.summary}</p>
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-4 text-sm text-reader-active hover:underline"
          >
            Open original source →
          </a>
        </header>

        <section className="prose-polished max-w-none text-ink-soft leading-relaxed">
          {contentParagraphs.length > 0 ? (
            contentParagraphs.map((paragraph: string, index: number) => (
              <p key={`${index}-${paragraph.slice(0, 12)}`} className="mb-5">
                {paragraph}
              </p>
            ))
          ) : (
            <p>Full content was not captured for this item.</p>
          )}
        </section>
      </article>
    </main>
  );
}
