import { cp, mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const revision = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/.test(revision)) throw Error('Invalid revision');
const output = resolve(process.argv[2] || '/tmp/metro-chat.tar.gz');
const stage = await mkdtemp(join(tmpdir(), 'metro-chat-package-'));
const files = ['index.html', 'client.js', 'features.js', 'cabin.js', 'cabin.css', 'cabin-data.mjs', 'cabin-motion.mjs', 'cabin-environment.js', 'cabin-controls.js', 'journey.mjs', 'server.mjs', 'transit.mjs', 'lines.mjs', 'timetable.mjs', 'positions.mjs', 'moderation.mjs', 'world.mjs', 'package.json', 'README.md', '.gitignore', 'data', 'scripts', 'test', 'infra', 'vendor'];
try {
  for (const file of files) await cp(file, join(stage, file), { recursive: true, filter: source => !/(?:^|\/)(?:\.env(?:\..*)?|subway\.env|.*\.pem|moderation\.json|node_modules|__pycache__|\.DS_Store)$/.test(source) });
  await mkdir(join(stage, 'data'), { recursive: true });
  await writeFile(join(stage, 'data/release.json'), JSON.stringify({ revision }) + '\n');
  await mkdir(resolve(output, '..'), { recursive: true });
  execFileSync('tar', ['-czf', output, '-C', stage, '.'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  console.log(`Packaged ${revision}: ${output}`);
} finally { await rm(stage, { recursive: true, force: true }); }
