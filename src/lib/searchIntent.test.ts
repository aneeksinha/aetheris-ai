import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldEnableLiveSearch } from './searchIntent';

test('shouldEnableLiveSearch skips greetings, coding, and static architecture prompts', () => {
  assert.equal(shouldEnableLiveSearch('hi'), false);
  assert.equal(shouldEnableLiveSearch('Hello!'), false);
  assert.equal(shouldEnableLiveSearch('thanks'), false);
  assert.equal(
    shouldEnableLiveSearch('Write a type-safe debounce hook in React 19.'),
    false,
  );
  assert.equal(
    shouldEnableLiveSearch('Compare optimistic UI updates vs server-confirmed writes.'),
    false,
  );
});

test('shouldEnableLiveSearch enables Google Search automatically for real-world & current queries', () => {
  assert.equal(
    shouldEnableLiveSearch('What are the top technology headlines today?'),
    true,
  );
  assert.equal(
    shouldEnableLiveSearch('Who won the 2025 UEFA Champions League final?'),
    true,
  );
  assert.equal(
    shouldEnableLiveSearch('What is the weather in New Delhi right now?'),
    true,
  );
  assert.equal(
    shouldEnableLiveSearch('What is the latest Bitcoin price in USD?'),
    true,
  );
});

test('shouldEnableLiveSearch skips search on attachments unless explicitly asked to search online', () => {
  assert.equal(
    shouldEnableLiveSearch('Summarize the latest numbers in this PDF', true),
    false,
  );
  assert.equal(
    shouldEnableLiveSearch('Search the web to verify this claim in the PDF', true),
    true,
  );
});
