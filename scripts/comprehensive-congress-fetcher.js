#!/usr/bin/env node

/**
 * Comprehensive Congress Data Fetcher
 * Fetches voting records, sponsored legislation, and cosponsored legislation
 * with configurable date ranges for historical data analysis
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Load .env file manually if it exists
function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...valueParts] = trimmedLine.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          process.env[key.trim()] = value;
        }
      }
    }
    console.log('📁 Loaded .env file');
  }
}

// Load environment variables
loadEnvFile();

class ComprehensiveCongressFetcher {
  constructor() {
    this.baseApiUrl = 'https://api.congress.gov/v3';
    this.apiKey = process.env.CONGRESS_GOV_API_KEY;
    this.requestDelay = 250; // 250ms between requests to respect rate limits
    
    // Initialize database
    const dbPath = path.join(__dirname, '..', 'data', 'politicians.db');
    this.db = new Database(dbPath);
    
    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Initialize comprehensive tables
    this.initializeComprehensiveTables();
  }

  /**
   * Initialize database tables for comprehensive congressional data
   */
  initializeComprehensiveTables() {
    console.log('🗃️ Initializing comprehensive congressional database schema...');
    
    // Bills/Legislation table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS legislation (
        id TEXT PRIMARY KEY,
        congress INTEGER NOT NULL,
        bill_type TEXT NOT NULL,
        bill_number TEXT NOT NULL,
        title TEXT,
        summary TEXT,
        introduced_date TEXT,
        last_action_date TEXT,
        is_law BOOLEAN DEFAULT FALSE,
        law_number TEXT,
        sponsor_bioguide_id TEXT,
        sponsor_name TEXT,
        url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Cosponsors table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS legislation_cosponsors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        legislation_id TEXT NOT NULL,
        cosponsor_bioguide_id TEXT NOT NULL,
        cosponsor_name TEXT,
        date_cosponsored TEXT,
        withdrawn_date TEXT,
        is_original_cosponsor BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (legislation_id) REFERENCES legislation (id),
        UNIQUE (legislation_id, cosponsor_bioguide_id)
      )
    `);

    // Enhanced politician sponsorship tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS politician_legislation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        politician_id TEXT NOT NULL,
        bioguide_id TEXT,
        legislation_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL, -- 'sponsor', 'cosponsor'
        date_involved TEXT,
        is_original_cosponsor BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (politician_id) REFERENCES politicians (id),
        FOREIGN KEY (legislation_id) REFERENCES legislation (id),
        UNIQUE (politician_id, legislation_id, relationship_type)
      )
    `);

    // Voting alignment analysis table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS voting_alignment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        politician1_id TEXT NOT NULL,
        politician2_id TEXT NOT NULL,
        total_shared_votes INTEGER DEFAULT 0,
        agreement_count INTEGER DEFAULT 0,
        agreement_rate REAL DEFAULT 0.0,
        last_calculated DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (politician1_id) REFERENCES politicians (id),
        FOREIGN KEY (politician2_id) REFERENCES politicians (id),
        UNIQUE (politician1_id, politician2_id)
      )
    `);

    // Legislative alignment analysis table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS legislative_alignment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        politician1_id TEXT NOT NULL,
        politician2_id TEXT NOT NULL,
        shared_sponsored INTEGER DEFAULT 0,
        shared_cosponsored INTEGER DEFAULT 0,
        total_alignment_score REAL DEFAULT 0.0,
        last_calculated DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (politician1_id) REFERENCES politicians (id),
        FOREIGN KEY (politician2_id) REFERENCES politicians (id),
        UNIQUE (politician1_id, politician2_id)
      )
    `);

    // Create indexes for efficient querying
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_legislation_congress ON legislation (congress);
      CREATE INDEX IF NOT EXISTS idx_legislation_sponsor ON legislation (sponsor_bioguide_id);
      CREATE INDEX IF NOT EXISTS idx_legislation_introduced_date ON legislation (introduced_date);
      
      CREATE INDEX IF NOT EXISTS idx_cosponsors_legislation ON legislation_cosponsors (legislation_id);
      CREATE INDEX IF NOT EXISTS idx_cosponsors_bioguide ON legislation_cosponsors (cosponsor_bioguide_id);
      
      CREATE INDEX IF NOT EXISTS idx_politician_legislation_politician ON politician_legislation (politician_id);
      CREATE INDEX IF NOT EXISTS idx_politician_legislation_legislation ON politician_legislation (legislation_id);
      CREATE INDEX IF NOT EXISTS idx_politician_legislation_type ON politician_legislation (relationship_type);
    `);

    console.log('✅ Comprehensive congressional database schema initialized');
  }

  /**
   * Fetch comprehensive data for all politicians
   */
  async fetchComprehensiveData(options = {}) {
    const {
      includeVoting = true,
      includeLegislation = true,
      votingStartDate = null,
      legislationStartDate = null,
      congress = 118,
      maxVotesPerPolitician = 100,
      maxLegislationPerPolitician = 50
    } = options;

    console.log('🏛️ Starting comprehensive congressional data fetch...');
    console.log(`📊 Options: Voting: ${includeVoting}, Legislation: ${includeLegislation}`);

    if (!this.apiKey) {
      console.warn('⚠️  No API key found. Limited functionality.');
      console.log('💡 Get a free API key at: https://api.congress.gov/sign-up/');
      return { error: 'No API key available' };
    }

    try {
      // Get all politicians with bioguide IDs
      const politicians = this.db.prepare(`
        SELECT id, name, bio_data 
        FROM politicians 
        WHERE bio_data IS NOT NULL
      `).all();

      console.log(`👥 Found ${politicians.length} politicians to process`);

      let processedCount = 0;
      const results = {
        votingRecords: 0,
        sponsoredLegislation: 0,
        cosponsoredLegislation: 0,
        errors: []
      };

      for (const politician of politicians) {
        try {
          const bioData = JSON.parse(politician.bio_data);
          const bioguideId = bioData.bioguideId;

          if (!bioguideId) {
            console.log(`⚠️  No bioguide ID for ${politician.name}, skipping...`);
            continue;
          }

          console.log(`\n📋 Processing ${politician.name} (${bioguideId})...`);

          // Fetch sponsored legislation
          if (includeLegislation) {
            const sponsored = await this.fetchSponsoredLegislation(
              bioguideId, 
              politician.id, 
              legislationStartDate,
              maxLegislationPerPolitician
            );
            results.sponsoredLegislation += sponsored;

            // Add delay between requests
            await this.delay(this.requestDelay);

            // Fetch cosponsored legislation
            const cosponsored = await this.fetchCosponsoredLegislation(
              bioguideId, 
              politician.id, 
              legislationStartDate,
              maxLegislationPerPolitician
            );
            results.cosponsoredLegislation += cosponsored;

            await this.delay(this.requestDelay);
          }

          processedCount++;
          
          // Progress indicator
          if (processedCount % 10 === 0) {
            console.log(`📊 Processed ${processedCount}/${politicians.length} politicians...`);
          }

          // Rate limiting - extra delay every 20 requests
          if (processedCount % 20 === 0) {
            console.log('⏱️  Rate limiting pause...');
            await this.delay(1000);
          }

        } catch (error) {
          console.error(`❌ Error processing ${politician.name}:`, error.message);
          results.errors.push({
            politician: politician.name,
            error: error.message
          });
        }
      }

      // Calculate alignment scores
      console.log('\n📊 Calculating alignment scores...');
      await this.calculateLegislativeAlignment();

      console.log('\n✅ Comprehensive data fetch complete!');
      console.log(`📊 Results:`);
      console.log(`   - Sponsored legislation: ${results.sponsoredLegislation}`);
      console.log(`   - Cosponsored legislation: ${results.cosponsoredLegislation}`);
      console.log(`   - Errors: ${results.errors.length}`);

      return results;

    } catch (error) {
      console.error('❌ Comprehensive data fetch failed:', error);
      throw error;
    }
  }

  /**
   * Fetch sponsored legislation for a politician
   */
  async fetchSponsoredLegislation(bioguideId, politicianId, startDate = null, limit = 50) {
    try {
      let url = `${this.baseApiUrl}/member/${bioguideId}/sponsored-legislation`;
      const params = new URLSearchParams();
      
      params.append('api_key', this.apiKey);
      params.append('format', 'json');
      params.append('limit', limit.toString());
      
      if (startDate) {
        params.append('fromDateTime', `${startDate}T00:00:00Z`);
      }
      
      url += `?${params.toString()}`;

      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`ℹ️  No sponsored legislation found for ${bioguideId}`);
          return 0;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.sponsoredLegislation) {
        return 0;
      }

      let processedCount = 0;
      
      for (const legislation of data.sponsoredLegislation) {
        await this.storeLegislation(legislation, bioguideId, politicianId, 'sponsor');
        processedCount++;
      }

      console.log(`  ✅ Sponsored: ${processedCount} bills`);
      return processedCount;

    } catch (error) {
      console.error(`❌ Error fetching sponsored legislation for ${bioguideId}:`, error.message);
      return 0;
    }
  }

  /**
   * Fetch cosponsored legislation for a politician
   */
  async fetchCosponsoredLegislation(bioguideId, politicianId, startDate = null, limit = 50) {
    try {
      let url = `${this.baseApiUrl}/member/${bioguideId}/cosponsored-legislation`;
      const params = new URLSearchParams();
      
      params.append('api_key', this.apiKey);
      params.append('format', 'json');
      params.append('limit', limit.toString());
      
      if (startDate) {
        params.append('fromDateTime', `${startDate}T00:00:00Z`);
      }
      
      url += `?${params.toString()}`;

      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`ℹ️  No cosponsored legislation found for ${bioguideId}`);
          return 0;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.cosponsoredLegislation) {
        return 0;
      }

      let processedCount = 0;
      
      for (const legislation of data.cosponsoredLegislation) {
        await this.storeLegislation(legislation, bioguideId, politicianId, 'cosponsor');
        processedCount++;
      }

      console.log(`  ✅ Cosponsored: ${processedCount} bills`);
      return processedCount;

    } catch (error) {
      console.error(`❌ Error fetching cosponsored legislation for ${bioguideId}:`, error.message);
      return 0;
    }
  }

  /**
   * Store legislation in database
   */
  async storeLegislation(legislation, bioguideId, politicianId, relationshipType) {
    try {
      const legislationId = `${legislation.congress}-${legislation.type}-${legislation.number}`;
      
      // Insert or update legislation
      const insertLegislationStmt = this.db.prepare(`
        INSERT OR REPLACE INTO legislation 
        (id, congress, bill_type, bill_number, title, summary, introduced_date, 
         last_action_date, sponsor_bioguide_id, sponsor_name, url, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      insertLegislationStmt.run(
        legislationId,
        legislation.congress,
        legislation.type,
        legislation.number,
        legislation.title || '',
        legislation.summary || '',
        legislation.introducedDate || null,
        legislation.latestAction?.actionDate || null,
        relationshipType === 'sponsor' ? bioguideId : legislation.sponsors?.[0]?.bioguideId || null,
        relationshipType === 'sponsor' ? null : legislation.sponsors?.[0]?.fullName || null,
        legislation.url || ''
      );

      // Insert politician-legislation relationship
      const insertRelationshipStmt = this.db.prepare(`
        INSERT OR REPLACE INTO politician_legislation 
        (politician_id, bioguide_id, legislation_id, relationship_type, date_involved)
        VALUES (?, ?, ?, ?, ?)
      `);

      insertRelationshipStmt.run(
        politicianId,
        bioguideId,
        legislationId,
        relationshipType,
        relationshipType === 'sponsor' ? 
          legislation.introducedDate : 
          legislation.cosponsorshipDate || legislation.introducedDate
      );

    } catch (error) {
      console.error(`❌ Error storing legislation ${legislation.number}:`, error.message);
    }
  }

  /**
   * Calculate legislative alignment between politicians
   */
  async calculateLegislativeAlignment() {
    const politicians = this.db.prepare('SELECT id FROM politicians').all();
    
    console.log(`📊 Calculating alignment for ${politicians.length} politicians...`);

    const updateAlignmentStmt = this.db.prepare(`
      INSERT OR REPLACE INTO legislative_alignment 
      (politician1_id, politician2_id, shared_sponsored, shared_cosponsored, 
       total_alignment_score, last_calculated)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    let calculatedPairs = 0;

    for (let i = 0; i < politicians.length; i++) {
      for (let j = i + 1; j < politicians.length; j++) {
        const pol1 = politicians[i];
        const pol2 = politicians[j];

        // Calculate shared sponsored legislation
        const sharedSponsored = this.db.prepare(`
          SELECT COUNT(*) as count
          FROM politician_legislation pl1
          JOIN politician_legislation pl2 ON pl1.legislation_id = pl2.legislation_id
          WHERE pl1.politician_id = ? AND pl2.politician_id = ?
          AND pl1.relationship_type = 'sponsor' AND pl2.relationship_type = 'sponsor'
        `).get(pol1.id, pol2.id);

        // Calculate shared cosponsored legislation
        const sharedCosponsored = this.db.prepare(`
          SELECT COUNT(*) as count
          FROM politician_legislation pl1
          JOIN politician_legislation pl2 ON pl1.legislation_id = pl2.legislation_id
          WHERE pl1.politician_id = ? AND pl2.politician_id = ?
          AND pl1.relationship_type = 'cosponsor' AND pl2.relationship_type = 'cosponsor'
        `).get(pol1.id, pol2.id);

        // Calculate total alignment score (weighted)
        const alignmentScore = 
          (sharedSponsored.count * 2) + // Sponsoring together is more significant
          (sharedCosponsored.count * 1); // Cosponsoring together

        updateAlignmentStmt.run(
          pol1.id,
          pol2.id,
          sharedSponsored.count,
          sharedCosponsored.count,
          alignmentScore
        );

        calculatedPairs++;
      }
    }

    console.log(`✅ Calculated ${calculatedPairs} alignment pairs`);
  }

  /**
   * Fetch historical voting data with configurable date range
   */
  async fetchHistoricalVotingData(options = {}) {
    const {
      startDate = '2023-01-03', // Start of 118th Congress
      endDate = null,
      limit = null,
      congress = 118
    } = options;

    console.log('🗳️ Fetching historical voting data...');
    console.log(`📅 Date range: ${startDate} to ${endDate || 'present'}`);

    // Use the existing voting records fetcher but with historical dates
    const VotingRecordsFetcher = require('./voting-records-fetcher');
    const votingFetcher = new VotingRecordsFetcher();

    try {
      const result = await votingFetcher.fetchVotingRecords({
        congress,
        chamber: 'house', // Only House votes available in beta API
        startDate,
        endDate,
        limit
      });

      votingFetcher.close();
      return result;

    } catch (error) {
      console.error('❌ Historical voting fetch failed:', error);
      votingFetcher.close();
      throw error;
    }
  }

  /**
   * Get comprehensive statistics
   */
  getComprehensiveStats() {
    const stats = {};

    // Legislation stats
    stats.legislation = this.db.prepare(`
      SELECT 
        COUNT(*) as total_bills,
        COUNT(DISTINCT sponsor_bioguide_id) as unique_sponsors,
        MIN(introduced_date) as earliest_bill,
        MAX(introduced_date) as latest_bill
      FROM legislation
    `).get();

    // Sponsorship stats
    stats.sponsorship = this.db.prepare(`
      SELECT 
        relationship_type,
        COUNT(*) as count,
        COUNT(DISTINCT politician_id) as unique_politicians
      FROM politician_legislation
      GROUP BY relationship_type
    `).all();

    // Top alignments
    stats.topAlignments = this.db.prepare(`
      SELECT 
        p1.name as politician1,
        p2.name as politician2,
        la.total_alignment_score,
        la.shared_sponsored,
        la.shared_cosponsored
      FROM legislative_alignment la
      JOIN politicians p1 ON la.politician1_id = p1.id
      JOIN politicians p2 ON la.politician2_id = p2.id
      WHERE la.total_alignment_score > 0
      ORDER BY la.total_alignment_score DESC
      LIMIT 10
    `).all();

    return stats;
  }

  /**
   * Utility function to add delay between API requests
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

module.exports = ComprehensiveCongressFetcher;

// CLI interface when run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const fetcher = new ComprehensiveCongressFetcher();

  async function runCLI() {
    try {
      const command = args[0] || 'comprehensive';

      switch (command) {
        case 'comprehensive':
          const options = {};
          
          // Parse command line arguments
          for (let i = 1; i < args.length; i++) {
            switch (args[i]) {
              case '--voting-start':
                options.votingStartDate = args[++i];
                break;
              case '--legislation-start':
                options.legislationStartDate = args[++i];
                break;
              case '--no-voting':
                options.includeVoting = false;
                break;
              case '--no-legislation':
                options.includeLegislation = false;
                break;
              case '--max-votes':
                options.maxVotesPerPolitician = parseInt(args[++i]);
                break;
              case '--max-legislation':
                options.maxLegislationPerPolitician = parseInt(args[++i]);
                break;
            }
          }

          await fetcher.fetchComprehensiveData(options);
          break;

        case 'historical-voting':
          const votingOptions = {};
          
          for (let i = 1; i < args.length; i++) {
            switch (args[i]) {
              case '--start-date':
                votingOptions.startDate = args[++i];
                break;
              case '--end-date':
                votingOptions.endDate = args[++i];
                break;
              case '--limit':
                votingOptions.limit = parseInt(args[++i]);
                break;
            }
          }

          await fetcher.fetchHistoricalVotingData(votingOptions);
          break;

        case 'stats':
          const stats = fetcher.getComprehensiveStats();
          console.log('\n📊 Comprehensive Congressional Data Statistics:');
          console.log('─'.repeat(60));
          console.log(`Legislation: ${stats.legislation.total_bills} bills from ${stats.legislation.unique_sponsors} sponsors`);
          console.log(`Date range: ${stats.legislation.earliest_bill || 'N/A'} to ${stats.legislation.latest_bill || 'N/A'}`);
          
          if (stats.sponsorship.length > 0) {
            console.log('\nSponsorship breakdown:');
            stats.sponsorship.forEach(s => {
              console.log(`  ${s.relationship_type}: ${s.count} (${s.unique_politicians} politicians)`);
            });
          }

          if (stats.topAlignments.length > 0) {
            console.log('\nTop legislative alignments:');
            stats.topAlignments.slice(0, 5).forEach((alignment, i) => {
              console.log(`  ${i + 1}. ${alignment.politician1} & ${alignment.politician2}: ${alignment.total_alignment_score} (${alignment.shared_sponsored} sponsored, ${alignment.shared_cosponsored} cosponsored)`);
            });
          }
          break;

        case 'help':
        default:
          console.log(`
📊 Comprehensive Congress Data Fetcher

Usage: node comprehensive-congress-fetcher.js <command> [options]

Commands:
  comprehensive           Fetch comprehensive data (legislation + voting)
  historical-voting       Fetch historical voting data only
  stats                   Show comprehensive statistics
  help                    Show this help message

Comprehensive Options:
  --voting-start <date>       Start date for voting data (YYYY-MM-DD)
  --legislation-start <date>  Start date for legislation data (YYYY-MM-DD)
  --no-voting                 Skip voting records
  --no-legislation            Skip legislation data
  --max-votes <number>        Max votes per politician
  --max-legislation <number>  Max legislation per politician

Historical Voting Options:
  --start-date <date>         Start date (YYYY-MM-DD)
  --end-date <date>           End date (YYYY-MM-DD)
  --limit <number>            Maximum votes to fetch

Examples:
  # Fetch all comprehensive data
  node comprehensive-congress-fetcher.js comprehensive

  # Fetch only recent legislation (last 6 months)
  node comprehensive-congress-fetcher.js comprehensive --voting-start 2025-01-01

  # Fetch historical voting from start of congress
  node comprehensive-congress-fetcher.js historical-voting --start-date 2023-01-03

  # Show current statistics
  node comprehensive-congress-fetcher.js stats
          `);
          break;
      }

    } catch (error) {
      console.error('❌ CLI Error:', error);
      process.exit(1);
    } finally {
      fetcher.close();
    }
  }

  runCLI();
}
