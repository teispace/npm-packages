import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyHttpClientFiles } from '../../../../src/services/setup/http-client/assets';

/**
 * Builds a minimal fake nextjs-starter template at `root`. The shape mirrors
 * what `degit clone` produces, but only the files `copyHttpClientFiles`
 * actually reads — that's the contract this test is locking in.
 */
async function writeFakeTemplate(root: string): Promise<void> {
  const write = async (rel: string, body: string) => {
    const full = path.join(root, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  };

  // src/lib/errors — copied wholesale by copyHttpClientFiles
  await write('src/lib/errors/api-exception.ts', '// stub ApiException\n');
  await write('src/lib/errors/index.ts', "export * from './api-exception';\n");

  // src/types — common/, utility/
  await write('src/types/common/http.types.ts', '// stub http types\n');
  await write('src/types/common/index.ts', "export * from './http.types';\n");
  await write('src/types/utility/result.ts', '// stub Result type\n');
  await write('src/types/utility/index.ts', "export * from './result';\n");

  // src/lib/config
  await write('src/lib/config/app-apis.ts', 'export const AppApis = {} as const;\n');
  await write('src/lib/config/api-url.ts', 'export const getApiBaseUrl = () => "";\n');
  await write(
    'src/lib/config/constants.ts',
    "export const API_PREFIX = '/api/v1';\nexport const API_RESPONSE_DATA_KEY = 'data';\nexport const SAVE_AUTH_TOKENS = false;\n",
  );

  // src/services/storage
  await write('src/services/storage/index.ts', '// stub SecureStorageService\n');

  // src/lib/utils/http — top-level files
  await write('src/lib/utils/http/index.ts', '// stub http barrel\n');
  await write('src/lib/utils/http/token-store.ts', '// stub token-store\n');
  await write('src/lib/utils/http/client-utils.ts', '// stub client-utils\n');

  // src/lib/utils/http/shared — the new foundation
  await write('src/lib/utils/http/shared/index.ts', '// stub shared barrel\n');
  await write('src/lib/utils/http/shared/runtime.ts', '// stub runtime\n');
  await write('src/lib/utils/http/shared/cookie-injection.ts', '// stub cookie-injection\n');
  await write('src/lib/utils/http/shared/server-cookies.ts', "import 'server-only';\n");
  await write('src/lib/utils/http/shared/request-id.ts', '// stub request-id\n');
  await write('src/lib/utils/http/shared/response-parser.ts', '// stub response-parser\n');
  await write('src/lib/utils/http/shared/search-params.ts', '// stub search-params\n');

  // src/lib/utils/http/fetch-client
  await write('src/lib/utils/http/fetch-client/index.ts', '// stub fetch barrel\n');
  await write('src/lib/utils/http/fetch-client/fetch-client.ts', '// stub fetch client\n');

  // src/lib/utils/http/axios-client
  await write('src/lib/utils/http/axios-client/index.ts', '// stub axios barrel\n');
  await write('src/lib/utils/http/axios-client/axios-client.ts', '// stub axios client\n');
}

describe('copyHttpClientFiles', () => {
  let template: string;
  let project: string;

  beforeEach(async () => {
    template = await mkdtemp(path.join(tmpdir(), 'next-maker-http-template-'));
    project = await mkdtemp(path.join(tmpdir(), 'next-maker-http-project-'));
    await writeFakeTemplate(template);
  });

  afterEach(async () => {
    await rm(template, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  });

  it('copies the shared/ foundation regardless of which client is picked', async () => {
    await copyHttpClientFiles(project, template, ['fetch']);

    const sharedFiles = [
      'src/lib/utils/http/shared/index.ts',
      'src/lib/utils/http/shared/runtime.ts',
      'src/lib/utils/http/shared/cookie-injection.ts',
      'src/lib/utils/http/shared/server-cookies.ts',
      'src/lib/utils/http/shared/request-id.ts',
      'src/lib/utils/http/shared/response-parser.ts',
      'src/lib/utils/http/shared/search-params.ts',
    ];

    for (const rel of sharedFiles) {
      expect(existsSync(path.join(project, rel)), `missing ${rel}`).toBe(true);
    }
  });

  it('copies api-url.ts on first install', async () => {
    await copyHttpClientFiles(project, template, ['fetch']);

    const apiUrl = await readFile(path.join(project, 'src/lib/config/api-url.ts'), 'utf-8');
    expect(apiUrl).toContain('getApiBaseUrl');
  });

  it('preserves a pre-existing api-url.ts (skip-if-exists)', async () => {
    const apiUrlPath = path.join(project, 'src/lib/config/api-url.ts');
    await mkdir(path.dirname(apiUrlPath), { recursive: true });
    await writeFile(apiUrlPath, '// user-edited\nexport const getApiBaseUrl = () => "custom";\n');

    await copyHttpClientFiles(project, template, ['fetch']);

    const apiUrl = await readFile(apiUrlPath, 'utf-8');
    expect(apiUrl).toContain('user-edited');
    expect(apiUrl).toContain('"custom"');
  });

  it('copies only the requested client variant', async () => {
    await copyHttpClientFiles(project, template, ['fetch']);

    expect(existsSync(path.join(project, 'src/lib/utils/http/fetch-client/fetch-client.ts'))).toBe(
      true,
    );
    expect(existsSync(path.join(project, 'src/lib/utils/http/axios-client/axios-client.ts'))).toBe(
      false,
    );
  });

  it('copies both clients when requested', async () => {
    await copyHttpClientFiles(project, template, ['fetch', 'axios']);

    expect(existsSync(path.join(project, 'src/lib/utils/http/fetch-client/fetch-client.ts'))).toBe(
      true,
    );
    expect(existsSync(path.join(project, 'src/lib/utils/http/axios-client/axios-client.ts'))).toBe(
      true,
    );
  });

  it('always copies token-store, client-utils, and http/index.ts', async () => {
    await copyHttpClientFiles(project, template, ['axios']);

    expect(existsSync(path.join(project, 'src/lib/utils/http/token-store.ts'))).toBe(true);
    expect(existsSync(path.join(project, 'src/lib/utils/http/client-utils.ts'))).toBe(true);
    expect(existsSync(path.join(project, 'src/lib/utils/http/index.ts'))).toBe(true);
  });

  it('removes the previous client when replacing', async () => {
    // Pre-populate the project with an existing fetch client so replace has
    // something to actually remove.
    await mkdir(path.join(project, 'src/lib/utils/http/fetch-client'), { recursive: true });
    await writeFile(
      path.join(project, 'src/lib/utils/http/fetch-client/index.ts'),
      '// existing\n',
    );

    await copyHttpClientFiles(project, template, ['axios'], ['fetch']);

    expect(existsSync(path.join(project, 'src/lib/utils/http/fetch-client/index.ts'))).toBe(false);
    expect(existsSync(path.join(project, 'src/lib/utils/http/axios-client/axios-client.ts'))).toBe(
      true,
    );
  });
});
