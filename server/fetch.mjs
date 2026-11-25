import http from "node:http";
import https from "node:https";
import net from "node:net";
import dns from "node:dns/promises";

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 4;

function fail(message, code = "EBADURL") {
  return Object.assign(new Error(message), { code });
}

function isBlockedAddress(ip) {
  const version = net.isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (version === 6) {
    const value = ip.toLowerCase();
    if (value === "::" || value === "::1") return true;
    if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80") || value.startsWith("ff")) return true;
    const mapped = value.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedAddress(mapped[1]);
    return false;
  }
  return true;
}

async function pin(hostname) {
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw fail("拒绝访问内网、本机或链路本地地址");
    return { address: hostname, family: net.isIP(hostname) };
  }
  const lowered = hostname.toLowerCase().replace(/\.$/, "");
  if (lowered === "localhost" || lowered.endsWith(".localhost") || lowered.endsWith(".local") || lowered === "metadata.google.internal") {
    throw fail("拒绝访问本机或内部主机名");
  }
  const records = await dns.lookup(lowered, { all: true, verbatim: true });
  if (records.length === 0) throw fail("域名没有解析结果");
  for (const record of records) {
    if (isBlockedAddress(record.address)) throw fail("域名解析到内网地址，已拒绝");
  }
  return records[0];
}

function metaRefresh(body, base) {
  if (body.length > 8192) return null;
  const head = body.toString("latin1");
  const match = head.match(/http-equiv\s*=\s*["']refresh["'][^>]*content\s*=\s*["'][^"']*?url\s*=\s*([^"'\s>]+)/i);
  if (!match) return null;
  try {
    return new URL(match[1], base);
  } catch {
    return null;
  }
}

function requestOnce(target, address, family) {
  const lib = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request({
      protocol: target.protocol,
      hostname: target.hostname,
      servername: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: "GET",
      headers: {
        "user-agent": "gov-workbench-consult/0.1",
        accept: "text/html,application/json,text/plain;q=0.9,*/*;q=0.1",
        "accept-language": "zh-CN,zh;q=0.9",
        "accept-encoding": "identity",
      },
      autoSelectFamily: false,
      lookup: (_hostname, options, callback) => {
        if (typeof options === "function") {
          callback = options;
          options = {};
        }
        if (options.all) {
          callback(null, [{ address, family }]);
          return;
        }
        callback(null, address, family);
      },
      timeout: 12000,
      rejectUnauthorized: true,
    }, (res) => {
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          req.destroy(fail("响应超过 1.5MB", "ELIMIT"));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on("timeout", () => req.destroy(fail("抓取超时", "ETIMEDOUT")));
    req.on("error", reject);
    req.end();
  });
}

export async function fetchPublic(rawUrl) {
  let current;
  try {
    current = new URL(rawUrl);
  } catch {
    throw fail("网址格式不正确");
  }
  if (current.username || current.password) throw fail("网址不能包含账号口令");
  const hops = [];
  for (let i = 0; i <= MAX_REDIRECTS; i += 1) {
    if (current.protocol !== "http:" && current.protocol !== "https:") throw fail("只抓取 http 或 https");
    const port = Number(current.port || (current.protocol === "https:" ? 443 : 80));
    if (port !== 80 && port !== 443) throw fail("只抓取 80 和 443 端口");
    const pinned = await pin(current.hostname);
    hops.push(current.href);
    const response = await requestOnce(current, pinned.address, pinned.family);
    const location = response.headers.location;
    const refresh = metaRefresh(response.body, current);
    const redirect = (response.status >= 300 && response.status < 400 && location) || refresh;
    if (!redirect) {
      return {
        url: hops[0],
        finalUrl: current.href,
        hops,
        status: response.status,
        contentType: String(response.headers["content-type"] || "").split(";")[0].trim(),
        charset: (/charset\s*=\s*"?([^";]+)/i.exec(String(response.headers["content-type"] || ""))?.[1] || "").trim(),
        body: response.body,
      };
    }
    if (i === MAX_REDIRECTS) throw fail("重定向次数过多");
    const next = refresh || new URL(location, current);
    if (next.href === current.href) throw fail("页面跳转停在同一地址");
    current = next;
  }
  throw fail("抓取失败");
}
