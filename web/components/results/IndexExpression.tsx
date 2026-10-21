/** Renders an index such as "E^(1/2)/ρ·(C + α_m)" with real superscripts and subscripts. */
export function IndexExpression({ expression }: { expression: string }) {
  const parts: React.ReactNode[] = [];
  let textStart = 0;
  for (const match of expression.matchAll(/\^(\([^)]*\)|-?\d+)|_(CO₂|[a-z]+)/g)) {
    const [whole, superscript, subscript] = match;
    parts.push(<span key={parts.length}>{expression.slice(textStart, match.index)}</span>);
    parts.push(superscript ? <sup key={parts.length}>{superscript.replace(/[()]/g, '')}</sup> : <sub key={parts.length}>{subscript}</sub>);
    textStart = match.index! + whole.length;
  }
  parts.push(<span key={parts.length}>{expression.slice(textStart)}</span>);
  return <span>{parts}</span>;
}
