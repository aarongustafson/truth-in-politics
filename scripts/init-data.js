// Node.js script to initialize sample data
const PoliticianDatabase = require('../src/js/database.js');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize database
const db = new PoliticianDatabase(path.join(dataDir, 'politicians.db'));

// Sample politicians data
const samplePoliticians = [
  {
    id: 'alexandria-ocasio-cortez',
    name: 'Alexandria Ocasio-Cortez',
    party: 'Democratic',
    state: 'NY',
    chamber: 'House',
    district: '14th District',
    title: 'Representative',
    first_elected: 2018,
    website: 'https://ocasio-cortez.house.gov',
    bio_data: {
      birthDate: '1989-10-13',
      education: 'Boston University (BA Economics, International Relations)',
      previousOccupation: 'Bartender, Community Organizer'
    }
  },
  {
    id: 'ted-cruz',
    name: 'Ted Cruz',
    party: 'Republican',
    state: 'TX',
    chamber: 'Senate',
    title: 'Senator',
    first_elected: 2012,
    website: 'https://www.cruz.senate.gov',
    bio_data: {
      birthDate: '1970-12-22',
      education: 'Princeton University (BA), Harvard Law School (JD)',
      previousOccupation: 'Lawyer, Solicitor General of Texas'
    }
  },
  {
    id: 'bernie-sanders',
    name: 'Bernie Sanders',
    party: 'Independent',
    state: 'VT',
    chamber: 'Senate',
    title: 'Senator',
    first_elected: 2006,
    website: 'https://www.sanders.senate.gov',
    bio_data: {
      birthDate: '1941-09-08',
      education: 'University of Chicago (BA Political Science)',
      previousOccupation: 'Mayor of Burlington, U.S. Representative'
    }
  },
  {
    id: 'nancy-pelosi',
    name: 'Nancy Pelosi',
    party: 'Democratic',
    state: 'CA',
    chamber: 'House',
    district: '5th District',
    title: 'Representative',
    first_elected: 1987,
    website: 'https://pelosi.house.gov',
    bio_data: {
      birthDate: '1940-03-26',
      education: 'Trinity College (BA Political Science)',
      previousOccupation: 'Democratic Party Organizer'
    }
  }
];

// Sample policy positions
const samplePolicyPositions = [
  {
    politician_id: 'alexandria-ocasio-cortez',
    category: 'Climate Change',
    stated_position: 'Supports the Green New Deal and aggressive action on climate change to achieve net-zero emissions',
    alignment_score: 92,
    source_url: 'https://ocasio-cortez.house.gov/issues/green-new-deal'
  },
  {
    politician_id: 'alexandria-ocasio-cortez',
    category: 'Healthcare',
    stated_position: 'Supports Medicare for All universal healthcare system',
    alignment_score: 88,
    source_url: 'https://ocasio-cortez.house.gov/issues/medicare-for-all'
  },
  {
    politician_id: 'ted-cruz',
    category: 'Healthcare',
    stated_position: 'Opposes government-run healthcare, supports market-based solutions',
    alignment_score: 85,
    source_url: 'https://www.cruz.senate.gov/issues/healthcare'
  },
  {
    politician_id: 'ted-cruz',
    category: 'Immigration',
    stated_position: 'Supports secure borders and merit-based immigration system',
    alignment_score: 90,
    source_url: 'https://www.cruz.senate.gov/issues/immigration'
  }
];

// Sample public statements
const sampleStatements = [
  {
    politician_id: 'alexandria-ocasio-cortez',
    policy_category: 'Climate Change',
    statement_text: 'Climate change is the single biggest national security threat for our generation.',
    source: 'CNN Interview',
    source_url: 'https://example.com/cnn-interview',
    statement_date: '2023-09-15',
    credibility_score: 85
  },
  {
    politician_id: 'alexandria-ocasio-cortez',
    policy_category: 'Healthcare',
    statement_text: 'Healthcare is a human right, not a privilege based on income.',
    source: 'Town Hall Meeting',
    source_url: 'https://example.com/townhall',
    statement_date: '2023-07-22',
    credibility_score: 90
  },
  {
    politician_id: 'ted-cruz',
    policy_category: 'Healthcare',
    statement_text: 'Government-run healthcare would destroy the doctor-patient relationship.',
    source: 'Senate Floor Speech',
    source_url: 'https://example.com/senate-speech',
    statement_date: '2023-08-10',
    credibility_score: 95
  }
];

// Sample voting records
const sampleVotes = [
  {
    politician_id: 'alexandria-ocasio-cortez',
    bill_name: 'Inflation Reduction Act',
    bill_id: 'HR5376-117',
    vote_decision: 'Yes',
    vote_date: '2022-08-12',
    policy_category: 'Climate Change',
    description: 'Major climate investment and inflation reduction package',
    source_url: 'https://www.congress.gov/bill/117th-congress/house-bill/5376'
  },
  {
    politician_id: 'alexandria-ocasio-cortez',
    bill_name: 'Lower Drug Costs Now Act',
    bill_id: 'HR3-118',
    vote_decision: 'Yes',
    vote_date: '2023-03-15',
    policy_category: 'Healthcare',
    description: 'Allow Medicare to negotiate prescription drug prices',
    source_url: 'https://www.congress.gov/bill/118th-congress/house-bill/3'
  },
  {
    politician_id: 'ted-cruz',
    bill_name: 'Inflation Reduction Act',
    bill_id: 'HR5376-117',
    vote_decision: 'No',
    vote_date: '2022-08-07',
    policy_category: 'Climate Change',
    description: 'Major climate investment and inflation reduction package',
    source_url: 'https://www.congress.gov/bill/117th-congress/house-bill/5376'
  }
];

// Insert sample data
console.log('Initializing database with sample data...');

try {
  // Insert politicians
  samplePoliticians.forEach(politician => {
    db.insertPolitician(politician);
    console.log(`Inserted politician: ${politician.name}`);
  });

  // Insert policy positions
  samplePolicyPositions.forEach(position => {
    db.insertPolicyPosition(position);
    console.log(`Inserted policy position: ${position.category} for ${position.politician_id}`);
  });

  // Insert public statements
  sampleStatements.forEach(statement => {
    db.insertPublicStatement(statement);
    console.log(`Inserted statement for ${statement.politician_id}`);
  });

  // Insert voting records
  sampleVotes.forEach(vote => {
    db.insertVotingRecord(vote);
    console.log(`Inserted vote record: ${vote.bill_name} for ${vote.politician_id}`);
  });

  console.log('\nDatabase initialization complete!');
  console.log(`Database location: ${path.join(dataDir, 'politicians.db')}`);

  // Test the database
  console.log('\nTesting database...');
  const searchResults = db.searchPoliticians('ocasio');
  console.log('Search results for "ocasio":', searchResults.length, 'results');

  if (searchResults.length > 0) {
    const politician = searchResults[0];
    const profile = db.getComprehensiveProfile(politician.id);
    console.log(`Comprehensive profile for ${politician.name}:`);
    console.log(`- Policy positions: ${profile.policyPositions.length}`);
    console.log(`- Public statements: ${profile.statements.length}`);
    console.log(`- Voting records: ${profile.votes.length}`);
  }

} catch (error) {
  console.error('Error initializing database:', error);
} finally {
  db.close();
}

console.log('\nNext steps:');
console.log('1. Run "npm install" to install dependencies');
console.log('2. Run "npm start" to start the development server');
console.log('3. Visit http://localhost:8080 to view the site');
