#!/usr/bin/env node

/**
 * Policy Position Crawler
 * Extracts and normalizes policy positions from politician websites
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const https = require('https');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const http = require('http');
const { URL } = require('url');

class PolicyPositionCrawler {
  constructor() {
    const dbPath = path.join(__dirname, '..', 'data', 'politicians.db');
    this.db = new Database(dbPath);
    
    // Initialize enhanced schema
    this.initializeEnhancedSchema();
    this.initializeTopicMappings();
    
    this.requestDelay = 2000; // 2 seconds between requests to be respectful
    this.processedCount = 0;
    this.errorsCount = 0;
    this.maxRetries = 3;
  }

  /**
   * Initialize enhanced database schema for normalized topics
   */
  initializeEnhancedSchema() {
    console.log('🗃️ Initializing enhanced policy position schema...');
    
    // Topics normalization table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS policy_topics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        canonical_name TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        parent_topic_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_topic_id) REFERENCES policy_topics (id)
      )
    `);

    // Topic aliases for matching variations
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS topic_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic_id INTEGER NOT NULL,
        alias TEXT NOT NULL,
        confidence_score REAL DEFAULT 1.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (topic_id) REFERENCES policy_topics (id),
        UNIQUE (topic_id, alias)
      )
    `);

    // Enhanced positions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS politician_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        politician_id TEXT NOT NULL,
        topic_id INTEGER NOT NULL,
        position_summary TEXT NOT NULL,
        position_details TEXT,
        is_key_issue BOOLEAN DEFAULT 0,
        source_url TEXT,
        source_section TEXT,
        confidence_score REAL DEFAULT 0.5,
        stance TEXT DEFAULT 'neutral',
        strength TEXT DEFAULT 'moderate',
        key_phrases TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (politician_id) REFERENCES politicians (id),
        FOREIGN KEY (topic_id) REFERENCES policy_topics (id),
        UNIQUE (politician_id, topic_id)
      )
    `);

    // Add new columns to existing politician_positions table if they don't exist
    try {
      this.db.exec(`ALTER TABLE politician_positions ADD COLUMN stance TEXT DEFAULT 'neutral'`);
    } catch (e) {
      // Column already exists
    }
    
    try {
      this.db.exec(`ALTER TABLE politician_positions ADD COLUMN strength TEXT DEFAULT 'moderate'`);
    } catch (e) {
      // Column already exists
    }
    
    try {
      this.db.exec(`ALTER TABLE politician_positions ADD COLUMN key_phrases TEXT`);
    } catch (e) {
      // Column already exists
    }

    // Crawl log for tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS crawl_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        politician_id TEXT NOT NULL,
        website_url TEXT NOT NULL,
        crawl_status TEXT NOT NULL,
        positions_found INTEGER DEFAULT 0,
        error_message TEXT,
        crawl_duration_ms INTEGER,
        crawled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (politician_id) REFERENCES politicians (id)
      )
    `);

    console.log('✅ Database schema initialized');
  }

  /**
   * Initialize core policy topics and their aliases
   */
  initializeTopicMappings() {
    console.log('📋 Initializing policy topic mappings...');
    
    const coreTopics = [
      {
        canonical_name: 'healthcare',
        display_name: 'Healthcare',
        description: 'Healthcare policy, insurance, medical access, public health',
        aliases: ['health', 'medical', 'medicine', 'insurance', 'medicare', 'medicaid', 'aca', 'obamacare', 'affordable care act']
      },
      {
        canonical_name: 'immigration',
        display_name: 'Immigration',
        description: 'Immigration policy, border security, asylum, citizenship',
        aliases: ['border', 'asylum', 'citizenship', 'daca', 'refugees', 'visa', 'deportation']
      },
      {
        canonical_name: 'economy',
        display_name: 'Economy',
        description: 'Economic policy, jobs, trade, fiscal policy',
        aliases: ['jobs', 'employment', 'trade', 'commerce', 'business', 'fiscal', 'economic', 'gdp', 'recession']
      },
      {
        canonical_name: 'housing',
        display_name: 'Housing',
        description: 'Housing affordability, homeownership, rental policy',
        aliases: ['affordable housing', 'homeownership', 'rental', 'mortgage', 'real estate', 'homelessness']
      },
      {
        canonical_name: 'education',
        display_name: 'Education',
        description: 'Education policy, schools, student loans, higher education',
        aliases: ['schools', 'students', 'teachers', 'college', 'university', 'student loans', 'education funding']
      },
      {
        canonical_name: 'environment',
        display_name: 'Environment',
        description: 'Environmental protection, climate change, clean energy',
        aliases: ['climate', 'clean energy', 'renewable energy', 'pollution', 'conservation', 'green new deal', 'carbon']
      },
      {
        canonical_name: 'defense',
        display_name: 'National Defense',
        description: 'National security, military, veterans affairs',
        aliases: ['military', 'veterans', 'national security', 'armed forces', 'defense spending', 'pentagon']
      },
      {
        canonical_name: 'civil_rights',
        display_name: 'Civil Rights',
        description: 'Civil rights, voting rights, equality, discrimination',
        aliases: ['voting rights', 'equality', 'discrimination', 'lgbtq', 'racial justice', 'civil liberties']
      },
      {
        canonical_name: 'criminal_justice',
        display_name: 'Criminal Justice',
        description: 'Law enforcement, prison reform, criminal justice reform',
        aliases: ['police', 'law enforcement', 'prison', 'criminal justice reform', 'sentencing', 'crime']
      },
      {
        canonical_name: 'taxation',
        display_name: 'Taxation',
        description: 'Tax policy, tax rates, tax reform',
        aliases: ['taxes', 'tax reform', 'tax cuts', 'tax policy', 'irs', 'revenue']
      },
      {
        canonical_name: 'social_security',
        display_name: 'Social Security',
        description: 'Social Security benefits, retirement, disability',
        aliases: ['retirement', 'disability', 'social security benefits', 'seniors']
      },
      {
        canonical_name: 'technology',
        display_name: 'Technology',
        description: 'Technology policy, internet, privacy, cybersecurity',
        aliases: ['internet', 'privacy', 'cybersecurity', 'tech', 'digital', 'data protection', 'ai', 'artificial intelligence']
      }
    ];

    const insertTopic = this.db.prepare(`
      INSERT OR IGNORE INTO policy_topics (canonical_name, display_name, description)
      VALUES (?, ?, ?)
    `);

    const insertAlias = this.db.prepare(`
      INSERT OR IGNORE INTO topic_aliases (topic_id, alias, confidence_score)
      VALUES (?, ?, ?)
    `);

    const getTopicId = this.db.prepare(`
      SELECT id FROM policy_topics WHERE canonical_name = ?
    `);

    coreTopics.forEach(topic => {
      insertTopic.run(topic.canonical_name, topic.display_name, topic.description);
      
      const topicRow = getTopicId.get(topic.canonical_name);
      if (topicRow) {
        // Add the canonical name as an alias
        insertAlias.run(topicRow.id, topic.canonical_name, 1.0);
        insertAlias.run(topicRow.id, topic.display_name.toLowerCase(), 1.0);
        
        // Add all aliases
        topic.aliases.forEach(alias => {
          insertAlias.run(topicRow.id, alias.toLowerCase(), 0.8);
        });
      }
    });

    console.log(`✅ Initialized ${coreTopics.length} core policy topics`);
  }

  /**
   * Get politicians with websites that haven't been successfully crawled recently
   */
  getPoliticiansWithWebsites() {
    const query = `
      SELECT p.id, p.name, p.party, p.state, p.chamber, p.website
      FROM politicians p
      WHERE p.website IS NOT NULL AND p.website != ''
        AND p.id NOT IN (
          SELECT cl.politician_id 
          FROM crawl_log cl 
          WHERE cl.crawl_status = 'success' 
            AND cl.crawled_at > datetime('now', '-7 days')
        )
        AND p.id NOT IN (
          SELECT cl.politician_id 
          FROM crawl_log cl 
          WHERE cl.crawl_status = 'error' 
            AND cl.error_message LIKE '%ENOTFOUND%'
            AND cl.crawled_at > datetime('now', '-30 days')
        )
        AND p.id NOT IN (
          SELECT cl.politician_id 
          FROM crawl_log cl 
          WHERE cl.crawl_status = 'error' 
            AND cl.error_message LIKE '%403%'
            AND cl.crawled_at > datetime('now', '-7 days')
        )
      ORDER BY p.name
    `;
    return this.db.prepare(query).all();
  }

  /**
   * Extract positions from a politician's website
   */
  async extractPositionsFromWebsite(politician) {
    console.log(`🔍 Crawling ${politician.name} (${politician.party}-${politician.state})...`);
    
    const startTime = Date.now();
    let crawlStatus = 'success';
    let errorMessage = null;
    let positionsFound = 0;

    try {
      const websiteContent = await this.fetchWebsiteContent(politician.website);
      if (!websiteContent) {
        throw new Error('Failed to fetch website content');
      }

      const $ = cheerio.load(websiteContent);
      
      // First try to extract from main page
      let positions = this.extractPolicyPositions($, politician.website);
      
      // Then discover and crawl policy-specific pages
      const policyPages = this.discoverPolicyPages($, politician.website);
      
      for (const policyPage of policyPages) {
        try {
          console.log(`  📄 Crawling policy page: ${policyPage.url}`);
          const policyContent = await this.fetchWebsiteContent(policyPage.url);
          if (policyContent) {
            const policy$ = cheerio.load(policyContent);
            const policyPositions = this.extractPolicyPositions(policy$, policyPage.url, policyPage.topic);
            positions.push(...policyPositions);
          }
          
          // Respectful delay between page requests
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.log(`  ⚠️ Failed to crawl policy page ${policyPage.url}: ${error.message}`);
        }
      }
      
      positionsFound = positions.length;
      
      // Save positions to database
      for (const position of positions) {
        await this.savePosition(politician.id, position);
      }

      console.log(`✅ Found ${positionsFound} positions for ${politician.name}`);

    } catch (error) {
      crawlStatus = 'error';
      errorMessage = error.message;
      console.error(`❌ Error crawling ${politician.name}: ${error.message}`);
      this.errorsCount++;
    }

    // Log the crawl attempt
    const crawlDuration = Date.now() - startTime;
    this.logCrawlAttempt(politician.id, politician.website, crawlStatus, positionsFound, errorMessage, crawlDuration);
    
    this.processedCount++;
  }

  /**
   * Fetch website content with retries
   */
  async fetchWebsiteContent(url, retryCount = 0) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Truth-in-Politics Policy Crawler 1.0 (Research/Educational Use)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
        },
        timeout: 30000
      };

      const req = client.request(options, (res) => {
        let data = '';

        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return resolve(this.fetchWebsiteContent(res.headers.location, retryCount));
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          resolve(data);
        });
      });

      req.on('error', (error) => {
        if (retryCount < this.maxRetries) {
          console.log(`⚠️ Retrying ${url} (attempt ${retryCount + 1}/${this.maxRetries})`);
          setTimeout(() => {
            resolve(this.fetchWebsiteContent(url, retryCount + 1));
          }, 1000 * (retryCount + 1));
        } else {
          reject(error);
        }
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  /**
   * Discover policy-specific pages from the main website
   */
  discoverPolicyPages($, baseUrl) {
    const policyPages = [];
    const baseHostname = new URL(baseUrl).hostname;
    
    // Common policy page patterns
    const policyPatterns = [
      '/legislation/',
      '/issues/',
      '/policy/',
      '/positions/',
      '/priorities/',
      '/agenda/',
      '/platform/'
    ];
    
    // Topic-specific page patterns
    const topicPatterns = [
      'healthcare', 'health', 'medical',
      'immigration', 'border',
      'economy', 'economic', 'jobs',
      'housing', 'affordable-housing',
      'education', 'schools',
      'environment', 'climate', 'energy',
      'defense', 'military', 'veterans',
      'civil-rights', 'voting',
      'criminal-justice', 'justice',
      'tax', 'taxes',
      'social-security', 'retirement',
      'technology', 'privacy', 'cybersecurity'
    ];
    
    // Find links that match policy patterns
    $('a[href]').each((i, element) => {
      const href = $(element).attr('href');
      const linkText = $(element).text().trim().toLowerCase();
      
      if (href) {
        let fullUrl;
        try {
          if (href.startsWith('http')) {
            fullUrl = href;
          } else if (href.startsWith('/')) {
            fullUrl = `${new URL(baseUrl).protocol}//${baseHostname}${href}`;
          } else {
            return; // Skip relative links without leading slash
          }
          
          const url = new URL(fullUrl);
          if (url.hostname !== baseHostname) {
            return; // Skip external links
          }
          
          const path = url.pathname.toLowerCase();
          
          // Check if URL matches policy patterns
          const matchesPattern = policyPatterns.some(pattern => path.includes(pattern));
          const matchesTopic = topicPatterns.some(topic => 
            path.includes(topic) || linkText.includes(topic)
          );
          
          if (matchesPattern || matchesTopic) {
            // Determine the likely topic based on URL and link text
            const detectedTopic = this.detectTopicFromUrl(path, linkText);
            
            policyPages.push({
              url: fullUrl,
              text: linkText,
              topic: detectedTopic
            });
          }
        } catch (error) {
          // Skip malformed URLs
        }
      }
    });
    
    // Remove duplicates and limit to reasonable number
    const uniquePages = policyPages
      .filter((page, index, self) => 
        index === self.findIndex(p => p.url === page.url)
      )
      .slice(0, 15); // Limit to 15 policy pages per politician
    
    return uniquePages;
  }

  /**
   * Detect topic from URL path and link text
   */
  detectTopicFromUrl(path, linkText) {
    const combined = `${path} ${linkText}`.toLowerCase();
    
    const topicMap = {
      'healthcare': ['health', 'medical', 'medicare', 'medicaid', 'aca'],
      'immigration': ['immigration', 'border', 'asylum', 'citizenship'],
      'economy': ['economy', 'economic', 'jobs', 'employment', 'trade'],
      'housing': ['housing', 'affordable', 'mortgage', 'rent'],
      'education': ['education', 'school', 'student', 'college'],
      'environment': ['environment', 'climate', 'energy', 'green'],
      'defense': ['defense', 'military', 'veteran', 'security'],
      'civil_rights': ['civil', 'rights', 'voting', 'equality'],
      'criminal_justice': ['justice', 'criminal', 'police', 'crime'],
      'taxation': ['tax', 'taxes', 'revenue', 'fiscal'],
      'social_security': ['social', 'security', 'retirement', 'senior'],
      'technology': ['technology', 'tech', 'privacy', 'cyber']
    };
    
    for (const [topic, keywords] of Object.entries(topicMap)) {
      if (keywords.some(keyword => combined.includes(keyword))) {
        return topic;
      }
    }
    
    return null;
  }
  /**
   * Extract policy positions from HTML content
   */
  extractPolicyPositions($, sourceUrl, hintTopic = null) {
    const positions = [];
    const contentSections = this.findContentSections($);
    
    contentSections.forEach(section => {
      let topics = this.identifyTopics(section.text);
      
      // If we have a hint topic from URL, prioritize it
      if (hintTopic) {
        const hintTopicData = this.getTopicByCanonicalName(hintTopic);
        if (hintTopicData && !topics.find(t => t.id === hintTopicData.id)) {
          topics.unshift({
            id: hintTopicData.id,
            canonical_name: hintTopicData.canonical_name,
            display_name: hintTopicData.display_name,
            confidence: 0.9 // High confidence from URL hint
          });
        }
      }
      
      topics.forEach(topic => {
        // Analyze the position using our enhanced method
        const analysis = this.analyzePosition(section.text, topic.canonical_name);
        
        // Only proceed if we found a meaningful position
        if (analysis.confidence > 0.2 && analysis.position !== 'neutral') {
          const positionSummary = this.extractPositionSummary(section.text, topic, analysis);
          
          const position = {
            topic_id: topic.id,
            position_summary: positionSummary,
            position_details: section.text.substring(0, 1500), // Limit detail length
            is_key_issue: this.isKeyIssue(section) || analysis.strength === 'strong',
            source_url: sourceUrl,
            source_section: section.title || section.selector,
            confidence_score: Math.min(topic.confidence, analysis.confidence),
            stance: analysis.position,
            strength: analysis.strength,
            key_phrases: analysis.keyPhrases.join('; ')
          };
          
          // Only add positions with meaningful content
          if (position.position_summary.length > 20) {
            positions.push(position);
          }
        }
      });
    });

    return positions;
  }

  /**
   * Get topic data by canonical name
   */
  getTopicByCanonicalName(canonicalName) {
    try {
      return this.db.prepare(`
        SELECT id, canonical_name, display_name 
        FROM policy_topics 
        WHERE canonical_name = ?
      `).get(canonicalName);
    } catch (error) {
      return null;
    }
  }

  /**
   * Find relevant content sections on the page
   */
  findContentSections($) {
    const sections = [];
    
    // Enhanced selectors for policy content
    const selectors = [
      'main',
      '.content',
      '#content',
      '.page-content',
      '.main-content',
      '.entry-content',
      '.post-content',
      '.article-content',
      '.issues',
      '.policy',
      '.positions',
      '.priorities',
      '.agenda',
      '.platform',
      '.legislation',
      '[id*="issue"]',
      '[class*="issue"]',
      '[id*="policy"]',
      '[class*="policy"]',
      '[id*="position"]',
      '[class*="position"]',
      'article',
      '.field--name-body',
      '.field-item',
      '.paragraph',
      'section[class*="content"]',
      'div[class*="content"]'
    ];

    selectors.forEach(selector => {
      $(selector).each((i, element) => {
        const $element = $(element);
        const text = $element.text().trim();
        
        if (text.length > 100 && text.length < 5000) { // More reasonable content length
          // Get title from various sources
          const title = 
            $element.find('h1, h2, h3').first().text().trim() ||
            $element.attr('title') ||
            $element.find('[class*="title"], [class*="heading"]').first().text().trim() ||
            '';
          
          sections.push({
            selector: selector,
            title: title,
            text: text.substring(0, 3000), // Limit text length but allow more
            isKeySection: this.isKeySection($element),
            hasStructuredContent: this.hasStructuredContent($element)
          });
        }
      });
    });

    // Also look for meta descriptions and page titles for position hints
    const metaDescription = $('meta[name="description"]').attr('content');
    const pageTitle = $('title').text().trim();
    
    if (metaDescription && metaDescription.length > 50) {
      sections.push({
        selector: 'meta[description]',
        title: pageTitle,
        text: metaDescription,
        isKeySection: true,
        hasStructuredContent: false
      });
    }

    // Remove duplicates and sort by relevance
    return sections
      .filter((section, index, self) => 
        index === self.findIndex(s => 
          s.text.substring(0, 200) === section.text.substring(0, 200)
        )
      )
      .sort((a, b) => {
        // Prioritize structured content and key sections
        const scoreA = (a.isKeySection ? 2 : 0) + (a.hasStructuredContent ? 1 : 0);
        const scoreB = (b.isKeySection ? 2 : 0) + (b.hasStructuredContent ? 1 : 0);
        return scoreB - scoreA;
      })
      .slice(0, 15); // Increased limit for better coverage
  }

  /**
   * Check if element has structured policy content
   */
  hasStructuredContent($element) {
    const structureIndicators = [
      'ul', 'ol', 'li',           // Lists
      'h1', 'h2', 'h3', 'h4',    // Headings
      'p',                        // Paragraphs
      '.policy-item',
      '.issue-item',
      '.position-item'
    ];
    
    return structureIndicators.some(indicator => 
      $element.find(indicator).length > 2
    );
  }

  /**
   * Identify topics mentioned in text content
   */
  identifyTopics(text) {
    const lowerText = text.toLowerCase();
    const topics = [];
    
    const topicsQuery = `
      SELECT DISTINCT t.id, t.canonical_name, t.display_name, a.alias, a.confidence_score
      FROM policy_topics t
      JOIN topic_aliases a ON t.id = a.topic_id
    `;
    
    const allTopicAliases = this.db.prepare(topicsQuery).all();
    
    allTopicAliases.forEach(row => {
      if (lowerText.includes(row.alias)) {
        const existingTopic = topics.find(t => t.id === row.id);
        if (!existingTopic) {
          topics.push({
            id: row.id,
            canonical_name: row.canonical_name,
            display_name: row.display_name,
            confidence: row.confidence_score
          });
        } else if (row.confidence_score > existingTopic.confidence) {
          existingTopic.confidence = row.confidence_score;
        }
      }
    });

    return topics;
  }

  /**
   * Extract position summary for a specific topic
   */
  extractPositionSummary(text, topic, analysis = null) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const relevantSentences = [];
    
    // If we have analysis with key phrases, use those first
    if (analysis && analysis.keyPhrases && analysis.keyPhrases.length > 0) {
      return analysis.keyPhrases.slice(0, 2).join('. ') + '.';
    }
    
    // Look for sentences with topic keywords and position indicators
    sentences.forEach(sentence => {
      const lowerSentence = sentence.toLowerCase();
      
      // Check for topic relevance
      const hasTopicKeyword = 
        lowerSentence.includes(topic.canonical_name.toLowerCase()) || 
        lowerSentence.includes(topic.display_name.toLowerCase()) ||
        (this.coreTopics[topic.canonical_name] || []).some(keyword => 
          lowerSentence.includes(keyword.toLowerCase())
        );
      
      // Check for position indicators
      const hasPositionIndicator = [
        'support', 'oppose', 'believe', 'advocate', 'against', 
        'committed', 'will fight', 'priority', 'important'
      ].some(indicator => lowerSentence.includes(indicator));
      
      if (hasTopicKeyword && hasPositionIndicator) {
        relevantSentences.push(sentence.trim());
      } else if (hasTopicKeyword && sentence.trim().length > 50) {
        // Include topic-relevant sentences even without explicit position words
        relevantSentences.push(sentence.trim());
      }
    });

    if (relevantSentences.length > 0) {
      return relevantSentences.slice(0, 2).join('. ') + '.';
    }

    // Fallback: look for any sentences mentioning the topic
    const fallbackSentences = sentences.filter(sentence => {
      const lowerSentence = sentence.toLowerCase();
      return lowerSentence.includes(topic.canonical_name.toLowerCase()) || 
             lowerSentence.includes(topic.display_name.toLowerCase());
    });
    
    if (fallbackSentences.length > 0) {
      return fallbackSentences.slice(0, 2).join('. ') + '.';
    }

    // Last resort: return first meaningful sentences
    return sentences.slice(0, 2).join('. ') + '.';
  }

  /**
   * Determine if this section represents a key issue
   */
  isKeyIssue(section) {
    const keyIndicators = [
      'priority',
      'key issue',
      'important',
      'focus',
      'commitment',
      'champion',
      'fight for',
      'dedicated to'
    ];
    
    const text = section.text.toLowerCase();
    return keyIndicators.some(indicator => text.includes(indicator));
  }

  /**
   * Determine if this is a key content section
   */
  isKeySection($element) {
    const text = $element.text().toLowerCase();
    const className = $element.attr('class') || '';
    const id = $element.attr('id') || '';
    const tag = $element.prop('tagName').toLowerCase();
    
    // Strong indicators
    const strongKeywords = [
      'policy', 'position', 'stance', 'priority', 'agenda', 
      'platform', 'issue', 'legislation', 'bill', 'vote',
      'support', 'oppose', 'believe', 'commitment'
    ];
    
    // Topic-specific keywords  
    const topicKeywords = [
      'healthcare', 'insurance', 'medicare', 'medicaid',
      'immigration', 'border', 'citizenship', 'refugee',
      'economy', 'jobs', 'employment', 'tax', 'budget',
      'housing', 'affordable', 'homeless', 'rent',
      'education', 'school', 'student', 'teacher',
      'environment', 'climate', 'energy', 'pollution',
      'defense', 'military', 'security', 'veteran',
      'rights', 'equality', 'justice', 'freedom',
      'criminal', 'police', 'reform', 'prison',
      'social security', 'retirement', 'disability',
      'technology', 'internet', 'privacy', 'data'
    ];

    // Check attributes first
    const attrText = (className + ' ' + id).toLowerCase();
    if (strongKeywords.some(keyword => attrText.includes(keyword))) {
      return true;
    }

    // Structural indicators
    if (tag === 'main' || 
        className.includes('main') || 
        className.includes('primary') ||
        id.includes('main') ||
        id.includes('content')) {
      return true;
    }

    // Check content for policy indicators
    const strongMatches = strongKeywords.filter(keyword => 
      text.includes(keyword)
    ).length;
    
    const topicMatches = topicKeywords.filter(keyword => 
      text.includes(keyword)
    ).length;

    // Scoring system for policy relevance
    const score = (strongMatches * 2) + topicMatches;
    
    return score >= 3 || // Strong policy indicators
           (strongMatches >= 1 && topicMatches >= 2) || // Mixed indicators
           text.includes('i believe') || 
           text.includes('my position') ||
           text.includes('will fight for') ||
           text.includes('committed to') ||
           text.includes('plan to');
  }

  /**
   * Analyze content to determine position polarity and strength
   */
  analyzePosition(text, topic) {
    const lowerText = text.toLowerCase();
    
    // Get topic-specific indicators
    const topicIndicators = this.getTopicIndicators(topic);
    
    // Enhanced stance detection
    const supportIndicators = [
      'support', 'back', 'endorse', 'champion', 'advocate',
      'believe in', 'committed to', 'will fight for', 'dedicated to',
      'promote', 'expand', 'strengthen', 'increase', 'improve',
      'invest in', 'fund', 'prioritize', 'defend', 'protect',
      'yes on', 'vote for', 'in favor of', 'agree with'
    ];
    
    const opposeIndicators = [
      'oppose', 'against', 'reject', 'block', 'stop', 'prevent',
      'cut', 'reduce', 'eliminate', 'repeal', 'defund',
      'no on', 'vote against', 'disagree with', 'resist'
    ];
    
    // Enhanced strength indicators
    const strongIndicators = [
      'strongly', 'firmly', 'absolutely', 'completely', 'fully',
      'always', 'never', 'must', 'will', 'committed', 'dedicated',
      'priority', 'essential', 'critical', 'vital', 'fundamental'
    ];
    
    // Count indicators
    let supportScore = supportIndicators.filter(indicator => 
      lowerText.includes(indicator)
    ).length;
    
    let opposeScore = opposeIndicators.filter(indicator => 
      lowerText.includes(indicator)
    ).length;
    
    const strengthScore = strongIndicators.filter(indicator => 
      lowerText.includes(indicator)
    ).length;
    
    // Add topic-specific scoring
    if (topicIndicators) {
      supportScore += topicIndicators.support.filter(indicator => 
        lowerText.includes(indicator)
      ).length;
      
      opposeScore += topicIndicators.oppose.filter(indicator => 
        lowerText.includes(indicator)
      ).length;
    }
    
    // Determine position
    let position = 'neutral';
    let confidence = 0.1;
    
    if (supportScore > opposeScore) {
      position = 'support';
      confidence = Math.min(0.9, 0.3 + (supportScore * 0.15) + (strengthScore * 0.1));
    } else if (opposeScore > supportScore) {
      position = 'oppose';
      confidence = Math.min(0.9, 0.3 + (opposeScore * 0.15) + (strengthScore * 0.1));
    } else if (supportScore > 0 || opposeScore > 0) {
      position = 'mixed';
      confidence = Math.min(0.7, 0.2 + ((supportScore + opposeScore) * 0.1));
    }
    
    // Extract key phrases that indicate the position
    const keyPhrases = this.extractKeyPhrases(text, topic, position);
    
    return {
      position,
      confidence,
      strength: strengthScore > 0 ? 'strong' : 'moderate',
      supportScore,
      opposeScore,
      keyPhrases
    };
  }

  /**
   * Get topic-specific indicators for better position detection
   */
  getTopicIndicators(topic) {
    const indicators = {
      healthcare: {
        support: ['expand medicare', 'public option', 'affordable healthcare', 'protect aca', 'universal healthcare'],
        oppose: ['repeal obamacare', 'privatize medicare', 'cut medicaid', 'block healthcare']
      },
      immigration: {
        support: ['path to citizenship', 'comprehensive reform', 'protect dreamers', 'family reunification'],
        oppose: ['build wall', 'mass deportation', 'close borders', 'end immigration']
      },
      economy: {
        support: ['create jobs', 'raise minimum wage', 'invest in infrastructure', 'support small business'],
        oppose: ['cut taxes for wealthy', 'reduce regulations', 'austerity measures']
      },
      environment: {
        support: ['combat climate change', 'clean energy', 'paris agreement', 'green new deal'],
        oppose: ['drill for oil', 'coal industry', 'climate denial', 'deregulation']
      },
      education: {
        support: ['fund public schools', 'affordable college', 'support teachers', 'increase education'],
        oppose: ['school vouchers', 'privatize education', 'cut education funding']
      }
    };
    
    return indicators[topic.toLowerCase()] || null;
  }

  /**
   * Extract key phrases that support the detected position
   */
  extractKeyPhrases(text, topic, position) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const keyPhrases = [];
    
    const positionWords = position === 'support' ? 
      ['support', 'advocate', 'believe', 'committed', 'will fight'] :
      ['oppose', 'against', 'reject', 'block', 'stop'];
    
    // Look for sentences containing both topic keywords and position indicators
    sentences.forEach(sentence => {
      const lowerSentence = sentence.toLowerCase();
      
      // Check if sentence contains topic-related terms
      const hasTopicKeyword = this.coreTopics[topic]?.some(keyword => 
        lowerSentence.includes(keyword.toLowerCase())
      ) || lowerSentence.includes(topic.toLowerCase());
      
      // Check if sentence contains position indicators
      const hasPositionIndicator = positionWords.some(word => 
        lowerSentence.includes(word)
      );
      
      if (hasTopicKeyword && hasPositionIndicator && sentence.trim().length < 200) {
        keyPhrases.push(sentence.trim());
      }
    });
    
    return keyPhrases.slice(0, 3); // Limit to 3 most relevant phrases
  }

  /**
   * Save position to database
   */
  async savePosition(politicianId, position) {
    const insertPosition = this.db.prepare(`
      INSERT OR REPLACE INTO politician_positions 
      (politician_id, topic_id, position_summary, position_details, is_key_issue, 
       source_url, source_section, confidence_score, stance, strength, key_phrases)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertPosition.run(
      politicianId,
      position.topic_id,
      position.position_summary,
      position.position_details,
      position.is_key_issue ? 1 : 0,
      position.source_url,
      position.source_section,
      position.confidence_score,
      position.stance || 'neutral',
      position.strength || 'moderate',
      position.key_phrases || ''
    );
  }

  /**
   * Log crawl attempt
   */
  logCrawlAttempt(politicianId, websiteUrl, status, positionsFound, errorMessage, duration) {
    const insertLog = this.db.prepare(`
      INSERT INTO crawl_log 
      (politician_id, website_url, crawl_status, positions_found, error_message, crawl_duration_ms)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertLog.run(politicianId, websiteUrl, status, positionsFound, errorMessage, duration);
  }

  /**
   * Check if politician should be skipped based on recent crawl attempts
   */
  shouldSkipPolitician(politicianId, websiteUrl) {
    const recentLog = this.db.prepare(`
      SELECT crawl_status, crawled_at, error_message
      FROM crawl_log 
      WHERE politician_id = ? 
      ORDER BY crawled_at DESC 
      LIMIT 1
    `).get(politicianId);
    
    if (!recentLog) {
      return false; // No previous attempts, crawl it
    }
    
    const daysSinceLastAttempt = (Date.now() - new Date(recentLog.crawled_at).getTime()) / (1000 * 60 * 60 * 24);
    
    switch (recentLog.crawl_status) {
      case 'success':
        // Skip if crawled successfully within last 7 days
        return daysSinceLastAttempt < 7;
        
      case 'error':
        // Check error type
        if (recentLog.error_message && recentLog.error_message.includes('ENOTFOUND')) {
          // DNS/domain not found - skip for 30 days
          return daysSinceLastAttempt < 30;
        } else if (recentLog.error_message && recentLog.error_message.includes('403')) {
          // Forbidden - skip for 7 days
          return daysSinceLastAttempt < 7;
        } else {
          // Other errors - retry after 1 day
          return daysSinceLastAttempt < 1;
        }
        
      default:
        return false;
    }
  }

  /**
   * Crawl a single politician's website for policy positions
   */
  async crawlSinglePolitician(politicianId) {
    console.log(`🔍 Crawling positions for politician: ${politicianId}`);
    
    const startTime = Date.now();
    
    try {
      // Get politician data
      const politician = this.db.prepare(`
        SELECT id, name, website FROM politicians WHERE id = ?
      `).get(politicianId);
      
      if (!politician) {
        throw new Error(`Politician with id ${politicianId} not found`);
      }
      
      if (!politician.website) {
        console.log(`⚠️  No website found for ${politician.name}`);
        return;
      }
      
      console.log(`📄 Crawling website: ${politician.website}`);
      
      // Check if we should skip this politician
      if (this.shouldSkipPolitician(politician.id, politician.website)) {
        console.log(`⏭️  Skipping ${politician.name} - recent attempt or failure`);
        return;
      }
      
      let positions = [];
      let errorMessage = null;
      
      try {
        // Fetch and parse the main website
        const response = await fetch(politician.website, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; TruthInPolitics/1.0; +https://truthinpolitics.org/about)'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        const $ = cheerio.load(html);
        
        // Extract positions from main page
        positions = this.extractPolicyPositions($, politician.website);
        
        // Try to discover policy-specific pages
        const policyPages = this.discoverPolicyPages($, politician.website);
        console.log(`🔍 Found ${policyPages.length} potential policy pages`);
        
        // Crawl up to 3 policy pages
        for (const policyPage of policyPages.slice(0, 3)) {
          try {
            console.log(`📄 Crawling policy page: ${policyPage.url}`);
            const policyResponse = await fetch(policyPage.url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; TruthInPolitics/1.0; +https://truthinpolitics.org/about)'
              }
            });
            
            if (policyResponse.ok) {
              const policyHtml = await policyResponse.text();
              const policy$ = cheerio.load(policyHtml);
              const policyPositions = this.extractPolicyPositions(policy$, policyPage.url, policyPage.topic);
              positions.push(...policyPositions);
            }
          } catch (policyError) {
            console.log(`⚠️  Failed to crawl policy page ${policyPage.url}: ${policyError.message}`);
          }
          
          // Add delay between requests
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log(`📊 Found ${positions.length} total positions for ${politician.name}`);
        
        // Save positions to database
        for (const position of positions) {
          await this.savePosition(politician.id, position);
        }
        
      } catch (crawlError) {
        errorMessage = crawlError.message;
        console.error(`❌ Failed to crawl ${politician.name}: ${errorMessage}`);
      }
      
      // Log the crawl attempt
      const duration = Date.now() - startTime;
      this.logCrawlAttempt(
        politician.id,
        politician.website,
        errorMessage ? 'error' : 'success',
        positions.length,
        errorMessage,
        duration
      );
      
      console.log(`✅ Completed crawling ${politician.name} in ${duration}ms`);
      
    } catch (error) {
      console.error(`❌ Error in crawlSinglePolitician: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crawl all politicians for policy positions
   */
  async crawlAllPoliticians(limit = null) {
    console.log('🚀 Starting policy position crawler...');
    
    const politicians = this.getPoliticiansWithWebsites();
    const totalCount = limit ? Math.min(politicians.length, limit) : politicians.length;
    
    console.log(`📊 Found ${politicians.length} politicians with websites`);
    console.log(`🎯 Processing ${totalCount} politicians`);
    
    const politiciansToProcess = limit ? politicians.slice(0, limit) : politicians;
    
    for (const politician of politiciansToProcess) {
      await this.extractPositionsFromWebsite(politician);
      
      // Progress update
      console.log(`📈 Progress: ${this.processedCount}/${totalCount} processed, ${this.errorsCount} errors`);
      
      // Respectful delay between requests
      if (this.processedCount < totalCount) {
        await new Promise(resolve => setTimeout(resolve, this.requestDelay));
      }
    }

    this.printSummary();
  }

  /**
   * Print crawling summary
   */
  printSummary() {
    console.log('\n🎉 Crawling completed!');
    console.log(`📊 Summary:`);
    console.log(`   • Politicians processed: ${this.processedCount}`);
    console.log(`   • Errors encountered: ${this.errorsCount}`);
    
    // Get position counts
    const positionCount = this.db.prepare('SELECT COUNT(*) as count FROM politician_positions').get();
    const topicCount = this.db.prepare('SELECT COUNT(*) as count FROM policy_topics').get();
    
    console.log(`   • Total positions found: ${positionCount.count}`);
    console.log(`   • Topics covered: ${topicCount.count}`);
    
    // Show top topics
    const topTopics = this.db.prepare(`
      SELECT t.display_name, COUNT(*) as position_count
      FROM politician_positions p
      JOIN policy_topics t ON p.topic_id = t.id
      GROUP BY t.id, t.display_name
      ORDER BY position_count DESC
      LIMIT 5
    `).all();
    
    console.log('\n🔥 Most discussed topics:');
    topTopics.forEach((topic, index) => {
      console.log(`   ${index + 1}. ${topic.display_name}: ${topic.position_count} positions`);
    });
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const limit = args.includes('--limit') ? 
    parseInt(args[args.indexOf('--limit') + 1]) : 
    null;
  
  const testMode = args.includes('--test');
  
  async function main() {
    const crawler = new PolicyPositionCrawler();
    
    try {
      if (testMode) {
        console.log('🧪 Running in test mode (limit: 5 politicians)');
        await crawler.crawlAllPoliticians(5);
      } else if (limit) {
        console.log(`🎯 Running with limit: ${limit} politicians`);
        await crawler.crawlAllPoliticians(limit);
      } else {
        console.log('⚠️  Running full crawl (this may take several hours)');
        console.log('💡 Use --test for testing or --limit N to process only N politicians');
        await crawler.crawlAllPoliticians();
      }
    } catch (error) {
      console.error('💥 Crawler failed:', error);
      process.exit(1);
    } finally {
      crawler.close();
    }
  }

  main().catch(console.error);
}

module.exports = PolicyPositionCrawler;
