# Congressional Voting Records & Legislation Tracking

This system provides comprehensive tracking of congressional voting records and legislative activity (sponsored/cosponsored bills) with configurable data strategies and periodic updates.

## 🏛️ Features

### Voting Records
- **House Voting Records**: Uses Congress.gov beta API for House roll call votes
- **Individual Member Votes**: Tracks how each representative voted on specific bills
- **Voting Statistics**: Participation rates, agreement analysis, voting patterns
- **Historical Data**: Configurable date ranges from recent (90 days) to full congressional term

### Legislative Activity
- **Sponsored Legislation**: Bills and resolutions sponsored by each member
- **Cosponsored Legislation**: Bills and resolutions cosponsored by each member
- **Legislative Alignment**: Analysis of shared legislative interests between members
- **Bill Tracking**: Comprehensive bill metadata, status, and progression

### Alignment Analysis
- **Voting Alignment**: How often two politicians vote the same way
- **Legislative Alignment**: Shared sponsored and cosponsored legislation
- **Weighted Scoring**: Sponsoring together weighted higher than cosponsoring

## 📊 Data Strategies

### 1. Recent Strategy (Default)
- **Voting**: Last 90 days
- **Legislation**: Last 180 days (6 months)
- **Update Speed**: Fast (minutes)
- **Use Case**: Regular site updates, current activity tracking

```bash
npm run config:recent
```

### 2. Historical Strategy
- **Voting**: From start of 118th Congress (January 3, 2023)
- **Legislation**: From start of 118th Congress
- **Update Speed**: Moderate (30-60 minutes)
- **Use Case**: Comprehensive term analysis, research

```bash
npm run config:historical
```

### 3. Comprehensive Strategy
- **Voting**: Full historical + individual member tracking
- **Legislation**: Full sponsored/cosponsored tracking for all members
- **Alignment**: Full voting and legislative alignment calculations
- **Update Speed**: Slow (2-4 hours for all 554 members)
- **Use Case**: Deep research, academic analysis, full site features

```bash
npm run config:comprehensive
```

## 🚀 Quick Start

### 1. Set Your Data Strategy
```bash
# For regular updates (recommended)
npm run config:recent

# For comprehensive historical data
npm run config:historical

# For full research capabilities
npm run config:comprehensive
```

### 2. Check Current Configuration
```bash
npm run config:show
```

### 3. Update Congressional Data
```bash
# Regular build (includes data update)
npm run build

# Force data update
npm run data:update:force

# Check data status
npm run data:status
```

### 4. Fetch Specific Data Types
```bash
# Comprehensive data (legislation + voting + alignment)
npm run congress:comprehensive

# Historical voting only
npm run congress:historical

# Current statistics
npm run congress:stats
```

## 📅 Date Range Configuration

### View Current Date Ranges
```bash
node scripts/congress-data-config.js dates
```

### Customize Date Ranges
```bash
# Set recent voting to last 60 days
node scripts/congress-data-config.js update recent votingDays 60

# Set historical start date to mid-2023
node scripts/congress-data-config.js update historical votingStartDate 2023-06-01

# Set max legislation per politician for comprehensive
node scripts/congress-data-config.js update comprehensive maxLegislationPerPolitician 150
```

## 🔧 Advanced Usage

### Manual Data Fetching

#### Voting Records Only
```bash
# Recent House votes (last 7 days)
node scripts/voting-records-fetcher.js --start-date 2025-07-08

# Historical House votes (specific range)
node scripts/voting-records-fetcher.js --start-date 2023-01-03 --end-date 2023-12-31 --limit 500
```

#### Comprehensive Data
```bash
# Fetch everything for all politicians
node scripts/comprehensive-congress-fetcher.js comprehensive

# Fetch only legislation (no voting)
node scripts/comprehensive-congress-fetcher.js comprehensive --no-voting

# Fetch with custom date ranges
node scripts/comprehensive-congress-fetcher.js comprehensive --legislation-start 2024-01-01
```

### Periodic Updates
```bash
# Check if update is needed
node scripts/periodic-voting-updater.js status

# Force periodic update
node scripts/periodic-voting-updater.js update --force

# Configure update frequency
node scripts/periodic-voting-updater.js configure --frequency weekly
```

## 📈 Data Analysis

### Current Statistics
```bash
npm run congress:stats
```

Example output:
```
📊 Comprehensive Congressional Data Statistics:
──────────────────────────────────────────────────────────────
Legislation: 1,247 bills from 89 sponsors
Date range: 2023-01-03 to 2025-07-15

Sponsorship breakdown:
  sponsor: 892 (89 politicians)
  cosponsor: 3,456 (234 politicians)

Top legislative alignments:
  1. Elizabeth Warren & Bernie Sanders: 15 (3 sponsored, 12 cosponsored)
  2. Alexandria Ocasio-Cortez & Rashida Tlaib: 12 (2 sponsored, 10 cosponsored)
  ...
```

### Database Queries

The system creates comprehensive database tables:

#### Key Tables
- `votes`: Roll call votes with metadata
- `politician_votes`: Individual politician positions on votes
- `legislation`: Bills and resolutions
- `politician_legislation`: Sponsor/cosponsor relationships
- `voting_alignment`: Calculated voting agreement rates
- `legislative_alignment`: Shared legislation analysis

#### Example Queries
```sql
-- Find politicians who vote together most often
SELECT p1.name, p2.name, va.agreement_rate, va.total_shared_votes
FROM voting_alignment va
JOIN politicians p1 ON va.politician1_id = p1.id
JOIN politicians p2 ON va.politician2_id = p2.id
WHERE va.total_shared_votes > 10
ORDER BY va.agreement_rate DESC;

-- Find most prolific bill sponsors
SELECT p.name, COUNT(*) as bills_sponsored
FROM politician_legislation pl
JOIN politicians p ON pl.politician_id = p.id
WHERE pl.relationship_type = 'sponsor'
GROUP BY p.id, p.name
ORDER BY bills_sponsored DESC;
```

## 🔑 API Configuration

### Congress.gov API Key
1. Get a free API key: https://api.congress.gov/sign-up/
2. Add to your `.env` file:
```
CONGRESS_GOV_API_KEY=your_api_key_here
```

### Rate Limiting
The system automatically handles rate limiting:
- 250ms delay between requests
- Batch processing with longer delays
- Configurable via `congress-data-config.js`

## 🏗️ Build Integration

### Automatic Updates
```bash
# Normal build with data update
npm run build

# Quick build without data update
npm run build:quick
```

### Build Configuration
```bash
# Check if data update is needed
node scripts/congress-data-config.js should-update

# Configure max data age (hours)
node scripts/congress-data-config.js update buildIntegration dataMaxAge 12
```

## 📊 Frontend Integration

### Politicians Data
Updated `src/_data/politicians.js` includes voting statistics:
```javascript
{
  name: "Elizabeth Warren",
  party: "Democratic",
  votingStats: {
    totalVotes: 245,
    participationRate: 97.2,
    lastVoteDate: "2025-07-14"
  }
}
```

### API Endpoints
- `/api/politicians.json` - All politicians with voting stats
- `/api/politician/{slug}/votes.json` - Individual politician voting records
- `/api/recent-votes.json` - Recent congressional votes

### Template Helpers
```javascript
// In Nunjucks templates
{{ voting.getRecentVotesForPolitician(politician.id, 10) }}
{{ voting.calculateAlignment(politician1.id, politician2.id) }}
{{ voting.formatVotePosition(position) }}
```

## 🔍 Monitoring & Debugging

### Status Commands
```bash
npm run data:status          # Overall data status
npm run voting:status        # Voting records status
npm run config:show          # Current configuration
```

### Log Files
- Database operations logged to console
- API requests with response codes
- Rate limiting and error handling
- Progress indicators for long operations

### Common Issues

1. **403 API Errors**: Check your API key in `.env`
2. **404 Vote Errors**: Normal for future dates or limited historical data
3. **Timeout Issues**: Reduce batch sizes in configuration
4. **Database Locks**: Ensure only one update process runs at a time

## 📝 Examples

### Research Workflow
```bash
# Set up for comprehensive research
npm run config:comprehensive

# Fetch all historical data (this will take 2-4 hours)
npm run congress:comprehensive

# Generate site with full data
npm run build

# Check results
npm run congress:stats
```

### Daily Update Workflow
```bash
# Set up for regular updates
npm run config:recent

# Normal daily build (quick)
npm run build

# Check what's new
npm run voting:status
```

### Custom Analysis
```bash
# Fetch only recent voting records
npm run config:recent
node scripts/voting-records-fetcher.js --start-date 2025-07-01

# Fetch legislation for specific timeframe
node scripts/comprehensive-congress-fetcher.js comprehensive \
  --legislation-start 2024-01-01 \
  --no-voting \
  --max-legislation 100
```

## 🎯 Next Steps

1. **Set your preferred data strategy** based on your needs
2. **Run initial data fetch** for your chosen strategy
3. **Integrate build process** with your deployment pipeline
4. **Customize date ranges** and limits as needed
5. **Monitor update performance** and adjust configuration

The system is designed to be flexible and scalable - start with 'recent' strategy for quick setup, then expand to 'historical' or 'comprehensive' as needed for deeper analysis.
