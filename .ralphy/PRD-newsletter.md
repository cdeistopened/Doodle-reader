# Newsletter-to-RSS with Kill the Newsletter

Add the ability for users to subscribe to email newsletters and read them as RSS feeds using kill-the-newsletter.com.

## Tasks

1. Add newsletterFeeds table to Convex schema in convex/schema.ts with fields: userId (string), name (string), email (string), feedUrl (string), createdAt (number), with an index by_user on userId

2. Create convex/newsletters.ts with three functions: createNewsletterFeed mutation that takes a name, calls kill-the-newsletter.com via HTTP POST to create an inbox, parses the HTML response to extract the email and feed URL, and stores them in the database; listNewsletterFeeds query that returns all newsletter feeds for the current user; deleteNewsletterFeed mutation that removes a feed by ID

3. Create components/AddNewsletterModal.tsx - a modal component following existing modal patterns with an input for newsletter name, a Create Email button that calls createNewsletterFeed, and displays the resulting email address with a copy button and Done button to close

4. Add Newsletter button to the sidebar in App.tsx - add state for showNewsletterModal, add a button labeled Add Newsletter near existing Add Feed button, wire it to open the AddNewsletterModal component

5. Display newsletter feeds in the feed list by fetching them with listNewsletterFeeds query and rendering them alongside regular feeds with a Newsletter badge to distinguish them
