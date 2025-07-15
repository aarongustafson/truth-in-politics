// API endpoint for politician search data
const Database = require('better-sqlite3');
const path = require('path');

module.exports = function() {
  try {
    // Connect to the database - try multiple possible paths
    const possiblePaths = [
      path.join(__dirname, '..', '..', 'data', 'politicians.db'),
      path.join(process.cwd(), 'data', 'politicians.db'),
      path.join(__dirname, '../../data/politicians.db'),
      path.join(__dirname, '..', '..', '..', 'data', 'politicians.db')
    ];
    
    let dbPath = null;
    for (const testPath of possiblePaths) {
      if (require('fs').existsSync(testPath)) {
        dbPath = testPath;
        break;
      }
    }
    
    if (!dbPath) {
      throw new Error(`Database not found. Tried paths: ${possiblePaths.join(', ')}`);
    }
    
    console.log(`📁 Using database at: ${dbPath} for search API`);
    const db = new Database(dbPath, { readonly: true });
    
    // Get all politicians with essential search data
    const politicians = db.prepare(`
      SELECT 
        id,
        name,
        party,
        state,
        chamber,
        district,
        title
      FROM politicians 
      ORDER BY name
    `).all();
    
    console.log(`📊 Preparing ${politicians.length} politicians for search API`);
    
    // Process for search - clean and format data
    const searchData = politicians.map(politician => ({
      id: politician.id,
      name: politician.name,
      party: politician.party || 'Unknown',
      state: politician.state || 'Unknown',
      chamber: politician.chamber || 'Unknown',
      district: politician.district,
      title: politician.title || 'Member of Congress',
      // Generate the URL slug for linking
      slug: politician.id
    }));
    
    db.close();
    return searchData;
    
  } catch (error) {
    console.error('❌ Error loading politicians for search API:', error.message);
    return [];
  }
};
