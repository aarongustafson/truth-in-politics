# Truth in Politics - Congressional Data

This directory contains scripts for populating the database with congressional member information.

## Current Data Status

### Sample Data (Default)
The current implementation uses **verified sample data** containing:
- **12 House Representatives** (including leadership and notable members)
- **20 Senators** (representing all political leanings and key states)

**What was removed:**
- ❌ Ron DeSantis (no longer in Congress - now FL Governor)
- ❌ Dianne Feinstein (passed away September 2023)
- ❌ Kevin McCarthy (no longer House Speaker as of October 2023)
- ❌ Other outdated/incorrect entries

**What remains is verified current members as of 2024-2025.**

## Getting Complete Congressional Data

To populate with **all 535 members of Congress**, you need API access:

### Option 1: ProPublica Congress API (Recommended)
1. Get a free API key: https://www.propublica.org/datastore/api/propublica-congress-api
2. Set environment variable:
   ```bash
   export PROPUBLICA_API_KEY="your-api-key-here"
   ```
3. Run the population script:
   ```bash
   npm run populate-congress
   ```

### Option 2: Congress.gov API
1. Get API key: https://api.congress.gov/sign-up/
2. Set environment variable:
   ```bash
   export CONGRESS_GOV_API_KEY="your-api-key-here"
   ```
3. Run the population script

### Option 3: Manual Data Entry
Edit `scripts/populate-congress.js` and add more members to the `houseMembers` and `senateMembers` arrays.

## Scripts

- `populate-congress.js` - Main population script with sample data
- `congress-api-fetcher.js` - API integration for real-time data
- `init-data.js` - Original sample data (4 politicians)

## Usage

```bash
# Populate with sample congressional data
npm run populate-congress

# Populate with original sample data
npm run init-data
```

## Data Accuracy

The sample data includes:
- ✅ Current members as of 2024-2025
- ✅ Correct party affiliations
- ✅ Accurate state/district information  
- ✅ Verified official websites
- ✅ Correct first elected years

For the most current and complete data, use the API integration options above.
