export interface SearchProjectionPort {
  rebuild(professionalId: string): Promise<void>;
}

export const SearchProjectionPortToken = Symbol('SearchProjectionPort');
