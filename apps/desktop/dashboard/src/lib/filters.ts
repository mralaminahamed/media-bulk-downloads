import type { FilterOptions } from '@mbd/core/types';

export { applyToolbarFilters, deriveFilterOptions } from '@mbd/core/collection/filters';

export const DEFAULT_FILTERS: FilterOptions = {
  mediaKind: 'all',
  imageType: 'all',
  minSize: 0,
  includeBase64: true,
  sizeBucket: 'all',
  downloadState: 'all',
  resolveState: 'all',
  duplicateState: 'all',
  search: '',
  sortBy: 'default',
  sortDir: 'desc',
};
