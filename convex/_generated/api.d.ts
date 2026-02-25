/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as boards from "../boards.js";
import type * as digestHelpers from "../digestHelpers.js";
import type * as digests from "../digests.js";
import type * as documents from "../documents.js";
import type * as feeds from "../feeds.js";
import type * as folders from "../folders.js";
import type * as http from "../http.js";
import type * as newsletters from "../newsletters.js";
import type * as opml from "../opml.js";
import type * as publicDigests from "../publicDigests.js";
import type * as scanJobs from "../scanJobs.js";
import type * as stats from "../stats.js";
import type * as stripe from "../stripe.js";
import type * as streams from "../streams.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  boards: typeof boards;
  digestHelpers: typeof digestHelpers;
  digests: typeof digests;
  documents: typeof documents;
  feeds: typeof feeds;
  folders: typeof folders;
  http: typeof http;
  newsletters: typeof newsletters;
  opml: typeof opml;
  publicDigests: typeof publicDigests;
  scanJobs: typeof scanJobs;
  stats: typeof stats;
  stripe: typeof stripe;
  streams: typeof streams;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
