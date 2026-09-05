export const hookWithStoreTemplate = (params: {
  hookName: string;
  componentName: string;
  featureName: string;
  state: 'redux' | 'zustand';
}): string => {
  const { hookName, componentName, featureName, state } = params;
  if (state === 'zustand') {
    return `'use client';

import { useAppStore } from '@/store/hooks';

export const ${hookName} = () => {
  const status = useAppStore((state) => state.${camel(featureName)}.status);
  const error = useAppStore((state) => state.${camel(featureName)}.error);
  const start = useAppStore((state) => state.${camel(featureName)}Started);
  const fail = useAppStore((state) => state.${camel(featureName)}Failed);
  const reset = useAppStore((state) => state.${camel(featureName)}Reset);

  return { status, error, start, fail, reset } as const;
};
`;
  }
  return `'use client';

import { useAppDispatch, useAppSelector } from '@/store/hooks';

import { failed, reset, started } from '../store/${featureName}.slice';
import { select${componentName}Error, select${componentName}Status } from '../store/${featureName}.selectors';

export const ${hookName} = () => {
  const dispatch = useAppDispatch();
  const status = useAppSelector(select${componentName}Status);
  const error = useAppSelector(select${componentName}Error);

  return {
    status,
    error,
    start: () => dispatch(started()),
    fail: (message: string) => dispatch(failed(message)),
    reset: () => dispatch(reset()),
  } as const;
};
`;
};

const camel = (kebab: string): string => kebab.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export const hookWithoutStoreTemplate = (params: { hookName: string }): string => {
  const { hookName } = params;
  return `'use client';

import { useCallback, useState } from 'react';

export const ${hookName} = () => {
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, run } as const;
};
`;
};
