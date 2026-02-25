import React, { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/clerk-react";
import { Mail, PlayCircle, Rocket } from "lucide-react";
import { api } from "../convex/_generated/api";

type Schedule = "daily" | "twice_daily" | "weekly";

function computeNextRunLabel(schedule: Schedule): string {
  const now = Date.now();
  const DAY_MS = 86400_000;
  const nextRun = schedule === "weekly"
    ? new Date(now + 7 * DAY_MS)
    : schedule === "twice_daily"
      ? new Date(now + 12 * 3600_000)
      : new Date(now + DAY_MS);

  return nextRun.toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function FirstDigestSetup() {
  const publicApi = api as any;
  const { user, isLoaded } = useUser();
  const templates = useQuery(publicApi.streams.starterTemplates, {});
  const existingStreams = useQuery(publicApi.streams.list, {});
  const createFromStarter = useMutation(publicApi.streams.createFromStarter);
  const runStreamNow = useAction(publicApi.digests.runStreamNow);

  const [templateId, setTemplateId] = useState<string>("");
  const [schedule, setSchedule] = useState<Schedule>("daily");
  const [deliveryEmail, setDeliveryEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    streamId: string;
    streamName: string;
    runId: string | null;
    destinationEmail: string;
    schedule: Schedule;
  } | null>(null);

  const defaultEmail = useMemo(() => {
    if (!user) return "";
    return user.primaryEmailAddress?.emailAddress || user.emailAddresses[0]?.emailAddress || "";
  }, [user]);

  React.useEffect(() => {
    if (deliveryEmail || !defaultEmail) return;
    setDeliveryEmail(defaultEmail);
  }, [defaultEmail, deliveryEmail]);

  React.useEffect(() => {
    if (!templates || templates.length === 0) return;
    if (templateId) return;
    setTemplateId(templates[0].id);
  }, [templates, templateId]);

  const selectedTemplate = useMemo(
    () => templates?.find((template: any) => template.id === templateId) || null,
    [templates, templateId]
  );

  const nextRunLabel = computeNextRunLabel(schedule);

  const handleCreateAndRun = async () => {
    if (!selectedTemplate) return;
    if (!deliveryEmail.trim()) {
      setError("Delivery email is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const streamId = await createFromStarter({
        templateId: selectedTemplate.id,
        deliveryEmail: deliveryEmail.trim(),
        schedule,
      });

      const runId = await runStreamNow({ streamId });

      setResult({
        streamId,
        streamName: selectedTemplate.name,
        runId,
        destinationEmail: deliveryEmail.trim(),
        schedule,
      });
    } catch (err: any) {
      setError(err?.message || "Failed to create your first digest stream.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoaded || templates === undefined || existingStreams === undefined) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center text-ink-muted">
        Loading setup...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-cream px-6 py-10">
        <div className="mx-auto max-w-xl rounded-xl border border-border bg-surface p-8 text-center">
          <h1 className="font-serif text-3xl text-ink mb-3">Sign in to create your first digest</h1>
          <p className="text-ink-muted mb-5">
            The activation flow needs your account so we can save streams and deliver email digests.
          </p>
          <a href="/" className="text-reader-active hover:underline">Return to app</a>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-cream px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="rounded-xl border border-border bg-surface p-6 sm:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-ink-muted mb-2">Activation</p>
          <h1 className="font-serif text-4xl text-ink leading-tight mb-3">Get your first digest in under 10 minutes</h1>
          <p className="text-ink-soft leading-relaxed">
            Pick a starter stream, confirm the destination email, and run a test digest now.
          </p>
          <div className="mt-4 text-sm text-ink-muted">
            {existingStreams.length > 0 ? `You already have ${existingStreams.length} stream(s).` : "No streams yet."}
          </div>
        </header>

        <section className="rounded-xl border border-border bg-surface p-6 sm:p-8">
          <h2 className="font-serif text-2xl text-ink mb-4">1. Choose a starter stream</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((template: any) => {
              const selected = template.id === templateId;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setTemplateId(template.id)}
                  className={`rounded-lg border p-4 text-left transition ${
                    selected
                      ? "border-reader-active bg-accent-soft/40"
                      : "border-border bg-surface hover:border-ink-muted"
                  }`}
                >
                  <div className="font-medium text-ink mb-1">{template.name}</div>
                  <div className="text-sm text-ink-muted mb-2">{template.description}</div>
                  <div className="text-xs text-ink-muted">{template.sourceCount} sources</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-surface p-6 sm:p-8">
          <h2 className="font-serif text-2xl text-ink mb-4">2. Confirm delivery and run now</h2>
          <label className="block mb-4">
            <span className="text-sm text-ink-muted">Delivery email</span>
            <div className="mt-1 flex items-center rounded-lg border border-border bg-cream-warm px-3 py-2">
              <Mail size={16} className="text-ink-muted mr-2" />
              <input
                type="email"
                value={deliveryEmail}
                onChange={(e) => setDeliveryEmail(e.target.value)}
                className="w-full bg-transparent text-ink outline-none"
                placeholder="you@example.com"
              />
            </div>
          </label>

          <label className="block mb-5">
            <span className="text-sm text-ink-muted">Schedule</span>
            <select
              value={schedule}
              onChange={(e) => setSchedule(e.target.value as Schedule)}
              className="mt-1 w-full rounded-lg border border-border bg-cream-warm px-3 py-2 text-ink outline-none"
            >
              <option value="daily">Daily</option>
              <option value="twice_daily">Twice daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </label>

          <div className="rounded-lg border border-border bg-cream-warm px-4 py-3 text-sm text-ink-muted mb-5">
            Next scheduled run after this test: <span className="text-ink font-medium">{nextRunLabel}</span>
          </div>

          <button
            type="button"
            disabled={!selectedTemplate || isSubmitting}
            onClick={handleCreateAndRun}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-white font-medium disabled:opacity-60"
          >
            {isSubmitting ? <PlayCircle size={18} className="animate-pulse" /> : <Rocket size={18} />}
            {isSubmitting ? "Creating stream and running digest..." : "Create stream + run first digest"}
          </button>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </section>

        {result && (
          <section className="rounded-xl border border-green-200 bg-green-50 p-6 sm:p-8">
            <h2 className="font-serif text-2xl text-green-900 mb-3">3. Confirmed</h2>
            <p className="text-green-900 mb-2">
              <strong>{result.streamName}</strong> was created and the first digest run was triggered.
            </p>
            <p className="text-green-800 text-sm mb-1">
              Destination email: <strong>{result.destinationEmail}</strong>
            </p>
            <p className="text-green-800 text-sm mb-4">
              Next scheduled run: <strong>{computeNextRunLabel(result.schedule)}</strong>
            </p>

            {result.runId ? (
              <a href={`/digest/${result.runId}`} className="text-reader-active hover:underline">
                Open generated digest →
              </a>
            ) : (
              <p className="text-sm text-green-800">
                The test run found no new items yet, but the stream is active and scheduled.
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
