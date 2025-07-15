// Database module for caching politician data and analysis results
const Database = require('better-sqlite3');
const path = require('path');

class PoliticianDatabase {
  constructor(dbPath = './data/politicians.db') {
    this.db = new Database(dbPath);
    this.initializeTables();
  }

  initializeTables() {
    // Politicians table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS politicians (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        party TEXT NOT NULL,
        state TEXT NOT NULL,
        chamber TEXT NOT NULL,
        district TEXT,
        title TEXT NOT NULL,
        first_elected INTEGER,
        website TEXT,
        bio_data TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Policy positions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS policy_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        politician_id TEXT NOT NULL,
        category TEXT NOT NULL,
        stated_position TEXT NOT NULL,
        alignment_score INTEGER,
        last_analyzed DATETIME DEFAULT CURRENT_TIMESTAMP,
        source_url TEXT,
        FOREIGN KEY (politician_id) REFERENCES politicians (id)
      )
    `);

    // Public statements table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS public_statements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        politician_id TEXT NOT NULL,
        policy_category TEXT NOT NULL,
        statement_text TEXT NOT NULL,
        source TEXT NOT NULL,
        source_url TEXT,
        statement_date DATE NOT NULL,
        credibility_score INTEGER DEFAULT 50,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (politician_id) REFERENCES politicians (id)
      )
    `);

    // Voting records table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS voting_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        politician_id TEXT NOT NULL,
        bill_name TEXT NOT NULL,
        bill_id TEXT,
        vote_decision TEXT NOT NULL,
        vote_date DATE NOT NULL,
        policy_category TEXT,
        description TEXT,
        source_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (politician_id) REFERENCES politicians (id)
      )
    `);

    // News sources configuration table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS news_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        domain TEXT UNIQUE NOT NULL,
        credibility_rating INTEGER DEFAULT 50,
        is_enabled BOOLEAN DEFAULT 1,
        api_key TEXT,
        last_scraped DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Analysis cache table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS analysis_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        politician_id TEXT NOT NULL,
        analysis_type TEXT NOT NULL,
        analysis_data TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (politician_id) REFERENCES politicians (id)
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_politicians_name ON politicians (name);
      CREATE INDEX IF NOT EXISTS idx_politicians_state ON politicians (state);
      CREATE INDEX IF NOT EXISTS idx_policy_positions_politician ON policy_positions (politician_id);
      CREATE INDEX IF NOT EXISTS idx_statements_politician ON public_statements (politician_id);
      CREATE INDEX IF NOT EXISTS idx_voting_records_politician ON voting_records (politician_id);
      CREATE INDEX IF NOT EXISTS idx_analysis_cache_politician ON analysis_cache (politician_id);
    `);

    // Insert default news sources
    this.insertDefaultNewsSources();
  }

  insertDefaultNewsSources() {
    const defaultSources = [
      { name: 'Associated Press', domain: 'apnews.com', credibility_rating: 90 },
      { name: 'Reuters', domain: 'reuters.com', credibility_rating: 90 },
      { name: 'NPR', domain: 'npr.org', credibility_rating: 85 },
      { name: 'BBC', domain: 'bbc.com', credibility_rating: 85 },
      { name: 'PBS NewsHour', domain: 'pbs.org', credibility_rating: 85 },
      { name: 'Wall Street Journal', domain: 'wsj.com', credibility_rating: 80 },
      { name: 'Washington Post', domain: 'washingtonpost.com', credibility_rating: 80 },
      { name: 'New York Times', domain: 'nytimes.com', credibility_rating: 80 },
      { name: 'Politico', domain: 'politico.com', credibility_rating: 75 },
      { name: 'The Hill', domain: 'thehill.com', credibility_rating: 75 }
    ];

    const insertSource = this.db.prepare(`
      INSERT OR IGNORE INTO news_sources (name, domain, credibility_rating, is_enabled)
      VALUES (?, ?, ?, 1)
    `);

    for (const source of defaultSources) {
      insertSource.run(source.name, source.domain, source.credibility_rating);
    }
  }

  // Politician methods
  insertPolitician(politician) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO politicians 
      (id, name, party, state, chamber, district, title, first_elected, website, bio_data, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    return stmt.run(
      politician.id,
      politician.name,
      politician.party,
      politician.state,
      politician.chamber,
      politician.district,
      politician.title,
      politician.first_elected,
      politician.website,
      JSON.stringify(politician.bio_data || {})
    );
  }

  getPolitician(id) {
    const stmt = this.db.prepare('SELECT * FROM politicians WHERE id = ?');
    const politician = stmt.get(id);
    
    if (politician && politician.bio_data) {
      politician.bio_data = JSON.parse(politician.bio_data);
    }
    
    return politician;
  }

  searchPoliticians(query) {
    const stmt = this.db.prepare(`
      SELECT * FROM politicians 
      WHERE name LIKE ? OR state LIKE ?
      ORDER BY name
    `);
    
    const searchTerm = `%${query}%`;
    const results = stmt.all(searchTerm, searchTerm);
    
    return results.map(politician => {
      if (politician.bio_data) {
        politician.bio_data = JSON.parse(politician.bio_data);
      }
      return politician;
    });
  }

  // Policy position methods
  insertPolicyPosition(position) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO policy_positions 
      (politician_id, category, stated_position, alignment_score, source_url, last_analyzed)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    return stmt.run(
      position.politician_id,
      position.category,
      position.stated_position,
      position.alignment_score,
      position.source_url
    );
  }

  getPolicyPositions(politicianId) {
    const stmt = this.db.prepare(`
      SELECT * FROM policy_positions 
      WHERE politician_id = ? 
      ORDER BY category
    `);
    
    return stmt.all(politicianId);
  }

  // Public statement methods
  insertPublicStatement(statement) {
    const stmt = this.db.prepare(`
      INSERT INTO public_statements 
      (politician_id, policy_category, statement_text, source, source_url, statement_date, credibility_score)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      statement.politician_id,
      statement.policy_category,
      statement.statement_text,
      statement.source,
      statement.source_url,
      statement.statement_date,
      statement.credibility_score || 50
    );
  }

  getPublicStatements(politicianId, category = null) {
    let query = `
      SELECT * FROM public_statements 
      WHERE politician_id = ?
    `;
    let params = [politicianId];

    if (category) {
      query += ' AND policy_category = ?';
      params.push(category);
    }

    query += ' ORDER BY statement_date DESC';

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  // Voting record methods
  insertVotingRecord(vote) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO voting_records 
      (politician_id, bill_name, bill_id, vote_decision, vote_date, policy_category, description, source_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      vote.politician_id,
      vote.bill_name,
      vote.bill_id,
      vote.vote_decision,
      vote.vote_date,
      vote.policy_category,
      vote.description,
      vote.source_url
    );
  }

  getVotingRecords(politicianId, category = null) {
    let query = `
      SELECT * FROM voting_records 
      WHERE politician_id = ?
    `;
    let params = [politicianId];

    if (category) {
      query += ' AND policy_category = ?';
      params.push(category);
    }

    query += ' ORDER BY vote_date DESC';

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  // Analysis cache methods
  cacheAnalysis(politicianId, analysisType, data, expirationHours = 24) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO analysis_cache 
      (politician_id, analysis_type, analysis_data, expires_at)
      VALUES (?, ?, ?, datetime('now', '+' || ? || ' hours'))
    `);

    return stmt.run(
      politicianId,
      analysisType,
      JSON.stringify(data),
      expirationHours
    );
  }

  getCachedAnalysis(politicianId, analysisType) {
    const stmt = this.db.prepare(`
      SELECT analysis_data FROM analysis_cache 
      WHERE politician_id = ? AND analysis_type = ? AND expires_at > datetime('now')
    `);

    const result = stmt.get(politicianId, analysisType);
    return result ? JSON.parse(result.analysis_data) : null;
  }

  // News source methods
  getNewsSources(enabledOnly = true) {
    let query = 'SELECT * FROM news_sources';
    if (enabledOnly) {
      query += ' WHERE is_enabled = 1';
    }
    query += ' ORDER BY credibility_rating DESC';

    const stmt = this.db.prepare(query);
    return stmt.all();
  }

  updateNewsSourceLastScraped(domain) {
    const stmt = this.db.prepare(`
      UPDATE news_sources 
      SET last_scraped = CURRENT_TIMESTAMP 
      WHERE domain = ?
    `);

    return stmt.run(domain);
  }

  // Utility methods
  getComprehensiveProfile(politicianId) {
    const politician = this.getPolitician(politicianId);
    if (!politician) return null;

    const policyPositions = this.getPolicyPositions(politicianId);
    const statements = this.getPublicStatements(politicianId);
    const votes = this.getVotingRecords(politicianId);

    return {
      politician,
      policyPositions,
      statements,
      votes
    };
  }

  cleanup() {
    // Remove expired cache entries
    this.db.prepare(`
      DELETE FROM analysis_cache 
      WHERE expires_at < datetime('now')
    `).run();

    // Remove old statements (older than 2 years)
    this.db.prepare(`
      DELETE FROM public_statements 
      WHERE created_at < datetime('now', '-2 years')
    `).run();
  }

  close() {
    this.db.close();
  }
}

module.exports = PoliticianDatabase;
