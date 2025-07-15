#!/usr/bin/env node

/**
 * Script to populate the database with current members of Congress
 * Uses public APIs and data sources to get comprehensive politician information
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const CongressAPIFetcher = require('./congress-api-fetcher');

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

class CongressPopulator {
  constructor() {
    // Initialize database
    const dbPath = path.join(__dirname, '..', 'data', 'politicians.db');
    this.db = new Database(dbPath);
    
    // Initialize API fetcher
    this.apiFetcher = new CongressAPIFetcher();
    
    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Create tables if they don't exist
    this.initializeTables();
    
    this.baseApiUrl = 'https://api.congress.gov/v3';
    this.apiKey = process.env.CONGRESS_GOV_API_KEY; // Optional API key for higher rate limits
  }

  initializeTables() {
    // Use the same table structure as our PoliticianDatabase class
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

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_politicians_name ON politicians (name);
      CREATE INDEX IF NOT EXISTS idx_politicians_state ON politicians (state);
      CREATE INDEX IF NOT EXISTS idx_politicians_chamber ON politicians (chamber);
    `);
  }

  /**
   * Main function to populate Congress data
   */
  async populateAllMembers() {
    console.log('🏛️ Starting to populate Congress database...');
    
    if (process.env.CONGRESS_GOV_API_KEY) {
      console.log('🔑 Using Congress.gov API key for real-time data');
    } else {
      console.log('⚠️  No API key found. Will try without key (limited requests) then fall back to sample data');
      console.log('💡 Get a free API key at: https://api.congress.gov/sign-up/');
    }
    
    try {
      // Try to fetch from Congress.gov API first
      console.log('📊 Fetching House members from Congress.gov...');
      let houseMembers = await this.apiFetcher.fetchHouseMembersFromAPI();
      if (!houseMembers) {
        console.log('� Using sample House data...');
        houseMembers = await this.fetchHouseMembers();
      } else {
        console.log(`✅ Fetched ${houseMembers.length} House members from API`);
      }
      
      console.log('🏛️ Fetching Senate members...');
      let senateMembers = await this.apiFetcher.fetchSenateMembersFromAPI();
      if (!senateMembers) {
        console.log('📝 Using verified sample Senate data (20 members)...');
        senateMembers = await this.fetchSenateMembers();
      } else {
        console.log(`✅ Fetched ${senateMembers.length} Senate members from API`);
      }
      
      const allMembers = [...houseMembers, ...senateMembers];
      console.log(`📝 Found ${allMembers.length} total members (${houseMembers.length} House, ${senateMembers.length} Senate)`);
      
      // Save data for backup
      this.apiFetcher.saveToFile({
        house: houseMembers,
        senate: senateMembers,
        timestamp: new Date().toISOString(),
        note: houseMembers[0]?.api_source ? 'Real API data from Congress.gov' : 'Sample data - not complete congressional roster'
      }, 'congress-members-backup.json');
      
      // Insert members into database
      let inserted = 0;
      let updated = 0;
      
      for (const member of allMembers) {
        try {
          const result = this.insertPolitician(member);
          if (result.changes > 0) {
            if (this.db.prepare('SELECT COUNT(*) as count FROM politicians WHERE id = ?').get(member.id).count === 1) {
              updated++;
            } else {
              inserted++;
            }
          }
        } catch (error) {
          console.error(`❌ Error inserting ${member.name}:`, error.message);
        }
      }
      
      console.log(`✅ Database updated successfully!`);
      console.log(`   📈 Inserted: ${inserted} new members`);
      console.log(`   🔄 Updated: ${updated} existing members`);
      console.log(`   📊 Total in database: ${allMembers.length} members`);
      
      if (houseMembers[0]?.api_source === 'congress.gov') {
        console.log(`   🎉 Real-time data from Congress.gov API!`);
        console.log(`   📊 ${houseMembers.length} House Representatives + ${senateMembers.length} Senators`);
      } else {
        console.log(`   ⚠️  Note: This is verified sample data, not the complete 535 members of Congress`);
      }
      
    } catch (error) {
      console.error('❌ Error populating Congress data:', error);
      throw error;
    }
  }

  /**
   * Fetch current House members
   */
  async fetchHouseMembers(congress = 118) {
    console.log('🔍 Fetching House of Representatives data...');
    
    // Verified current House members (as of 2024-2025)
    // Note: This is a curated sample. For production, use Congress.gov API
    const houseMembers = [
      // House Leadership (verified current positions)
      {
        name: 'Mike Johnson',
        party: 'Republican',
        state: 'LA',
        district: '4th District',
        first_elected: 2016,
        website: 'https://mikejohnson.house.gov'
      },
      {
        name: 'Hakeem Jeffries',
        party: 'Democratic',
        state: 'NY',
        district: '8th District',
        first_elected: 2012,
        website: 'https://jeffries.house.gov'
      },
      {
        name: 'Steve Scalise',
        party: 'Republican',
        state: 'LA',
        district: '1st District',
        first_elected: 2008,
        website: 'https://scalise.house.gov'
      },
      {
        name: 'Katherine Clark',
        party: 'Democratic',
        state: 'MA',
        district: '5th District',
        first_elected: 2013,
        website: 'https://katherineclark.house.gov'
      },
      // Notable current members (verified)
      {
        name: 'Alexandria Ocasio-Cortez',
        party: 'Democratic',
        state: 'NY',
        district: '14th District',
        first_elected: 2018,
        website: 'https://ocasio-cortez.house.gov'
      },
      {
        name: 'Nancy Pelosi',
        party: 'Democratic',
        state: 'CA',
        district: '5th District',
        first_elected: 1987,
        website: 'https://pelosi.house.gov'
      },
      {
        name: 'Jim Jordan',
        party: 'Republican',
        state: 'OH',
        district: '4th District',
        first_elected: 2006,
        website: 'https://jordan.house.gov'
      },
      {
        name: 'Adam Schiff',
        party: 'Democratic',
        state: 'CA',
        district: '30th District',
        first_elected: 2000,
        website: 'https://schiff.house.gov'
      },
      {
        name: 'Ilhan Omar',
        party: 'Democratic',
        state: 'MN',
        district: '5th District',
        first_elected: 2018,
        website: 'https://omar.house.gov'
      },
      {
        name: 'Rashida Tlaib',
        party: 'Democratic',
        state: 'MI',
        district: '12th District',
        first_elected: 2018,
        website: 'https://tlaib.house.gov'
      },
      {
        name: 'Ayanna Pressley',
        party: 'Democratic',
        state: 'MA',
        district: '7th District',
        first_elected: 2018,
        website: 'https://pressley.house.gov'
      },
      {
        name: 'Maxine Waters',
        party: 'Democratic',
        state: 'CA',
        district: '43rd District',
        first_elected: 1990,
        website: 'https://waters.house.gov'
      }
    ];

    return houseMembers.map(member => ({
      ...member,
      chamber: 'House',
      title: 'Representative',
      id: this.generateId(member.name, 'house')
    }));
  }

  /**
   * Fetch current Senate members
   */
  async fetchSenateMembers(congress = 118) {
    console.log('🔍 Fetching Senate data...');
    
    // Verified current senators (as of 2024-2025)
    // Note: This is a curated sample. For production, use Congress.gov API
    const senateMembers = [
      // Leadership (verified)
      {
        name: 'Chuck Schumer',
        party: 'Democratic',
        state: 'NY',
        first_elected: 1998,
        website: 'https://www.schumer.senate.gov'
      },
      {
        name: 'Mitch McConnell',
        party: 'Republican',
        state: 'KY',
        first_elected: 1984,
        website: 'https://www.mcconnell.senate.gov'
      },
      // Progressive wing
      {
        name: 'Bernie Sanders',
        party: 'Independent',
        state: 'VT',
        first_elected: 2006,
        website: 'https://www.sanders.senate.gov'
      },
      {
        name: 'Elizabeth Warren',
        party: 'Democratic',
        state: 'MA',
        first_elected: 2012,
        website: 'https://www.warren.senate.gov'
      },
      {
        name: 'Ed Markey',
        party: 'Democratic',
        state: 'MA',
        first_elected: 2013,
        website: 'https://www.markey.senate.gov'
      },
      // Conservative wing
      {
        name: 'Ted Cruz',
        party: 'Republican',
        state: 'TX',
        first_elected: 2012,
        website: 'https://www.cruz.senate.gov'
      },
      {
        name: 'Josh Hawley',
        party: 'Republican',
        state: 'MO',
        first_elected: 2018,
        website: 'https://www.hawley.senate.gov'
      },
      {
        name: 'Tom Cotton',
        party: 'Republican',
        state: 'AR',
        first_elected: 2014,
        website: 'https://www.cotton.senate.gov'
      },
      // Moderate/swing votes
      {
        name: 'Joe Manchin',
        party: 'Democratic',
        state: 'WV',
        first_elected: 2010,
        website: 'https://www.manchin.senate.gov'
      },
      {
        name: 'Kyrsten Sinema',
        party: 'Independent',
        state: 'AZ',
        first_elected: 2018,
        website: 'https://www.sinema.senate.gov'
      },
      {
        name: 'Susan Collins',
        party: 'Republican',
        state: 'ME',
        first_elected: 1996,
        website: 'https://www.collins.senate.gov'
      },
      {
        name: 'Lisa Murkowski',
        party: 'Republican',
        state: 'AK',
        first_elected: 2002,
        website: 'https://www.murkowski.senate.gov'
      },
      // Other notable senators (verified current)
      {
        name: 'Marco Rubio',
        party: 'Republican',
        state: 'FL',
        first_elected: 2010,
        website: 'https://www.rubio.senate.gov'
      },
      {
        name: 'Amy Klobuchar',
        party: 'Democratic',
        state: 'MN',
        first_elected: 2006,
        website: 'https://www.klobuchar.senate.gov'
      },
      {
        name: 'John Cornyn',
        party: 'Republican',
        state: 'TX',
        first_elected: 2002,
        website: 'https://www.cornyn.senate.gov'
      },
      {
        name: 'Kirsten Gillibrand',
        party: 'Democratic',
        state: 'NY',
        first_elected: 2009,
        website: 'https://www.gillibrand.senate.gov'
      },
      {
        name: 'Raphael Warnock',
        party: 'Democratic',
        state: 'GA',
        first_elected: 2021,
        website: 'https://www.warnock.senate.gov'
      },
      {
        name: 'Jon Ossoff',
        party: 'Democratic',
        state: 'GA',
        first_elected: 2021,
        website: 'https://www.ossoff.senate.gov'
      },
      {
        name: 'Cory Booker',
        party: 'Democratic',
        state: 'NJ',
        first_elected: 2013,
        website: 'https://www.booker.senate.gov'
      },
      {
        name: 'Tim Scott',
        party: 'Republican',
        state: 'SC',
        first_elected: 2013,
        website: 'https://www.scott.senate.gov'
      }
    ];

    return senateMembers.map(member => ({
      ...member,
      chamber: 'Senate',
      title: 'Senator',
      district: null,
      id: this.generateId(member.name, 'senate')
    }));
  }

  /**
   * Generate a unique ID for a politician
   */
  generateId(name, chamber) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Insert a politician into the database
   */
  insertPolitician(politician) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO politicians 
      (id, name, party, state, chamber, district, title, first_elected, website, bio_data, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const bioData = {
      fullName: politician.name,
      chamber: politician.chamber,
      party: politician.party,
      state: politician.state,
      district: politician.district,
      yearFirstElected: politician.first_elected,
      officialWebsite: politician.website,
      bioguideId: politician.bioguide_id || null
    };

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
      JSON.stringify(bioData)
    );
  }

  /**
   * Add sample policy positions for testing
   */
  async addSamplePolicyPositions() {
    console.log('📋 Adding sample policy positions...');
    
    const policyCategories = [
      'Healthcare',
      'Climate Change',
      'Immigration',
      'Economy',
      'Education',
      'Gun Policy',
      'Foreign Policy',
      'Infrastructure'
    ];

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO policy_positions 
      (politician_id, category, stated_position, alignment_score, source_url)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Get all politicians
    const politicians = this.db.prepare('SELECT id, name, party FROM politicians').all();
    
    let positionsAdded = 0;
    
    for (const politician of politicians) {
      // Add 2-3 random policy positions per politician
      const numPositions = Math.floor(Math.random() * 2) + 2;
      const selectedCategories = this.shuffleArray(policyCategories).slice(0, numPositions);
      
      for (const category of selectedCategories) {
        const position = this.generateSamplePosition(politician, category);
        try {
          stmt.run(
            politician.id,
            category,
            position.statement,
            position.score,
            position.sourceUrl
          );
          positionsAdded++;
        } catch (error) {
          console.error(`Error adding position for ${politician.name}:`, error.message);
        }
      }
    }
    
    console.log(`✅ Added ${positionsAdded} sample policy positions`);
  }

  /**
   * Generate a sample policy position based on party affiliation
   */
  generateSamplePosition(politician, category) {
    const partyPositions = {
      'Healthcare': {
        'Democratic': 'Supports universal healthcare coverage and strengthening the Affordable Care Act',
        'Republican': 'Advocates for market-based healthcare solutions and reducing government involvement',
        'Independent': 'Supports Medicare for All and comprehensive healthcare reform'
      },
      'Climate Change': {
        'Democratic': 'Supports aggressive climate action and clean energy transition',
        'Republican': 'Focuses on energy independence and market-based environmental solutions',
        'Independent': 'Advocates for the Green New Deal and immediate climate action'
      },
      'Immigration': {
        'Democratic': 'Supports comprehensive immigration reform and pathway to citizenship',
        'Republican': 'Advocates for border security and merit-based immigration system',
        'Independent': 'Supports humane immigration policies and worker protections'
      }
      // Add more categories as needed
    };

    const statement = partyPositions[category]?.[politician.party] || 
                     `Stated position on ${category} based on ${politician.party} platform`;
    
    return {
      statement,
      score: Math.floor(Math.random() * 30) + 70, // Random score between 70-100
      sourceUrl: politician.website || `https://www.congress.gov`
    };
  }

  /**
   * Utility function to shuffle an array
   */
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

// Main execution
async function main() {
  const populator = new CongressPopulator();
  
  try {
    await populator.populateAllMembers();
    await populator.addSamplePolicyPositions();
    
    console.log('\n🎉 Congressional database population complete!');
    console.log('📍 Database location: data/politicians.db');
    console.log('🔍 You can now search for any of the added politicians');
    
  } catch (error) {
    console.error('❌ Failed to populate database:', error);
    process.exit(1);
  } finally {
    populator.close();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = CongressPopulator;
