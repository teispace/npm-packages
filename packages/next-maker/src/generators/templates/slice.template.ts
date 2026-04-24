export const sliceTemplate = (params: {
  componentName: string;
  camelName: string;
  typesImportPath: string;
}): string => {
  const { componentName, camelName, typesImportPath } = params;
  return `import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ${componentName}State } from '${typesImportPath}';

const initialState: ${componentName}State = {
  loading: false,
  error: null,
  // Add your initial state here
};

export const ${camelName}Slice = createSlice({
  name: '${camelName}',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    resetState: (state) => {
      state.loading = false;
      state.error = null;
    },
  },
});

export const { setLoading, setError, resetState } = ${camelName}Slice.actions;

export const ${camelName}Reducer = ${camelName}Slice.reducer;
`;
};
