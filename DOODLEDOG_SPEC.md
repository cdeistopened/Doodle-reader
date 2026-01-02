# DoodleDog - AI Assistant Specification

> Doodle Reader's friendly AI assistant for content discovery, workspace organization, and stream curation

---

## Core Concept

**DoodleDog is like Clippy, but actually useful.** A helpful chatbot assistant that:
- Fetches content across multiple sources (podcasts, YouTube, blogs, tweets, etc.)
- Creates custom boards/streams that combine content from different feeds
- Helps set up and organize your workspace
- Provides intelligent content recommendations and connections

---

## Primary Use Cases

### 1. Multi-Source Content Compilation
**Example:** "Find all content related to Brett Weinstein's new theory of evolution from his Joe Rogan appearance"

DoodleDog would:
- Search podcast transcripts for the specific Rogan episode
- Find related YouTube videos, blog posts, Twitter threads
- Identify follow-up discussions and critiques
- Create a custom board with all related content
- Enable bulk transcription and export of the entire collection

### 2. Workspace Setup & Organization
- Guide new users through feed subscription
- Suggest folder/board organization based on content types
- Help configure "Send To" integrations (Obsidian, Notion)
- Set up custom export templates

### 3. Content Discovery & Curation
- "Show me all AI-related content from this week"
- "Find podcast episodes where [specific person] was mentioned"
- "Create a reading list about [topic] from my subscribed feeds"

---

## Technical Architecture

### Stream-Based Foundation
Everything in DoodleDog operates on **streams** - unified data structures that can represent:
- RSS feeds
- Podcast episodes
- YouTube playlists
- Twitter searches
- Custom boards/collections

```typescript
interface Stream {
  id: string;
  name: string;
  type: 'rss' | 'podcast' | 'youtube' | 'twitter' | 'custom' | 'search';
  query?: string; // For search-based streams
  sources: StreamSource[];
  filters?: StreamFilter[];
  lastUpdated: Date;
}

interface CustomBoard extends Stream {
  type: 'custom';
  items: ContentItem[];
  description?: string;
  tags: string[];
  isPublic: boolean;
}
```

### Content Search & Discovery

**Multi-Platform Search API:**
```typescript
interface ContentSearcher {
  searchPodcasts(query: string): Promise<PodcastEpisode[]>;
  searchYouTube(query: string): Promise<VideoResult[]>;
  searchBlogs(query: string): Promise<BlogPost[]>;
  searchTwitter(query: string): Promise<Tweet[]>;
  searchTranscripts(query: string): Promise<TranscriptMatch[]>;
}
```

**Implementation Strategy:**
- **Podcasts:** Podcast Index API + local transcript search
- **YouTube:** YouTube Data API + caption search
- **Blogs:** RSS aggregation + web scraping
- **Twitter:** Twitter API v2 (Academic Research tier)
- **Transcripts:** Full-text search across processed content

### AI Chat Interface

**Natural Language Processing:**
- Intent recognition for content requests
- Entity extraction (people, topics, dates)
- Query expansion and refinement
- Result ranking and relevance scoring

**Chat Commands:**
```
"Find all content about [topic]"
"Create a board for [subject]"
"What did [person] say about [topic]?"
"Show me recent discussions about [event]"
"Transcribe everything in this collection"
"Export this board to Obsidian"
```

---

## Core Features

### 1. Smart Content Discovery

**Topic-Based Search:**
- Semantic search across all content types
- Cross-reference mentions and discussions
- Timeline-based content organization
- Related content suggestions

**People-Centric Search:**
- Find all mentions of specific individuals
- Track conversations across platforms
- Identify key influencers on topics
- Map discussion networks

### 2. Custom Board Creation

**Dynamic Collections:**
- Combine content from multiple sources
- Live-updating based on search criteria
- Manual curation with drag-and-drop
- Collaborative boards (future)

**Board Templates:**
- "Research Topic" (academic style)
- "News Event Timeline" (chronological)
- "Person Profile" (all mentions/content)
- "Debate/Discussion" (pro/con organization)

### 3. Bulk Operations

**Batch Processing:**
- Transcribe all audio content in a board
- Generate summaries for entire collections
- Extract key quotes and insights
- Create reading time estimates

**Export Workflows:**
- Markdown export with frontmatter
- Obsidian vault integration
- Notion database sync
- PDF compilation for offline reading

### 4. Workspace Intelligence

**Usage Analytics:**
- Reading pattern analysis
- Content preference learning
- Source quality scoring
- Recommendation tuning

**Automation Suggestions:**
- "You read 80% of Stratechery but only 10% of TechCrunch"
- "Consider creating a board for [emerging topic]"
- "This content might interest you based on your starred items"

---

## User Interface Design

### Chat-Based Interaction

**Primary Interface:**
- Floating chat bubble in bottom-right corner
- Keyboard shortcut to summon (Cmd+K)
- Natural language input with smart suggestions
- Rich result previews with actions

**Chat Flow Example:**
```
User: "Find everything about Anthropic's Claude"

DoodleDog: "I found 23 items about Claude across your sources:
📰 5 blog posts
🎙️ 8 podcast mentions  
📺 4 YouTube videos
🐦 6 tweets

Would you like me to:
□ Create a board with all items
□ Show just the most recent
□ Focus on technical discussions
□ Include competitor comparisons"

User: "Create a board with everything"

DoodleDog: "Created 'Claude Research' board with 23 items.
Added to your 'AI Research' folder.
🔄 Transcribing 8 podcast segments...
📝 Would you like me to generate a summary when done?"
```

### Board Management

**Visual Board Editor:**
- Kanban-style columns for organization
- Rich previews with thumbnails/favicons
- Drag-and-drop reordering
- Bulk actions (select multiple, apply tags)

**Board Actions:**
- Export options (Markdown, PDF, Obsidian)
- Sharing (public URL, collaboration)
- Processing (transcribe, summarize, extract)
- Monitoring (auto-update with new content)

---

## Implementation Plan

### Phase 1: Core Chat Interface
**Goal:** Basic DoodleDog with simple content search

- [ ] Chat UI component with floating bubble
- [ ] Natural language intent parsing (simple keyword matching)
- [ ] Basic search across existing RSS content
- [ ] Custom board creation from search results

**Technical Stack:**
- OpenAI GPT-4 for intent parsing
- Vector embeddings for content similarity
- Fuse.js for fuzzy text search
- React components for chat UI

### Phase 2: Multi-Platform Search
**Goal:** Expand beyond RSS to podcasts, YouTube, Twitter

- [ ] Podcast Index API integration
- [ ] YouTube Data API integration
- [ ] Twitter API v2 integration
- [ ] Unified search results ranking

**Data Sources:**
- Podcast Index (2M+ podcasts)
- YouTube Data API (search + captions)
- Twitter Academic Research API
- RSS aggregation services

### Phase 3: Advanced AI Features
**Goal:** Intelligent recommendations and automation

- [ ] Semantic search with embeddings
- [ ] Content relationship mapping
- [ ] Usage pattern analysis
- [ ] Automated board suggestions

**AI Integration:**
- OpenAI embeddings for semantic search
- GPT-4 for content analysis
- Custom fine-tuning for domain expertise
- Local vector database (Chroma or Pinecone)

### Phase 4: Collaboration & Sharing
**Goal:** Social features and workspace sharing

- [ ] Public board sharing
- [ ] Collaborative editing
- [ ] Community content recommendations
- [ ] Export marketplace

---

## Content Examples

### Brett Weinstein Evolution Example

**Query:** "Find all content related to Brett Weinstein's new theory of evolution from his Joe Rogan appearance"

**DoodleDog Process:**
1. **Identify Source Episode:**
   - Search Joe Rogan podcast for "Brett Weinstein" + "evolution"
   - Find specific episode with transcript

2. **Extract Key Concepts:**
   - Named entities: "telomeres," "evolutionary mismatch," specific theory names
   - Key quotes and explanations

3. **Cross-Platform Search:**
   - YouTube: Brett's own channel follow-ups
   - Twitter: Discussions and critiques
   - Academic blogs: Responses from evolutionary biologists
   - Reddit: r/JordanPeterson, r/DarkHorse discussions

4. **Create Organized Board:**
   - **Primary Source** (Rogan episode transcript)
   - **Author Follow-ups** (Brett's explanations)
   - **Expert Responses** (academic critiques)
   - **Community Discussion** (social media)

5. **Processing Options:**
   - Transcribe all video content
   - Extract key arguments from each source
   - Generate pro/con summary
   - Create timeline of discussion evolution

**Result:** Comprehensive research board with 15-25 items, fully transcribed and organized, ready for analysis or export.

---

## Monetization Integration

### Credit System
- **Free Tier:** Basic search, 5 boards, limited transcription
- **Pro Tier:** Advanced search, unlimited boards, bulk processing
- **Research Tier:** API access, collaboration, priority processing

### Usage Tracking
- Search queries (simple vs complex)
- Transcription minutes
- AI summarization requests
- Export volume

---

## Technical Considerations

### Performance
- **Caching:** Aggressive caching of search results and processed content
- **Pagination:** Stream-based loading for large result sets
- **Background Processing:** Queue heavy operations (transcription, analysis)

### Privacy & Data
- **Local-First:** All boards and preferences stored locally
- **API Keys:** User-provided keys for external services
- **No Data Mining:** DoodleDog helps organize user's own content consumption

### Extensibility
- **Plugin Architecture:** Custom search providers
- **Template System:** User-defined board templates
- **Webhook Integration:** External automation triggers

---

## Success Metrics

### User Engagement
- Board creation frequency
- Search queries per session
- Content processing volume
- Export usage patterns

### Content Quality
- User satisfaction with search results
- Board completion rates (% of items actually read)
- Export frequency (indicates value)
- Sharing activity

### Business Impact
- Conversion from free to paid
- Credit consumption patterns
- Feature adoption rates
- User retention by tier

---

## Future Enhancements

### Advanced AI
- **Conversational Memory:** DoodleDog remembers your research context
- **Proactive Suggestions:** "New content available for your Brett Weinstein board"
- **Cross-Board Insights:** "This connects to your earlier research on X"

### Specialized Workflows
- **Academic Research:** Citation management, peer review tracking
- **Journalism:** Source verification, fact-checking integration
- **Investment Research:** Company mention tracking, sentiment analysis

### Platform Integration
- **Slack/Discord Bots:** Share boards and insights in team chats
- **Browser Extension:** Save content to boards from any website
- **Mobile App:** Voice queries and offline board access

---

*DoodleDog represents the next evolution of content curation - from passive consumption to active knowledge synthesis.*