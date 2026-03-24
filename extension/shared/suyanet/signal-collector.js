/**
 * SignalCollector — Gathers all available user signals from the browser
 *
 * Collects from:
 *   - Chrome browsing history (chrome.history API)
 *   - Bookmarks (chrome.bookmarks API)
 *   - Installed extensions (chrome.management API)
 *   - Tab activity (passive observation)
 *   - User behavior events (clicks, dismissals, skill usage)
 *
 * All data stays local until explicitly sent to the server for training.
 */

/**
 * Categorize a URL into a broad interest domain.
 */
function categorizeUrl(url) {
  const domain = extractDomain(url);
  const title = (url || '').toLowerCase();

  const categories = {
    'technology':   ['github.com', 'stackoverflow.com', 'dev.to', 'hackernews', 'techcrunch.com', 'arstechnica.com', 'wired.com', 'theverge.com', 'medium.com'],
    'development':  ['github.com', 'gitlab.com', 'bitbucket.org', 'npmjs.com', 'pypi.org', 'docs.python.org', 'developer.mozilla.org', 'w3schools.com'],
    'ai_ml':        ['arxiv.org', 'huggingface.co', 'openai.com', 'anthropic.com', 'kaggle.com', 'tensorflow.org', 'pytorch.org'],
    'design':       ['figma.com', 'dribbble.com', 'behance.net', 'canva.com', 'adobe.com'],
    'business':     ['linkedin.com', 'crunchbase.com', 'bloomberg.com', 'forbes.com', 'wsj.com', 'ft.com'],
    'productivity': ['notion.so', 'trello.com', 'asana.com', 'todoist.com', 'slack.com', 'monday.com'],
    'education':    ['coursera.org', 'udemy.com', 'edx.org', 'khanacademy.org', 'brilliant.org'],
    'social':       ['twitter.com', 'x.com', 'reddit.com', 'facebook.com', 'instagram.com', 'tiktok.com'],
    'video':        ['youtube.com', 'twitch.tv', 'vimeo.com'],
    'news':         ['bbc.com', 'cnn.com', 'reuters.com', 'apnews.com', 'nytimes.com', 'theguardian.com'],
    'shopping':     ['amazon.com', 'ebay.com', 'shopify.com', 'etsy.com'],
    'finance':      ['robinhood.com', 'coinbase.com', 'binance.com', 'tradingview.com', 'yahoo.com/finance'],
    'health':       ['webmd.com', 'mayoclinic.org', 'healthline.com', 'nih.gov'],
    'entertainment':['netflix.com', 'spotify.com', 'hulu.com', 'disney.com', 'imdb.com'],
    'reference':    ['wikipedia.org', 'wikimedia.org', 'britannica.com'],
  };

  for (const [category, domains] of Object.entries(categories)) {
    if (domains.some(d => domain.includes(d) || title.includes(d))) {
      return category;
    }
  }

  return 'general';
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url || '';
  }
}

class SignalCollector {
  constructor() {
    this.collectedSignals = {
      browsingHistory: [],
      bookmarks: [],
      extensions: [],
      patterns: null
    };
  }

  /**
   * Collect browsing history from the last N days.
   * Requires chrome.history permission.
   *
   * @param {number} [days=30] - how far back to look
   * @param {number} [maxResults=500]
   */
  async collectBrowsingHistory(days = 30, maxResults = 500) {
    if (typeof chrome === 'undefined' || !chrome.history) {
      console.warn('[SignalCollector] chrome.history API not available');
      return [];
    }

    try {
      const startTime = Date.now() - (days * 24 * 60 * 60 * 1000);
      const items = await chrome.history.search({
        text: '',
        startTime,
        maxResults
      });

      this.collectedSignals.browsingHistory = items
        .filter(item => item.url && !item.url.startsWith('chrome://') && !item.url.startsWith('chrome-extension://'))
        .map(item => ({
          url: item.url,
          title: item.title || '',
          visitCount: item.visitCount || 1,
          lastVisitTime: item.lastVisitTime,
          category: categorizeUrl(item.url)
        }));

      // Compute browsing patterns
      this.collectedSignals.patterns = this._analyzeBrowsingPatterns(items);

      console.log(`[SignalCollector] Collected ${this.collectedSignals.browsingHistory.length} history entries`);
      return this.collectedSignals.browsingHistory;
    } catch (error) {
      console.error('[SignalCollector] Failed to collect browsing history:', error);
      return [];
    }
  }

  /**
   * Collect bookmarks from the bookmark tree.
   * Requires chrome.bookmarks permission.
   */
  async collectBookmarks(maxResults = 200) {
    if (typeof chrome === 'undefined' || !chrome.bookmarks) {
      console.warn('[SignalCollector] chrome.bookmarks API not available');
      return [];
    }

    try {
      const tree = await chrome.bookmarks.getTree();
      const bookmarks = [];
      this._flattenBookmarks(tree, bookmarks, maxResults);

      this.collectedSignals.bookmarks = bookmarks.map(bm => ({
        url: bm.url,
        title: bm.title || '',
        category: categorizeUrl(bm.url),
        dateAdded: bm.dateAdded
      }));

      console.log(`[SignalCollector] Collected ${this.collectedSignals.bookmarks.length} bookmarks`);
      return this.collectedSignals.bookmarks;
    } catch (error) {
      console.error('[SignalCollector] Failed to collect bookmarks:', error);
      return [];
    }
  }

  /**
   * Collect installed extensions.
   * Requires chrome.management permission.
   */
  async collectInstalledExtensions() {
    if (typeof chrome === 'undefined' || !chrome.management) {
      console.warn('[SignalCollector] chrome.management API not available');
      return [];
    }

    try {
      const extensions = await chrome.management.getAll();
      this.collectedSignals.extensions = extensions
        .filter(ext => ext.enabled && ext.type === 'extension')
        .map(ext => ({
          name: ext.name,
          description: ext.description || '',
          category: this._categorizeExtension(ext)
        }));

      console.log(`[SignalCollector] Collected ${this.collectedSignals.extensions.length} extensions`);
      return this.collectedSignals.extensions;
    } catch (error) {
      console.error('[SignalCollector] Failed to collect extensions:', error);
      return [];
    }
  }

  /**
   * Collect all available signals at once.
   * Returns the full signal payload ready for server ingestion.
   *
   * @param {object} [onboardingData] - optional onboarding answers to include
   */
  async collectAll(onboardingData = null) {
    const [history, bookmarks, extensions] = await Promise.all([
      this.collectBrowsingHistory(),
      this.collectBookmarks(),
      this.collectInstalledExtensions()
    ]);

    const payload = {
      browsingHistory: history,
      bookmarks,
      extensions,
      patterns: this.collectedSignals.patterns
    };

    if (onboardingData) {
      payload.onboarding = onboardingData;
    }

    return payload;
  }

  // ── Internal Helpers ──────────────────────────────────────────────────

  _flattenBookmarks(nodes, result, maxResults) {
    for (const node of nodes) {
      if (result.length >= maxResults) return;
      if (node.url) {
        result.push(node);
      }
      if (node.children) {
        this._flattenBookmarks(node.children, result, maxResults);
      }
    }
  }

  _analyzeBrowsingPatterns(historyItems) {
    // Peak activity hours
    const hourCounts = new Array(24).fill(0);
    for (const item of historyItems) {
      if (item.lastVisitTime) {
        const hour = new Date(item.lastVisitTime).getHours();
        hourCounts[hour] += (item.visitCount || 1);
      }
    }

    // Find top 5 peak hours
    const peakHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(h => h.hour);

    // Content preference distribution
    const categoryDistribution = {};
    for (const item of historyItems) {
      if (!item.url) continue;
      const cat = categorizeUrl(item.url);
      categoryDistribution[cat] = (categoryDistribution[cat] || 0) + (item.visitCount || 1);
    }

    // Top content preferences
    const contentPrefs = Object.entries(categoryDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([cat]) => cat);

    // Most visited domains
    const domainCounts = {};
    for (const item of historyItems) {
      if (!item.url) continue;
      const domain = extractDomain(item.url);
      domainCounts[domain] = (domainCounts[domain] || 0) + (item.visitCount || 1);
    }

    const mostVisitedDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([domain]) => domain);

    return {
      peakHours,
      contentPrefs,
      mostVisitedDomains,
      totalSites: Object.keys(domainCounts).length,
      totalVisits: historyItems.reduce((sum, i) => sum + (i.visitCount || 1), 0)
    };
  }

  _categorizeExtension(ext) {
    const name = (ext.name || '').toLowerCase();
    const desc = (ext.description || '').toLowerCase();
    const combined = `${name} ${desc}`;

    const categories = {
      'developer_tools': ['developer', 'debug', 'inspect', 'react', 'vue', 'angular', 'json', 'api', 'git', 'code'],
      'productivity': ['productivity', 'tab', 'bookmark', 'save', 'organize', 'manage', 'todo', 'note'],
      'ad_blocker': ['adblock', 'ad block', 'ublock', 'privacy', 'tracker'],
      'communication': ['email', 'mail', 'slack', 'chat', 'message', 'zoom', 'meet'],
      'writing': ['grammarly', 'grammar', 'writing', 'spell', 'compose', 'text'],
      'design': ['color', 'design', 'font', 'css', 'screenshot', 'image', 'figma'],
      'security': ['password', 'security', 'vpn', 'encrypt', 'authenticat'],
      'shopping': ['coupon', 'price', 'deal', 'shop', 'honey', 'cashback'],
      'ai': ['ai', 'gpt', 'claude', 'copilot', 'chatbot', 'openai', 'anthropic'],
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(kw => combined.includes(kw))) {
        return category;
      }
    }

    return 'utility';
  }
}

export { SignalCollector, categorizeUrl, extractDomain };
