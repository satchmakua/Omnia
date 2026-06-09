// Node-only content source: walk the /content tree and read every YAML file
// into a { relativePath: text } map for the pure loader. NOT imported by the
// browser bundle (main.ts uses import.meta.glob instead) — keeps fs out of Vite.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { loadContent } from './loader.ts';
import type { Content } from './loader.ts';

function walk(dir: string, root: string, out: Map<string, string>): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, root, out);
    } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
      const rel = relative(root, full).split(sep).join('/');
      out.set(rel, readFileSync(full, 'utf8'));
    }
  }
}

export function readContentFiles(root = './content'): Map<string, string> {
  const files = new Map<string, string>();
  walk(root, root, files);
  return files;
}

export function loadContentFromDisk(root = './content'): Content {
  return loadContent(readContentFiles(root));
}
