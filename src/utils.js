const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');

function nowIso() {
  return new Date().toISOString();
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex');
}

function mkdirRecursive(dirPath) {
  if (fs.existsSync(dirPath)) return;
  const parent = path.dirname(dirPath);
  if (!fs.existsSync(parent)) mkdirRecursive(parent);
  fs.mkdirSync(dirPath);
}

function parseJson(str, fallback) {
  try {
    return JSON.parse(str || '{}');
  } catch (e) {
    return fallback;
  }
}

function htmlEscape(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function mkId(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let res = '';
  for (let i = 0; i < len; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
  return res;
}

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
  nowIso,
  sha256,
  mkdirRecursive,
  parseJson,
  htmlEscape,
  mkId,
  getIfNotBlank,
  getIfPresent,
  getRandomPort,
  isIPv4,
  isIPv6,
  isNotBlank,
  isPlainObject,
  isPresent
};
