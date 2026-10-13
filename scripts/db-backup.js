const { spawn } = require('node:child_process');
const { createReadStream, mkdirSync, statSync, unlinkSync } = require('node:fs');
const path = require('node:path');
const { open } = require('node:fs/promises');
const { pipeline } = require('node:stream/promises');

const projectRoot = path.resolve(__dirname, '..');

function usage() {
  console.error(
    'Usage:\n' +
      '  npm run db:backup -- [--file <backup.dump>]\n' +
      '  npm run db:restore -- --file <backup.dump> --confirm',
  );
  process.exit(2);
}

function parseArgs(args) {
  let file;
  let confirm = false;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--file' && args[i + 1] && !args[i + 1].startsWith('--')) {
      file = args[++i];
    } else if (args[i] === '--confirm' && !confirm) {
      confirm = true;
    } else {
      usage();
    }
  }
  return { file, confirm };
}

function runCompose(args) {
  return spawn('docker', ['compose', 'exec', '-T', 'postgres', ...args], {
    cwd: projectRoot,
    stdio: ['pipe', 'ignore', 'inherit'],
  });
}

async function streamFileToCompose(file, args) {
  const child = runCompose(args);
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`docker compose exec exited with code ${code}`));
    });
  });
  try {
    await Promise.all([pipeline(createReadStream(file), child.stdin), completed]);
  } catch (error) {
    child.kill();
    throw error;
  }
}

async function backup(file) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const destination = path.resolve(projectRoot, file ?? `backups/deploywatch-${stamp}.dump`);
  mkdirSync(path.dirname(destination), { recursive: true });

  const backupFile = await open(destination, 'wx', 0o600);
  const output = backupFile.createWriteStream();
  const child = spawn(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'postgres',
      'sh',
      '-c',
      'pg_dump --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
    ],
    { cwd: projectRoot, stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const completed = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`docker compose exec exited with code ${code}`));
    });
  });

  try {
    const results = await Promise.allSettled([pipeline(child.stdout, output), completed]);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason;
    if (statSync(destination).size === 0) throw new Error('pg_dump produced an empty backup file.');
    console.log(`Backup written to ${path.relative(projectRoot, destination)}`);
  } catch (error) {
    child.kill();
    output.destroy();
    try {
      unlinkSync(destination);
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') {
        console.error(`Could not remove incomplete backup ${destination}: ${cleanupError.message}`);
      }
    }
    throw error;
  }
}

async function restore(file, confirm) {
  if (!file || !confirm) usage();

  const source = path.resolve(projectRoot, file);
  const stats = statSync(source);
  if (!stats.isFile() || stats.size === 0) throw new Error('Backup file is missing or empty.');

  console.log(`Validating backup ${path.relative(projectRoot, source)}...`);
  await streamFileToCompose(source, ['pg_restore', '--list']);
  console.error('WARNING: This will replace matching objects in the database configured for the Compose postgres service.');
  await streamFileToCompose(source, [
    'sh',
    '-c',
    'pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
  ]);
  console.log('Restore completed.');
}

async function main() {
  const [action, ...args] = process.argv.slice(2);
  if (action !== 'backup' && action !== 'restore') usage();
  const { file, confirm } = parseArgs(args);

  if (action === 'backup') {
    if (confirm) usage();
    await backup(file);
    return;
  }

  await restore(file, confirm);
}

main().catch((error) => {
  console.error(`Database ${process.argv[2] ?? 'backup'} failed: ${error.message}`);
  process.exitCode = 1;
});
