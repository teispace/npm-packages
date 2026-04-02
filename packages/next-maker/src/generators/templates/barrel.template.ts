export const sliceBarrelTemplate = (params: {
  sliceName: string;
  withPersist: boolean;
}): string => {
  const { sliceName, withPersist } = params;
  return `export * from './${sliceName}.slice';
export * from './${sliceName}.selectors';
export * from './${sliceName}.types';${withPersist ? "\nexport * from './persist';" : ''}
`;
};

export const featureBarrelTemplate = (params: {
  featureName: string;
  componentName: string;
  hookName: string;
  withStore: boolean;
  withService: boolean;
}): string => {
  const { featureName, componentName, hookName, withStore, withService } = params;
  return `export { default as ${componentName} } from './components/${componentName}';
export { ${hookName} } from './hooks/${hookName}';
export * from './types/${featureName}.types';${withStore ? `\nexport * from './store';` : ''}${withService ? `\nexport * from './services/${featureName}.service';` : ''}
`;
};
