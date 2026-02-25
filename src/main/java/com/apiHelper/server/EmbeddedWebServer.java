package com.apiHelper.server;

import com.apiHelper.model.ApiProject;
import com.apiHelper.model.EndpointInfo;
import com.apiHelper.model.Field;
import com.apiHelper.model.ParsedEndpoint;
import com.apiHelper.service.OpenapiIndexer;
import com.apiHelper.service.RedoclyParser;
import com.apiHelper.service.YamlEndpointParser;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
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
        
        // Static resources
        server.createContext("/", this::handleStatic);
        
        // API endpoints
        server.createContext("/api/projects", this::handleGetProjects);
        server.createContext("/api/endpoints", this::handleGetEndpoints);
        server.createContext("/api/parse-endpoint", this::handleParseEndpoint);
        server.createContext("/api/endpoint-details", this::handleGetEndpointDetails);
        
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
    
    private void handleGetProjects(HttpExchange exchange) throws IOException {
        LOG.info("API Request: GET /api/projects");
        
        if (!"GET".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
            return;
        }
        
        try {
            List<ApiProject> projects = RedoclyParser.discoverProjects(project);
            
            LOG.info("Found " + projects.size() + " projects");
            
            StringBuilder json = new StringBuilder("[");
            for (int i = 0; i < projects.size(); i++) {
                if (i > 0) json.append(",");
                ApiProject p = projects.get(i);
                json.append("{")
                    .append("\"name\":\"").append(escapeJson(p.getName())).append("\",")
                    .append("\"rootPath\":\"").append(escapeJson(p.getRootPath())).append("\"")
                    .append("}");
            }
            json.append("]");
            
            sendJson(exchange, json.toString());
        } catch (Exception e) {
            LOG.error("Error getting projects", e);
            sendJson(exchange, "{\"error\":\"" + escapeJson(e.getMessage()) + "\"}");
        }
    }
    
    private void handleGetEndpoints(HttpExchange exchange) throws IOException {
        LOG.info("API Request: GET /api/endpoints");
        
        if (!"GET".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
            return;
        }
        
        try {
            // Parse query parameters
            String query = exchange.getRequestURI().getQuery();
            String projectName = getQueryParam(query, "project");
            String rootPath = getQueryParam(query, "rootPath");
            
            LOG.info("Parameters: project=" + projectName + ", rootPath=" + rootPath);
            
            if (projectName == null || rootPath == null) {
                sendJson(exchange, "{\"error\":\"Missing parameters\"}");
                return;
            }
            
            ApiProject apiProject = new ApiProject(projectName, rootPath);
            List<EndpointInfo> endpoints = OpenapiIndexer.indexEndpoints(this.project, apiProject);
            
            LOG.info("Found " + endpoints.size() + " endpoints");
            
            StringBuilder json = new StringBuilder("[");
            for (int i = 0; i < endpoints.size(); i++) {
                if (i > 0) json.append(",");
                EndpointInfo ep = endpoints.get(i);
                json.append("{")
                    .append("\"apiPath\":\"").append(escapeJson(ep.getApiPath())).append("\",")
                    .append("\"filePath\":\"").append(escapeJson(ep.getFilePath())).append("\",")
                    .append("\"methods\":[");
                
                List<String> methods = ep.getMethods();
                for (int j = 0; j < methods.size(); j++) {
                    if (j > 0) json.append(",");
                    json.append("\"").append(methods.get(j)).append("\"");
                }
                json.append("]")
                    .append("}");
            }
            json.append("]");
            
            sendJson(exchange, json.toString());
        } catch (Exception e) {
            LOG.error("Error getting endpoints", e);
            sendJson(exchange, "{\"error\":\"" + escapeJson(e.getMessage()) + "\"}");
        }
    }
    
    private void handleParseEndpoint(HttpExchange exchange) throws IOException {
        LOG.info("API Request: POST /api/parse-endpoint");
        
        if (!"POST".equals(exchange.getRequestMethod())) {
            exchange.sendResponseHeaders(405, -1);
            return;
        }
        
        try {
            // Read JSON body
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            LOG.info("Request body: " + body);
            
            // Simple JSON parsing (you might want to use a proper JSON library)
            String projectRoot = extractJsonValue(body, "projectRoot");
            String endpointPath = extractJsonValue(body, "endpointPath");
            String method = extractJsonValue(body, "method");
            
            LOG.info("Parse parameters: projectRoot=" + projectRoot + ", endpointPath=" + endpointPath + ", method=" + method);
            
            if (projectRoot == null || endpointPath == null || method == null) {
                sendJson(exchange, "{\"error\":\"Missing parameters\"}");
                return;
            }
            
            YamlEndpointParser parser = new YamlEndpointParser(this.project);
            ParsedEndpoint parsed = parser.parseEndpoint(projectRoot, endpointPath, method);
            
            // Convert to JSON
            StringBuilder json = new StringBuilder("{");
            json.append("\"method\":\"").append(escapeJson(parsed.getMethod())).append("\",");
            json.append("\"url\":\"").append(escapeJson(parsed.getUrl() != null ? parsed.getUrl() : "")).append("\",");
            json.append("\"operationId\":\"").append(escapeJson(parsed.getOperationId() != null ? parsed.getOperationId() : "")).append("\",");
            json.append("\"tag\":\"").append(escapeJson(parsed.getTag() != null ? parsed.getTag() : "")).append("\",");
            json.append("\"summary\":\"").append(escapeJson(parsed.getSummary() != null ? parsed.getSummary() : "")).append("\",");
            
            // Request fields
            json.append("\"requestFields\":[");
            appendFieldsJson(json, parsed.getRequestFields());
            json.append("],");
            
            // Response fields
            json.append("\"responseFields\":[");
            appendFieldsJson(json, parsed.getResponseFields());
            json.append("]");
            
            json.append("}");
            
            LOG.info("Parsed endpoint successfully");
            sendJson(exchange, json.toString());
            
        } catch (Exception e) {
            LOG.error("Error parsing endpoint", e);
            sendJson(exchange, "{\"error\":\"" + escapeJson(e.getMessage()) + "\"}");
        }
    }
    
    private void appendFieldsJson(StringBuilder json, List<Field> fields) {
        for (int i = 0; i < fields.size(); i++) {
            if (i > 0) json.append(",");
            Field f = fields.get(i);
            json.append("{");
            json.append("\"name\":\"").append(escapeJson(f.getName())).append("\",");
            json.append("\"type\":\"").append(escapeJson(f.getType() != null ? f.getType() : "")).append("\",");
            json.append("\"description\":\"").append(escapeJson(f.getDescription() != null ? f.getDescription() : "")).append("\",");
            json.append("\"format\":\"").append(escapeJson(f.getFormat() != null ? f.getFormat() : "")).append("\",");
            json.append("\"example\":\"").append(escapeJson(f.getExample() != null ? f.getExample() : "")).append("\",");
            json.append("\"required\":").append(f.isRequired()).append(",");
            json.append("\"depth\":").append(f.getDepth()).append(",");
            json.append("\"hasChildren\":").append(f.hasChildren());
            
            if (f.hasChildren()) {
                json.append(",\"children\":[");
                appendFieldsJson(json, f.getChildren());
                json.append("]");
            }
            
            json.append("}");
        }
    }
    
    private void handleGetEndpointDetails(HttpExchange exchange) throws IOException {
        // TODO: Implement full endpoint parsing
        sendJson(exchange, "{\"status\":\"not implemented yet\"}");
    }
    
    private void sendJson(HttpExchange exchange, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.sendResponseHeaders(200, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }
    
    private void send404(HttpExchange exchange) throws IOException {
        String response = "404 Not Found";
        exchange.sendResponseHeaders(404, response.length());
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(response.getBytes());
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
    
    private String extractJsonValue(String json, String key) {
        String pattern = "\"" + key + "\":\"([^\"]*)\"";
        java.util.regex.Pattern p = java.util.regex.Pattern.compile(pattern);
        java.util.regex.Matcher m = p.matcher(json);
        if (m.find()) {
            return m.group(1);
        }
        return null;
    }
    
    private String escapeJson(String str) {
        if (str == null) return "";
        return str.replace("\\", "\\\\")
                  .replace("\"", "\\\"")
                  .replace("\n", "\\n")
                  .replace("\r", "\\r")
                  .replace("\t", "\\t");
    }
    
    private int findFreePort() throws IOException {
        try (java.net.ServerSocket socket = new java.net.ServerSocket(0)) {
            return socket.getLocalPort();
        }
    }
}
