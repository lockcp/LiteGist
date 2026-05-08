'use strict';

const yaml = require('static-js-yaml');

function safeLoad(input) {
  return yaml.safeLoad(input);
}

function safeDump(input, options) {
  return yaml.safeDump(input, options);
}

module.exports = {
  safeLoad,
  safeDump
};
