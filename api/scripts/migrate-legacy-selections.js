// One-off, non-destructive: copy results saved by the pre-Mongoose store (collection "selections")
// into the current collection ("material_selections"). Safe to run more than once.
// Usage: mongosh "mongodb://127.0.0.1:27017/matselect" scripts/migrate-legacy-selections.js
const src = db.getCollection('selections');
const dst = db.getCollection('material_selections');
let copied = 0;
let skipped = 0;
src.find().forEach((d) => {
  if (dst.findOne({ _id: d._id })) return skipped++;
  const top = (d.ranking || [])[0];
  const { id, candidateCount, ...rest } = d;
  dst.insertOne({
    ...rest,
    title: (d.spec && d.spec.title) || 'Untitled',
    topPick: top ? (top.grade ? `${top.name} (${top.grade})` : top.name) : null,
    candidateCount: candidateCount || (d.materials || []).length,
    keySource: d.keySource || (d.dataSource === 'llm' ? 'server' : 'none'),
    createdAt: new Date(d.createdAt),
    updatedAt: new Date(d.createdAt),
  });
  copied++;
});
print(`copied ${copied}, already present ${skipped}`);
