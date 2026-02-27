package com.apiHelper.server;

import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.project.ProjectUtil;
import com.intellij.openapi.vfs.VirtualFile;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;

/**
 * Embedded HTTP server to serve web UI and provide API endpoints
 */
public class EmbeddedWebServer {
    private static final Logger LOG = Logger.getInstance(EmbeddedWebServer.class);
    
    private HttpServer server;
    private final Project project;
    private int port;
    
    public EmbeddedWebServer(Project project) {
        this.project = project;
    }
    
    public int start() throws IOException {
        // Find free port
        port = findFreePort();
        
        server = HttpServer.create(new InetSocketAddress("localhost", port), 0);
        server.setExecutor(Executors.newFixedThreadPool(4));
        
        // Static UI resources
        server.createContext("/", this::handleStatic);
        
        // File proxy endpoint: client requests path relative to project root
        server.createContext("/api/file", this::handleGetFile);
        // Existence check (returns 200 if path exists, 404 otherwise)
        server.createContext("/api/exists", this::handleExists);
        // Save markdown or other text to workspace
        server.createContext("/api/save", this::handleSaveFile);
        
        server.start();
        LOG.info("Web server started on port " + port);
        
        return port;
    }
    
    public void stop() {
        if (server != null) {
            server.stop(0);
            LOG.info("Web server stopped");
        }
    }
    
    public boolean isRunning() {
        return server != null;
    }
    
    public int getPort() {
        return port;
    }
    
    private void handleStatic(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        
        LOG.info("Request: " + exchange.getRequestMethod() + " " + path);
        
        if (path.equals("/")) {
            path = "/index.html";
        }
        
        // Ignore source map requests
        if (path.endsWith(".map")) {
            exchange.sendResponseHeaders(404, -1);
            return;
        }
        
        // Load from resources
        String resourcePath = "/web" + path;
        
        try (InputStream is = getClass().getResourceAsStream(resourcePath)) {
            if (is == null) {
                LOG.warn("Resource not found: " + resourcePath);
                send404(exchange);
                return;
            }
            
            byte[] content = is.readAllBytes();
            String contentType = getContentType(path);
            
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.getResponseHeaders().set("Cache-Control", "no-cache");
            exchange.sendResponseHeaders(200, content.length);
            
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(content);
            }
            
            LOG.info("Served: " + path + " (" + content.length + " bytes)");
        } catch (Exception e) {
            LOG.error("Error serving " + path, e);
            send404(exchange);
        }
    }
    
    
    
    
    
    private void send404(HttpExchange exchange) throws IOException {
        String response = "404 Not Found";
        exchange.sendResponseHeaders(404, response.length());
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(response.getBytes());
        }
    }

    /**
     * Проверка существования файла или директории
     */
    private void handleExists(HttpExchange exchange) throws IOException {
        if (!"GET".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
            return;
        }
        String query = exchange.getRequestURI().getQuery();
        String path = getQueryParam(query, "path");
        if (path == null || path.isEmpty()) {
            exchange.sendResponseHeaders(400, -1);
            return;
        }

        VirtualFile baseDir = ProjectUtil.guessProjectDir(project);
        if (baseDir == null) {
            exchange.sendResponseHeaders(500, -1);
            return;
        }

        VirtualFile file = baseDir.findFileByRelativePath(path);
        if (file == null) {
            exchange.sendResponseHeaders(404, -1);
        } else {
            exchange.sendResponseHeaders(200, -1);
        }
    }

    /**
     * Сохранение файла в рабочую папку. Тело запроса — содержимое.
     * Путь передаётся в query param `path`.
     * Если папка не существует, возвращается 404.
     */
    private void handleSaveFile(HttpExchange exchange) throws IOException {
        if (!"POST".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
            return;
        }
        String query = exchange.getRequestURI().getQuery();
        String path = getQueryParam(query, "path");
        if (path == null || path.isEmpty()) {
            exchange.sendResponseHeaders(400, -1);
            return;
        }

        VirtualFile baseDir = ProjectUtil.guessProjectDir(project);
        if (baseDir == null) {
            exchange.sendResponseHeaders(500, -1);
            return;
        }

        java.io.File dest = new java.io.File(baseDir.getPath(), path);
        java.io.File parent = dest.getParentFile();
        if (parent == null || !parent.exists() || !parent.isDirectory()) {
            // папки нет
            exchange.sendResponseHeaders(404, -1);
            return;
        }

        try (OutputStream os = new java.io.FileOutputStream(dest)) {
            exchange.getRequestBody().transferTo(os);
        } catch (Exception e) {
            LOG.error("Error writing file " + dest, e);
            exchange.sendResponseHeaders(500, -1);
            return;
        }

        exchange.sendResponseHeaders(200, -1);
    }
    
    /**
     * Serve a file from project root. Query parameter: path=<relative path>
     */
    private void handleGetFile(HttpExchange exchange) throws IOException {
        if (!"GET".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
            return;
        }

        String query = exchange.getRequestURI().getQuery();
        String path = getQueryParam(query, "path");
        if (path == null || path.isEmpty()) {
            exchange.sendResponseHeaders(400, -1);
            return;
        }

        VirtualFile baseDir = ProjectUtil.guessProjectDir(project);
        if (baseDir == null) {
            exchange.sendResponseHeaders(500, -1);
            return;
        }

        VirtualFile file = baseDir.findFileByRelativePath(path);
        if (file == null || file.isDirectory()) {
            exchange.sendResponseHeaders(404, -1);
            return;
        }

        byte[] content = file.contentsToByteArray();
        exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
        exchange.sendResponseHeaders(200, content.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(content);
        }
    }
    
    private String getContentType(String path) {
        if (path.endsWith(".html")) return "text/html; charset=utf-8";
        if (path.endsWith(".css")) return "text/css; charset=utf-8";
        if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (path.endsWith(".json")) return "application/json; charset=utf-8";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
        if (path.endsWith(".svg")) return "image/svg+xml";
        return "text/plain";
    }
    
    
    
    
    private int findFreePort() throws IOException {
        try (java.net.ServerSocket socket = new java.net.ServerSocket(0)) {
            return socket.getLocalPort();
        }
    }

    private String getQueryParam(String query, String param) {
        if (query == null) return null;
        String[] pairs = query.split("&");
        for (String pair : pairs) {
            String[] kv = pair.split("=", 2);
            if (kv.length == 2 && kv[0].equals(param)) {
                return java.net.URLDecoder.decode(kv[1], StandardCharsets.UTF_8);
            }
        }
        return null;
    }
}
