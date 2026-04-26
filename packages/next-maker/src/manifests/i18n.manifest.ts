import { setupI18n } from '../services/setup/i18n';
import type { FeatureManifest } from './types';

export const i18nManifest: FeatureManifest = {
  id: 'i18n',
  name: 'Internationalization',
  description: 'next-intl with [locale] routing, RootProvider, and proxy.ts',
  detect: async (projectPath) => {
    const { detectProjectSetup } = await import('../detection');
    return (await detectProjectSetup(projectPath)).hasI18n;
  },
  files: [
    { path: 'src/i18n', generated: true, isDir: true },
    { path: 'src/proxy.ts', generated: true },
    { path: 'src/app/[locale]', generated: true, isDir: true },
  ],
  packages: [{ name: 'next-intl', kind: 'dependency' }],
  scripts: [],
  injections: [
    {
      file: 'next.config.ts',
      description: 'createNextIntlPlugin wrap in next.config.ts',
      presence: /next-intl\/plugin/,
    },
    {
      file: 'src/providers/RootProvider.tsx',
      description: '<NextIntlClientProvider> wrap',
      presence: /NextIntlClientProvider/,
    },
  ],
  apply: setupI18n,
};
