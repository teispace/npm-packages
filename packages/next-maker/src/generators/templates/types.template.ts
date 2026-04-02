export const stateTypesTemplate = (params: {
  componentName: string;
  withStore: boolean;
}): string => {
  const { componentName, withStore } = params;
  return `export interface ${componentName}State {
  ${withStore ? 'loading: boolean;\n  error: string | null;\n  // Add your state properties here' : '// Add your state properties here\n  // example: value: string;'}
}
`;
};
