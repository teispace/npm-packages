export const sliceTemplate = (params: {
  componentName: string;
  camelName: string;
  typesImportPath: string;
}): string => {
  const { componentName, camelName, typesImportPath } = params;
  return `import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { ${componentName}State } from '${typesImportPath}';

const initialState: ${componentName}State = {
  status: 'idle',
  error: null,
};

export const ${camelName}Slice = createSlice({
  name: '${camelName}',
  initialState,
  reducers: {
    started: (state) => {
      state.status = 'loading';
      state.error = null;
    },
    failed: (state, action: PayloadAction<string>) => {
      state.status = 'error';
      state.error = action.payload;
    },
    reset: () => initialState,
  },
});

export const { started, failed, reset } = ${camelName}Slice.actions;
export const ${camelName}Reducer = ${camelName}Slice.reducer;
`;
};
