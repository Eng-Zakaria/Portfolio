# Gemini API Rate Limit Fix

## Problem

The Gemini API has a **free tier rate limit of 5 requests per minute per project per model**. The comparison scripts (`compare_vs_gemini.py` and `compare_llms.py`) were making requests too quickly, causing the API to return `429 RESOURCE_EXHAUSTED` errors after the first 5 requests.

### Symptoms

- Only 15-16 out of 145 test cases were being evaluated by Gemini
- 129 errors with message: `429 RESOURCE_EXHAUSTED. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 5, model: gemini-2.5-flash`
- Gemini pass rate appeared artificially low (87.5%) because only 16 cases were checked

## Solution

Added rate limiting to both comparison scripts with the following features:

### 1. Rate Limiter Class

A `RateLimiter` class that:
- Tracks request timestamps
- Enforces 5 requests per minute limit
- Automatically waits when limit is reached
- Adds a small buffer (0.5s) to avoid edge cases

### 2. Exponential Backoff with Retry

When a rate limit error (429) is detected:
- Retries up to 3 times
- Uses exponential backoff: 2s, 4s, 8s + jitter
- Resets the rate limiter after backoff
- Properly handles non-retryable errors

### 3. Better Error Reporting

- Logs when rate limits are hit
- Shows retry attempts and wait times
- Marks empty answers with warnings
- Preserves error details in results

## Changes Made

### `compare_vs_gemini.py`

1. Added `RateLimiter` class (lines 45-63)
2. Updated `ask_gemini()` function with:
   - Rate limiting before each request
   - Retry logic with exponential backoff
   - Better error handling and reporting
3. Added warning when Gemini returns empty answer

### `compare_llms.py`

1. Added `RateLimiter` class (lines 60-78)
2. Updated `GeminiEvaluator.generate_answer()` with:
   - Rate limiting before each request
   - Retry logic with exponential backoff
   - Better error handling and reporting
3. Added warning when Gemini returns empty answer

## Expected Behavior After Fix

- All 145 test cases will be evaluated by Gemini
- Script will automatically pause when rate limit is reached
- Total runtime will be longer (approximately 30 minutes for 145 requests at 5 RPM)
- No more 429 errors
- Accurate comparison metrics

## Usage Notes

1. **Patience required**: With 5 RPM limit, 145 requests will take ~30 minutes
2. **Monitor progress**: The script will print wait messages when rate limited
3. **Check results**: All Gemini answers should now be populated (no empty answers)
4. **Error handling**: If you still see errors, they are likely non-rate-limit issues

## Testing

The rate limiter was tested with a standalone script and verified to:
- Allow first 5 requests immediately
- Wait ~60 seconds before allowing next 5 requests
- Properly track request timestamps
- Handle edge cases (requests spanning minute boundaries)

## Future Improvements

If you need faster evaluation:
1. **Upgrade Gemini plan**: Paid tiers have higher rate limits
2. **Use multiple API keys**: Distribute requests across multiple projects
3. **Cache results**: Store Gemini answers and reuse them
4. **Parallel testing**: Run multiple scripts with different API keys

## Files Modified

- `compare_vs_gemini.py` - Added rate limiting and retry logic
- `compare_llms.py` - Added rate limiting and retry logic

## Verification

Run the comparison scripts again and verify:
- All test cases show Gemini results
- No 429 errors in the output
- Script completes successfully (takes ~30 minutes)
- Comparison metrics are accurate