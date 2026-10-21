import { FAMILY_LABEL } from '@/lib/labels';
import type { Family } from '@/lib/types';
import { Badge } from '../ui';

export function FamilyBadge({ family }: { family: Family }) {
  const { color, icon, label } = FAMILY_LABEL[family];
  return (
    <Badge className={color}>
      <span aria-hidden>{icon}</span> {label}
    </Badge>
  );
}
