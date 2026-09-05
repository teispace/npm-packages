export const stateTypesTemplate = (params: {
  componentName: string;
  withStore: boolean;
}): string => {
  const { componentName, withStore } = params;
  if (withStore) {
    return `export type ${componentName}Status = 'idle' | 'loading' | 'error';

export interface ${componentName}State {
  status: ${componentName}Status;
  error: string | null;
}
`;
  }
  return `export interface ${componentName}Props {
  // Props for the ${componentName} component
}
`;
};
