/**
 * Minimal karma reporter optimized for AI / log-scraper consumption.
 *
 * Output shape (line-based, greppable):
 *
 *   ✗ fail suite > nested suite > test name
 *       <error message and stack>
 *   ✓ pass suite > nested suite > test name   (verbose mode only)
 *   » skip suite > nested suite > test name   (verbose mode only)
 *
 *   # tests N
 *   ✓ pass  M
 *   ✗ fail  K
 *   » skip  S
 *   ⏱ time  12.3s
 *
 *   # Failed tests:
 *   ✗ suite > nested suite > test name
 *       AssertionError: expected x to equal y
 *   ✗ ...
 *
 * By default only failed specs are printed live; pass `--verbose` / `-v` to also stream
 * passing/skipped specs. ANSI color is emitted only when stdout is a TTY and NO_COLOR is unset.
 *
 * The reporter also forwards `--grep` / `-g` from the CLI to mocha by setting
 * `config.client.mocha.grep` in its constructor (runs before the browser reads the client
 * config), so no separate framework entry is needed.
 */

const STACK_PREFIX_RE = /webpack-internal:\/\/\/\.\//g;
const STACK_BARE_RE = /webpack-internal:\/\/\//g;

const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

const useColor = !!process.stdout.isTTY && !process.env.NO_COLOR;
const C = {
  green: useColor ? '\x1b[32m' : '',
  red: useColor ? '\x1b[31m' : '',
  yellow: useColor ? '\x1b[33m' : '',
  reset: useColor ? '\x1b[0m' : ''
};

const ICON_PASS = C.green + '✓' + C.reset;
const ICON_FAIL = C.red + '✗' + C.reset;
const ICON_SKIP = C.yellow + '»' + C.reset;
const ICON_TIME = C.reset + '⏱' + C.reset;

function Reporter(baseReporterDecorator, config) {
  baseReporterDecorator(this);

  // forward CLI --grep/-g to mocha (runs before the browser reads config.client)
  const grep = parseGrep(process.argv);
  if (grep) {
    config.client = config.client || {};
    config.client.mocha = config.client.mocha || {};
    config.client.mocha.grep = grep;
  }

  const failed = [];
  let skipped = 0;
  let startedAt = 0;
  let introPrinted = false;

  const baseOnRunStart = this.onRunStart;
  this.onRunStart = function() {
    if (baseOnRunStart) {
      baseOnRunStart.apply(this, arguments);
    }
    failed.length = 0;
    skipped = 0;
    startedAt = Date.now();
    introPrinted = false;
  };

  this.onBrowserStart = function() {
    if (!introPrinted) {
      introPrinted = true;
      this.write('Karma: running tests...\n');

      if (!VERBOSE) {
        this.write('(use --verbose to print full output)\n');
      }
    }
  };

  this.specSuccess = function(browser, result) {
    if (VERBOSE) {
      this.write(ICON_PASS + ' pass ' + describe(result) + '\n');
    }
  };

  this.specSkipped = function(browser, result) {
    skipped++;
    if (VERBOSE) {
      this.write(ICON_SKIP + ' skip ' + describe(result) + '\n');
    }
  };

  this.specFailure = function(browser, result) {
    const name = describe(result);

    this.write(ICON_FAIL + ' fail ' + name + '\n');

    const detail = (result.log || []).map(normalize).join('\n').trim();

    failed.push({ name, message: detail ? detail.split('\n')[0] : '' });

    if (detail) {
      detail.split('\n').forEach((line) => {
        this.write('    ' + line + '\n');
      });
    }
  };

  this.onBrowserError = function(browser, error) {
    this.write(ICON_FAIL + ' ' + browser.name + ' errored: ' + normalize(String(error)) + '\n');
  };

  this.onRunComplete = function(browsers, results) {
    const total = results.success + results.failed;

    this.write('\n');
    this.write('# tests ' + (total + skipped) + '\n');
    this.write(ICON_PASS + ' pass  ' + results.success + '\n');
    this.write(ICON_FAIL + ' fail  ' + results.failed + '\n');
    if (skipped > 0) {
      this.write(ICON_SKIP + ' skip  ' + skipped + '\n');
    }
    this.write(ICON_TIME + ' time  ' + formatDuration(Date.now() - startedAt) + '\n');

    if (failed.length === 0 && results.disconnected) {
      this.write('# ERROR — runner disconnected before completion\n');
    }

    if (failed.length > 0) {
      this.write('\n');
      this.write('# Failed tests (' + failed.length + '):\n');
      failed.forEach((f) => {
        this.write(ICON_FAIL + ' ' + f.name + '\n');
        if (f.message) {
          this.write('    ' + f.message + '\n');
        }
      });
    }
  };
}

Reporter.$inject = [ 'baseReporterDecorator', 'config' ];

function parseGrep(argv) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--grep' || arg === '-g') {
      return argv[i + 1];
    }
    if (arg.startsWith('--grep=')) {
      return arg.slice('--grep='.length);
    }
  }
  return undefined;
}

function describe(result) {
  return [].concat(result.suite || [], result.description).join(' > ');
}

function normalize(line) {
  return String(line)
    .replace(STACK_PREFIX_RE, '')
    .replace(STACK_BARE_RE, '');
}

function formatDuration(ms) {
  if (ms < 1000) {
    return ms + 'ms';
  }
  const s = ms / 1000;
  if (s < 60) {
    return s.toFixed(1) + 's';
  }
  const m = Math.floor(s / 60);
  const remainingS = (s - m * 60).toFixed(1);
  return m + 'm ' + remainingS + 's';
}

module.exports = Reporter;
