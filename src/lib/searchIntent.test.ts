import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldEnableLiveSearch } from './searchIntent';

test('shouldEnableLiveSearch skips search for greetings and pure coding prompts', () => {
  assert.equal(shouldEnableLiveSearch('hi'), false);
  assert.equal(shouldEnableLiveSearch('hello there'), false);
  assert.equal(
    shouldEnableLiveSearch('Write a type-safe debounce hook in React 19.'),
    false,
  );
  assert.equal(
    shouldEnableLiveSearch('Compare optimistic UI updates vs server-confirmed writes.'),
    false,
  );
});

test('shouldEnableLiveSearch enables search for live events, prices, weather, and news', () => {
  assert.equal(
    shouldEnableLiveSearch('What are the top technology headlines today?'),
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
  assert.equal(
    shouldEnableLiveSearch('Who won the latest cricket match?'),
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
