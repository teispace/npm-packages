export const selectorsTemplate = (params: {
  componentName: string;
  camelName: string;
  sliceName: string;
}): string => {
  const { componentName, camelName, sliceName } = params;
  return `import { RootState } from '@/store/rootReducer';

export const select${componentName}State = (state: RootState) => state.${camelName};
export { setLoading, setError, resetState } from './${sliceName}.slice';
`;
};
