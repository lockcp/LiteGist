'use strict';

const crypto = require('node:crypto');
const net = require('node:net');

function isIPv4(value) {
  return net.isIP(String(value || '').trim()) === 4;
}

function isIPv6(value) {
  return net.isIP(String(value || '').trim().replace(/^\[/, '').replace(/\]$/, '')) === 6;
}

function isNotBlank(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function getIfNotBlank(value, fallback) {
  return isNotBlank(value) ? value : fallback;
}

function isPresent(value) {
  return value !== undefined && value !== null;
}

function getIfPresent(value, fallback) {
  return isPresent(value) ? value : fallback;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function getRandomPort(ports) {
  const raw = String(ports || '').trim();
  if (!raw) return undefined;
  const choices = [];
  for (const segment of raw.split(/\s*[;,]\s*/)) {
    if (!segment) continue;
    const match = segment.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) continue;
    const start = parseInt(match[1], 10);
    const end = parseInt(match[2] || match[1], 10);
    if (start > end) continue;
    choices.push([start, end]);
  }
  if (!choices.length) return undefined;
  const [start, end] = choices[crypto.randomInt(choices.length)];
  return start === end ? start : crypto.randomInt(start, end + 1);
}

module.exports = {
  getIfNotBlank,
  getIfPresent,
  getRandomPort,
  isIPv4,
  isIPv6,
  isNotBlank,
  isPlainObject,
  isPresent
};
