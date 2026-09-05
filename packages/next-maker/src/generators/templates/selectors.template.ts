export const selectorsTemplate = (params: {
  componentName: string;
  camelName: string;
  sliceName: string;
}): string => {
  const { componentName, camelName } = params;
  return `import type { RootState } from '@/store/rootReducer';

export const select${componentName}State = (state: RootState) => state.${camelName};
export const select${componentName}Status = (state: RootState) => state.${camelName}.status;
export const select${componentName}Error = (state: RootState) => state.${camelName}.error;
`;
};
