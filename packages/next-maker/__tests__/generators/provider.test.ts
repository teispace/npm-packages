import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateProvider } from '../../src/generators/provider.generator';
import { findRootProviderFile, registerProvider } from '../../src/modifiers/root-provider.modifier';

const ROOT_PROVIDER_FIXTURE = `'use client';
import { StoreProvider } from './StoreProvider';

export const RootProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <StoreProvider>
      {children}
    </StoreProvider>
  );
};
`;

const BARREL_FIXTURE = `export * from './RootProvider';\nexport * from './StoreProvider';\n`;

let projectPath: string;

beforeEach(async () => {
  projectPath = await mkdtemp(path.join(tmpdir(), 'next-maker-provider-'));
  await mkdir(path.join(projectPath, 'src/providers'), { recursive: true });
});

afterEach(async () => {
  await rm(projectPath, { recursive: true, force: true });
});

describe('generateProvider', () => {
  it('writes the provider file at src/providers/<Name>Provider.tsx', async () => {
    const result = await generateProvider({ name: 'auth', projectPath });
    expect(result.componentName).toBe('AuthProvider');
    expect(result.fileBaseName).toBe('AuthProvider');
    expect(result.providerFile).toBe(path.join(projectPath, 'src/providers/AuthProvider.tsx'));

    const contents = await readFile(result.providerFile, 'utf-8');
    expect(contents).toContain('export const AuthProvider');
  });

  it('refuses to overwrite an existing provider file', async () => {
    await generateProvider({ name: 'auth', projectPath });
    await expect(generateProvider({ name: 'auth', projectPath })).rejects.toThrow(/already exists/);
  });

  it('rejects names with invalid characters', async () => {
    await expect(generateProvider({ name: 'Auth/Bad', projectPath })).rejects.toThrow(
      /Invalid provider name/,
    );
  });

  it('handles names already ending in Provider', async () => {
    const result = await generateProvider({ name: 'session-provider', projectPath });
    expect(result.componentName).toBe('SessionProvider');
  });
});

describe('findRootProviderFile', () => {
  it('returns the canonical path when present', async () => {
    const canonical = path.join(projectPath, 'src/providers/RootProvider.tsx');
    await writeFile(canonical, ROOT_PROVIDER_FIXTURE);
    const found = await findRootProviderFile(projectPath);
    expect(found).toBe(canonical);
  });

  it('falls back to a heuristic scan when canonical is missing', async () => {
    const decoy = path.join(projectPath, 'src/providers/DecoyProvider.tsx');
    await writeFile(decoy, 'export const Decoy = () => <div />;\n');

    const wrap = path.join(projectPath, 'src/providers/AppProviders.tsx');
    await writeFile(wrap, ROOT_PROVIDER_FIXTURE.replace('RootProvider', 'AppProviders'));

    const found = await findRootProviderFile(projectPath);
    expect(found).toBe(wrap);
  });

  it('returns null when no candidate is found', async () => {
    const decoy = path.join(projectPath, 'src/providers/Decoy.tsx');
    await writeFile(decoy, 'export const Decoy = () => <div />;\n');
    const found = await findRootProviderFile(projectPath);
    expect(found).toBeNull();
  });
});

describe('registerProvider', () => {
  it('wraps {children} and updates the barrel', async () => {
    const canonical = path.join(projectPath, 'src/providers/RootProvider.tsx');
    await writeFile(canonical, ROOT_PROVIDER_FIXTURE);
    const barrel = path.join(projectPath, 'src/providers/index.ts');
    await writeFile(barrel, BARREL_FIXTURE);

    const result = await registerProvider({
      projectPath,
      componentName: 'AuthProvider',
      fileBaseName: 'AuthProvider',
    });

    expect(result.rootProviderFile).toBe(canonical);
    expect(result.barrelFile).toBe(barrel);

    const updated = await readFile(canonical, 'utf-8');
    expect(updated).toContain('<AuthProvider>');
    expect(updated).toContain("import { AuthProvider } from './AuthProvider';");

    const updatedBarrel = await readFile(barrel, 'utf-8');
    expect(updatedBarrel).toContain("export * from './AuthProvider';");
  });

  it('reports null root-provider when none can be located', async () => {
    const result = await registerProvider({
      projectPath,
      componentName: 'AuthProvider',
      fileBaseName: 'AuthProvider',
    });
    expect(result.rootProviderFile).toBeNull();
  });

  it('is idempotent', async () => {
    const canonical = path.join(projectPath, 'src/providers/RootProvider.tsx');
    await writeFile(canonical, ROOT_PROVIDER_FIXTURE);
    const barrel = path.join(projectPath, 'src/providers/index.ts');
    await writeFile(barrel, BARREL_FIXTURE);

    await registerProvider({
      projectPath,
      componentName: 'AuthProvider',
      fileBaseName: 'AuthProvider',
    });
    const onceContent = await readFile(canonical, 'utf-8');

    await registerProvider({
      projectPath,
      componentName: 'AuthProvider',
      fileBaseName: 'AuthProvider',
    });
    const twiceContent = await readFile(canonical, 'utf-8');

    expect(twiceContent).toBe(onceContent);
  });
});
