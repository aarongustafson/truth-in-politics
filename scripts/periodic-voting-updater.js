#!/usr/bin/env node

/**
 * Periodic Voting Records Updater
 * Updates voting records incrementally based on last update timestamp
 * Designed for efficient periodic updates during builds
 */

const VotingRecordsFetcher = require('./voting-records-fetcher');
const path = require('path');
const fs = require('fs');

class PeriodicVotingUpdater {
  constructor() {
    this.fetcher = new VotingRecordsFetcher();
    this.configFile = path.join(__dirname, '..', 'data', 'voting-update-config.json');
    this.loadConfig();
  }

  /**
   * Load update configuration
   */
  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        this.config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      } else {
    this.config = {
      lastFullUpdate: null,
      lastIncrementalUpdate: null,
      updateFrequency: 'daily', // daily, weekly, monthly
      maxVotesPerUpdate: 50,    // Reduced for beta API
      enabledChambers: ['house'] // Only House until Senate API is available
    };
        this.saveConfig();
      }
    } catch (error) {
      console.error('⚠️  Error loading config, using defaults:', error);
      this.config = {
        lastFullUpdate: null,
        lastIncrementalUpdate: null,
        updateFrequency: 'daily',
        maxVotesPerUpdate: 100,
        enabledChambers: ['house', 'senate']
      };
    }
  }

  /**
   * Save update configuration
   */
  saveConfig() {
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('⚠️  Error saving config:', error);
    }
  }

  /**
   * Run periodic update based on configuration
   */
  async runPeriodicUpdate(options = {}) {
    const {
      force = false,
      updateType = 'auto', // 'auto', 'full', 'incremental'
      maxAge = null // Maximum age in days before forcing full update
    } = options;

    console.log('🔄 Starting periodic voting records update...');
    console.log(`📋 Config: ${this.config.updateFrequency} updates, max ${this.config.maxVotesPerUpdate} votes per run`);

    try {
      const now = new Date();
      const shouldUpdate = force || this.shouldRunUpdate(now, maxAge);

      if (!shouldUpdate.update) {
        console.log(`⏰ ${shouldUpdate.reason}`);
        return { skipped: true, reason: shouldUpdate.reason };
      }

      console.log(`✅ ${shouldUpdate.reason}`);

      // Determine update strategy
      const strategy = this.determineUpdateStrategy(updateType, now, maxAge);
      console.log(`📊 Update strategy: ${strategy.type}`);
      console.log(`📅 Date range: ${strategy.startDate} to ${strategy.endDate || 'present'}`);

      // Execute update
      const result = await this.executeUpdate(strategy);

      // Update configuration
      if (strategy.type === 'full') {
        this.config.lastFullUpdate = now.toISOString();
      }
      this.config.lastIncrementalUpdate = now.toISOString();
      this.saveConfig();

      console.log('✅ Periodic update completed successfully');
      return result;

    } catch (error) {
      console.error('❌ Periodic update failed:', error);
      throw error;
    } finally {
      this.fetcher.close();
    }
  }

  /**
   * Determine if an update should run
   */
  shouldRunUpdate(now, maxAge) {
    const lastUpdate = this.config.lastIncrementalUpdate 
      ? new Date(this.config.lastIncrementalUpdate)
      : null;

    if (!lastUpdate) {
      return { update: true, reason: 'No previous update found, running initial update' };
    }

    const timeSinceUpdate = now - lastUpdate;
    const hoursAgo = timeSinceUpdate / (1000 * 60 * 60);
    const daysAgo = hoursAgo / 24;

    // Check based on update frequency
    switch (this.config.updateFrequency) {
      case 'daily':
        if (hoursAgo >= 24) {
          return { update: true, reason: `Last update was ${Math.round(hoursAgo)} hours ago` };
        }
        break;
      case 'weekly':
        if (daysAgo >= 7) {
          return { update: true, reason: `Last update was ${Math.round(daysAgo)} days ago` };
        }
        break;
      case 'monthly':
        if (daysAgo >= 30) {
          return { update: true, reason: `Last update was ${Math.round(daysAgo)} days ago` };
        }
        break;
    }

    // Check max age override
    if (maxAge && daysAgo >= maxAge) {
      return { update: true, reason: `Data is ${Math.round(daysAgo)} days old, exceeds max age of ${maxAge} days` };
    }

    return { 
      update: false, 
      reason: `Update not needed (last update: ${Math.round(hoursAgo)} hours ago)` 
    };
  }

  /**
   * Determine update strategy based on parameters
   */
  determineUpdateStrategy(updateType, now, maxAge) {
    const lastFullUpdate = this.config.lastFullUpdate 
      ? new Date(this.config.lastFullUpdate)
      : null;

    const lastIncrementalUpdate = this.config.lastIncrementalUpdate 
      ? new Date(this.config.lastIncrementalUpdate)
      : null;

    // Force full update if requested
    if (updateType === 'full') {
      return {
        type: 'full',
        startDate: this.getStartDateForFullUpdate(),
        endDate: this.formatDate(now)
      };
    }

    // Force incremental if requested
    if (updateType === 'incremental') {
      return {
        type: 'incremental',
        startDate: this.getStartDateForIncremental(lastIncrementalUpdate),
        endDate: this.formatDate(now)
      };
    }

    // Auto determination
    const daysSinceFullUpdate = lastFullUpdate 
      ? (now - lastFullUpdate) / (1000 * 60 * 60 * 24)
      : Infinity;

    // Run full update if it's been more than 30 days or maxAge is exceeded
    if (daysSinceFullUpdate > 30 || (maxAge && daysSinceFullUpdate > maxAge)) {
      return {
        type: 'full',
        startDate: this.getStartDateForFullUpdate(),
        endDate: this.formatDate(now)
      };
    }

    // Otherwise run incremental update
    return {
      type: 'incremental',
      startDate: this.getStartDateForIncremental(lastIncrementalUpdate),
      endDate: this.formatDate(now)
    };
  }

  /**
   * Get start date for full update (current congress session)
   */
  getStartDateForFullUpdate() {
    // 118th Congress started January 3, 2023, but let's be more conservative
    // and start from a more recent date to avoid overwhelming API calls
    const date = new Date();
    date.setDate(date.getDate() - 90); // Last 90 days for initial full update
    return this.formatDate(date);
  }

  /**
   * Get start date for incremental update
   */
  getStartDateForIncremental(lastUpdate) {
    if (!lastUpdate) {
      // No previous update, go back 7 days
      const date = new Date();
      date.setDate(date.getDate() - 7);
      return this.formatDate(date);
    }

    // Start from last update date
    return this.formatDate(lastUpdate);
  }

  /**
   * Execute the update strategy
   */
  async executeUpdate(strategy) {
    const fetchOptions = {
      congress: 118,
      chamber: 'house', // Only House votes available in beta API
      startDate: strategy.startDate,
      endDate: strategy.endDate,
      limit: this.config.maxVotesPerUpdate
    };

    console.log('🔄 Executing update with options:', fetchOptions);

    const result = await this.fetcher.fetchVotingRecords(fetchOptions);

    return {
      ...result,
      strategy: strategy.type,
      dateRange: {
        start: strategy.startDate,
        end: strategy.endDate
      }
    };
  }

  /**
   * Format date as YYYY-MM-DD
   */
  formatDate(date) {
    return date.toISOString().split('T')[0];
  }

  /**
   * Get update status and statistics
   */
  getUpdateStatus() {
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, '..', 'data', 'politicians.db');
    const db = new Database(dbPath);

    try {
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
          COUNT(DISTINCT politician_id) as politicians_with_votes,
          AVG(participation_rate) as avg_participation_rate
        FROM voting_statistics 
        WHERE total_votes > 0
      `).get();

      return {
        config: this.config,
        database: {
          totalVotes: stats.total_votes || 0,
          earliestVote: stats.earliest_vote,
          latestVote: stats.latest_vote,
          votingDays: stats.voting_days || 0,
          politiciansWithVotes: politicianStats.politicians_with_votes || 0,
          avgParticipationRate: politicianStats.avg_participation_rate || 0
        }
      };

    } finally {
      db.close();
    }
  }

  /**
   * Configure update settings
   */
  configure(settings) {
    this.config = { ...this.config, ...settings };
    this.saveConfig();
    console.log('✅ Configuration updated');
  }
}

module.exports = PeriodicVotingUpdater;

// CLI interface when run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const updater = new PeriodicVotingUpdater();

  async function runCLI() {
    try {
      const command = args[0] || 'update';

      switch (command) {
        case 'update':
          const options = {};
          
          // Parse update options
          for (let i = 1; i < args.length; i++) {
            switch (args[i]) {
              case '--force':
                options.force = true;
                break;
              case '--type':
                options.updateType = args[++i];
                break;
              case '--max-age':
                options.maxAge = parseInt(args[++i]);
                break;
            }
          }

          await updater.runPeriodicUpdate(options);
          break;

        case 'status':
          const status = updater.getUpdateStatus();
          console.log('\n📊 Voting Records Status:');
          console.log('─'.repeat(50));
          console.log(`Total votes in database: ${status.database.totalVotes}`);
          console.log(`Date range: ${status.database.earliestVote || 'N/A'} to ${status.database.latestVote || 'N/A'}`);
          console.log(`Politicians with voting records: ${status.database.politiciansWithVotes}`);
          console.log(`Average participation rate: ${(status.database.avgParticipationRate || 0).toFixed(1)}%`);
          console.log(`\nLast full update: ${status.config.lastFullUpdate || 'Never'}`);
          console.log(`Last incremental update: ${status.config.lastIncrementalUpdate || 'Never'}`);
          console.log(`Update frequency: ${status.config.updateFrequency}`);
          break;

        case 'configure':
          const settings = {};
          
          for (let i = 1; i < args.length; i++) {
            switch (args[i]) {
              case '--frequency':
                settings.updateFrequency = args[++i];
                break;
              case '--max-votes':
                settings.maxVotesPerUpdate = parseInt(args[++i]);
                break;
            }
          }

          if (Object.keys(settings).length > 0) {
            updater.configure(settings);
          } else {
            console.log('Current configuration:', updater.config);
          }
          break;

        case 'help':
        default:
          console.log(`
📊 Periodic Voting Records Updater

Usage: node periodic-voting-updater.js <command> [options]

Commands:
  update                  Run periodic update (default)
  status                  Show update status and statistics
  configure               View or update configuration
  help                    Show this help message

Update Options:
  --force                 Force update regardless of schedule
  --type <type>           Update type: auto, full, incremental
  --max-age <days>        Force update if data is older than N days

Configure Options:
  --frequency <freq>      Update frequency: daily, weekly, monthly
  --max-votes <number>    Maximum votes to fetch per update

Examples:
  # Run scheduled update
  node periodic-voting-updater.js

  # Force full update
  node periodic-voting-updater.js update --force --type full

  # Show current status
  node periodic-voting-updater.js status

  # Set daily updates with max 50 votes
  node periodic-voting-updater.js configure --frequency daily --max-votes 50
          `);
          break;
      }

    } catch (error) {
      console.error('❌ CLI Error:', error);
      process.exit(1);
    }
  }

  runCLI();
}
