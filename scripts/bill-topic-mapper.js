#!/usr/bin/env node

/**
 * Bill Topic Mapper
 * Links bills with policy topics for comprehensive position analysis
 */

const Database = require('better-sqlite3');
const path = require('path');

class BillTopicMapper {
  constructor() {
    const dbPath = path.join(__dirname, '..', 'data', 'politicians.db');
    this.db = new Database(dbPath);
    this.initializeBillTopicSchema();
  }

  /**
   * Initialize bill-topic mapping schema
   */
  initializeBillTopicSchema() {
    console.log('🗃️ Initializing bill-topic mapping schema...');
    
    // Bill topics junction table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bill_topics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_id TEXT NOT NULL,
        topic_id INTEGER NOT NULL,
        relevance_score REAL DEFAULT 0.5,
        mapping_method TEXT DEFAULT 'keyword',
        mapped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (topic_id) REFERENCES policy_topics (id),
        UNIQUE (bill_id, topic_id)
      )
    `);

    // Enhanced voting analysis
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS position_vote_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        politician_id TEXT NOT NULL,
        topic_id INTEGER NOT NULL,
        stated_position TEXT,
        voting_pattern TEXT,
        consistency_score REAL,
        total_votes INTEGER DEFAULT 0,
        aligned_votes INTEGER DEFAULT 0,
        analysis_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (politician_id) REFERENCES politicians (id),
        FOREIGN KEY (topic_id) REFERENCES policy_topics (id),
        UNIQUE (politician_id, topic_id)
      )
    `);

    console.log('✅ Bill-topic mapping schema initialized');
  }

  /**
   * Map bills to topics based on keywords and content
   */
  async mapBillsToTopics() {
    console.log('🔗 Mapping bills to policy topics...');
    
    // Get all topic aliases for matching
    const topicAliases = this.db.prepare(`
      SELECT t.id, t.canonical_name, t.display_name, a.alias, a.confidence_score
      FROM policy_topics t
      JOIN topic_aliases a ON t.id = a.topic_id
      ORDER BY a.confidence_score DESC
    `).all();

    // Get all bills
    const bills = this.db.prepare(`
      SELECT id as bill_id, title, summary 
      FROM bills 
      WHERE title IS NOT NULL
    `).all();

    console.log(`📊 Processing ${bills.length} bills...`);

    if (bills.length === 0) {
      console.log('⚠️  No bills found in database. Please run bill fetching first.');
      console.log('💡 You can still test policy position crawling without bill analysis.');
      return 0;
    }

    const insertBillTopic = this.db.prepare(`
      INSERT OR REPLACE INTO bill_topics (bill_id, topic_id, relevance_score, mapping_method)
      VALUES (?, ?, ?, ?)
    `);

    let mappedCount = 0;

    for (const bill of bills) {
      const billText = `${bill.title} ${bill.summary || ''}`.toLowerCase();
      const matchedTopics = new Map();

      // Find topic matches
      topicAliases.forEach(topic => {
        if (billText.includes(topic.alias.toLowerCase())) {
          const existingScore = matchedTopics.get(topic.id) || 0;
          const newScore = Math.max(existingScore, topic.confidence_score);
          matchedTopics.set(topic.id, newScore);
        }
      });

      // Save mappings
      matchedTopics.forEach((score, topicId) => {
        insertBillTopic.run(bill.bill_id, topicId, score, 'keyword_matching');
        mappedCount++;
      });
    }

    console.log(`✅ Created ${mappedCount} bill-topic mappings`);
    return mappedCount;
  }

  /**
   * Analyze voting consistency with stated positions
   */
  async analyzeVotingConsistency() {
    console.log('📊 Analyzing voting consistency with stated positions...');

    // Get politicians with both positions and voting records
    const politiciansWithData = this.db.prepare(`
      SELECT DISTINCT p.id, p.name, p.party, p.state
      FROM politicians p
      WHERE EXISTS (SELECT 1 FROM politician_positions pp WHERE pp.politician_id = p.id)
        AND EXISTS (SELECT 1 FROM politician_votes pv WHERE pv.politician_id = p.id)
    `).all();

    console.log(`👥 Analyzing ${politiciansWithData.length} politicians...`);

    const insertAnalysis = this.db.prepare(`
      INSERT OR REPLACE INTO position_vote_analysis 
      (politician_id, topic_id, stated_position, voting_pattern, consistency_score, total_votes, aligned_votes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const politician of politiciansWithData) {
      await this.analyzePoliticianConsistency(politician, insertAnalysis);
    }

    console.log('✅ Voting consistency analysis completed');
  }

  /**
   * Analyze individual politician's consistency
   */
  async analyzePoliticianConsistency(politician, insertStmt) {
    // Get politician's stated positions
    const positions = this.db.prepare(`
      SELECT pp.*, t.canonical_name, t.display_name
      FROM politician_positions pp
      JOIN policy_topics t ON pp.topic_id = t.id
      WHERE pp.politician_id = ?
    `).all(politician.id);

    for (const position of positions) {
      // Find relevant bills for this topic
      const relevantVotes = this.db.prepare(`
        SELECT pv.position as vote, v.bill_id, b.title
        FROM politician_votes pv
        JOIN votes v ON pv.vote_id = v.id
        JOIN bills b ON v.bill_id = b.id
        JOIN bill_topics bt ON b.id = bt.bill_id
        WHERE pv.politician_id = ? AND bt.topic_id = ?
          AND pv.position IN ('Yes', 'No')
        ORDER BY bt.relevance_score DESC
      `).all(politician.id, position.topic_id);

      if (relevantVotes.length === 0) continue;

      // Analyze voting pattern
      const votingAnalysis = this.analyzeVotingPattern(position, relevantVotes);
      
      insertStmt.run(
        politician.id,
        position.topic_id,
        position.position_summary,
        votingAnalysis.pattern,
        votingAnalysis.consistencyScore,
        relevantVotes.length,
        votingAnalysis.alignedVotes
      );
    }
  }

  /**
   * Analyze voting pattern for consistency
   */
  analyzeVotingPattern(position, votes) {
    // This is a simplified analysis - in reality, you'd want more sophisticated 
    // natural language processing to determine if votes align with stated positions
    
    const totalVotes = votes.length;
    const yesVotes = votes.filter(v => v.vote === 'Yes').length;
    const noVotes = votes.filter(v => v.vote === 'No').length;
    
    // Simple pattern analysis
    let pattern;
    const yesPercent = yesVotes / totalVotes;
    
    if (yesPercent > 0.7) {
      pattern = 'mostly_supportive';
    } else if (yesPercent < 0.3) {
      pattern = 'mostly_opposing';
    } else {
      pattern = 'mixed';
    }

    // Simplified consistency scoring
    // In a real implementation, you'd analyze the position text and bill content
    let consistencyScore = 0.5; // Default neutral
    
    // Basic keyword analysis for consistency
    const positionText = position.position_summary.toLowerCase();
    const supportKeywords = ['support', 'champion', 'advocate', 'promote', 'strengthen', 'expand'];
    const opposeKeywords = ['oppose', 'against', 'prevent', 'stop', 'reduce', 'eliminate'];
    
    const hasSupport = supportKeywords.some(keyword => positionText.includes(keyword));
    const hasOppose = opposeKeywords.some(keyword => positionText.includes(keyword));
    
    if (hasSupport && pattern === 'mostly_supportive') {
      consistencyScore = 0.8;
    } else if (hasOppose && pattern === 'mostly_opposing') {
      consistencyScore = 0.8;
    } else if ((hasSupport && pattern === 'mostly_opposing') || 
               (hasOppose && pattern === 'mostly_supportive')) {
      consistencyScore = 0.2;
    }

    return {
      pattern,
      consistencyScore,
      alignedVotes: Math.round(consistencyScore * totalVotes)
    };
  }

  /**
   * Get topic coverage report for bills
   */
  getTopicCoverageReport() {
    return this.db.prepare(`
      SELECT 
        t.display_name,
        COUNT(DISTINCT bt.bill_id) as bill_count,
        AVG(bt.relevance_score) as avg_relevance,
        COUNT(DISTINCT pv.politician_id) as politicians_voted
      FROM policy_topics t
      LEFT JOIN bill_topics bt ON t.id = bt.topic_id
      LEFT JOIN votes v ON bt.bill_id = v.bill_id
      LEFT JOIN politician_votes pv ON v.id = pv.vote_id
      GROUP BY t.id, t.display_name
      ORDER BY bill_count DESC
    `).all();
  }

  /**
   * Get consistency report for politicians
   */
  getConsistencyReport(limit = 20) {
    return this.db.prepare(`
      SELECT 
        p.name,
        p.party,
        p.state,
        t.display_name as topic,
        pva.consistency_score,
        pva.total_votes,
        pva.voting_pattern,
        SUBSTR(pva.stated_position, 1, 100) as position_preview
      FROM position_vote_analysis pva
      JOIN politicians p ON pva.politician_id = p.id
      JOIN policy_topics t ON pva.topic_id = t.id
      WHERE pva.total_votes >= 3
      ORDER BY pva.consistency_score DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get inconsistency report
   */
  getInconsistencyReport(limit = 20) {
    return this.db.prepare(`
      SELECT 
        p.name,
        p.party,
        p.state,
        t.display_name as topic,
        pva.consistency_score,
        pva.total_votes,
        pva.voting_pattern,
        SUBSTR(pva.stated_position, 1, 100) as position_preview
      FROM position_vote_analysis pva
      JOIN politicians p ON pva.politician_id = p.id
      JOIN policy_topics t ON pva.topic_id = t.id
      WHERE pva.total_votes >= 3 AND pva.consistency_score < 0.4
      ORDER BY pva.consistency_score ASC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get bills by topic
   */
  getBillsByTopic(topicName, limit = 10) {
    return this.db.prepare(`
      SELECT 
        b.id as bill_id,
        b.title,
        b.introduced_date,
        bt.relevance_score,
        COUNT(pv.politician_id) as total_votes
      FROM bills b
      JOIN bill_topics bt ON b.id = bt.bill_id
      JOIN policy_topics t ON bt.topic_id = t.id
      LEFT JOIN votes v ON b.id = v.bill_id
      LEFT JOIN politician_votes pv ON v.id = pv.vote_id AND pv.position IN ('Yes', 'No')
      WHERE t.canonical_name = ? OR t.display_name = ?
      GROUP BY b.id, b.title, b.introduced_date, bt.relevance_score
      ORDER BY bt.relevance_score DESC, total_votes DESC
      LIMIT ?
    `).all(topicName, topicName, limit);
  }

  /**
   * Print comprehensive analysis report
   */
  printAnalysisReport() {
    console.log('📊 BILL-TOPIC ANALYSIS REPORT');
    console.log('=' .repeat(50));
    
    // Topic coverage
    console.log('\n📈 TOPIC COVERAGE IN BILLS');
    const coverage = this.getTopicCoverageReport().slice(0, 10);
    coverage.forEach((topic, index) => {
      console.log(`${index + 1}. ${topic.display_name}: ${topic.bill_count} bills (avg relevance: ${(topic.avg_relevance || 0).toFixed(2)})`);
    });
    
    // Most consistent politicians
    console.log('\n🏆 MOST CONSISTENT POLITICIANS');
    const consistent = this.getConsistencyReport(10);
    consistent.forEach((pol, index) => {
      console.log(`${index + 1}. ${pol.name} (${pol.party}-${pol.state}) - ${pol.topic}: ${(pol.consistency_score * 100).toFixed(0)}% (${pol.total_votes} votes)`);
    });
    
    // Biggest inconsistencies
    console.log('\n⚠️  BIGGEST INCONSISTENCIES');
    const inconsistent = this.getInconsistencyReport(5);
    inconsistent.forEach((pol, index) => {
      console.log(`${index + 1}. ${pol.name} (${pol.party}-${pol.state}) - ${pol.topic}: ${(pol.consistency_score * 100).toFixed(0)}% consistency`);
      console.log(`   Position: "${pol.position_preview}..."`);
      console.log(`   Voting: ${pol.voting_pattern} (${pol.total_votes} votes)`);
    });
  }

  /**
   * Run full analysis
   */
  async runFullAnalysis() {
    console.log('🚀 Starting comprehensive bill-topic analysis...');
    
    try {
      await this.mapBillsToTopics();
      await this.analyzeVotingConsistency();
      this.printAnalysisReport();
    } catch (error) {
      console.error('💥 Analysis failed:', error);
      throw error;
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
  
  const mapper = new BillTopicMapper();
  
  async function main() {
    try {
      switch (command) {
        case 'map':
          await mapper.mapBillsToTopics();
          break;
          
        case 'analyze':
          await mapper.analyzeVotingConsistency();
          break;
          
        case 'report':
          mapper.printAnalysisReport();
          break;
          
        case 'topic-bills':
          const topicName = args[1];
          if (!topicName) {
            console.error('Usage: node bill-topic-mapper.js topic-bills <topic_name>');
            process.exit(1);
          }
          const bills = mapper.getBillsByTopic(topicName);
          console.log(`\n📄 TOP BILLS FOR ${topicName.toUpperCase()}`);
          bills.forEach((bill, index) => {
            console.log(`${index + 1}. ${bill.title} (${bill.total_votes} votes, relevance: ${bill.relevance_score.toFixed(2)})`);
          });
          break;
          
        case 'full':
          await mapper.runFullAnalysis();
          break;
          
        default:
          console.log('📖 BILL-TOPIC MAPPER USAGE');
          console.log('Available commands:');
          console.log('  map              - Map bills to policy topics');
          console.log('  analyze          - Analyze voting consistency');
          console.log('  report           - Show analysis report');
          console.log('  topic-bills      - Show bills for a topic');
          console.log('  full             - Run complete analysis');
          console.log('\nExamples:');
          console.log('  node bill-topic-mapper.js map');
          console.log('  node bill-topic-mapper.js analyze');
          console.log('  node bill-topic-mapper.js topic-bills healthcare');
          console.log('  node bill-topic-mapper.js full');
      }
    } catch (error) {
      console.error('💥 Error:', error.message);
      process.exit(1);
    } finally {
      mapper.close();
    }
  }

  main().catch(console.error);
}

module.exports = BillTopicMapper;
