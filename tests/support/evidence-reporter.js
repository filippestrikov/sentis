const fs = require('fs');
const path = require('path');

class EvidenceReporter {
  constructor() {
    this.folders = [];
  }

  mask(value) {
    if (Array.isArray(value)) return value.map(item => this.mask(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.mask(item)]));
    }
    if (typeof value !== 'string') return value;
    const secrets = Object.entries(process.env)
      .filter(([name, secret]) => /EMAIL|PASSWORD|TOKEN/i.test(name) && secret)
      .map(([, secret]) => secret)
      .sort((a, b) => b.length - a.length);
    return secrets.reduce((text, secret) => text.split(secret).join('<masked>'), value);
  }

  warning(error) {
    console.warn(this.mask(`Evidence reporter warning: ${error.message}`));
  }

  onBegin(config) {
    try {
      const repoRoot = path.resolve(config.rootDir, '..');
      const parent = path.dirname(repoRoot);
      // Agent checkouts live one level deeper under <repo>-worktrees/<agent>.
      const evidenceParent = path.basename(parent).endsWith('-worktrees')
        ? path.dirname(parent) : parent;
      this.evidenceDir = process.env.SENTIS_EVIDENCE_DIR
        ? path.resolve(repoRoot, process.env.SENTIS_EVIDENCE_DIR)
        : path.join(evidenceParent, 'Sentis-evidence');
    } catch (error) {
      this.warning(error);
    }
  }

  onTestEnd(test, result) {
    try {
      const project = test.parent.project().name;
      if (project === 'setup' || !['failed', 'timedOut'].includes(result.status)) return;
      if (!this.evidenceDir) return;

      const caseId = test.title.match(/^(SNTS-\d+)\b/)?.[1] || 'misc';
      const safeProject = this.mask(project).replace(/[^a-zA-Z0-9_-]/g, '_') || 'project';
      const now = new Date();
      let folder;
      // Reserve a distinct timestamp folder when retries finish in the same second.
      while (true) {
        const stamp = now.toISOString();
        const parent = path.join(this.evidenceDir, stamp.slice(0, 10), caseId);
        fs.mkdirSync(parent, { recursive: true });
        folder = path.join(parent, `${stamp.slice(11, 19).replace(/:/g, '')}-${safeProject}`);
        try {
          fs.mkdirSync(folder);
          break;
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
          now.setSeconds(now.getSeconds() + 1);
        }
      }
      this.folders.push(folder);

      const copied = [];
      for (const [index, attachment] of result.attachments.entries()) {
        const screenshot = attachment.contentType?.startsWith('image/');
        const trace = attachment.name === 'trace';
        const video = attachment.contentType?.startsWith('video/');
        if (!screenshot && !(project === 'public' && (trace || video))) continue;
        if (attachment.path && path.resolve(attachment.path).split(path.sep)
          .some(part => part.toLowerCase() === '.auth')) continue;
        try {
          const extension = attachment.path ? path.extname(attachment.path)
            : screenshot ? '.png' : video ? '.webm' : '.zip';
          const filename = trace ? 'trace.zip' : `${screenshot ? 'screenshot' : 'video'}-${index}${extension}`;
          const destination = path.join(folder, filename);
          if (attachment.path) fs.copyFileSync(attachment.path, destination);
          else if (attachment.body) fs.writeFileSync(destination, attachment.body);
          else continue;
          copied.push(filename);
        } catch (error) {
          this.warning(error);
        }
      }

      const error = result.errors?.[0] || result.error;
      const location = error?.location || test.location;
      const summary = {
        title: this.mask(test.title),
        project: this.mask(project),
        status: result.status,
        duration: result.duration,
        retry: result.retry,
        // Strip terminal colour codes so the summary reads cleanly.
        error: error ? this.mask(error.message || error.value || '').replace(/\u001b\[[0-9;]*m/g, '') : null,
        location: location ? {
          file: this.mask(location.file), line: location.line, column: location.column,
        } : null,
        attachments: copied,
        trace: project === 'public'
          ? (copied.includes('trace.zip') ? 'trace.zip' : 'not attached')
          : 'not preserved: authenticated session',
      };
      fs.writeFileSync(path.join(folder, 'summary.json'), JSON.stringify(this.mask(summary), null, 2));
    } catch (error) {
      this.warning(error);
    }
  }

  onEnd() {
    try {
      for (const folder of this.folders) console.log(this.mask(`Evidence preserved: ${folder}`));
    } catch (error) {
      this.warning(error);
    }
  }
}

module.exports = EvidenceReporter;
