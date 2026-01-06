# Debug Mode with Test Data - Quick Guide

## What Changed

**Before**: Two separate toggles (Debug Mode + Test Data)
**Now**: Single "Debug Mode" toggle with dropdown to choose:
- **Use Test Data** (default) - Anonymized test data, no real scraping
- **Use Existing Results** - Latest real result file from results/

## How to Use

### 1. Enable Debug Mode
- Toggle "Debug Mode" ON (red switch)
- Dropdown appears automatically

### 2. Select Mode
- **Use Test Data** (recommended for testing)
  - No credentials needed
  - Instant results
  - Safe for demos
  
- **Use Existing Results**
  - Uses latest real result file
  - Faster than re-scraping
  - Good for testing post-processing

### 3. Run Scraper
- Select company (isracard or mizrahi for test data)
- Click "Run Scraper"
- Results load instantly

## What Was Fixed

1. ✅ **Test data now actually works** - Previously ran real scrapes
2. ✅ **No credentials required** for test data mode
3. ✅ **Simpler UI** - One toggle instead of two
4. ✅ **Default to test data** - Safer option is default

## Files Modified

- `src/routes/scrapeRoutes.js` - Skip credential validation for test data
- `public/index.html` - Replaced toggles with dropdown
- `public/js/main.js` - Updated logic to use dropdown, added dummy credentials

## Test It

1. Start server: `npm start`
2. Open http://localhost:3000
3. Enable "Debug Mode" (should show dropdown)
4. Select "Use Test Data"
5. Choose "isracard" or "mizrahi"
6. Click "Run Scraper"
7. Should see instant results with anonymized data
