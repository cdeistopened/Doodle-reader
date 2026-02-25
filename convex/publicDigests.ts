/**
 * Public digest queries.
 *
 * These intentionally do not require auth so digest reader URLs
 * can be opened directly from email links.
 */

import { v } from "convex/values";
import { query } from "./_generated/server";

export const getDigestRun = query({
  args: {
    digestRunId: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedId = ctx.db.normalizeId("digestRuns", args.digestRunId);
    if (!normalizedId) return null;

    const run = await ctx.db.get(normalizedId);
    if (!run) return null;

    const stream = await ctx.db.get(run.streamId);

    return {
      _id: run._id,
      streamId: run.streamId,
      streamName: stream?.name || "Digest",
      generatedAt: run.generatedAt,
      itemCount: run.itemCount,
      digestMarkdown: run.digestMarkdown,
      digestHtml: run.digestHtml,
      items: run.items,
    };
  },
});
