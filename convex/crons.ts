/**
 * DoodleDog Scheduled Jobs
 *
 * Cron jobs for automated digest processing.
 */

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/**
 * Process active digest streams every hour.
 * The digest engine checks each stream's schedule and lastRun
 * to determine if it's due for processing.
 */
crons.interval(
  "process-digest-streams",
  { hours: 1 },
  internal.digests.processActiveStreams
);

export default crons;
