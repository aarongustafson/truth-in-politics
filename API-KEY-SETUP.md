# Congress.gov API Key Setup

## Why You Need an API Key

The Congress.gov API has different rate limits:
- **Without API key**: 25 requests per hour
- **With free API key**: 5,000 requests per hour

Since we need to fetch data for all 535 members of Congress (435 House + 100 Senate), we need the higher rate limit that comes with an API key.

## How to Get a Free API Key

1. **Visit the signup page**: https://api.congress.gov/sign-up/
2. **Fill out the form**:
   - Name
   - Email address
   - Organization (can be "Personal" or "Individual")
   - Intended use (e.g., "Educational project to build a political search tool")
3. **Submit the form**
4. **Check your email** for the API key (usually arrives within a few minutes)

## How to Use Your API Key

Once you have your API key, you can use it in two ways:

### Option 1: Environment Variable (Recommended)
```bash
export CONGRESS_GOV_API_KEY="your-api-key-here"
npm run populate-congress
```

### Option 2: Create a .env file
Create a `.env` file in the project root:
```
CONGRESS_GOV_API_KEY=your-api-key-here
```

Then run:
```bash
npm run populate-congress
```

## What Happens With the API Key

With a valid API key, the system will:
- Fetch all ~435 House Representatives from Congress.gov
- Fetch all 100 Senators from Congress.gov  
- Get real-time, accurate data including:
  - Full names and official titles
  - Current party affiliations
  - State and district information
  - Official websites
  - Committee memberships (where available)
  - Contact information

## Fallback Behavior

If the API key doesn't work or isn't provided, the system will:
1. Try the API without a key (very limited)
2. Fall back to our verified sample data (32 current members)
3. Continue working with the sample data

This ensures the application always works, even without an API key.

## Rate Limiting

The Congress.gov API implements rate limiting:
- Our script includes automatic retry logic with exponential backoff
- It will wait and retry if rate limits are hit
- The full dataset fetch should complete in under 5 minutes with an API key

## Terms of Service

The Congress.gov API is provided by the U.S. Government and is free for public use. Please review their terms of service at https://api.congress.gov/ and use the API responsibly.
