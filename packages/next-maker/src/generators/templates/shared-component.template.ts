export const sharedComponentTemplate = (params: {
  componentName: string;
  isClient: boolean;
  hasI18n: boolean;
  translationNamespace?: string;
}): string => {
  const { componentName, isClient, hasI18n } = params;
  const ns = params.translationNamespace || componentName;
  const lines: string[] = [];

  if (isClient || hasI18n) {
    lines.push("'use client';");
  }

  if (hasI18n) {
    lines.push("import { useTranslations } from 'next-intl';");
  }

  lines.push('');
  lines.push(`export function ${componentName}() {`);

  if (hasI18n) {
    lines.push(`  const t = useTranslations('${ns}');`);
    lines.push('');
    lines.push('  return (');
    lines.push('    <div>');
    lines.push(`      <h2>{t('title')}</h2>`);
    lines.push('    </div>');
    lines.push('  );');
  } else {
    lines.push('  return (');
    lines.push('    <div>');
    lines.push(`      <h2>${componentName}</h2>`);
    lines.push('    </div>');
    lines.push('  );');
  }

  lines.push('}');
  lines.push('');

  return lines.join('\n');
};

export const componentBarrelTemplate = (params: { componentName: string }): string => {
  return `export { ${params.componentName} } from './${params.componentName}';\n`;
};
