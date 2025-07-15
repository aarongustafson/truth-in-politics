# Policy Position Crawler System

A comprehensive system for extracting, normalizing, and analyzing policy positions from politician websites, connecting them with voting records for consistency analysis.

## 🎯 Overview

This system consists of three main components:

1. **Policy Position Crawler** - Extracts policy positions from politician websites
2. **Policy Position Analyzer** - Analyzes and reports on crawled positions  
3. **Bill Topic Mapper** - Links bills with policy topics and analyzes voting consistency

## 📊 Database Schema

### Core Tables

#### `policy_topics`
Normalized policy topic areas (healthcare, immigration, etc.)
- `canonical_name` - Standardized topic identifier
- `display_name` - Human-readable topic name
- `description` - Topic description
- `parent_topic_id` - For hierarchical topics

#### `topic_aliases`
Alternative ways topics might be referenced
- `topic_id` - Links to policy_topics
- `alias` - Alternative term/phrase
- `confidence_score` - How strongly this alias indicates the topic

#### `politician_positions`
Extracted policy positions for each politician
- `politician_id` - Links to politicians table
- `topic_id` - Links to policy_topics
- `position_summary` - Brief position description
- `position_details` - Full extracted text
- `is_key_issue` - Whether this is a key issue for the politician
- `source_url` - Website where position was found
- `confidence_score` - How confident we are in the extraction

#### `bill_topics`
Maps bills to relevant policy topics
- `bill_id` - Links to bills table
- `topic_id` - Links to policy_topics  
- `relevance_score` - How relevant the bill is to the topic

#### `position_vote_analysis`
Analyzes consistency between stated positions and voting records
- `politician_id` - Links to politicians
- `topic_id` - Links to policy_topics
- `stated_position` - Summary of stated position
- `voting_pattern` - Pattern from voting analysis
- `consistency_score` - How consistent votes are with stated position

## 🚀 Quick Start

### 1. Test the Crawler (Recommended First Step)
```bash
# Test with just 5 politicians
npm run positions:crawl:test
```

### 2. Run Full Position Crawling
```bash
# Crawl all politicians (this will take several hours)
npm run positions:crawl

# Or limit to specific number
node scripts/policy-position-crawler.js --limit 50
```

### 3. Analyze Results
```bash
# Generate comprehensive report
npm run positions:analyze

# Search for specific keywords
node scripts/policy-position-analyzer.js search "climate change"

# Export positions for a topic
node scripts/policy-position-analyzer.js export healthcare
```

### 4. Map Bills to Topics
```bash
# Map bills to policy topics
npm run bills:map

# Analyze voting consistency
npm run bills:analyze

# Generate analysis report
npm run bills:report

# Run complete bill analysis
npm run bills:full
```

## 📋 Core Policy Topics

The system includes 12 core policy topic areas:

- **Healthcare** - Healthcare policy, insurance, medical access
- **Immigration** - Immigration policy, border security, asylum
- **Economy** - Economic policy, jobs, trade, fiscal policy  
- **Housing** - Housing affordability, homeownership, rental policy
- **Education** - Education policy, schools, student loans
- **Environment** - Environmental protection, climate change, clean energy
- **National Defense** - National security, military, veterans affairs
- **Civil Rights** - Civil rights, voting rights, equality
- **Criminal Justice** - Law enforcement, prison reform
- **Taxation** - Tax policy, tax rates, tax reform
- **Social Security** - Social Security benefits, retirement
- **Technology** - Technology policy, internet, privacy, cybersecurity

Each topic includes multiple aliases for robust matching.

## 🔍 Analysis Features

### Position Analysis
- **Coverage Report** - Which politicians have positions on which topics
- **Party Breakdown** - Position distribution by political party
- **Key Issues** - Which topics politicians emphasize most
- **Missing Positions** - Politicians without positions on specific topics

### Voting Consistency
- **Consistency Scoring** - How well voting records align with stated positions
- **Pattern Analysis** - Voting patterns (supportive, opposing, mixed)
- **Inconsistency Detection** - Politicians with significant gaps between positions and votes

### Bill Topic Mapping
- **Topic Relevance** - Which bills relate to which policy topics
- **Vote Coverage** - How many politicians voted on topic-relevant bills
- **Trend Analysis** - Topic popularity over time

## 🛠️ Advanced Usage

### Custom Topic Analysis
```bash
# Analyze specific topic by party
node scripts/policy-position-analyzer.js topic immigration

# Find politicians missing positions on healthcare
node scripts/policy-position-analyzer.js missing healthcare

# Get bills related to environment
node scripts/bill-topic-mapper.js topic-bills environment
```

### Data Export
```bash
# Export all healthcare positions to JSON
node scripts/policy-position-analyzer.js export healthcare

# This creates: healthcare_positions.json
```

### Crawl Status and Debugging
```bash
# Check recent crawling activity
sqlite3 data/politicians.db "SELECT * FROM crawl_log ORDER BY crawled_at DESC LIMIT 10"

# See crawl success rate
sqlite3 data/politicians.db "SELECT crawl_status, COUNT(*) FROM crawl_log GROUP BY crawl_status"

# Find politicians with crawl errors
sqlite3 data/politicians.db "SELECT pol.name, cl.error_message FROM crawl_log cl JOIN politicians pol ON cl.politician_id = pol.id WHERE cl.crawl_status = 'error'"
```

## 📈 Sample Queries

### Most Discussed Topics
```sql
SELECT 
  t.display_name,
  COUNT(*) as position_count,
  COUNT(DISTINCT p.politician_id) as politician_count
FROM politician_positions p
JOIN policy_topics t ON p.topic_id = t.id
GROUP BY t.id
ORDER BY position_count DESC;
```

### Politicians with Most Key Issues
```sql
SELECT 
  pol.name,
  pol.party,
  COUNT(*) as key_issue_count
FROM politician_positions pp
JOIN politicians pol ON pp.politician_id = pol.id
WHERE pp.is_key_issue = 1
GROUP BY pol.id
ORDER BY key_issue_count DESC
LIMIT 10;
```

### Voting Consistency by Party
```sql
SELECT 
  pol.party,
  AVG(pva.consistency_score) as avg_consistency,
  COUNT(*) as analyses_count
FROM position_vote_analysis pva
JOIN politicians pol ON pva.politician_id = pol.id
WHERE pva.total_votes >= 3
GROUP BY pol.party
ORDER BY avg_consistency DESC;
```

## ⚙️ Configuration

### Crawler Settings
Edit `scripts/policy-position-crawler.js` to adjust:
- `requestDelay` - Time between website requests (default: 2000ms)
- `maxRetries` - Maximum retry attempts for failed requests (default: 3)
- Content extraction selectors and patterns

### Topic Customization
Add new topics or aliases by modifying the `initializeTopicMappings()` method in the crawler or by directly inserting into the database:

```sql
-- Add new topic
INSERT INTO policy_topics (canonical_name, display_name, description)
VALUES ('energy', 'Energy Policy', 'Energy production, distribution, and regulation');

-- Add topic aliases
INSERT INTO topic_aliases (topic_id, alias, confidence_score)
SELECT id, 'renewable energy', 0.9 FROM policy_topics WHERE canonical_name = 'energy';
```

## 🔧 Troubleshooting

### Common Issues

1. **Website Access Errors**
   - Some politician websites may block automated requests
   - Check crawl_log table for specific error messages
   - Consider adjusting request delays or user agent

2. **Low Position Extraction**
   - Some websites may have content in non-standard formats
   - Review extraction selectors in `findContentSections()`
   - Check if content is loaded dynamically (requires different approach)

3. **Topic Matching Issues**
   - Add more aliases for better topic detection
   - Review confidence scores for topic matching
   - Consider adding domain-specific terminology

### Performance Optimization

- Use `--limit` flag for testing and partial runs
- Monitor database size growth
- Consider implementing caching for repeated website access
- Add database indexes for frequently queried fields

## 📝 Contributing

When adding new features:

1. **New Topics** - Add to core topics list with comprehensive aliases
2. **Extraction Patterns** - Update content selectors for better coverage
3. **Analysis Methods** - Enhance consistency scoring algorithms
4. **Data Validation** - Add checks for data quality and completeness

## 🎯 Future Enhancements

- **Natural Language Processing** - Better position sentiment analysis
- **Machine Learning** - Improved consistency scoring
- **Real-time Updates** - Automated periodic crawling
- **API Integration** - Direct feeds from official sources
- **Visualization** - Interactive charts and graphs for analysis
- **Multi-language Support** - Support for non-English content
