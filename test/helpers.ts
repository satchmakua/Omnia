import { loadContentFromDisk } from '../src/content/fsSource.ts';
import type { Content } from '../src/content/loader.ts';

// Load the real authored content once for tests that need a populated world.
let cached: Content | null = null;
export function testContent(): Content {
  if (!cached) cached = loadContentFromDisk('./content');
  return cached;
}
