#!/usr/bin/env node

/**
 * Policy Position Analyzer
 * Utilities for analyzing and managing crawled policy positions
 */

const Database = require('better-sqlite3');
const path = require('path');

class PolicyPositionAnalyzer {
  constructor() {
    const dbPath = path.join(__dirname, '..', 'data', 'politicians.db');
    this.db = new Database(dbPath);
  }

  /**
   * Get summary statistics about crawled positions
   */
  getSummaryStats() {
    const stats = {};
    
    // Total positions
    stats.totalPositions = this.db.prepare('SELECT COUNT(*) as count FROM politician_positions').get().count;
    
    // Politicians with positions
    stats.politiciansWithPositions = this.db.prepare(`
      SELECT COUNT(DISTINCT politician_id) as count FROM politician_positions
    `).get().count;
    
    // Total politicians
    stats.totalPoliticians = this.db.prepare('SELECT COUNT(*) as count FROM politicians').get().count;
    
    // Coverage percentage
    stats.coveragePercentage = Math.round((stats.politiciansWithPositions / stats.totalPoliticians) * 100);
    
    // Topics covered
    stats.topicsCovered = this.db.prepare(`
      SELECT COUNT(DISTINCT topic_id) as count FROM politician_positions
    `).get().count;
    
    // Total topics available
    stats.totalTopics = this.db.prepare('SELECT COUNT(*) as count FROM policy_topics').get().count;
    
    // Key issues
    stats.keyIssues = this.db.prepare(`
      SELECT COUNT(*) as count FROM politician_positions WHERE is_key_issue = 1
    `).get().count;
    
    // Recent crawls
    stats.recentCrawls = this.db.prepare(`
      SELECT COUNT(*) as count FROM crawl_log 
      WHERE crawled_at > datetime('now', '-24 hours')
    `).get().count;
    
    // Success rate
    const crawlStats = this.db.prepare(`
      SELECT 
        SUM(CASE WHEN crawl_status = 'success' THEN 1 ELSE 0 END) as successful,
        COUNT(*) as total
      FROM crawl_log
    `).get();
    
    stats.successRate = crawlStats.total > 0 ? 
      Math.round((crawlStats.successful / crawlStats.total) * 100) : 0;
    
    return stats;
  }

  /**
   * Get topic distribution across politicians
   */
  getTopicDistribution() {
    return this.db.prepare(`
      SELECT 
        t.display_name,
        t.canonical_name,
        COUNT(*) as position_count,
        COUNT(DISTINCT p.politician_id) as politician_count,
        SUM(CASE WHEN p.is_key_issue = 1 THEN 1 ELSE 0 END) as key_issue_count,
        ROUND(AVG(p.confidence_score), 3) as avg_confidence
      FROM politician_positions p
      JOIN policy_topics t ON p.topic_id = t.id
      GROUP BY t.id, t.display_name, t.canonical_name
      ORDER BY position_count DESC
    `).all();
  }

  /**
   * Get positions by party for a specific topic
   */
  getPositionsByParty(topicName) {
    return this.db.prepare(`
      SELECT 
        pol.party,
        COUNT(*) as position_count,
        SUM(CASE WHEN pp.is_key_issue = 1 THEN 1 ELSE 0 END) as key_issue_count,
        ROUND(AVG(pp.confidence_score), 3) as avg_confidence
      FROM politician_positions pp
      JOIN politicians pol ON pp.politician_id = pol.id
      JOIN policy_topics t ON pp.topic_id = t.id
      WHERE t.canonical_name = ? OR t.display_name = ?
      GROUP BY pol.party
      ORDER BY position_count DESC
    `).all(topicName, topicName);
  }

  /**
   * Get politicians with the most key issues
   */
  getTopKeyIssuePoliticians(limit = 10) {
    return this.db.prepare(`
      SELECT 
        pol.name,
        pol.party,
        pol.state,
        pol.chamber,
        COUNT(*) as key_issue_count,
        COUNT(DISTINCT pp.topic_id) as total_topics
      FROM politician_positions pp
      JOIN politicians pol ON pp.politician_id = pol.id
      WHERE pp.is_key_issue = 1
      GROUP BY pol.id, pol.name, pol.party, pol.state, pol.chamber
      ORDER BY key_issue_count DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get crawl failure analysis
   */
  getCrawlFailures() {
    return this.db.prepare(`
      SELECT 
        pol.name,
        pol.party,
        pol.state,
        pol.chamber,
        pol.website,
        cl.error_message,
        cl.crawled_at
      FROM crawl_log cl
      JOIN politicians pol ON cl.politician_id = pol.id
      WHERE cl.crawl_status = 'error'
      ORDER BY cl.crawled_at DESC
    `).all();
  }

  /**
   * Find politicians missing positions on key topics
   */
  findMissingPositions(topicName) {
    return this.db.prepare(`
      SELECT 
        pol.name,
        pol.party,
        pol.state,
        pol.chamber,
        pol.website
      FROM politicians pol
      WHERE pol.website IS NOT NULL 
        AND pol.id NOT IN (
          SELECT pp.politician_id 
          FROM politician_positions pp
          JOIN policy_topics t ON pp.topic_id = t.id
          WHERE t.canonical_name = ? OR t.display_name = ?
        )
      ORDER BY pol.name
    `).all(topicName, topicName);
  }

  /**
   * Get detailed positions for a politician
   */
  getPoliticianPositions(politicianId) {
    return this.db.prepare(`
      SELECT 
        t.display_name as topic,
        pp.position_summary,
        pp.is_key_issue,
        pp.confidence_score,
        pp.source_section,
        pp.last_updated
      FROM politician_positions pp
      JOIN policy_topics t ON pp.topic_id = t.id
      WHERE pp.politician_id = ?
      ORDER BY pp.is_key_issue DESC, t.display_name
    `).all(politicianId);
  }

  /**
   * Search positions by keyword
   */
  searchPositions(keyword, limit = 20) {
    const searchTerm = `%${keyword.toLowerCase()}%`;
    return this.db.prepare(`
      SELECT 
        pol.name,
        pol.party,
        pol.state,
        t.display_name as topic,
        pp.position_summary,
        pp.is_key_issue,
        pp.confidence_score
      FROM politician_positions pp
      JOIN politicians pol ON pp.politician_id = pol.id
      JOIN policy_topics t ON pp.topic_id = t.id
      WHERE LOWER(pp.position_summary) LIKE ? 
         OR LOWER(pp.position_details) LIKE ?
      ORDER BY pp.confidence_score DESC, pp.is_key_issue DESC
      LIMIT ?
    `).all(searchTerm, searchTerm, limit);
  }

  /**
   * Export positions to JSON for a topic
   */
  exportTopicPositions(topicName) {
    const positions = this.db.prepare(`
      SELECT 
        pol.name,
        pol.party,
        pol.state,
        pol.chamber,
        pp.position_summary,
        pp.position_details,
        pp.is_key_issue,
        pp.confidence_score,
        pp.source_url,
        pp.last_updated
      FROM politician_positions pp
      JOIN politicians pol ON pp.politician_id = pol.id
      JOIN policy_topics t ON pp.topic_id = t.id
      WHERE t.canonical_name = ? OR t.display_name = ?
      ORDER BY pol.name
    `).all(topicName, topicName);

    return {
      topic: topicName,
      exportedAt: new Date().toISOString(),
      totalPositions: positions.length,
      positions: positions
    };
  }

  /**
   * Print comprehensive report
   */
  printReport() {
    console.log('📊 POLICY POSITION CRAWLER REPORT');
    console.log('=' .repeat(50));
    
    const stats = this.getSummaryStats();
    
    console.log('\n📈 SUMMARY STATISTICS');
    console.log(`Total Positions Crawled: ${stats.totalPositions.toLocaleString()}`);
    console.log(`Politicians with Positions: ${stats.politiciansWithPositions}/${stats.totalPoliticians} (${stats.coveragePercentage}%)`);
    console.log(`Topics Covered: ${stats.topicsCovered}/${stats.totalTopics}`);
    console.log(`Key Issues Identified: ${stats.keyIssues.toLocaleString()}`);
    console.log(`Crawl Success Rate: ${stats.successRate}%`);
    console.log(`Recent Crawls (24h): ${stats.recentCrawls}`);
    
    console.log('\n🏆 TOP TOPICS BY COVERAGE');
    const topicDist = this.getTopicDistribution().slice(0, 10);
    topicDist.forEach((topic, index) => {
      console.log(`${index + 1}. ${topic.display_name}: ${topic.position_count} positions (${topic.politician_count} politicians)`);
    });
    
    console.log('\n🔑 TOP POLITICIANS BY KEY ISSUES');
    const topPoliticians = this.getTopKeyIssuePoliticians(5);
    topPoliticians.forEach((pol, index) => {
      console.log(`${index + 1}. ${pol.name} (${pol.party}-${pol.state}): ${pol.key_issue_count} key issues`);
    });
    
    const failures = this.getCrawlFailures();
    if (failures.length > 0) {
      console.log('\n⚠️  RECENT CRAWL FAILURES');
      failures.slice(0, 5).forEach((failure, index) => {
        console.log(`${index + 1}. ${failure.name}: ${failure.error_message}`);
      });
      
      if (failures.length > 5) {
        console.log(`   ... and ${failures.length - 5} more failures`);
      }
    }
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
  const command = args[0];
  
  const analyzer = new PolicyPositionAnalyzer();
  
  try {
    switch (command) {
      case 'report':
        analyzer.printReport();
        break;
        
      case 'topic':
        const topicName = args[1];
        if (!topicName) {
          console.error('Usage: node policy-position-analyzer.js topic <topic_name>');
          process.exit(1);
        }
        const byParty = analyzer.getPositionsByParty(topicName);
        console.log(`\n📊 ${topicName.toUpperCase()} POSITIONS BY PARTY`);
        byParty.forEach(party => {
          console.log(`${party.party}: ${party.position_count} positions (${party.key_issue_count} key issues)`);
        });
        break;
        
      case 'missing':
        const missingTopic = args[1];
        if (!missingTopic) {
          console.error('Usage: node policy-position-analyzer.js missing <topic_name>');
          process.exit(1);
        }
        const missing = analyzer.findMissingPositions(missingTopic);
        console.log(`\n🔍 POLITICIANS MISSING ${missingTopic.toUpperCase()} POSITIONS`);
        missing.slice(0, 20).forEach(pol => {
          console.log(`${pol.name} (${pol.party}-${pol.state})`);
        });
        if (missing.length > 20) {
          console.log(`... and ${missing.length - 20} more`);
        }
        break;
        
      case 'search':
        const keyword = args[1];
        if (!keyword) {
          console.error('Usage: node policy-position-analyzer.js search <keyword>');
          process.exit(1);
        }
        const results = analyzer.searchPositions(keyword);
        console.log(`\n🔎 SEARCH RESULTS FOR "${keyword}"`);
        results.forEach(result => {
          console.log(`${result.name} (${result.party}-${result.state}) - ${result.topic}:`);
          console.log(`   ${result.position_summary.substring(0, 100)}...`);
        });
        break;
        
      case 'export':
        const exportTopic = args[1];
        if (!exportTopic) {
          console.error('Usage: node policy-position-analyzer.js export <topic_name>');
          process.exit(1);
        }
        const exportData = analyzer.exportTopicPositions(exportTopic);
        const filename = `${exportTopic.toLowerCase().replace(/\s+/g, '_')}_positions.json`;
        require('fs').writeFileSync(filename, JSON.stringify(exportData, null, 2));
        console.log(`✅ Exported ${exportData.totalPositions} positions to ${filename}`);
        break;
        
      default:
        console.log('📖 POLICY POSITION ANALYZER USAGE');
        console.log('Available commands:');
        console.log('  report                    - Show comprehensive report');
        console.log('  topic <name>             - Show positions by party for topic');
        console.log('  missing <name>           - Show politicians missing topic positions');
        console.log('  search <keyword>         - Search positions by keyword');
        console.log('  export <topic>           - Export topic positions to JSON');
        console.log('\nExamples:');
        console.log('  node policy-position-analyzer.js report');
        console.log('  node policy-position-analyzer.js topic healthcare');
        console.log('  node policy-position-analyzer.js missing immigration');
        console.log('  node policy-position-analyzer.js search "climate change"');
    }
  } catch (error) {
    console.error('💥 Error:', error.message);
    process.exit(1);
  } finally {
    analyzer.close();
  }
}

module.exports = PolicyPositionAnalyzer;
