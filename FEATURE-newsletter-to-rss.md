# Feature Spec: Newsletter-to-RSS Integration

**Status:** Proposed
**Priority:** High
**Issue ID:** TBD (create in beads)

---

## Overview

Allow users to subscribe to email newsletters and read them as RSS feeds within Doodle Reader. Uses [Kill the Newsletter](https://github.com/leafac/kill-the-newsletter) architecture.

---

## User Flow

```
1. User clicks "Add Newsletter" button
2. Modal shows unique email: user123@newsletters.doodlereader.com
3. User subscribes to Substack/Beehiiv/etc with that email
4. Newsletters appear as feed items in Doodle Reader
5. User can organize newsletter feeds like any other feed
```

---

## Technical Architecture

### Option A: Proxy to kill-the-newsletter.com (Recommended for MVP)

```
User → Doodle Reader UI → kill-the-newsletter.com API
                              ↓
                        Atom Feed URL
                              ↓
                        Doodle Reader fetches like normal RSS
```

**Pros:** No infrastructure, works immediately
**Cons:** Dependency on external service, addresses are @kill-the-newsletter.com

### Option B: Self-hosted KTN Instance

```
Newsletter Email → SMTP Server (port 25) → SQLite → Atom Feed
                   newsletters.doodlereader.com
```

**Requires:**
- VPS with port 25 open (Railway doesn't support SMTP)
- MX DNS records pointing to the server
- Run KTN as Docker container

**Pros:** Full control, custom domain, seamless UX
**Cons:** More complex, need to maintain SMTP server

---

## Implementation Plan

### Phase 1: MVP with kill-the-newsletter.com

1. **UI: Add Newsletter Modal** (`components/AddNewsletterModal.tsx`)
   - Input field for newsletter name
   - "Create Email" button
   - Display generated email address with copy button
   - Show resulting feed URL

2. **Integration with KTN API**
   - POST to create new inbox: `https://kill-the-newsletter.com/`
   - Returns email address and feed URL
   - Store mapping in Convex

3. **Convex Schema Update** (`convex/schema.ts`)
   ```typescript
   newsletterFeeds: defineTable({
     userId: v.string(),
     name: v.string(),
     email: v.string(),        // user123@kill-the-newsletter.com
     feedUrl: v.string(),      // https://kill-the-newsletter.com/feeds/xxx.xml
     createdAt: v.number(),
   })
   ```

4. **Feed Sync**
   - Treat newsletter feed URL like any RSS feed
   - Add to existing feed polling system
   - Display with "Newsletter" badge in UI

### Phase 2: Self-hosted (Future)

1. Deploy KTN instance on dedicated VPS
2. Set up MX records for newsletters.doodlereader.com
3. Migrate existing newsletter feeds to self-hosted
4. Add custom features:
   - Automatic sender verification
   - Spam filtering
   - Usage analytics

---

## UI Mockup

```
┌─────────────────────────────────────┐
│  Add Newsletter                   ✕ │
├─────────────────────────────────────┤
│                                     │
│  Newsletter Name:                   │
│  ┌─────────────────────────────┐    │
│  │ Morning Brew                │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────────────────────┐    │
│  │     Create Email Address    │    │
│  └─────────────────────────────┘    │
│                                     │
│  ─────────────────────────────────  │
│                                     │
│  Your newsletter email:             │
│  ┌─────────────────────────────┐    │
│  │ abc123@kill-the-newsletter  │ 📋 │
│  └─────────────────────────────┘    │
│                                     │
│  Subscribe to "Morning Brew" with   │
│  this email. New issues will appear │
│  in your Doodle Reader feed.        │
│                                     │
│  ┌─────────────────────────────┐    │
│  │         Done                │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

---

## Data Model

### Newsletter Feed (Convex)

```typescript
{
  _id: Id<"newsletterFeeds">,
  userId: string,
  name: string,                    // "Morning Brew"
  email: string,                   // "abc123@kill-the-newsletter.com"
  feedUrl: string,                 // "https://kill-the-newsletter.com/feeds/abc123.xml"
  ktnInboxId: string,              // For future API calls
  createdAt: number,
  lastFetched: number | null,
  itemCount: number,
}
```

### Integration with Existing Feed System

Newsletter feeds should integrate with the existing `feeds` table:
- Add `feedType: "rss" | "newsletter" | "youtube"` field
- Newsletter badge in feed list UI
- Same reading/starring/annotation experience

---

## API Endpoints

### Create Newsletter Inbox

```typescript
// convex/newsletters.ts
export const createNewsletterInbox = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    // 1. Call KTN to create inbox
    const response = await fetch("https://kill-the-newsletter.com/", {
      method: "POST",
      body: new URLSearchParams({ name }),
    });

    // 2. Parse response for email and feed URL
    // 3. Store in Convex
    // 4. Return to client
  }
});
```

### List User's Newsletter Feeds

```typescript
export const listNewsletterFeeds = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return ctx.db
      .query("newsletterFeeds")
      .filter(q => q.eq(q.field("userId"), userId))
      .collect();
  }
});
```

---

## Open Questions

1. **KTN API stability** - Is there a documented API or do we need to scrape?
2. **Feed polling frequency** - How often to check for new newsletter issues?
3. **Inbox limits** - Does KTN have limits on number of inboxes per IP?
4. **Email deliverability** - Will newsletters actually deliver to KTN addresses?

---

## References

- [Kill the Newsletter GitHub](https://github.com/leafac/kill-the-newsletter)
- [Kill the Newsletter Service](https://kill-the-newsletter.com)
- [Atom Feed Spec](https://validator.w3.org/feed/docs/atom.html)

---

## Success Metrics

- Users can add newsletter feeds in < 60 seconds
- Newsletter items render correctly (HTML formatting preserved)
- Zero missed newsletter issues after subscription

---

*Created: 2026-01-24*
