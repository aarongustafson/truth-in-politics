#!/usr/bin/env node

/**
 * Build-time Data Updater
 * Integrates with your build process to update voting records
 * before generating the static site
 */

const PeriodicVotingUpdater = require('./periodic-voting-updater');
const CongressPopulator = require('./populate-congress');
const path = require('path');
const fs = require('fs');

class BuildTimeUpdater {
  constructor() {
    this.votingUpdater = new PeriodicVotingUpdater();
    this.congressPopulator = new CongressPopulator();
  }

  /**
   * Run complete build-time data update
   */
  async runBuildUpdate(options = {}) {
    const {
      skipVotingRecords = false,
      skipCongressUpdate = false,
      maxVotingAge = 7, // Days
      force = false
    } = options;

    console.log('🏗️ Starting build-time data update...');
    console.log('─'.repeat(60));

    const results = {
      congressUpdate: null,
      votingUpdate: null,
      errors: []
    };

    try {
      // 1. Update congressional membership if needed
      if (!skipCongressUpdate) {
        console.log('\n1️⃣ Checking congressional membership data...');
        try {
          const congressResult = await this.updateCongressionalData(force);
          results.congressUpdate = congressResult;
        } catch (error) {
          console.error('❌ Congressional update failed:', error.message);
          results.errors.push({ type: 'congress', error: error.message });
        }
      }

      // 2. Update voting records
      if (!skipVotingRecords) {
        console.log('\n2️⃣ Updating voting records...');
        try {
          const votingResult = await this.votingUpdater.runPeriodicUpdate({
            force,
            maxAge: maxVotingAge
          });
          results.votingUpdate = votingResult;
        } catch (error) {
          console.error('❌ Voting records update failed:', error.message);
          results.errors.push({ type: 'voting', error: error.message });
        }
      }

      // 3. Generate data files for Eleventy
      console.log('\n3️⃣ Generating data files for static site...');
      try {
        await this.generateDataFiles();
        console.log('✅ Data files generated successfully');
      } catch (error) {
        console.error('❌ Data file generation failed:', error.message);
        results.errors.push({ type: 'data-generation', error: error.message });
      }

      // 4. Summary
      console.log('\n📊 Build Update Summary:');
      console.log('─'.repeat(40));
      
      if (results.congressUpdate) {
        if (results.congressUpdate.skipped) {
          console.log(`👥 Congress: ${results.congressUpdate.reason}`);
        } else {
          console.log(`👥 Congress: Updated successfully`);
        }
      }
      
      if (results.votingUpdate) {
        if (results.votingUpdate.skipped) {
          console.log(`🗳️  Voting: ${results.votingUpdate.reason}`);
        } else {
          console.log(`🗳️  Voting: ${results.votingUpdate.totalVotes || 0} votes processed`);
        }
      }

      if (results.errors.length > 0) {
        console.log(`⚠️  Errors: ${results.errors.length} components failed`);
        results.errors.forEach(err => {
          console.log(`   - ${err.type}: ${err.error}`);
        });
      } else {
        console.log('✅ All updates completed successfully');
      }

      return results;

    } catch (error) {
      console.error('❌ Build update failed:', error);
      throw error;
    } finally {
      // Cleanup
      if (this.votingUpdater.fetcher) {
        this.votingUpdater.fetcher.close();
      }
      if (this.congressPopulator.db) {
        this.congressPopulator.close();
      }
    }
  }

  /**
   * Update congressional membership data
   */
  async updateCongressionalData(force = false) {
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, '..', 'data', 'politicians.db');
    
    if (!force && fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
      
      if (ageInDays < 7) {
        return {
          skipped: true,
          reason: `Congressional data is ${Math.round(ageInDays)} days old, no update needed`
        };
      }
    }

    console.log('🔄 Updating congressional membership...');
    await this.congressPopulator.populateAllMembers();
    
    return { updated: true };
  }

  /**
   * Generate data files for Eleventy build
   */
  async generateDataFiles() {
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, '..', 'data', 'politicians.db');
    const dataDir = path.join(__dirname, '..', 'src', '_data');
    
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const db = new Database(dbPath);

    try {
      // Generate politicians data
      await this.generatePoliticiansData(db, dataDir);
      
      // Generate voting statistics
      await this.generateVotingStatistics(db, dataDir);
      
      // Generate recent votes data
      await this.generateRecentVotesData(db, dataDir);

    } finally {
      db.close();
    }
  }

  /**
   * Generate politicians data file
   */
  async generatePoliticiansData(db, dataDir) {
    console.log('📄 Generating politicians.js...');
    
    const politicians = db.prepare(`
      SELECT p.*, vs.participation_rate, vs.total_votes
      FROM politicians p
      LEFT JOIN voting_statistics vs ON p.id = vs.politician_id
      ORDER BY p.name
    `).all();

    // Transform for Eleventy
    const politiciansData = politicians.map(p => ({
      ...p,
      slug: p.id,
      bio_data: p.bio_data ? JSON.parse(p.bio_data) : null
    }));

    const jsContent = `// Auto-generated by build-time-updater.js
// Last updated: ${new Date().toISOString()}

module.exports = ${JSON.stringify(politiciansData, null, 2)};
`;

    fs.writeFileSync(path.join(dataDir, 'politicians.js'), jsContent);
    console.log(`✅ Generated politicians.js with ${politiciansData.length} entries`);
  }

  /**
   * Generate voting statistics
   */
  async generateVotingStatistics(db, dataDir) {
    console.log('📊 Generating voting-stats.js...');
    
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_votes,
        MIN(vote_date) as earliest_vote,
        MAX(vote_date) as latest_vote,
        COUNT(DISTINCT DATE(vote_date)) as voting_days
      FROM votes
    `).get();

    const politicianStats = db.prepare(`
      SELECT 
        COUNT(DISTINCT vs.politician_id) as politicians_with_votes,
        AVG(vs.participation_rate) as avg_participation_rate
      FROM voting_statistics vs
      WHERE vs.total_votes > 0
    `).get();

    const chamberStats = db.prepare(`
      SELECT 
        chamber,
        COUNT(*) as vote_count,
        AVG(total_yes + total_no + total_present + total_not_voting) as avg_participation
      FROM votes
      GROUP BY chamber
    `).all();

    const votingStats = {
      overview: {
        ...stats,
        politiciansWithVotes: politicianStats.politicians_with_votes || 0,
        avgParticipationRate: politicianStats.avg_participation_rate || 0
      },
      byChamber: chamberStats,
      lastUpdated: new Date().toISOString()
    };

    const jsContent = `// Auto-generated voting statistics
// Last updated: ${new Date().toISOString()}

module.exports = ${JSON.stringify(votingStats, null, 2)};
`;

    fs.writeFileSync(path.join(dataDir, 'voting-stats.js'), jsContent);
    console.log('✅ Generated voting-stats.js');
  }

  /**
   * Generate recent votes data
   */
  async generateRecentVotesData(db, dataDir) {
    console.log('🗳️ Generating recent-votes.js...');
    
    const recentVotes = db.prepare(`
      SELECT 
        v.*,
        COUNT(pv.id) as recorded_politician_votes
      FROM votes v
      LEFT JOIN politician_votes pv ON v.id = pv.vote_id
      GROUP BY v.id
      ORDER BY v.vote_date DESC, v.chamber, v.roll_call_number DESC
      LIMIT 50
    `).all();

    const jsContent = `// Auto-generated recent votes data
// Last updated: ${new Date().toISOString()}

module.exports = ${JSON.stringify(recentVotes, null, 2)};
`;

    fs.writeFileSync(path.join(dataDir, 'recent-votes.js'), jsContent);
    console.log(`✅ Generated recent-votes.js with ${recentVotes.length} votes`);
  }

  /**
   * Get build update status
   */
  async getBuildStatus() {
    const status = this.votingUpdater.getUpdateStatus();
    
    // Add build-specific information
    const buildInfo = {
      dataFilesExist: {
        politicians: fs.existsSync(path.join(__dirname, '..', 'src', '_data', 'politicians.js')),
        votingStats: fs.existsSync(path.join(__dirname, '..', 'src', '_data', 'voting-stats.js')),
        recentVotes: fs.existsSync(path.join(__dirname, '..', 'src', '_data', 'recent-votes.js'))
      },
      databaseAge: this.getDatabaseAge(),
      lastBuildUpdate: this.getLastBuildUpdate()
    };

    return { ...status, build: buildInfo };
  }

  /**
   * Get database age in days
   */
  getDatabaseAge() {
    const dbPath = path.join(__dirname, '..', 'data', 'politicians.db');
    
    if (!fs.existsSync(dbPath)) {
      return null;
    }

    const stats = fs.statSync(dbPath);
    return (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
  }

  /**
   * Get last build update timestamp
   */
  getLastBuildUpdate() {
    const flagFile = path.join(__dirname, '..', 'data', 'last-build-update.txt');
    
    if (!fs.existsSync(flagFile)) {
      return null;
    }

    try {
      return fs.readFileSync(flagFile, 'utf8').trim();
    } catch {
      return null;
    }
  }

  /**
   * Mark build update completion
   */
  markBuildComplete() {
    const flagFile = path.join(__dirname, '..', 'data', 'last-build-update.txt');
    fs.writeFileSync(flagFile, new Date().toISOString());
  }
}

module.exports = BuildTimeUpdater;

// CLI interface when run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const updater = new BuildTimeUpdater();

  async function runCLI() {
    try {
      const command = args[0] || 'update';

      switch (command) {
        case 'update':
          const options = {};
          
          // Parse options
          for (let i = 1; i < args.length; i++) {
            switch (args[i]) {
              case '--force':
                options.force = true;
                break;
              case '--skip-voting':
                options.skipVotingRecords = true;
                break;
              case '--skip-congress':
                options.skipCongressUpdate = true;
                break;
              case '--max-voting-age':
                options.maxVotingAge = parseInt(args[++i]);
                break;
            }
          }

          const result = await updater.runBuildUpdate(options);
          
          if (result.errors.length === 0) {
            updater.markBuildComplete();
            console.log('\n🎉 Build update completed successfully!');
            process.exit(0);
          } else {
            console.log('\n⚠️  Build update completed with errors');
            process.exit(1);
          }
          break;

        case 'status':
          const status = await updater.getBuildStatus();
          console.log('\n🏗️ Build Status:');
          console.log('─'.repeat(50));
          console.log(`Database age: ${status.build.databaseAge?.toFixed(1) || 'N/A'} days`);
          console.log(`Last build update: ${status.build.lastBuildUpdate || 'Never'}`);
          console.log('\nData files:');
          Object.entries(status.build.dataFilesExist).forEach(([file, exists]) => {
            console.log(`  ${exists ? '✅' : '❌'} ${file}.js`);
          });
          console.log('\nVoting records:');
          console.log(`  Total votes: ${status.database.totalVotes}`);
          console.log(`  Politicians with votes: ${status.database.politiciansWithVotes}`);
          break;

        case 'help':
        default:
          console.log(`
🏗️ Build-time Data Updater

Usage: node build-time-updater.js <command> [options]

Commands:
  update                  Run complete build-time update (default)
  status                  Show build and data status
  help                    Show this help message

Update Options:
  --force                 Force all updates regardless of age
  --skip-voting           Skip voting records update
  --skip-congress         Skip congressional membership update
  --max-voting-age <days> Max age in days before updating voting records

Examples:
  # Full build update
  node build-time-updater.js

  # Force update everything
  node build-time-updater.js update --force

  # Update only congressional data
  node build-time-updater.js update --skip-voting

  # Quick status check
  node build-time-updater.js status
          `);
          break;
      }

    } catch (error) {
      console.error('❌ Build CLI Error:', error);
      process.exit(1);
    }
  }

  runCLI();
}
