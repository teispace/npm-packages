import { describe, expect, it, vi } from 'vitest';
import { withRepair } from '../../src/manifests/apply';
import type { FeatureFinding } from '../../src/manifests/types';

const drift: FeatureFinding[] = [{ kind: 'missingPackage', name: 'tsx', depKind: 'devDependency' }];

describe('withRepair', () => {
  it('runs the installer when no drift is supplied (the `setup` path)', async () => {
    const install = vi.fn(async () => {});
    const repair = vi.fn(async () => {});

    await withRepair(install, repair)('/project');

    expect(install).toHaveBeenCalledWith('/project');
    expect(repair).not.toHaveBeenCalled();
  });

  it('runs the installer when the drift array is empty', async () => {
    const install = vi.fn(async () => {});
    const repair = vi.fn(async () => {});

    await withRepair(install, repair)('/project', []);

    expect(install).toHaveBeenCalledOnce();
    expect(repair).not.toHaveBeenCalled();
  });

  it('runs the repairer — not the installer — when drift is supplied', async () => {
    const install = vi.fn(async () => {});
    const repair = vi.fn(async () => {});

    await withRepair(install, repair)('/project', drift);

    expect(repair).toHaveBeenCalledWith('/project', drift);
    expect(install).not.toHaveBeenCalled();
  });

  it('propagates repair failures so doctor can report them', async () => {
    const repair = vi.fn(async () => {
      throw new Error('boom');
    });

    await expect(withRepair(async () => {}, repair)('/project', drift)).rejects.toThrow('boom');
  });
});
