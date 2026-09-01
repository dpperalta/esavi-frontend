import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaginatedResponse } from '@/contracts/declared/pagination';
import { client } from '@/shared/api/client';
import { useCan } from '@/shared/hooks/useCan';
import { ROLE_LEVELS } from '@/shared/config/roles';

export type InactiveMode = 'adminPath' | 'serverDecides';

// The parent-listing shape of ARCHITECTURE.md §4.2 / SPEC FE02 §1 finding D: the FK travels in
// the URL, never as a query param. `operation` is the cache-key segment (CONVENTIONS.md §6.3,
// e.g. 'byType'); `segment`/`adminSegment` are path templates with a literal ':parentId'.
export interface ResourceParentConfig {
  operation: string;
  segment: string;
  adminSegment?: string;
}

// SPEC FE02 §3.1. `idField` has no default on purpose (Riesgos §7): forgetting it doesn't compile.
export interface ResourceConfig<T> {
  key: string;
  path: string;
  idField: keyof T;
  inactiveMode: InactiveMode;
  adminPath?: string;
  parent?: ResourceParentConfig;
  staleTime?: number;
  hasActivate?: boolean;
}

export interface ListParams {
  page?: number;
  pageSize: number;
  includeInactive?: boolean;
  filters?: Record<string, string>;
}

function toOffsetLimit({ page, pageSize }: ListParams): { limit: number; offset: number } {
  return { limit: pageSize, offset: ((page ?? 1) - 1) * pageSize };
}

function assertConfig<T>(config: ResourceConfig<T>): void {
  if (config.inactiveMode === 'adminPath' && !config.adminPath) {
    throw new Error(`createResource(${config.key}): inactiveMode 'adminPath' requires adminPath`);
  }
  if (config.inactiveMode === 'serverDecides' && config.adminPath) {
    throw new Error(`createResource(${config.key}): inactiveMode 'serverDecides' forbids adminPath`);
  }
}

function replaceParentId(segment: string, parentId: string): string {
  return segment.replace(':parentId', parentId);
}

// One declaration replaces the CRUD every entity would otherwise write by hand (ARCHITECTURE.md
// §4, CONVENTIONS.md §5). Every mutation invalidates the root key — never enumerated keys — so
// the factory never has to know which screens exist (SPEC FE02 §3.1).
export function createResource<T, TCreateInput = Partial<T>, TUpdateInput = Partial<T>>(
  config: ResourceConfig<T>,
) {
  assertConfig(config);

  // Which role can reach the entity's `/admin` route — hallazgo C: the `/admin` routes of the
  // inventory require ADMIN, regardless of what `canViewInactive` checks on the backend.
  function useCanViewAdminPath(): boolean {
    return useCan(ROLE_LEVELS.ADMIN);
  }

  function useList(params: ListParams) {
    const canViewAdminPath = useCanViewAdminPath();
    const { limit, offset } = toOffsetLimit(params);
    const includeInactive =
      config.inactiveMode === 'adminPath' && !!params.includeInactive && canViewAdminPath;
    const url = includeInactive ? (config.adminPath as string) : config.path;
    const filters = params.filters;

    return useQuery({
      queryKey: [config.key, 'list', { limit, offset, includeInactive, filters }],
      queryFn: async () => {
        const response = await client.get<PaginatedResponse<T>>(url, {
          params: { limit, offset, ...filters },
        });
        return response.data;
      },
      staleTime: config.staleTime,
    });
  }

  function useOne(id: string) {
    return useQuery({
      queryKey: [config.key, 'detail', id],
      queryFn: async () => {
        const response = await client.get<T>(`${config.path}/${id}`);
        return response.data;
      },
      staleTime: config.staleTime,
      enabled: !!id,
    });
  }

  function useCreate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (input: TCreateInput) => {
        const response = await client.post<T>(config.path, input);
        return response.data;
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: [config.key] });
      },
    });
  }

  // The backend does the differential update (CONVENTIONS.md §6.5) — the full object travels,
  // no diff computed here.
  function useUpdate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async ({ id, data }: { id: string; data: TUpdateInput }) => {
        const response = await client.put<T>(`${config.path}/${id}`, data);
        return response.data;
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: [config.key] });
      },
    });
  }

  function useDeactivate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (id: string) => {
        await client.delete(`${config.path}/${id}`);
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: [config.key] });
      },
    });
  }

  function useActivate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (id: string) => {
        await client.patch(`${config.path}/activate/${id}`);
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: [config.key] });
      },
    });
  }

  function useListByParent(parentId: string, params: ListParams) {
    const parent = config.parent as ResourceParentConfig;
    const canViewAdminPath = useCanViewAdminPath();
    const { limit, offset } = toOffsetLimit(params);
    const includeInactive =
      config.inactiveMode === 'adminPath' && !!params.includeInactive && canViewAdminPath;
    const segment =
      includeInactive && parent.adminSegment ? parent.adminSegment : parent.segment;
    const url = `${config.path}/${replaceParentId(segment, parentId)}`;
    const filters = params.filters;

    return useQuery({
      queryKey: [
        config.key,
        parent.operation,
        parentId,
        { limit, offset, includeInactive, filters },
      ],
      queryFn: async () => {
        const response = await client.get<PaginatedResponse<T>>(url, {
          params: { limit, offset, ...filters },
        });
        return response.data;
      },
      staleTime: config.staleTime,
      enabled: !!parentId,
    });
  }

  return {
    key: config.key,
    idField: config.idField,
    useList,
    useOne,
    useCreate,
    useUpdate,
    useDeactivate,
    useActivate: config.hasActivate === false ? undefined : useActivate,
    useListByParent: config.parent ? useListByParent : undefined,
  };
}
