import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const exec = promisify(execFile);
const required = name => { const value = process.env[name]; if (!value) throw Error(`Missing ${name}`); return value; };
const revision = required('GITHUB_SHA'), run = required('GITHUB_RUN_ID'), attempt = required('GITHUB_RUN_ATTEMPT');
const bucket = required('METRO_DEPLOY_BUCKET'), instance = required('METRO_INSTANCE_ID'), region = required('AWS_REGION');
if (!/^[a-f0-9]{40}$/.test(revision) || !/^\d+$/.test(run) || !/^\d+$/.test(attempt) || !/^[a-z0-9.-]+$/.test(bucket) || !/^i-[a-f0-9]+$/.test(instance) || !/^[a-z0-9-]+$/.test(region)) throw Error('Invalid deployment inputs');
const archive = process.argv[2] || '/tmp/metro-chat.tar.gz';
const digest = createHash('sha256').update(await readFile(archive)).digest('hex');
const key = `metro-chat/${revision}/${run}-${attempt}.tar.gz`, version = `metro-chat-${revision.slice(0, 12)}-${run}-${attempt}`;
const aws = async args => { const { stdout } = await exec('aws', [...args, '--region', region, '--output', 'json', '--no-cli-pager'], { maxBuffer: 1024 * 1024 }); return stdout.trim() ? JSON.parse(stdout) : {}; };
await aws(['s3api', 'put-object', '--bucket', bucket, '--key', key, '--body', archive, '--server-side-encryption', 'AES256', '--metadata', `revision=${revision},sha256=${digest}`]);
const command = [
  'set -eu',
  'unset AWS_PROFILE AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN',
  'export AWS_CONFIG_FILE=/dev/null AWS_SHARED_CREDENTIALS_FILE=/dev/null',
  'TASK_DIR=$(mktemp -d /tmp/metro-chat-ci.XXXXXX)',
  'trap \'rm -rf "$TASK_DIR"\' EXIT',
  `aws s3api get-object --region '${region}' --bucket '${bucket}' --key '${key}' "$TASK_DIR/app.tar.gz" >/dev/null`,
  `echo '${digest}  '"$TASK_DIR/app.tar.gz" | sha256sum -c -`,
  'tar -xOf "$TASK_DIR/app.tar.gz" ./infra/deploy.sh > "$TASK_DIR/deploy.sh"',
  `bash "$TASK_DIR/deploy.sh" "$TASK_DIR/app.tar.gz" '${version}' '${revision}'`,
].join('\n');
const sent = await aws(['ssm', 'send-command', '--instance-ids', instance, '--document-name', 'AWS-RunShellScript', '--comment', `Metro Chat ${revision.slice(0, 12)}`, '--parameters', JSON.stringify({ commands: [command], executionTimeout: ['600'] }), '--timeout-seconds', '600']);
const commandId = sent.Command.CommandId; console.log(`SSM command: ${commandId}; release: ${version}`);
const started = Date.now();
while (Date.now() - started < 660000) {
  let result;
  try { result = await aws(['ssm', 'get-command-invocation', '--command-id', commandId, '--instance-id', instance]); }
  catch (error) { if (!error.stderr?.includes('InvocationDoesNotExist')) throw error; }
  if (result && !['Pending', 'InProgress', 'Delayed'].includes(result.Status)) {
    console.log(result.StandardOutputContent || '');
    if (result.StandardErrorContent) console.error(result.StandardErrorContent);
    if (result.Status !== 'Success') throw Error(`Deployment ${result.Status}; previous release rollback is handled by deploy.sh`);
    const health = await (await fetch('https://www.bookey.site/metro-chat/api/health', { signal: AbortSignal.timeout(15000) })).json();
    if (health.status !== 'ok' || health.revision !== revision || health.mode !== 'live') throw Error(`Unexpected production health: ${JSON.stringify(health)}`);
    console.log(`Verified production ${health.revision} (${health.mode})`); process.exit(0);
  }
  await new Promise(resolve => setTimeout(resolve, 5000));
}
throw Error(`Timed out waiting for SSM command ${commandId}; check its final status before retrying`);
