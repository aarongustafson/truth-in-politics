#!/usr/bin/env node

/**
 * Congressional Data Configuration Manager
 * Configure and manage historical vs recent data fetching
 */

const fs = require('fs');
const path = require('path');

class CongressionalDataConfig {
  constructor() {
    this.configFile = path.join(__dirname, '..', 'data', 'congress-data-config.json');
    this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        this.config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      } else {
        this.config = this.getDefaultConfig();
        this.saveConfig();
      }
    } catch (error) {
      console.error('⚠️  Error loading config, using defaults:', error);
      this.config = this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      dataStrategy: 'recent', // 'recent', 'historical', 'comprehensive'
      
      // Recent data configuration (last few months)
      recent: {
        votingDays: 90,        // Last 90 days of voting
        legislationDays: 180,  // Last 6 months of legislation
        maxVotesPerUpdate: 50,
        maxLegislationPerPolitician: 25
      },
      
      // Historical data configuration (full congressional term)
      historical: {
        votingStartDate: '2023-01-03',     // Start of 118th Congress
        legislationStartDate: '2023-01-03', // Start of 118th Congress
        maxVotesPerUpdate: 500,            // More votes for historical
        maxLegislationPerPolitician: 100   // More legislation for historical
      },
      
      // Comprehensive data configuration (everything)
      comprehensive: {
        includeVoting: true,
        includeLegislation: true,
        includeAlignment: true,
        votingStartDate: '2023-01-03',
        legislationStartDate: '2023-01-03',
        maxVotesPerUpdate: 1000,
        maxLegislationPerPolitician: 200,
        calculateAlignments: true
      },
      
      // API rate limiting
      rateLimit: {
        requestDelayMs: 250,
        batchSize: 20,
        batchDelayMs: 1000
      },
      
      // Build integration
      buildIntegration: {
        autoUpdate: true,
        updateOnBuild: true,
        skipOnErrors: false,
        dataMaxAge: 24  // Hours before forcing update
      },
      
      lastUpdated: null,
      lastStrategy: null
    };
  }

  saveConfig() {
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('⚠️  Error saving config:', error);
    }
  }

  setStrategy(strategy) {
    if (!['recent', 'historical', 'comprehensive'].includes(strategy)) {
      throw new Error(`Invalid strategy: ${strategy}. Must be 'recent', 'historical', or 'comprehensive'`);
    }
    
    this.config.dataStrategy = strategy;
    this.config.lastStrategy = strategy;
    this.config.lastUpdated = new Date().toISOString();
    this.saveConfig();
    
    console.log(`✅ Data strategy set to: ${strategy}`);
    this.showCurrentConfig();
  }

  getStrategyConfig() {
    const strategy = this.config.dataStrategy;
    const baseConfig = this.config[strategy];
    
    return {
      ...baseConfig,
      strategy,
      rateLimit: this.config.rateLimit,
      buildIntegration: this.config.buildIntegration
    };
  }

  showCurrentConfig() {
    const strategy = this.config.dataStrategy;
    const config = this.config[strategy];
    
    console.log(`\n📊 Current Strategy: ${strategy.toUpperCase()}`);
    console.log('─'.repeat(50));
    
    switch (strategy) {
      case 'recent':
        console.log(`Voting: Last ${config.votingDays} days`);
        console.log(`Legislation: Last ${config.legislationDays} days`);
        console.log(`Max votes per update: ${config.maxVotesPerUpdate}`);
        console.log(`Max legislation per politician: ${config.maxLegislationPerPolitician}`);
        break;
        
      case 'historical':
        console.log(`Voting from: ${config.votingStartDate}`);
        console.log(`Legislation from: ${config.legislationStartDate}`);
        console.log(`Max votes per update: ${config.maxVotesPerUpdate}`);
        console.log(`Max legislation per politician: ${config.maxLegislationPerPolitician}`);
        break;
        
      case 'comprehensive':
        console.log(`Include voting: ${config.includeVoting}`);
        console.log(`Include legislation: ${config.includeLegislation}`);
        console.log(`Include alignment: ${config.includeAlignment}`);
        console.log(`Voting from: ${config.votingStartDate}`);
        console.log(`Legislation from: ${config.legislationStartDate}`);
        console.log(`Calculate alignments: ${config.calculateAlignments}`);
        break;
    }
    
    console.log(`\nRate limiting: ${this.config.rateLimit.requestDelayMs}ms between requests`);
    console.log(`Build integration: ${this.config.buildIntegration.autoUpdate ? 'Enabled' : 'Disabled'}`);
    console.log(`Last updated: ${this.config.lastUpdated || 'Never'}`);
  }

  updateStrategy(strategy, updates) {
    if (!this.config[strategy]) {
      throw new Error(`Unknown strategy: ${strategy}`);
    }
    
    this.config[strategy] = { ...this.config[strategy], ...updates };
    this.saveConfig();
    
    console.log(`✅ Updated ${strategy} strategy configuration`);
  }

  getDateRangeForStrategy() {
    const strategy = this.config.dataStrategy;
    const config = this.config[strategy];
    const now = new Date();
    
    switch (strategy) {
      case 'recent':
        const votingStart = new Date(now);
        votingStart.setDate(votingStart.getDate() - config.votingDays);
        
        const legislationStart = new Date(now);
        legislationStart.setDate(legislationStart.getDate() - config.legislationDays);
        
        return {
          voting: {
            startDate: votingStart.toISOString().split('T')[0],
            endDate: now.toISOString().split('T')[0]
          },
          legislation: {
            startDate: legislationStart.toISOString().split('T')[0],
            endDate: now.toISOString().split('T')[0]
          }
        };
        
      case 'historical':
      case 'comprehensive':
        return {
          voting: {
            startDate: config.votingStartDate,
            endDate: now.toISOString().split('T')[0]
          },
          legislation: {
            startDate: config.legislationStartDate,
            endDate: now.toISOString().split('T')[0]
          }
        };
        
      default:
        throw new Error(`Unknown strategy: ${strategy}`);
    }
  }

  shouldUpdate() {
    if (!this.config.buildIntegration.autoUpdate) {
      return { update: false, reason: 'Auto-update disabled' };
    }
    
    if (!this.config.lastUpdated) {
      return { update: true, reason: 'No previous update found' };
    }
    
    const lastUpdate = new Date(this.config.lastUpdated);
    const now = new Date();
    const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);
    
    if (hoursSinceUpdate >= this.config.buildIntegration.dataMaxAge) {
      return { 
        update: true, 
        reason: `Data is ${Math.round(hoursSinceUpdate)} hours old (max age: ${this.config.buildIntegration.dataMaxAge}h)` 
      };
    }
    
    return { 
      update: false, 
      reason: `Data is ${Math.round(hoursSinceUpdate)} hours old (within max age)` 
    };
  }

  getExecutionOptions() {
    const strategy = this.config.dataStrategy;
    const config = this.config[strategy];
    const dateRange = this.getDateRangeForStrategy();
    
    return {
      strategy,
      dateRange,
      limits: {
        maxVotesPerUpdate: config.maxVotesPerUpdate || 100,
        maxLegislationPerPolitician: config.maxLegislationPerPolitician || 50
      },
      features: {
        includeVoting: config.includeVoting !== false,
        includeLegislation: config.includeLegislation !== false,
        includeAlignment: config.includeAlignment !== false,
        calculateAlignments: config.calculateAlignments !== false
      },
      rateLimit: this.config.rateLimit
    };
  }
}

module.exports = CongressionalDataConfig;

// CLI interface when run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const config = new CongressionalDataConfig();

  function runCLI() {
    const command = args[0] || 'show';

    switch (command) {
      case 'show':
        config.showCurrentConfig();
        break;

      case 'set':
        const strategy = args[1];
        if (!strategy) {
          console.error('❌ Please specify a strategy: recent, historical, or comprehensive');
          process.exit(1);
        }
        config.setStrategy(strategy);
        break;

      case 'update':
        const updateStrategy = args[1];
        const updateKey = args[2];
        const updateValue = args[3];
        
        if (!updateStrategy || !updateKey || !updateValue) {
          console.error('❌ Usage: update <strategy> <key> <value>');
          process.exit(1);
        }
        
        const updates = {};
        // Parse different value types
        if (updateValue === 'true') updates[updateKey] = true;
        else if (updateValue === 'false') updates[updateKey] = false;
        else if (/^\d+$/.test(updateValue)) updates[updateKey] = parseInt(updateValue);
        else updates[updateKey] = updateValue;
        
        config.updateStrategy(updateStrategy, updates);
        break;

      case 'dates':
        const dateRange = config.getDateRangeForStrategy();
        console.log('\n📅 Date Ranges for Current Strategy:');
        console.log('─'.repeat(40));
        console.log(`Voting: ${dateRange.voting.startDate} to ${dateRange.voting.endDate}`);
        console.log(`Legislation: ${dateRange.legislation.startDate} to ${dateRange.legislation.endDate}`);
        break;

      case 'should-update':
        const updateCheck = config.shouldUpdate();
        console.log(`Update needed: ${updateCheck.update ? 'YES' : 'NO'}`);
        console.log(`Reason: ${updateCheck.reason}`);
        process.exit(updateCheck.update ? 0 : 1);
        break;

      case 'execution-options':
        const options = config.getExecutionOptions();
        console.log(JSON.stringify(options, null, 2));
        break;

      case 'help':
      default:
        console.log(`
📊 Congressional Data Configuration Manager

Usage: node congress-data-config.js <command> [options]

Commands:
  show                    Show current configuration
  set <strategy>          Set data strategy (recent, historical, comprehensive)
  update <strategy> <key> <value>  Update specific setting
  dates                   Show date ranges for current strategy
  should-update           Check if data update is needed
  execution-options       Show current execution options as JSON
  help                    Show this help message

Strategies:
  recent                  Last few months of data (faster updates)
  historical              Full congressional term data (comprehensive analysis)
  comprehensive           Everything with alignment calculations (slowest, most complete)

Examples:
  # Set to recent data strategy
  node congress-data-config.js set recent

  # Update recent strategy to last 60 days
  node congress-data-config.js update recent votingDays 60

  # Update historical strategy start date
  node congress-data-config.js update historical votingStartDate 2023-06-01

  # Check if update is needed
  node congress-data-config.js should-update

        `);
        break;
    }
  }

  runCLI();
}
