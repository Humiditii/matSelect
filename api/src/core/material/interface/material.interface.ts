import { Material } from 'src/common/domain/domain.types';

export interface CandidateSetI {
  readonly materials: Material[];
  /** Plain-language notes, e.g. a family Claude could not supply. */
  readonly warnings: string[];
}
