/**
 * Doodle Reader - Markdown Serialization
 *
 * Converts documents to/from Markdown with Front Matter.
 * This format is compatible with:
 * - Obsidian
 * - Notion (via import)
 * - Any Markdown editor
 * - Git version control
 * - LLM processing (Front Matter as "skill" context)
 */

import type {
  Document,
  ArticleDocument,
  TranscriptDocument,
  ScanDocument,
  VideoDocument,
  NoteDocument,
  ContentType,
  SourceType,
  ContentStatus,
} from './types';

// =============================================================================
// MARKDOWN GENERATION
// =============================================================================

/**
 * Convert a document to Markdown with Front Matter.
 */
export function generateMarkdown(doc: Document): string {
  const frontMatter = generateFrontMatter(doc);
  return `---\n${frontMatter}---\n\n${doc.content}`;
}

function generateFrontMatter(doc: Document): string {
  const lines: string[] = [];

  // Universal properties
  lines.push(`id: ${doc.id}`);
  lines.push(`type: ${doc.type}`);
  lines.push(`title: "${escapeYaml(doc.title)}"`);
  lines.push(`created: ${doc.created}`);
  lines.push(`modified: ${doc.modified}`);
  lines.push(`status: ${doc.status}`);
  lines.push(`source: ${doc.source}`);

  if (doc.summary) {
    lines.push(`summary: "${escapeYaml(doc.summary)}"`);
  }

  if (doc.tags.length > 0) {
    lines.push(`tags:`);
    doc.tags.forEach((tag) => lines.push(`  - ${tag}`));
  }

  if (doc.folderId) {
    lines.push(`folder_id: ${doc.folderId}`);
  }

  // Type-specific properties
  switch (doc.type) {
    case 'article':
      lines.push(...generateArticleFrontMatter(doc as ArticleDocument));
      break;
    case 'transcript':
      lines.push(...generateTranscriptFrontMatter(doc as TranscriptDocument));
      break;
    case 'scan':
      lines.push(...generateScanFrontMatter(doc as ScanDocument));
      break;
    case 'video':
      lines.push(...generateVideoFrontMatter(doc as VideoDocument));
      break;
    case 'note':
      // Notes have no extra properties
      break;
  }

  // AI metadata
  if (doc.ai) {
    lines.push(`ai:`);
    if (doc.ai.embeddingsGenerated !== undefined) {
      lines.push(`  embeddings_generated: ${doc.ai.embeddingsGenerated}`);
    }
    if (doc.ai.summaryModel) {
      lines.push(`  summary_model: ${doc.ai.summaryModel}`);
    }
    if (doc.ai.topicsExtracted && doc.ai.topicsExtracted.length > 0) {
      lines.push(`  topics_extracted:`);
      doc.ai.topicsExtracted.forEach((t) => lines.push(`    - ${t}`));
    }
    if (doc.ai.qualityScore !== undefined) {
      lines.push(`  quality_score: ${doc.ai.qualityScore}`);
    }
    if (doc.ai.lastProcessed) {
      lines.push(`  last_processed: ${doc.ai.lastProcessed}`);
    }
  }

  return lines.join('\n') + '\n';
}

function generateArticleFrontMatter(doc: ArticleDocument): string[] {
  const lines: string[] = [];
  const a = doc.article;

  lines.push(`article:`);
  lines.push(`  url: "${escapeYaml(a.url)}"`);
  lines.push(`  feed_id: ${a.feedId}`);
  lines.push(`  feed_url: "${escapeYaml(a.feedUrl)}"`);
  lines.push(`  site_name: "${escapeYaml(a.siteName)}"`);
  if (a.author) lines.push(`  author: "${escapeYaml(a.author)}"`);
  lines.push(`  pub_date: ${a.pubDate}`);
  if (a.wordCount) lines.push(`  word_count: ${a.wordCount}`);
  if (a.readTime) lines.push(`  read_time: ${a.readTime}`);
  lines.push(`  is_read: ${a.isRead}`);
  lines.push(`  is_starred: ${a.isStarred}`);
  if (a.excerpt) lines.push(`  excerpt: "${escapeYaml(a.excerpt.substring(0, 200))}"`);

  return lines;
}

function generateTranscriptFrontMatter(doc: TranscriptDocument): string[] {
  const lines: string[] = [];
  const t = doc.transcript;

  lines.push(`transcript:`);
  lines.push(`  feed_url: "${escapeYaml(t.feedUrl)}"`);
  lines.push(`  feed_id: ${t.feedId}`);
  lines.push(`  podcast_title: "${escapeYaml(t.podcastTitle)}"`);
  lines.push(`  audio_url: "${escapeYaml(t.audioUrl)}"`);
  lines.push(`  duration: ${t.duration}`);
  lines.push(`  pub_date: ${t.pubDate}`);
  if (t.episodeNumber) lines.push(`  episode_number: ${t.episodeNumber}`);
  if (t.speakers && t.speakers.length > 0) {
    lines.push(`  speakers:`);
    t.speakers.forEach((s) => lines.push(`    - "${escapeYaml(s)}"`));
  }
  if (t.transcriptionCost !== undefined) {
    lines.push(`  transcription_cost: ${t.transcriptionCost.toFixed(4)}`);
  }
  if (t.chapters && t.chapters.length > 0) {
    lines.push(`  chapters:`);
    t.chapters.forEach((ch) => {
      lines.push(`    - start: ${ch.start}`);
      lines.push(`      end: ${ch.end}`);
      lines.push(`      title: "${escapeYaml(ch.title)}"`);
      if (ch.summary) lines.push(`      summary: "${escapeYaml(ch.summary)}"`);
    });
  }

  return lines;
}

function generateScanFrontMatter(doc: ScanDocument): string[] {
  const lines: string[] = [];
  const s = doc.scan;

  lines.push(`scan:`);
  lines.push(`  source_file: "${escapeYaml(s.sourceFile)}"`);
  lines.push(`  page_count: ${s.pageCount}`);
  if (s.pageRange) lines.push(`  page_range: "${s.pageRange}"`);
  if (s.parentDocumentId) lines.push(`  parent_document_id: ${s.parentDocumentId}`);
  if (s.ocrConfidence !== undefined) lines.push(`  ocr_confidence: ${s.ocrConfidence}`);
  lines.push(`  date_scanned: ${s.dateScanned}`);

  return lines;
}

function generateVideoFrontMatter(doc: VideoDocument): string[] {
  const lines: string[] = [];
  const v = doc.video;

  lines.push(`video:`);
  lines.push(`  video_url: "${escapeYaml(v.videoUrl)}"`);
  lines.push(`  video_id: ${v.videoId}`);
  lines.push(`  channel_name: "${escapeYaml(v.channelName)}"`);
  if (v.channelId) lines.push(`  channel_id: ${v.channelId}`);
  if (v.thumbnail) lines.push(`  thumbnail: "${escapeYaml(v.thumbnail)}"`);
  lines.push(`  duration: ${v.duration}`);
  lines.push(`  pub_date: ${v.pubDate}`);
  if (v.chapters && v.chapters.length > 0) {
    lines.push(`  chapters:`);
    v.chapters.forEach((ch) => {
      lines.push(`    - start: ${ch.start}`);
      lines.push(`      end: ${ch.end}`);
      lines.push(`      title: "${escapeYaml(ch.title)}"`);
    });
  }

  return lines;
}

function escapeYaml(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

// =============================================================================
// MARKDOWN PARSING
// =============================================================================

/**
 * Parse Markdown with Front Matter into a Document.
 * Returns null if parsing fails.
 */
export function parseMarkdown(markdown: string): Document | null {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!match) return null;

  const frontMatterStr = match[1];
  const content = match[2];

  const frontMatter = parseYamlFrontMatter(frontMatterStr);
  if (!frontMatter) return null;

  // Validate required fields
  const { id, type, title, created, modified, status, source } = frontMatter;
  if (!id || !type || !title) return null;

  // Build base document
  const baseDoc = {
    id: String(id),
    type: type as ContentType,
    title: String(title),
    created: String(created || new Date().toISOString()),
    modified: String(modified || new Date().toISOString()),
    status: (status as ContentStatus) || 'complete',
    source: (source as SourceType) || 'manual',
    content,
    summary: frontMatter.summary ? String(frontMatter.summary) : undefined,
    tags: Array.isArray(frontMatter.tags) ? frontMatter.tags.map(String) : [],
    folderId: frontMatter.folder_id ? String(frontMatter.folder_id) : undefined,
    ai: frontMatter.ai ? parseAIMetadata(frontMatter.ai) : undefined,
  };

  // Build type-specific document
  switch (type) {
    case 'article':
      return parseArticleDocument(baseDoc, frontMatter);
    case 'transcript':
      return parseTranscriptDocument(baseDoc, frontMatter);
    case 'scan':
      return parseScanDocument(baseDoc, frontMatter);
    case 'video':
      return parseVideoDocument(baseDoc, frontMatter);
    case 'note':
      return { ...baseDoc, type: 'note', source: 'manual' } as NoteDocument;
    default:
      return null;
  }
}

function parseYamlFrontMatter(str: string): Record<string, any> | null {
  try {
    const result: Record<string, any> = {};
    let currentKey = '';
    let currentObject: Record<string, any> | null = null;
    let currentArray: any[] | null = null;
    let arrayItemObject: Record<string, any> | null = null;
    let indentLevel = 0;

    const lines = str.split('\n');

    for (const line of lines) {
      // Skip empty lines
      if (!line.trim()) continue;

      // Count indentation
      const indent = line.match(/^(\s*)/)?.[1].length || 0;

      // Check for array item
      if (line.trim().startsWith('- ')) {
        const value = line.trim().substring(2).trim();

        // Check if it's a key-value in array item
        if (value.includes(': ')) {
          arrayItemObject = {};
          const [k, ...v] = value.split(': ');
          arrayItemObject[k] = parseYamlValue(v.join(': '));
        } else {
          if (currentArray) {
            currentArray.push(parseYamlValue(value));
          }
          arrayItemObject = null;
        }
        continue;
      }

      // Check for continuation of array item object
      if (arrayItemObject && indent > indentLevel) {
        if (line.includes(': ')) {
          const [k, ...v] = line.trim().split(': ');
          arrayItemObject[k] = parseYamlValue(v.join(': '));
        }
        continue;
      }

      // Finish array item object
      if (arrayItemObject && currentArray) {
        currentArray.push(arrayItemObject);
        arrayItemObject = null;
      }

      // Check for key-value pair
      if (line.includes(': ')) {
        const colonIdx = line.indexOf(':');
        const key = line.substring(0, colonIdx).trim();
        const value = line.substring(colonIdx + 1).trim();

        if (indent === 0) {
          // Top-level key
          currentObject = null;
          currentArray = null;

          if (value === '') {
            // Start of nested object or array
            result[key] = {};
            currentKey = key;
            currentObject = result[key];
            indentLevel = indent;
          } else {
            result[key] = parseYamlValue(value);
          }
        } else if (currentObject) {
          // Nested key
          if (value === '') {
            // Start of array
            currentObject[key] = [];
            currentArray = currentObject[key];
            indentLevel = indent;
          } else {
            currentObject[key] = parseYamlValue(value);
          }
        }
      }
    }

    // Handle last array item object
    if (arrayItemObject && currentArray) {
      currentArray.push(arrayItemObject);
    }

    return result;
  } catch {
    return null;
  }
}

function parseYamlValue(str: string): string | number | boolean {
  // Remove quotes
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    return str.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  // Boolean
  if (str === 'true') return true;
  if (str === 'false') return false;

  // Number
  const num = parseFloat(str);
  if (!isNaN(num) && str === String(num)) return num;

  return str;
}

function parseAIMetadata(ai: any): Document['ai'] {
  return {
    embeddingsGenerated: ai.embeddings_generated,
    summaryModel: ai.summary_model,
    topicsExtracted: ai.topics_extracted,
    qualityScore: ai.quality_score,
    lastProcessed: ai.last_processed,
  };
}

function parseArticleDocument(base: any, fm: any): ArticleDocument | null {
  const a = fm.article;
  if (!a) return null;

  return {
    ...base,
    type: 'article',
    source: base.source === 'newsletter' ? 'newsletter' : 'rss',
    article: {
      url: String(a.url || ''),
      feedId: String(a.feed_id || ''),
      feedUrl: String(a.feed_url || ''),
      siteName: String(a.site_name || ''),
      author: a.author ? String(a.author) : undefined,
      pubDate: String(a.pub_date || base.created),
      wordCount: a.word_count ? Number(a.word_count) : undefined,
      readTime: a.read_time ? Number(a.read_time) : undefined,
      isRead: a.is_read === true,
      isStarred: a.is_starred === true,
      excerpt: a.excerpt ? String(a.excerpt) : undefined,
    },
  } as ArticleDocument;
}

function parseTranscriptDocument(base: any, fm: any): TranscriptDocument | null {
  const t = fm.transcript;
  if (!t) return null;

  return {
    ...base,
    type: 'transcript',
    source: 'podcast',
    transcript: {
      feedUrl: String(t.feed_url || ''),
      feedId: String(t.feed_id || ''),
      podcastTitle: String(t.podcast_title || ''),
      audioUrl: String(t.audio_url || ''),
      duration: Number(t.duration || 0),
      pubDate: String(t.pub_date || base.created),
      episodeNumber: t.episode_number ? Number(t.episode_number) : undefined,
      speakers: Array.isArray(t.speakers) ? t.speakers.map(String) : undefined,
      transcriptionCost: t.transcription_cost ? Number(t.transcription_cost) : undefined,
      chapters: Array.isArray(t.chapters)
        ? t.chapters.map((ch: any) => ({
            start: Number(ch.start || 0),
            end: Number(ch.end || 0),
            title: String(ch.title || ''),
            summary: ch.summary ? String(ch.summary) : undefined,
          }))
        : undefined,
    },
  } as TranscriptDocument;
}

function parseScanDocument(base: any, fm: any): ScanDocument | null {
  const s = fm.scan;
  if (!s) return null;

  return {
    ...base,
    type: 'scan',
    source: 'scan',
    scan: {
      sourceFile: String(s.source_file || ''),
      pageCount: Number(s.page_count || 0),
      pageRange: s.page_range ? String(s.page_range) : undefined,
      parentDocumentId: s.parent_document_id ? String(s.parent_document_id) : undefined,
      ocrConfidence: s.ocr_confidence ? Number(s.ocr_confidence) : undefined,
      dateScanned: String(s.date_scanned || base.created),
    },
  } as ScanDocument;
}

function parseVideoDocument(base: any, fm: any): VideoDocument | null {
  const v = fm.video;
  if (!v) return null;

  return {
    ...base,
    type: 'video',
    source: 'youtube',
    video: {
      videoUrl: String(v.video_url || ''),
      videoId: String(v.video_id || ''),
      channelName: String(v.channel_name || ''),
      channelId: v.channel_id ? String(v.channel_id) : undefined,
      thumbnail: v.thumbnail ? String(v.thumbnail) : undefined,
      duration: Number(v.duration || 0),
      pubDate: String(v.pub_date || base.created),
      chapters: Array.isArray(v.chapters)
        ? v.chapters.map((ch: any) => ({
            start: Number(ch.start || 0),
            end: Number(ch.end || 0),
            title: String(ch.title || ''),
          }))
        : undefined,
    },
  } as VideoDocument;
}
