#!/usr/bin/env node

/**
 * Enhanced Congress data fetcher with real API integration
 * This script can fetch live data from Congress.gov and other official sources
 */

const https = require('https');
const fs = require('fs');

class CongressAPIFetcher {
  constructor() {
    this.sources = {
      // Congress.gov API (official government API)
      congress: {
        baseUrl: 'https://api.congress.gov/v3',
        headers: {
          'accept': 'application/json'
        }
      }
    };
    
    // Use API key if available (required for higher rate limits)
    this.apiKey = process.env.CONGRESS_GOV_API_KEY || null;
  }

  /**
   * Fetch data from a URL with proper error handling and retries
   */
  async fetchData(url, options = {}) {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🌐 Fetching: ${url} (attempt ${attempt}/${maxRetries})`);
        
        return await new Promise((resolve, reject) => {
          const req = https.get(url, options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
              data += chunk;
            });
            
            res.on('end', () => {
              if (res.statusCode === 200) {
                try {
                  const parsed = JSON.parse(data);
                  resolve(parsed);
                } catch (error) {
                  reject(new Error(`Failed to parse JSON: ${error.message}`));
                }
              } else if (res.statusCode === 429) {
                reject(new Error('Rate limited - need API key for higher limits'));
              } else {
                reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
              }
            });
          });
          
          req.on('error', (error) => {
            reject(error);
          });
          
          req.setTimeout(15000, () => {
            req.abort();
            reject(new Error('Request timeout'));
          });
        });
        
      } catch (error) {
        lastError = error;
        console.log(`⚠️  Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
          // Wait before retrying (exponential backoff)
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Fetch current House members from Congress.gov API
   */
  async fetchHouseMembersFromAPI() {
    try {
      // Use cached data if available, otherwise fetch all members with pagination
      let allMembers = this.cachedAllMembers;
      if (!allMembers) {
        allMembers = await this.fetchAllMembersFromAPI();
        if (!allMembers) return null;
        this.cachedAllMembers = allMembers;
      }
      
      // Filter for House members only - House members have district numbers
      const houseMembers = allMembers.filter(member => 
        member.district && member.district > 0
      );
      
      console.log(`✅ Found ${houseMembers.length} House members (from ${allMembers.length} total)`);
      
      return houseMembers.map(member => ({
          name: `${member.name}`,
          party: this.normalizeParty(member.partyName),
          state: member.state,
          district: member.district ? `${this.getOrdinalNumber(member.district)} District` : null,
          first_elected: this.extractFirstElected(member),
          website: this.buildWebsiteUrl(member, 'house'),
          chamber: 'House',
          title: 'Representative',
          id: this.generateId(`${member.name}`, 'house'),
          bioguide_id: member.bioguideId,
          api_source: 'congress.gov'
        }));
      
    } catch (error) {
      console.error('❌ Error fetching House data from Congress.gov:', error.message);
      return null;
    }
  }

  /**
   * Fetch current Senate members from Congress.gov API
   */
  async fetchSenateMembersFromAPI() {
    try {
      // Since we already fetched all members for House, reuse that data if available
      if (this.cachedAllMembers) {
        const senateMembers = this.cachedAllMembers.filter(member => 
          !member.district || member.district === 0 || member.district === null
        );
        
        console.log(`✅ Found ${senateMembers.length} Senate members (from cached data)`);
        
        return senateMembers.map(member => ({
          name: `${member.name}`,
          party: this.normalizeParty(member.partyName),
          state: member.state,
          district: null,
          first_elected: this.extractFirstElected(member),
          website: this.buildWebsiteUrl(member, 'senate'),
          chamber: 'Senate',
          title: 'Senator',
          id: this.generateId(`${member.name}`, 'senate'),
          bioguide_id: member.bioguideId,
          api_source: 'congress.gov'
        }));
      }
      
      const currentCongress = 118; // 118th Congress (2023-2025)
      let url = `${this.sources.congress.baseUrl}/member/congress/${currentCongress}?format=json&limit=600`;
      
      // Add API key as query parameter if available
      if (this.apiKey) {
        url += `&api_key=${this.apiKey}`;
      }
      
      const options = { headers: this.sources.congress.headers };
      
      console.log('🏛️ Fetching Senate data from Congress.gov API...');
      const response = await this.fetchData(url, options);
      
      if (response.members && Array.isArray(response.members)) {
        // Filter for Senate members only - Senate members don't have district numbers
        const senateMembers = response.members.filter(member => 
          !member.district || member.district === 0 || member.district === null
        );
        
        console.log(`✅ Found ${senateMembers.length} Senate members (from ${response.members.length} total)`);
        
        return senateMembers.map(member => ({
          name: `${member.name}`,
          party: this.normalizeParty(member.partyName),
          state: member.state,
          district: null,
          first_elected: this.extractFirstElected(member),
          website: this.buildWebsiteUrl(member, 'senate'),
          chamber: 'Senate',
          title: 'Senator',
          id: this.generateId(`${member.name}`, 'senate'),
          bioguide_id: member.bioguideId,
          api_source: 'congress.gov'
        }));
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error fetching Senate data from Congress.gov:', error.message);
      if (error.message.includes('Rate limited')) {
        console.log('💡 Get a free API key at: https://api.congress.gov/sign-up/');
      }
      return null;
    }
  }

  /**
   * Fetch all members with pagination support
   */
  async fetchAllMembersFromAPI() {
    try {
      const currentCongress = 118;
      const allMembers = [];
      let offset = 0;
      const limit = 250; // Reasonable batch size
      
      console.log('🏛️ Fetching all Congress members from Congress.gov API...');
      
      while (true) {
        let url = `${this.sources.congress.baseUrl}/member/congress/${currentCongress}?format=json&limit=${limit}&offset=${offset}`;
        
        if (this.apiKey) {
          url += `&api_key=${this.apiKey}`;
        }
        
        console.log(`🌐 Fetching batch: offset ${offset}, limit ${limit}...`);
        const response = await this.fetchData(url, { headers: this.sources.congress.headers });
        
        if (response.members && Array.isArray(response.members)) {
          allMembers.push(...response.members);
          console.log(`   📊 Got ${response.members.length} members (total so far: ${allMembers.length})`);
          
          // Check if we have more data to fetch
          if (response.pagination && response.pagination.next) {
            offset += limit;
            // Add a small delay to be respectful to the API
            await new Promise(resolve => setTimeout(resolve, 500));
          } else {
            console.log(`✅ Fetched all ${allMembers.length} members from Congress.gov API`);
            break;
          }
        } else {
          console.log('❌ No members found in response');
          break;
        }
        
        // Safety check to prevent infinite loops
        if (allMembers.length > 1000) {
          console.log('⚠️  Safety limit reached, stopping fetch');
          break;
        }
      }
      
      return allMembers;
      
    } catch (error) {
      console.error('❌ Error fetching all members from Congress.gov:', error.message);
      return null;
    }
  }

  /**
   * Extract first elected year from member data
   */
  extractFirstElected(member) {
    // Try to get from terms if available
    if (member.terms && Array.isArray(member.terms) && member.terms.length > 0) {
      const firstTerm = member.terms.sort((a, b) => new Date(a.startYear) - new Date(b.startYear))[0];
      return parseInt(firstTerm.startYear);
    }
    
    // Fallback to served data if available
    if (member.served && member.served.House && Array.isArray(member.served.House)) {
      const firstHouse = member.served.House.sort((a, b) => parseInt(a.start) - parseInt(b.start))[0];
      return parseInt(firstHouse.start);
    }
    
    if (member.served && member.served.Senate && Array.isArray(member.served.Senate)) {
      const firstSenate = member.served.Senate.sort((a, b) => parseInt(a.start) - parseInt(b.start))[0];
      return parseInt(firstSenate.start);
    }
    
    return null;
  }

  /**
   * Build official website URL
   */
  buildWebsiteUrl(member, chamber) {
    if (member.url) {
      return member.url;
    }
    
    // Construct standard URLs
    const lastName = member.name.split(' ').pop().toLowerCase();
    
    if (chamber === 'house') {
      return `https://${lastName}.house.gov`;
    } else {
      return `https://www.${lastName}.senate.gov`;
    }
  }

  /**
   * Normalize party names
   */
  normalizeParty(party) {
    if (!party) return 'Unknown';
    
    const partyMap = {
      'Democratic': 'Democratic',
      'Republican': 'Republican', 
      'Independent': 'Independent',
      'D': 'Democratic',
      'R': 'Republican',
      'I': 'Independent',
      'ID': 'Independent'
    };
    
    return partyMap[party] || party;
  }

  /**
   * Get ordinal number (1st, 2nd, 3rd, etc.)
   */
  getOrdinalNumber(num) {
    const number = parseInt(num);
    if (isNaN(number)) return num;
    
    const j = number % 10;
    const k = number % 100;
    
    if (j === 1 && k !== 11) return `${number}st`;
    if (j === 2 && k !== 12) return `${number}nd`;
    if (j === 3 && k !== 13) return `${number}rd`;
    return `${number}th`;
  }

  /**
   * Generate ID from name
   */
  generateId(name, chamber) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Save data to JSON file for backup
   */
  saveToFile(data, filename) {
    try {
      const path = require('path');
      const dataDir = path.join(__dirname, '..', 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      const filepath = path.join(dataDir, filename);
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      console.log(`💾 Data saved to ${filepath}`);
    } catch (error) {
      console.error(`❌ Failed to save backup file: ${error.message}`);
    }
  }
}

module.exports = CongressAPIFetcher;
