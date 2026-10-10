const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const assert = require('assert');

const root = path.resolve(__dirname, '..');

function loadEnv() {
  const file = path.join(root, '.env');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !(match[1] in process.env)) process.env[match[1]] = match[2];
    }
  }
}

function secrets(markerOnly) {
  return Object.entries(process.env)
    .filter(([name, value]) => value && (markerOnly ? name.startsWith('SENTIS_LEAKCHECK_') : /EMAIL|PASSWORD|TOKEN/i.test(name)))
    .map(([name, value]) => ({ name, forms: [...new Set([value, encodeURIComponent(value), JSON.stringify(value).slice(1, -1)])] }));
}

// Read the central directory, so entries with data descriptors work too.
function zipEntries(data) {
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (data.readUInt32LE(i) === 0x06054b50 && i + 22 + data.readUInt16LE(i + 20) === data.length) { end = i; break; }
  }
  if (end < 0) throw new Error('Invalid ZIP');
  const count = data.readUInt16LE(end + 10);
  if (data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6) || count === 65535) throw new Error('Unsupported ZIP');
  let offset = data.readUInt32LE(end + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (data.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid ZIP directory');
    const flags = data.readUInt16LE(offset + 8);
    const method = data.readUInt16LE(offset + 10);
    const size = data.readUInt32LE(offset + 20);
    const nameLength = data.readUInt16LE(offset + 28);
    const name = data.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const local = data.readUInt32LE(offset + 42);
    if (flags & 1 || size === 0xffffffff || data.readUInt32LE(local) !== 0x04034b50) throw new Error('Unsupported ZIP entry');
    const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
    if (start + size > data.length) throw new Error('Truncated ZIP entry');
    const compressed = data.subarray(start, start + size);
    const body = method === 0 ? compressed : method === 8 ? zlib.inflateRawSync(compressed) : null;
    if (!body) throw new Error('Unsupported ZIP compression');
    if (body.length !== data.readUInt32LE(offset + 24)) throw new Error('Invalid ZIP size');
    entries.push({ name, body });
    offset += 46 + nameLength + data.readUInt16LE(offset + 30) + data.readUInt16LE(offset + 32);
  }
  return entries;
}

function scan(locations, needles, report = console.log) {
  let files = 0;
  let hits = 0;
  let errors = 0;
  const visited = new Set();
  const safe = value => needles.reduce((text, secret) => secret.forms.reduce((s, form) => s.split(form).join('<masked>'), text), String(value));
  function match(data, label) {
    for (const secret of needles) {
      if (secret.forms.some(form => data.includes(Buffer.from(form)))) {
        hits++;
        report(`${secret.name} ${safe(label)}`);
      }
    }
  }
  function archive(data, label) {
    for (const entry of zipEntries(data)) {
      const entryLabel = `${label} ! ${entry.name}`;
      match(Buffer.from(entry.name), entryLabel);
      match(entry.body, entryLabel);
      if (/\.zip$/i.test(entry.name)) archive(entry.body, entryLabel);
    }
  }
  function visit(file, optional = false) {
    try {
      const stat = fs.statSync(file);
      const real = fs.realpathSync(file);
      if (visited.has(real)) return;
      visited.add(real);
      if (stat.isDirectory()) {
        for (const name of fs.readdirSync(file)) visit(path.join(file, name));
      } else if (stat.isFile()) {
        files++;
        const data = fs.readFileSync(file);
        match(data, file);
        if (/\.zip$/i.test(file)) archive(data, file);
        if (/\.html?$/i.test(file)) {
          const html = data.toString('utf8');
          for (const embedded of html.matchAll(/data:application\/zip;base64,([A-Za-z0-9+/=\r\n]+)/g)) {
            archive(Buffer.from(embedded[1], 'base64'), `${file} ! embedded ZIP`);
          }
        }
      }
    } catch (error) {
      if (optional && error.code === 'ENOENT') report(`Skipped missing: ${safe(file)}`);
      else { errors++; report(`Cannot scan: ${safe(file)}`); }
    }
  }
  for (const location of locations) visit(location, true);
  report(`${files} files scanned, ${hits} hits`);
  return { files, hits, errors, code: errors ? 2 : hits ? 1 : 0 };
}

function defaultLocations() {
  const parent = path.dirname(root);
  const evidenceParent = path.basename(parent).endsWith('-worktrees') ? path.dirname(parent) : parent;
  return [path.join(root, 'playwright-report'), path.join(root, 'test-results'),
    ...fs.readdirSync(root).filter(name => /\.json$/i.test(name)).map(name => path.join(root, name)),
    process.env.SENTIS_EVIDENCE_DIR ? path.resolve(root, process.env.SENTIS_EVIDENCE_DIR) : path.join(evidenceParent, 'Sentis-evidence')];
}

function selfTest() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'sentis-scanner-'));
  const marker = 'control-"\\\n@example.invalid';
  try {
    fs.writeFileSync(path.join(folder, 'plain.txt'), marker);
    fs.writeFileSync(path.join(folder, 'escaped.json'), JSON.stringify(marker));
    const name = Buffer.from('control.txt');
    const body = Buffer.from(marker);
    const compressed = zlib.deflateRawSync(body);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(body.length, 24); central.writeUInt16LE(name.length, 28);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + compressed.length, 16);
    fs.writeFileSync(path.join(folder, 'control.zip'), Buffer.concat([local, name, compressed, central, name, end]));
    const result = scan([folder], [{ name: 'SENTIS_LEAKCHECK_CONTROL', forms: [marker, encodeURIComponent(marker), JSON.stringify(marker).slice(1, -1)] }], () => {});
    assert.strictEqual(result.files, 3); assert.strictEqual(result.hits, 3); assert.strictEqual(result.errors, 0);
    const zipped = fs.readFileSync(path.join(folder, 'control.zip'));
    fs.writeFileSync(path.join(folder, 'plain.txt'), encodeURIComponent(marker));
    fs.writeFileSync(path.join(folder, 'escaped.json'), 'clean');
    fs.writeFileSync(path.join(folder, 'control.zip'), zipped);
    const encoded = scan([path.join(folder, 'plain.txt')], [{ name: 'SENTIS_LEAKCHECK_CONTROL', forms: [encodeURIComponent(marker)] }], () => {});
    assert.strictEqual(encoded.hits, 1); assert.strictEqual(encoded.errors, 0);
    fs.writeFileSync(path.join(folder, 'embedded.html'), `data:application/zip;base64,${zipped.toString('base64')}`);
    const embedded = scan([path.join(folder, 'embedded.html')], [{ name: 'SENTIS_LEAKCHECK_CONTROL', forms: [marker] }], () => {});
    assert.strictEqual(embedded.hits, 1); assert.strictEqual(embedded.errors, 0);
    const clean = scan([path.join(folder, 'escaped.json')], [{ name: 'SENTIS_LEAKCHECK_CONTROL', forms: [marker] }], () => {});
    assert.strictEqual(clean.code, 0); assert.strictEqual(clean.hits, 0);
    console.log('Self-test passed: plain, JSON-escaped, ZIP entry (3 hits).');
    return 0;
  } catch {
    console.log('Self-test failed: positive control did not find all three leaks.');
    return 1;
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) process.exitCode = selfTest();
  else {
    try {
      loadEnv();
      process.exitCode = scan(defaultLocations(), secrets(process.argv.includes('--marker-only'))).code;
    } catch {
      console.log('Cannot read scanner inputs.');
      console.log('0 files scanned, 0 hits');
      process.exitCode = 2;
    }
  }
}

module.exports = { scan, secrets, zipEntries };
