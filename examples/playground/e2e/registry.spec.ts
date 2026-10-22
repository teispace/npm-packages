import { expect, test } from '@playwright/test';

/** The shadcn registry route: items from the package's build, and nothing else. */
test.describe('registry', () => {
  test('lists the items, each a registry item with the component’s source', async ({ request }) => {
    const index = await request.get('/r/index.json');
    expect(index.ok()).toBe(true);
    const items = (await index.json()) as { name: string; url: string }[];
    expect(items.map((item) => item.name)).toContain('teieditor-bubble-menu');

    const item = await request.get('/r/teieditor-bubble-menu.json');
    expect(item.headers()['content-type']).toContain('application/json');
    const body = await item.json();
    expect(body.type).toBe('registry:component');
    expect(body.dependencies[0]).toMatch(/^@teispace\/teieditor@\^/);
    expect(body.files[0].path).toBe('components/teieditor/bubble-menu.tsx');
    // Public imports only: it builds in any app.
    expect(body.files[0].content).toContain("from '@teispace/teieditor/react'");
    expect(body.files[0].content).not.toMatch(/from '\.\.?\//);
  });

  test('serves names only: no paths, no other files', async ({ request }) => {
    for (const path of ['/r/missing.json', '/r/..%2Fpackage.json', '/r/manifest', '/r/%2e%2e%2f%2e%2e%2fpackage.json']) {
      expect((await request.get(path)).status(), path).toBe(404);
    }
  });
});
