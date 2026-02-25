import React from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

interface DigestOverviewProps {
  digestRunId: string;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function contentTypeLabel(type: "article" | "video" | "podcast" | "newsletter"): string {
  if (type === "video") return "Video";
  if (type === "podcast") return "Podcast";
  if (type === "newsletter") return "Newsletter";
  return "Article";
}

export function DigestOverview({ digestRunId }: DigestOverviewProps) {
  const publicApi = api as any;
  const digest = useQuery(publicApi.publicDigests.getDigestRun, { digestRunId });

  if (digest === undefined) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center text-ink-muted">
        Loading digest...
      </div>
    );
  }

  if (digest === null) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-serif text-ink mb-3">Digest not found</h1>
          <p className="text-ink-muted">
            This digest link may be expired or incorrect.
          </p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-cream px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 border-b border-border pb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-muted mb-3">DoodleDog Digest</p>
          <h1 className="font-serif text-4xl text-ink leading-tight">{digest.streamName}</h1>
          <p className="mt-2 text-ink-muted">
            {formatDate(digest.generatedAt)} · {digest.itemCount} items
          </p>
        </header>

        {digest.digestMarkdown && (
          <section className="mb-8 rounded-lg border border-border bg-surface p-5">
            <p className="font-serif text-lg italic text-ink-soft leading-relaxed">
              {digest.digestMarkdown.split("\n").find((line: string) => line.trim())}
            </p>
          </section>
        )}

        <section className="space-y-4">
          {digest.items.map((item: any, index: number) => (
            <article key={`${item.url}-${index}`} className="rounded-lg border border-border bg-surface p-5">
              <p className="text-xs uppercase tracking-wide text-ink-muted mb-2">
                {contentTypeLabel(item.contentType)} · {item.sourceName}
              </p>
              <h2 className="font-serif text-2xl text-ink leading-snug mb-3">{item.title}</h2>
              <p className="text-ink-soft leading-relaxed mb-4">{item.summary}</p>
              <div className="flex flex-wrap gap-4 text-sm">
                <a href={`/read/${digestRunId}/${index}`} className="text-reader-active hover:underline">
                  Open reader
                </a>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-ink-muted hover:text-ink hover:underline"
                >
                  Original link
                </a>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
