'use strict';

const { magenta } = require('picocolors');
const tildify = require('tildify');
const Promise = require('bluebird');
const Context = require('./context');
const findPkg = require('./find_pkg');
const goodbye = require('./goodbye');
const minimist = require('minimist');
const resolve = require('resolve');
const { camelCaseKeys } = require('hexo-util');

class HexoNotFoundError extends Error {}

function entry(cwd = process.cwd(), args) {
  args = camelCaseKeys(args || minimist(process.argv.slice(2), { string: ['_'] }));

  let hexo = new Context(cwd, args);
  let { log } = hexo;

  // Change the title in console
  process.title = 'hexo';

  function handleError(err) {
    if (err && !(err instanceof HexoNotFoundError)) {
      log.fatal(err);
    }

    process.exitCode = 2;
  }

  return findPkg(cwd, args).then(path => {
    if (!path) return;

    hexo.base_dir = path;

    return loadModule(path, args).catch(err => {
      log.error(err.message);
      log.error('Local hexo loading failed in %s', magenta(tildify(path)));
      log.error('Try running: \'rm -rf node_modules && npm install --force\'');
      throw new HexoNotFoundError();
    });
  }).then(mod => {
    if (mod) hexo = mod;
    log = hexo.log;

    require('./console')(hexo);

    return hexo.init();
  }).then(() => {
    let cmd = 'help';

    if (!args.h && !args.help) {
      const c = args._.shift();
      if (c && hexo.extend.console.get(c)) cmd = c;
    }

    watchSignal(hexo);

    return hexo.call(cmd, args).then(() => hexo.exit()).catch(err => hexo.exit(err).then(() => {
      // `hexo.exit()` already dumped `err`
      handleError(null);
    }));
  }).catch(handleError);
}

entry.console = {
  init: require('./console/init'),
  help: require('./console/help'),
  version: require('./console/version')
};

entry.version = require('../package.json').version;

function loadModule(path, args) {
  return Promise.try(() => {
    const modulePath = resolve.sync('hexo', { basedir: path });
    const Hexo = require(modulePath);

    return new Hexo(path, args);
  });
}

function watchSignal(hexo) {
  process.on('SIGINT', () => {
    hexo.log.info(goodbye());
    hexo.unwatch();

    hexo.exit().then(() => {
      // eslint-disable-next-line no-process-exit
      process.exit();
    });
  });
}

module.exports = entry;
