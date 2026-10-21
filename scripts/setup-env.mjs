// Create api/.env and web/.env.local from the examples if they don't exist yet (never overwrites).
import { copyFileSync, existsSync } from 'node:fs';

for (const [example, target] of [
  ['api/.env.example', 'api/.env'],
  ['web/.env.example', 'web/.env.local'],
]) {
  if (existsSync(target)) console.log(`✓ ${target} already exists (left unchanged)`);
  else {
    copyFileSync(example, target);
    console.log(`✓ created ${target} from ${example}`);
  }
}
console.log('\nAdd ANTHROPIC_API_KEY to api/.env for real Claude data, or leave it empty for demo mode.');
console.log('Then run: npm run dev   →   http://localhost:3000');
