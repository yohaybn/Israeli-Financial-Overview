# Test Data

This directory contains anonymized test data for development and testing purposes.

## Structure

Test data files are named: `test_data_{companyId}.json`

Example:
- `test_data_isracard.json`
- `test_data_mizrahi.json`

## Anonymization

All test data has been anonymized:
- ✓ Transaction amounts randomized (±20% variation)
- ✓ Account numbers masked (XXXX-1234 format)
- ✓ Merchant names replaced with generic placeholders
- ✓ Personal information removed
- ✓ Data structure preserved

## Usage

### In Debug Mode
Enable "Use Test Data" in the UI to load test data instead of running actual scrapers.

### In Tests
```javascript
import { loadTestData } from '../src/testHelpers.js';

const testData = loadTestData('isracard');
```

## Generating Test Data

To regenerate test data from current results:

```bash
node scripts/anonymize-results.js
```

This will:
1. Read all `scrape_result_*.json` files from `results/`
2. Anonymize the data
3. Save to `src/testData/test_data_{companyId}.json`

## Important

⚠️ **Do not commit actual result files!** Only commit anonymized test data.

Test data files are gitignored by default. To track specific test files, add them explicitly to git.
