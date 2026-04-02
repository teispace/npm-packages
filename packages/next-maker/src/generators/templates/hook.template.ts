export const hookWithStoreTemplate = (params: {
  hookName: string;
  componentName: string;
  featureName: string;
}): string => {
  const { hookName, componentName, featureName } = params;
  return `'use client';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { select${componentName}State, setLoading, setError } from '../store/${featureName}.selectors';

export const ${hookName} = () => {
  const dispatch = useAppDispatch();
  const state = useAppSelector(select${componentName}State);

  const handleSetLoading = (loading: boolean) => {
    dispatch(setLoading(loading));
    console.log('Loading state updated:', loading);
  };

  const handleSetError = (error: string | null) => {
    dispatch(setError(error));
    console.log('Error state updated:', error);
  };

  return {
    state,
    setLoading: handleSetLoading,
    setError: handleSetError,
  } as const;
};
`;
};

export const hookWithoutStoreTemplate = (params: { hookName: string }): string => {
  const { hookName } = params;
  return `'use client';
import { useState } from 'react';

export const ${hookName} = () => {
  // Add your state and logic here
  const [state, setState] = useState({});

  return {
    state,
    // Add your methods here
  } as const;
};
`;
};
