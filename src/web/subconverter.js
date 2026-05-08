'use strict';

const path = require('node:path');
const Module = require('node:module');

let loaded = null;
let aliasInstalled = false;

function installSrcAlias(projectRoot) {
  if (aliasInstalled) return;
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function patchedResolveFilename(request, parent, isMain, options) {
    if (typeof request === 'string' && request.startsWith('@/')) {
      const mapped = path.join(projectRoot, 'src', request.slice(2));
      return originalResolveFilename.call(this, mapped, parent, isMain, options);
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
  aliasInstalled = true;
}

function loadSubStoreEngine() {
  if (loaded) return loaded;

  const projectRoot = path.join(__dirname, '..', '..');
  installSrcAlias(projectRoot);
  let presetEnv = '@babel/preset-env';
  try {
    presetEnv = require.resolve('@babel/preset-env', {
      paths: [projectRoot]
    });
  } catch (_) {}

  require('@babel/register')({
    extensions: ['.js'],
    ignore: [/node_modules/],
    only: [path.join(__dirname, '../core/proxy-utils')],
    presets: [presetEnv],
    babelrc: false,
    cache: false
  });

  const base = path.join(__dirname, '../core/proxy-utils');
  const preprocessors = require(path.join(base, 'preprocessors/index.js')).default;
  const parsers = require(path.join(base, 'parsers/index.js')).default;
  const producers = require(path.join(base, 'producers/index.js')).default;

  loaded = { preprocessors, parsers, producers };
  return loaded;
}

function preprocess(raw, preprocessors) {
  const looksLikePlainSubscription = /^\s*(proxies:|\w+:\/\/|[^=\n]+=\s*\w+|\[Proxy\]|\[server_local\])/im.test(raw);
  for (const processor of preprocessors) {
    try {
      if (looksLikePlainSubscription && /Base64 Pre-processor/i.test(processor.name)) continue;
      if (looksLikePlainSubscription && /Fallback Base64 Pre-processor/i.test(processor.name)) continue;
      if (processor.test(raw)) {
        return processor.parse(raw);
      }
    } catch (_) {}
  }
  return raw;
}

function tryParse(parser, line) {
  try {
    if (!parser.test(line)) return [null, new Error('Parser mismatch')];
  } catch (_) {
    return [null, new Error('Parser mismatch')];
  }
  try {
    return [parser.parse(line), null];
  } catch (error) {
    return [null, error];
  }
}

function parseNodes(content) {
  const { preprocessors, parsers } = loadSubStoreEngine();
  const raw = preprocess(content, preprocessors);
  const lines = String(raw || '').split('\n');
  const proxies = [];
  let lastParser = null;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    let parsed = null;
    let error = null;

    if (lastParser) {
      [parsed, error] = tryParse(lastParser, line);
      if (!error) {
        proxies.push(parsed);
        continue;
      }
    }

    for (const parser of parsers) {
      [parsed, error] = tryParse(parser, line);
      if (!error) {
        proxies.push(parsed);
        lastParser = parser;
        break;
      }
    }
  }

  return proxies;
}

function resolveProducer(format, producers) {
  const normalized = String(format || '').trim().toLowerCase();
  const aliases = {
    clash: 'Clash',
    surge: 'Surge',
    surgemac: 'SurgeMac',
    loon: 'Loon',
    qx: 'QX',
    singbox: 'singbox',
    'sing-box': 'sing-box',
    uri: 'URI',
    v2ray: 'V2Ray',
    v2: 'v2',
    mihomo: 'mihomo',
    meta: 'meta',
    clashmeta: 'clashmeta',
    'clash.meta': 'clash.meta',
    stash: 'Stash',
    shadowrocket: 'Shadowrocket',
    surfboard: 'Surfboard',
    egern: 'Egern',
    json: 'JSON'
  };
  return producers[aliases[normalized] || normalized];
}

function produceOutput(nodes, format) {
  const { producers } = loadSubStoreEngine();
  try {
    if (format === 'b64') {
      const uriProducer = resolveProducer('uri', producers);
      if (!uriProducer) return { error: 'URI producer is unavailable.' };
      const lines = [];
      for (const node of nodes) {
        try {
          lines.push(uriProducer.produce({ ...node }, 'subscription'));
        } catch (_) {}
      }
      if (!lines.length) return { error: 'No nodes in this subscription can be converted to b64.' };
      const text = lines.join('\n');
      return {
        output: Buffer.from(text).toString('base64'),
        contentType: 'text/plain; charset=utf-8',
        ext: 'txt'
      };
    }

    const producer = resolveProducer(format, producers);
    if (!producer) return { error: `Unknown format: ${format}` };

    if (producer.type === 'ALL') {
      const output = producer.produce(nodes, 'collection');
      return {
        output,
        contentType: format === 'json' || format === 'singbox' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
        ext: format === 'clash' || format === 'meta' || format === 'mihomo' || format === 'clashmeta' || format === 'stash' ? 'yaml' : (format === 'json' || format === 'singbox' ? 'json' : 'conf')
      };
    }

    const output = [];
    for (const node of nodes) {
      try {
        output.push(producer.produce({ ...node }, 'subscription'));
      } catch (_) {}
    }

    if (!output.length) {
      return { error: `No nodes in this subscription can be converted to ${format}.` };
    }

    return {
      output: output.join('\n'),
      contentType: 'text/plain; charset=utf-8',
      ext: format === 'uri' ? 'txt' : 'conf'
    };
  } catch (error) {
    return { error: error && error.message ? error.message : String(error) };
  }
}

function toBase32(content) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const buf = Buffer.from(content, 'utf8');
  let result = '';
  let bits = 0;
  let value = 0;
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alpha[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) result += alpha[(value << (5 - bits)) & 31];
  while (result.length % 8 !== 0) result += '=';
  return result;
}

function convert(content, format) {
  format = String(format || '').trim().toLowerCase();
  if (format === 'b32') {
    return { output: toBase32(content), contentType: 'text/plain; charset=utf-8', ext: 'txt' };
  }

  const nodes = parseNodes(content);
  if (!nodes.length) {
    return { error: 'No valid proxy nodes found by Sub-Store parser.' };
  }

  return produceOutput(nodes, format);
}

const FORMAT_LABELS = {
  clash: 'Clash', meta: 'Clash', clashmeta: 'Clash',
  mihomo: 'Mihomo',
  stash: 'Stash',
  surfboard: 'Surfboard',
  surge: 'Surge',
  surgemac: 'SurgeMac',
  loon: 'Loon',
  shadowrocket: 'Shadowrocket',
  qx: 'QX',
  egern: 'Egern',
  singbox: 'Singbox',
  v2ray: 'V2Ray',
  uri: 'URI',
  json: 'JSON',
  b64: 'Base64',
  b32: 'Base32'
};

function formatLabel(format) {
  return FORMAT_LABELS[String(format || '').trim().toLowerCase()] || String(format).toUpperCase();
}

module.exports = { convert, parseNodes, formatLabel };
