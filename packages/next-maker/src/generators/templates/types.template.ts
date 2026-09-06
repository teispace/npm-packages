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
  // An empty shape would trip Biome's noBannedTypes, so the placeholder
  // carries the prop every component in the starter already accepts.
  return `export interface ${componentName}Props {
  /** Extra classes for the root element. Add this feature's own props here. */
  className?: string;
}
`;
};
