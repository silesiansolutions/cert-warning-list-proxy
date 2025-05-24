/**
 * Cloudflare Worker - Secure Proxy for hole.cert.pl/domains/
 *
 * This worker acts as a secure proxy for hole.cert.pl/domains/ endpoints,
 * providing reliable access through Cloudflare infrastructure with CORS support.
 *
 * GitHub IP ranges are often blocked by hole.cert.pl, but Cloudflare's
 * distributed infrastructure is harder to block, making this proxy more reliable.
 */

const ALLOWED_PATHS = ["/domains/", "/domains/v2/"];
const TARGET_DOMAIN = "hole.cert.pl";

export default {
  async fetch(request) {
    return handleRequest(request);
  },
};

function isPathAllowed(pathname) {
  return ALLOWED_PATHS.some((allowedPath) => pathname.startsWith(allowedPath));
}

async function handleRequest(request) {
  try {
    const url = new URL(request.url);

    if (!isPathAllowed(url.pathname)) {
      return new Response(
        "Not Found - This proxy only handles /domains/ and /domains/v2/ paths",
        {
          status: 404,
          headers: getCorsHeaders("text/plain; charset=utf-8"),
        }
      );
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: {
          ...getCorsHeaders(),
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (!["GET", "HEAD"].includes(request.method)) {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: {
          ...getCorsHeaders(),
          Allow: "GET, HEAD, OPTIONS",
        },
      });
    }

    const targetUrl = `https://${TARGET_DOMAIN}${url.pathname}${url.search}`;

    const modifiedRequest = new Request(targetUrl, {
      method: request.method,
      headers: {
        "User-Agent": "Cloudflare-Worker-Proxy/1.0",
        Accept: request.headers.get("Accept") || "*/*",
        "Accept-Encoding":
          request.headers.get("Accept-Encoding") || "gzip, deflate",
        "Accept-Language":
          request.headers.get("Accept-Language") || "en-US,en;q=0.9",
      },
    });

    const response = await fetch(modifiedRequest);

    if (!response.ok) {
      return new Response(
        `Source server error: ${response.status} ${response.statusText}`,
        {
          status: response.status,
          headers: getCorsHeaders("text/plain; charset=utf-8"),
        }
      );
    }

    const responseHeaders = new Headers();

    const headersToKeep = [
      "content-type",
      "content-length",
      "content-encoding",
      "content-disposition",
      "last-modified",
      "etag",
      "expires",
      "cache-control",
    ];

    headersToKeep.forEach((header) => {
      const value = response.headers.get(header);
      if (value) {
        responseHeaders.set(header, value);
      }
    });

    Object.entries(getCorsHeaders()).forEach(([key, value]) => {
      responseHeaders.set(key, value);
    });

    if (!responseHeaders.has("cache-control")) {
      responseHeaders.set("Cache-Control", "public, max-age=3600");
    }

    responseHeaders.set("X-Proxied-By", "Cloudflare-Worker");
    responseHeaders.set("X-Proxy-Source", TARGET_DOMAIN);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Worker error:", error);
    return new Response(`Proxy error: ${error.message}`, {
      status: 500,
      headers: getCorsHeaders("text/plain; charset=utf-8"),
    });
  }
}

function getCorsHeaders(contentType = null) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  return headers;
}
