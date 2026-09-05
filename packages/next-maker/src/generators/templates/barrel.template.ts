export const sliceBarrelTemplate = (params: {
  sliceName: string;
  withPersist: boolean;
  state?: 'redux' | 'zustand';
}): string => {
  const { sliceName, withPersist, state = 'redux' } = params;
  if (state === 'zustand') return `export * from './${sliceName}.store';\n`;
  return `export * from './${sliceName}.selectors';
export * from './${sliceName}.slice';${withPersist ? "\nexport * from './persist';" : ''}
`;
};

export const featureBarrelTemplate = (params: {
  featureName: string;
  componentName: string;
  hookName: string;
  pascalName: string;
  withStore: boolean;
  withApi: boolean;
}): string => {
  const { featureName, componentName, hookName, pascalName, withStore, withApi } = params;
  const lines = [
    '/**',
    ' * Client-safe public surface. Server-only pieces live in `./server`.',
    ' */',
  ];
  if (withApi) {
    lines.push(
      `export { create${pascalName}, delete${pascalName}, update${pascalName} } from './api/actions';`,
    );
    lines.push(`export { ${camel(featureName)}Keys } from './api/keys';`);
    lines.push(
      `export { ${camel(featureName)}ListQuery, ${camel(featureName)}Query, use${pascalName}, use${pascalName}List } from './api/queries';`,
    );
    lines.push(`export * from './api/schema';`);
  }
  lines.push(`export { ${componentName} } from './components/${componentName}';`);
  if (!withApi) lines.push(`export { ${hookName} } from './hooks/${hookName}';`);
  lines.push(`export * from './types/${featureName}.types';`);
  if (withStore) lines.push(`export * from './store';`);
  return `${lines.join('\n')}\n`;
};

export const featureServerBarrelTemplate = (params: {
  pascalName: string;
}): string => `import 'server-only';

export { get${params.pascalName}, list${params.pascalName}s, ${params.pascalName.toUpperCase()}_TAG } from './api/server';
`;

const camel = (kebab: string): string => kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
