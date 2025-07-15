const Database = require('better-sqlite3');
const path = require('path');

// Connect to the database
const dbPath = path.resolve(__dirname, '../../data/politicians.db');

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Get all politicians
  const getPoliticians = db.prepare(`
    SELECT id, name, party, state, chamber, district, title, first_elected, website 
    FROM politicians 
    ORDER BY name
  `);
  
  // Get positions for each politician
  const getPositions = db.prepare(`
    SELECT 
      pp.topic_id,
      pt.canonical_name as topic_name,
      pt.display_name as topic_display,
      pp.position_summary,
      pp.position_details,
      pp.stance,
      pp.strength,
      pp.confidence_score,
      pp.is_key_issue,
      pp.key_phrases,
      pp.source_url,
      pp.source_section,
      pp.last_updated
    FROM politician_positions pp
    JOIN policy_topics pt ON pp.topic_id = pt.id
    WHERE pp.politician_id = ?
    ORDER BY pp.confidence_score DESC, pp.is_key_issue DESC
  `);
  
  const politicians = getPoliticians.all();
  
  // Add positions to each politician
  const politiciansWithPositions = politicians.map(politician => {
    const positions = getPositions.all(politician.id);
    return {
      ...politician,
      positions: positions,
      slug: politician.id // Use the ID as slug for URLs
    };
  });
  
  db.close();
  
  module.exports = politiciansWithPositions;
  
} catch (error) {
  console.error('Error loading politicians data:', error);
  
  // Fallback to existing data if database is not available
  try {
    module.exports = require('./politicians.js');
  } catch (fallbackError) {
    console.error('Fallback failed:', fallbackError);
    module.exports = [];
  }
}
