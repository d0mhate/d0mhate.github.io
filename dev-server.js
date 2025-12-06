// Lightweight static dev server with SSE live reload (no external deps).
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const port = process.env.PORT || 3000;
const root = __dirname;
const sseClients = new Set();

const mime = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
};

function injectLiveReload(html) {
    const snippet = `
<script>
(function() {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
        var es = new EventSource("/__livereload");
        es.onmessage = function() { location.reload(); };
        es.onerror = function() { setTimeout(function(){ location.reload(); }, 1000); };
    }
})();
</script>`;
    const idx = html.lastIndexOf("</body>");
    if (idx === -1) return html + snippet;
    return html.slice(0, idx) + snippet + html.slice(idx);
}

function serveStatic(req, res) {
    const parsed = url.parse(req.url);
    let pathname = decodeURIComponent(parsed.pathname);

    if (pathname === "/") pathname = "/index.html";
    const filePath = path.join(root, pathname);

    // security: prevent path traversal
    if (!filePath.startsWith(root)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404);
            res.end("Not found");
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const type = mime[ext] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": type });

        if (ext === ".html") {
            fs.readFile(filePath, "utf8", (readErr, data) => {
                if (readErr) {
                    res.writeHead(500);
                    res.end("Server error");
                    return;
                }
                res.end(injectLiveReload(data));
            });
        } else {
            fs.createReadStream(filePath).pipe(res);
        }
    });
}

const server = http.createServer((req, res) => {
    if (req.url === "/__livereload") {
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
        });
        res.write("\n");

        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return;
    }

    serveStatic(req, res);
});

server.listen(port, () => {
    console.log(`Dev server with live reload at http://localhost:${port}`);
});

// Watch files and notify clients.
const ignored = ["node_modules", ".git"];
fs.watch(
    root,
    { recursive: true },
    (eventType, filename) => {
        if (!filename) return;
        if (ignored.some((seg) => filename.includes(seg))) return;
        for (const res of sseClients) {
            res.write("data: reload\n\n");
        }
    }
);
