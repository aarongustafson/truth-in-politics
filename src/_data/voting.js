// Voting data helper for Eleventy templates
const Database = require('better-sqlite3');
const path = require('path');

class VotingDataHelper {
  constructor() {
    this.db = null;
    this.initializeDb();
  }

  initializeDb() {
    try {
      const possiblePaths = [
        path.join(__dirname, '..', '..', 'data', 'politicians.db'),
        path.join(process.cwd(), 'data', 'politicians.db'),
        path.join(__dirname, '../../data/politicians.db')
      ];
      
      let dbPath = null;
      for (const testPath of possiblePaths) {
        if (require('fs').existsSync(testPath)) {
          dbPath = testPath;
          break;
        }
      }
      
      if (dbPath) {
        this.db = new Database(dbPath, { readonly: true });
      }
    } catch (error) {
      console.warn('Warning: Could not initialize voting database:', error.message);
    }
  }

  getRecentVotesForPolitician(politicianId, limit = 20) {
    if (!this.db) return [];

    try {
      return this.db.prepare(`
        SELECT 
          v.id,
          v.vote_date,
          v.question,
          v.description,
          v.result,
          v.chamber,
          pv.position
        FROM votes v
        JOIN politician_votes pv ON v.id = pv.vote_id
        WHERE pv.politician_id = ?
        ORDER BY v.vote_date DESC, v.roll_call_number DESC
        LIMIT ?
      `).all(politicianId, limit);
    } catch (error) {
      console.warn(`Warning: Could not fetch votes for ${politicianId}:`, error.message);
      return [];
    }
  }

  getVotingStatsForPolitician(politicianId) {
    if (!this.db) return null;

    try {
      return this.db.prepare(`
        SELECT *
        FROM voting_statistics
        WHERE politician_id = ?
      `).get(politicianId);
    } catch (error) {
      console.warn(`Warning: Could not fetch voting stats for ${politicianId}:`, error.message);
      return null;
    }
  }

  getAllRecentVotes(limit = 50) {
    if (!this.db) return [];

    try {
      return this.db.prepare(`
        SELECT 
          v.*,
          COUNT(pv.id) as recorded_votes
        FROM votes v
        LEFT JOIN politician_votes pv ON v.id = pv.vote_id
        GROUP BY v.id
        ORDER BY v.vote_date DESC, v.chamber, v.roll_call_number DESC
        LIMIT ?
      `).all(limit);
    } catch (error) {
      console.warn('Warning: Could not fetch recent votes:', error.message);
      return [];
    }
  }

  getVotesByBill(billId) {
    if (!this.db) return [];

    try {
      return this.db.prepare(`
        SELECT 
          v.*,
          COUNT(pv.id) as recorded_votes
        FROM votes v
        LEFT JOIN politician_votes pv ON v.id = pv.vote_id
        WHERE v.bill_id = ?
        GROUP BY v.id
        ORDER BY v.vote_date DESC
      `).all(billId);
    } catch (error) {
      console.warn(`Warning: Could not fetch votes for bill ${billId}:`, error.message);
      return [];
    }
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Create a singleton instance
const votingHelper = new VotingDataHelper();

// Export functions for use in templates
module.exports = {
  getRecentVotesForPolitician: (politicianId, limit) => 
    votingHelper.getRecentVotesForPolitician(politicianId, limit),
  
  getVotingStatsForPolitician: (politicianId) => 
    votingHelper.getVotingStatsForPolitician(politicianId),
  
  getAllRecentVotes: (limit) => 
    votingHelper.getAllRecentVotes(limit),
  
  getVotesByBill: (billId) => 
    votingHelper.getVotesByBill(billId),

  // Utility function to format vote position
  formatVotePosition: (position) => {
    switch (position?.toLowerCase()) {
      case 'yes': return { text: 'Yes', class: 'vote-yes' };
      case 'no': return { text: 'No', class: 'vote-no' };
      case 'present': return { text: 'Present', class: 'vote-present' };
      case 'not voting': return { text: 'Not Voting', class: 'vote-absent' };
      default: return { text: position || 'Unknown', class: 'vote-unknown' };
    }
  },

  // Calculate voting alignment between two politicians
  calculateAlignment: (politician1Id, politician2Id) => {
    if (!votingHelper.db) return null;

    try {
      const alignment = votingHelper.db.prepare(`
        SELECT 
          COUNT(*) as total_shared_votes,
          SUM(CASE WHEN pv1.position = pv2.position THEN 1 ELSE 0 END) as agreement_count
        FROM politician_votes pv1
        JOIN politician_votes pv2 ON pv1.vote_id = pv2.vote_id
        WHERE pv1.politician_id = ? AND pv2.politician_id = ?
        AND pv1.position IN ('Yes', 'No') AND pv2.position IN ('Yes', 'No')
      `).get(politician1Id, politician2Id);

      if (alignment.total_shared_votes > 0) {
        return {
          totalSharedVotes: alignment.total_shared_votes,
          agreementCount: alignment.agreement_count,
          agreementRate: (alignment.agreement_count / alignment.total_shared_votes) * 100
        };
      }

      return null;
    } catch (error) {
      console.warn('Warning: Could not calculate voting alignment:', error.message);
      return null;
    }
  }
};

// Cleanup on process exit
process.on('exit', () => {
  votingHelper.close();
});
