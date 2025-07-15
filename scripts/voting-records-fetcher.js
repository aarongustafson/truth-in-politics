const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Load environment variables
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    
    lines.forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          process.env[key] = value;
        }
      }
    });
    
    console.log('📁 Loaded .env file');
  } else {
    console.log('⚠️  No .env file found');
  }
}

loadEnv();

class VotingRecordsFetcher {
  constructor() {
    this.apiKey = process.env.CONGRESS_GOV_API_KEY;
    this.db = new Database('data/politicians.db');
    this.requestDelay = 250; // Delay between API requests
    this.newVotesProcessed = 0;
    this.newMemberVotesProcessed = 0;
    this.skippedVotes = 0;
    
    if (!this.apiKey) {
      console.error('❌ CONGRESS_GOV_API_KEY not found in environment variables');
      process.exit(1);
    }
    
    this.initDatabase();
  }

  /**
   * Initialize database schema for voting records
   */
  initDatabase() {
    console.log('🗃️ Initializing voting records database schema...');
    
    // The votes and politician_votes tables should already exist
    // Just verify politician_votes table exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS politician_votes (
        vote_id TEXT,
        politician_id INTEGER,
        position TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (vote_id, politician_id),
        FOREIGN KEY (vote_id) REFERENCES votes(id),
        FOREIGN KEY (politician_id) REFERENCES politicians(id)
      )
    `);

    console.log('✅ Voting records database schema initialized');
  }

  /**
   * Check if vote already exists in database
   */
  voteExists(voteId) {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM votes WHERE id = ?`);
    const result = stmt.get(voteId);
    return result.count > 0;
  }

  /**
   * Check if individual member votes exist for a vote
   */
  memberVotesExist(voteId) {
    const stmt = this.db.prepare(`SELECT COUNT(*) as count FROM politician_votes WHERE vote_id = ?`);
    const result = stmt.get(voteId);
    return result.count > 0;
  }

  /**
   * Get a summary of existing data to help with incremental fetching
   */
  getDataSummary() {
    const voteCount = this.db.prepare(`SELECT COUNT(*) as count FROM votes`).get().count;
    const memberVoteCount = this.db.prepare(`SELECT COUNT(*) as count FROM politician_votes`).get().count;
    const votesWithMemberData = this.db.prepare(`SELECT COUNT(DISTINCT vote_id) as count FROM politician_votes`).get().count;
    const votesWithoutMemberData = this.db.prepare(`
      SELECT COUNT(*) as count FROM votes 
      WHERE id NOT IN (SELECT DISTINCT vote_id FROM politician_votes)
      AND chamber = 'house'
    `).get().count;

    return {
      totalVotes: voteCount,
      totalMemberVotes: memberVoteCount,
      votesWithMemberData: votesWithMemberData,
      houseVotesWithoutMemberData: votesWithoutMemberData
    };
  }

  /**
   * Backfill individual member votes for existing house votes that are missing member data
   */
  async backfillMemberVotes(congress = 118) {
    console.log('🔄 Backfilling individual member votes for existing votes...');
    
    // Get house votes that don't have individual member data
    const votesNeedingMemberData = this.db.prepare(`
      SELECT id, congress, session, roll_call_number, question 
      FROM votes 
      WHERE chamber = 'house' 
      AND id NOT IN (SELECT DISTINCT vote_id FROM politician_votes)
      ORDER BY roll_call_number
    `).all();

    console.log(`📊 Found ${votesNeedingMemberData.length} house votes needing individual member data`);

    let processedCount = 0;
    let memberVotesAdded = 0;

    for (const vote of votesNeedingMemberData) {
      try {
        console.log(`🔍 Fetching member votes for ${vote.id}: ${vote.question.substring(0, 50)}...`);
        
        const memberVotesUrl = `https://api.congress.gov/v3/house-vote/${vote.congress}/${vote.session}/${vote.roll_call_number}/members`;
        const url = memberVotesUrl + (this.apiKey ? `?api_key=${this.apiKey}&format=json` : '?format=json');
        
        await this.delay(this.requestDelay);
        
        const response = await fetch(url);
        
        if (!response.ok) {
          console.log(`⚠️  Could not fetch member votes for ${vote.id}: ${response.status}`);
          continue;
        }

        const memberData = await response.json();
        
        if (memberData.houseRollCallVoteMemberVotes && memberData.houseRollCallVoteMemberVotes.results) {
          await this.processHouseMemberVotes(vote.id, memberData.houseRollCallVoteMemberVotes.results);
          const votesAdded = memberData.houseRollCallVoteMemberVotes.results.length;
          memberVotesAdded += votesAdded;
          console.log(`✅ Added ${votesAdded} member votes for ${vote.id}`);
        }
        
        processedCount++;
        
        // Add a small delay to be respectful to the API
        if (processedCount % 10 === 0) {
          console.log(`📊 Progress: ${processedCount}/${votesNeedingMemberData.length} votes processed, ${memberVotesAdded} member votes added`);
        }

      } catch (error) {
        console.error(`❌ Error fetching member votes for ${vote.id}:`, error);
      }
    }

    console.log(`✅ Backfill complete! Processed ${processedCount} votes, added ${memberVotesAdded} individual member votes`);
    
    return {
      votesProcessed: processedCount,
      memberVotesAdded: memberVotesAdded
    };
  }

  /**
   * Get state mapping from abbreviation to full name
   */
  getStateMapping() {
    return {
      'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
      'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
      'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
      'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
      'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
      'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
      'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
      'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
      'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
      'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
      'DC': 'District of Columbia'
    };
  }

  /**
   * Add delay between requests
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch voting records
   */
  async fetchVotingRecords(congress = 118, chamber = 'both') {
    console.log('🗳️ Starting voting records fetch...');
    console.log(`📊 Parameters: Congress ${congress}, Chamber: ${chamber}`);
    
    // Show current data summary
    const summary = this.getDataSummary();
    console.log('📈 Current data summary:');
    console.log(`   • Total votes: ${summary.totalVotes}`);
    console.log(`   • Votes with member data: ${summary.votesWithMemberData}`);
    console.log(`   • House votes missing member data: ${summary.houseVotesWithoutMemberData}`);
    console.log(`   • Total individual member votes: ${summary.totalMemberVotes}`);
    console.log('');

    if (chamber === 'both' || chamber === 'house') {
      await this.fetchHouseVotingRecords(congress);
    }

    if (chamber === 'both' || chamber === 'senate') {
      await this.fetchSenateVotingRecords(congress);
    }

    console.log('📊 Updating voting statistics...');
    await this.updateVotingStatistics();
    console.log('✅ Voting statistics updated');
    console.log('');
  }

  /**
   * Fetch House voting records using beta API
   */
  async fetchHouseVotingRecords(congress) {
    console.log('🏛️ Fetching house voting records...');
    
    try {
      // Use beta API endpoint
      const baseUrl = `https://api.congress.gov/v3/house-vote/${congress}`;
      const url = baseUrl + (this.apiKey ? `?api_key=${this.apiKey}&format=json` : '?format=json');
      
      console.log(`🔗 Fetching from beta endpoint: ${url.replace(this.apiKey, '[API_KEY]')}`);
      
      await this.delay(this.requestDelay);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
        return;
      }

      const data = await response.json();
      console.log(`📊 Raw API response structure: ${JSON.stringify(Object.keys(data))}`);
      
      if (!data.houseRollCallVotes || !Array.isArray(data.houseRollCallVotes)) {
        console.error('❌ Invalid API response structure');
        return;
      }

      console.log(`📥 Found ${data.houseRollCallVotes.length} house votes in API response`);
      
      // Process all house votes
      for (const voteData of data.houseRollCallVotes) {
        await this.processVote(voteData, 'house', congress);
        await this.delay(this.requestDelay);
      }

      console.log(`📥 Found ${data.houseRollCallVotes.length} votes for house`);

    } catch (error) {
      console.error('❌ Error fetching house voting records:', error);
    }
  }

  /**
   * Fetch Senate voting records
   */
  async fetchSenateVotingRecords(congress) {
    console.log('🏛️ Fetching senate voting records...');
    console.log('ℹ️  Senate voting endpoints are not yet available in the Congress.gov API');
    console.log(`📥 Found 0 votes for senate`);
  }

  /**
   * Process individual vote data
   */
  async processVote(voteData, chamber, congress) {
    try {
      const rollCall = voteData.rollCall;
      const session = voteData.session || 1;
      const question = voteData.question || '';
      const description = voteData.description || '';
      const date = voteData.date || '';
      const result = voteData.result || '';
      const url = voteData.url || '';
      
      // Extract vote counts
      const totalYes = voteData.totalYes || 0;
      const totalNo = voteData.totalNo || 0;  
      const totalPresent = voteData.totalPresent || 0;
      const totalNotVoting = voteData.totalNotVoting || 0;

      const voteId = `${congress}-${chamber}-${session}-${rollCall}`;

      // Skip if vote already exists
      if (this.voteExists(voteId)) {
        this.skippedVotes++;
        console.log(`⏭️  Skipping existing vote ${voteId}`);
        
        // Still check if we need individual member votes
        if (chamber === 'house' && !this.memberVotesExist(voteId)) {
          console.log(`🔍 Fetching missing member votes for existing vote ${voteId}`);
          await this.fetchHouseMemberVotes(congress, session, rollCall, voteId);
        }
        return;
      }

      // Skip processing if vote already exists
      if (this.voteExists(voteId)) {
        console.log(`⚠️  Vote ${voteId} already exists, skipping...`);
        return;
      }

      // Insert or update vote record using existing schema
      this.db.prepare(`
        INSERT OR REPLACE INTO votes (
          id, congress, chamber, session, roll_call_number, vote_date, 
          question, description, result, total_yes, total_no, total_present, total_not_voting, url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        voteId,
        congress,
        chamber,
        session,
        rollCall,
        date,
        question,
        description,
        result,
        totalYes,
        totalNo,
        totalPresent,
        totalNotVoting,
        url
      );

      console.log(`✅ Processed vote ${voteId}: ${question.substring(0, 50)}...`);
      this.newVotesProcessed++;

      // Always use beta API for house votes to get individual member votes
      if (chamber === 'house') {
        await this.fetchHouseMemberVotes(congress, session, rollCall, voteId);
      }

    } catch (error) {
      console.error(`❌ Error processing vote ${voteData.rollCall || 'unknown'}:`, error);
    }
  }

  /**
   * Fetch individual House member votes using beta API
   */
  async fetchHouseMemberVotes(congress, session, voteNumber, voteId) {
    try {
      // Skip if we already have member votes for this vote
      if (this.memberVotesExist(voteId)) {
        console.log(`⏭️  Skipping existing member votes for ${voteId}`);
        return;
      }

      const memberVotesUrl = `https://api.congress.gov/v3/house-vote/${congress}/${session}/${voteNumber}/members`;
      const url = memberVotesUrl + (this.apiKey ? `?api_key=${this.apiKey}&format=json` : '?format=json');
      
      await this.delay(this.requestDelay);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.log(`⚠️  Could not fetch member votes for ${voteId}: ${response.status}`);
        return;
      }

      const memberData = await response.json();
      console.log(`📊 Member votes response structure: ${JSON.stringify(Object.keys(memberData))}`);
      
      if (memberData.houseRollCallVoteMemberVotes && memberData.houseRollCallVoteMemberVotes.results) {
        await this.processHouseMemberVotes(voteId, memberData.houseRollCallVoteMemberVotes.results);
        this.newMemberVotesProcessed += memberData.houseRollCallVoteMemberVotes.results.length;
        console.log(`✅ Processed ${memberData.houseRollCallVoteMemberVotes.results.length} member votes for ${voteId}`);
      }

    } catch (error) {
      console.error(`❌ Error fetching member votes for ${voteId}:`, error);
    }
  }

  /**
   * Process individual House member votes from beta API
   */
  async processHouseMemberVotes(voteId, memberVotes) {
    const insertVoteStmt = this.db.prepare(`
      INSERT OR REPLACE INTO politician_votes (vote_id, politician_id, position)
      VALUES (?, ?, ?)
    `);

    for (const memberVote of memberVotes) {
      try {
        const bioguideId = memberVote.bioguideID;
        const firstName = memberVote.firstName;
        const lastName = memberVote.lastName;
        const voteCast = memberVote.voteCast;
        const voteState = memberVote.voteState;

        let politician = null;

        // Try to find by bioguide ID first (most reliable)
        if (bioguideId) {
          politician = this.findPoliticianByBioguideId(bioguideId);
        }

        // If not found by bioguide ID, try name and state matching
        if (!politician && firstName && lastName && voteState) {
          const memberName = `${firstName} ${lastName}`;
          politician = this.findPoliticianByNameAndState(memberName, voteState);
        }

        if (politician) {
          insertVoteStmt.run(voteId, politician.id, voteCast);
        } else {
          console.log(`⚠️  Could not match politician: ${firstName} ${lastName} (${voteState}) - BioguideID: ${bioguideId}`);
        }

      } catch (error) {
        console.error('❌ Error processing member vote:', error);
      }
    }
  }

  /**
   * Find politician in database by name and state
   */
  findPoliticianByNameAndState(name, state) {
    const stateMapping = this.getStateMapping();
    
    // Convert state abbreviation to full name if needed
    const fullStateName = state.length === 2 ? stateMapping[state] : state;
    
    const stmt = this.db.prepare(`
      SELECT * FROM politicians 
      WHERE (LOWER(name) LIKE LOWER(?) OR LOWER(name) LIKE LOWER(?)) AND LOWER(state) = LOWER(?)
      LIMIT 1
    `);

    // Handle different name formats: "John Smith" vs "Smith, John"
    const nameParts = name.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts[nameParts.length - 1];
    
    // Try both "First Last" and "Last, First" formats
    const namePattern1 = `%${name}%`;
    const namePattern2 = `%${lastName}, ${firstName}%`;
    
    // Try with full state name first if we have it
    let politician = null;
    if (fullStateName) {
      politician = stmt.get(namePattern1, namePattern2, fullStateName);
    }
    
    // If not found, try with original state
    if (!politician) {
      politician = stmt.get(namePattern1, namePattern2, state);
    }
    
    if (!politician) {
      // Try just last name match as fallback
      const lastNameStmt = this.db.prepare(`
        SELECT * FROM politicians 
        WHERE LOWER(name) LIKE LOWER(?) AND LOWER(state) = LOWER(?)
        LIMIT 1
      `);
      
      if (fullStateName) {
        politician = lastNameStmt.get(`%${lastName}%`, fullStateName);
      }
      if (!politician) {
        politician = lastNameStmt.get(`%${lastName}%`, state);
      }
    }

    return politician;
  }

  /**
   * Find politician in database by bioguide ID (most reliable method)
   */
  findPoliticianByBioguideId(bioguideId) {
    // Try to find by bioguide ID stored in bio_data JSON
    const stmt = this.db.prepare(`
      SELECT * FROM politicians 
      WHERE json_extract(bio_data, '$.bioguideId') = ?
      LIMIT 1
    `);

    return stmt.get(bioguideId);
  }

  /**
   * Update voting statistics for all politicians
   */
  async updateVotingStatistics() {
    // No need to update politician records as voting_record_count column doesn't exist
    // Statistics can be calculated from politician_votes table when needed
    console.log('ℹ️  Voting statistics will be calculated dynamically from politician_votes table');
  }

  /**
   * Get voting statistics
   */
  getVotingStatistics() {
    const stats = this.db.prepare(`
      SELECT 
        COUNT(DISTINCT vote_id) as total_votes,
        COUNT(DISTINCT politician_id) as politicians_with_votes,
        COUNT(*) as total_individual_votes
      FROM politician_votes
    `).get();

    return stats;
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

// Run if this file is executed directly
if (require.main === module) {
  async function main() {
    const fetcher = new VotingRecordsFetcher();
    
    try {
      // Check if we should run backfill mode
      const args = process.argv.slice(2);
      if (args.includes('--backfill') || args.includes('-b')) {
        console.log('🔄 Running in backfill mode...');
        await fetcher.backfillMemberVotes();
      } else {
        await fetcher.fetchVotingRecords();
      }
      
      const stats = fetcher.getVotingStatistics();
      console.log('✅ Voting records fetch complete!');
      console.log(`📊 Efficiency Summary:`);
      console.log(`   • New votes processed: ${fetcher.newVotesProcessed}`);
      console.log(`   • Votes skipped (already existed): ${fetcher.skippedVotes}`);
      console.log(`   • New individual votes collected: ${fetcher.newMemberVotesProcessed}`);
      console.log(`📊 Current Totals:`);
      console.log(`   • Total votes in database: ${stats.total_votes}`);
      console.log(`   • Politicians with votes: ${stats.politicians_with_votes}`);
      console.log(`   • Total individual votes: ${stats.total_individual_votes}`);
      
    } catch (error) {
      console.error('❌ Error:', error);
    } finally {
      fetcher.close();
    }
  }
  
  main();
}

module.exports = VotingRecordsFetcher;
