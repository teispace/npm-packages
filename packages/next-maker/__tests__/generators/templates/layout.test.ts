import { describe, expect, it } from 'vitest';
import { layoutTemplate } from '../../../src/generators/templates/layout.template';

describe('layoutTemplate', () => {
  it('emits a plain nested layout regardless of i18n (locale comes from root params)', () => {
    for (const hasI18n of [true, false]) {
      const result = layoutTemplate({ componentName: 'DashboardLayout', hasI18n });
      expect(result).toContain('export default function DashboardLayout');
      expect(result).not.toContain('setRequestLocale');
      expect(result).not.toContain('next-intl');
    }
  });
});
