export const componentTemplate = (params: {
  componentName: string;
  hookName: string;
  withApi: boolean;
  pascalName: string;
  hasI18n: boolean;
}): string => {
  const { componentName, hookName, withApi, pascalName, hasI18n } = params;
  const i18nImport = hasI18n ? "import { useTranslations } from 'next-intl';\n\n" : '';
  const i18nHook = hasI18n ? `  const t = useTranslations('${pascalName}');\n` : '';
  const title = hasI18n ? "{t('title')}" : componentName;

  if (withApi) {
    return `'use client';

${i18nImport}import { use${pascalName}List } from '../api/queries';

/**
 * Renders hydrated query data: prefetch \`${camelize(pascalName)}ListQuery()\` in the
 * page and wrap this component in \`<HydrateQueries>\` for a no-spinner first paint.
 */
export function ${componentName}() {
${i18nHook}  const { data } = use${pascalName}List();

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium text-sm">${title}</h2>
      <ul className="flex flex-col gap-1">
        {data.map((item) => (
          <li key={item.id}>{item.title}</li>
        ))}
      </ul>
    </section>
  );
}
`;
  }

  return `'use client';

${i18nImport}import { ${hookName} } from '../hooks/${hookName}';

export function ${componentName}() {
${i18nHook}  const state = ${hookName}();

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium text-sm">${title}</h2>
      <pre className="text-xs">{JSON.stringify(state, null, 2)}</pre>
    </section>
  );
}
`;
};

const camelize = (pascal: string): string => pascal.charAt(0).toLowerCase() + pascal.slice(1);
