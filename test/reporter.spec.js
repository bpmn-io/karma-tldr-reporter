const { expect } = require('chai');
const Reporter = require('../lib/reporter');


/**
 * Build a reporter instance wired to an in-memory output buffer.
 * `totalExpected` is fed through browser.lastResult.total (what karma sets
 * at browser-start time via the suite discovery result).
 */
function createReporter(totalExpected = 0) {
  const lines = [];

  const baseReporterDecorator = (obj) => {
    obj.write = (str) => lines.push(str);
  };

  const reporter = new Reporter(baseReporterDecorator, {});

  return {
    reporter,
    lines,
    browser: { lastResult: { total: totalExpected } }
  };
}

function spec(suite, description) {
  return { suite: [].concat(suite), description, log: [] };
}

function failSpec(suite, description, message) {
  return { suite: [].concat(suite), description, log: [ message ] };
}

/**
 * Stub process.stdout.isTTY for the duration of a describe block.
 * Returns to the original value after each test.
 */
function useTTY(value) {
  let original;

  beforeEach(function() {
    original = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
    Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true, writable: true });
  });

  afterEach(function() {
    if (original) {
      Object.defineProperty(process.stdout, 'isTTY', original);
    } else {
      delete process.stdout.isTTY;
    }
  });
}


describe('Reporter', function() {

  describe('run lifecycle', function() {

    it('should print intro on browser start', function() {

      // given
      const { reporter, lines, browser } = createReporter();

      // when
      reporter.onRunStart({});
      reporter.onBrowserStart(browser);

      // then
      expect(lines.join('')).to.include('Karma: running tests...');
    });


    it('should print intro once even with multiple browsers', function() {

      // given
      const { reporter, lines, browser } = createReporter();

      // when
      reporter.onRunStart({});
      reporter.onBrowserStart(browser);
      reporter.onBrowserStart(browser);

      // then
      const intro = lines.filter(l => l.includes('Karma: running tests...'));
      expect(intro).to.have.length(1);
    });


    it('should reset state between runs', function() {

      // given
      const { reporter, lines, browser } = createReporter();

      reporter.onRunStart({});
      reporter.onBrowserStart(browser);
      reporter.specFailure(browser, failSpec('suite', 'a', 'Error: a'));
      reporter.onRunComplete({}, { success: 0, failed: 1, disconnected: false });

      const linesAfterFirst = lines.length;

      // when
      // second run
      reporter.onRunStart({});
      reporter.onBrowserStart(browser);
      reporter.onRunComplete({}, { success: 0, failed: 0, disconnected: false });

      // then
      // second run should not re-report first run's failures
      const secondRunOutput = lines.slice(linesAfterFirst).join('');
      expect(secondRunOutput).to.not.include('Failed tests');
    });

  });


  describe('summary', function() {

    it('should print test counts', function() {

      // given
      const { reporter, lines, browser } = createReporter();

      reporter.onRunStart({});
      reporter.onBrowserStart(browser);

      // when
      reporter.specSuccess(browser, spec('suite', 'a'));
      reporter.specSuccess(browser, spec('suite', 'b'));
      reporter.specFailure(browser, failSpec('suite', 'c', 'Error'));
      reporter.onRunComplete({}, { success: 2, failed: 1, disconnected: false });

      // then
      const out = lines.join('');
      expect(out).to.include('# tests 3');
      expect(out).to.match(/pass\s+2/);
      expect(out).to.match(/fail\s+1/);
    });


    it('should include skipped tests in total', function() {

      // given
      const { reporter, lines, browser } = createReporter();

      reporter.onRunStart({});
      reporter.onBrowserStart(browser);

      // when
      reporter.specSkipped(browser, spec('suite', 'a'));
      reporter.onRunComplete({}, { success: 0, failed: 0, disconnected: false });

      // then
      const out = lines.join('');
      expect(out).to.include('# tests 1');
      expect(out).to.match(/skip\s+1/);
    });


    it('should list failed tests after summary', function() {

      // given
      const { reporter, lines, browser } = createReporter();

      reporter.onRunStart({});
      reporter.onBrowserStart(browser);

      // when
      reporter.specFailure(browser, failSpec('suite', 'test a', 'AssertionError: expected 1 to equal 2'));
      reporter.onRunComplete({}, { success: 0, failed: 1, disconnected: false });

      // then
      const out = lines.join('');
      expect(out).to.include('Failed tests (1)');
      expect(out).to.include('suite > test a');
      expect(out).to.include('AssertionError: expected 1 to equal 2');
    });

  });


  describe('progress (non-TTY)', function() {

    useTTY(false);


    it('should print a progress line when the interval has elapsed', function() {

      // given
      // lastProgressAt starts at 0, so the first spec always fires
      const { reporter, lines, browser } = createReporter();

      reporter.onRunStart({});
      reporter.onBrowserStart(browser);

      // when
      reporter.specSuccess(browser, spec('suite', 'test 0'));

      // then
      expect(lines.join('')).to.include('... 1 tests');
    });


    it('should not print a second progress line before the interval elapses', function() {

      // given
      const { reporter, lines, browser } = createReporter();

      reporter.onRunStart({});
      reporter.onBrowserStart(browser);

      // when
      // all specs run in <680ms, so only the first triggers a line
      for (let i = 0; i < 10; i++) {
        reporter.specSuccess(browser, spec('suite', `test ${i}`));
      }

      // then
      const progressLines = lines.filter(l => l.includes('... '));
      expect(progressLines).to.have.length(1);
    });


    it('should show percentage when total is known', function() {

      // given
      const { reporter, lines, browser } = createReporter(200);

      reporter.onRunStart({});
      reporter.onBrowserStart(browser);

      // when
      // first spec fires immediately (lastProgressAt = 0)
      reporter.specSuccess(browser, spec('suite', 'test 0'));

      // then
      // 1/200 = 1%
      const progressLine = lines.find(l => l.includes('... '));
      expect(progressLine).to.include('1%');
    });


    it('should count a failure toward the progress count', function() {

      // given
      const { reporter, lines, browser } = createReporter();

      reporter.onRunStart({});
      reporter.onBrowserStart(browser);

      // when
      reporter.specFailure(browser, failSpec('suite', 'fail', 'Error'));

      // then
      expect(lines.join('')).to.include('... 1 tests');
    });


    it('should count a skip toward the progress count', function() {

      // given
      const { reporter, lines, browser } = createReporter();

      reporter.onRunStart({});
      reporter.onBrowserStart(browser);

      // when
      reporter.specSkipped(browser, spec('suite', 'skip'));

      // then
      expect(lines.join('')).to.include('... 1 tests');
    });

  });


  describe('progress (TTY)', function() {

    useTTY(true);

    function findProgressLine(lines) {
      return lines.find(l => l.includes('running') && l.includes('\x1b[K'));
    }


    it('should draw progress on a new line when no prior progress exists', function() {

      // given
      // progressDrawn starts false, so \n prefix is used (not \r overwrite)
      const { reporter, lines, browser } = createReporter();

      reporter.onRunStart({});
      reporter.onBrowserStart(browser);

      // when
      reporter.specSuccess(browser, spec('suite', 'test'));

      // then
      const progressLine = findProgressLine(lines);
      expect(progressLine).to.exist;
      expect(progressLine).to.match(/^\n/);
    });


    it('should show percentage when total is known', function() {

      // given
      const { reporter, lines, browser } = createReporter(200);

      reporter.onRunStart({});
      reporter.onBrowserStart(browser);

      // when
      reporter.specSuccess(browser, spec('suite', 'test'));

      // then
      // 1/200 = 1%
      const progressLine = findProgressLine(lines);
      expect(progressLine).to.include('1/200');
      expect(progressLine).to.include('1%');
    });


    it('should clear the progress line before failure output', function() {

      // given
      // draw progress first so clearProgress has something to clear
      const { reporter, lines, browser } = createReporter();

      reporter.onRunStart({});
      reporter.onBrowserStart(browser);
      reporter.specSuccess(browser, spec('suite', 'pass'));  // draws progress

      const linesBeforeFailure = lines.length;

      // when
      reporter.specFailure(browser, failSpec('suite', 'fail', 'Error'));

      // then
      // first write after progress was drawn clears it (\r\x1b[K)
      expect(lines[linesBeforeFailure]).to.equal('\r\x1b[K');
    });


    it('should draw progress on a new line after failure output', function() {

      // given — failure clears progress (progressDrawn → false), so next draw uses \n
      const { reporter, lines, browser } = createReporter();

      reporter.onRunStart({});
      reporter.onBrowserStart(browser);

      // when
      reporter.specFailure(browser, failSpec('suite', 'fail', 'Error'));

      // then
      // progress redrawn with \n separator after the failure
      const progressLine = findProgressLine(lines);
      expect(progressLine).to.exist;
      expect(progressLine).to.match(/^\n/);
    });

  });


  describe('failures', function() {

    it('should print failure inline with detail', function() {

      // given
      const { reporter, lines, browser } = createReporter();

      reporter.onRunStart({});
      reporter.onBrowserStart(browser);

      // when
      reporter.specFailure(browser, failSpec([ 'suite', 'sub' ], 'test a', 'Error: bad\n  at foo.js:1'));

      // then
      const out = lines.join('');
      expect(out).to.include('fail suite > sub > test a');
      expect(out).to.include('Error: bad');
    });

  });

});
