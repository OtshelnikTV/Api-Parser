package com.apiHelper.model;

import java.util.List;

/**
 * Lightweight representation of an endpoint (without full parsing)
 */
public class EndpointInfo {
    private final String apiPath;      // e.g., "/api/v1/cashback/score"
    private final String filePath;     // relative path to endpoint file
    private final List<String> methods; // HTTP methods (get, post, etc.)
    
    public EndpointInfo(String apiPath, String filePath, List<String> methods) {
        this.apiPath = apiPath;
        this.filePath = filePath;
        this.methods = methods;
    }
    
    public String getApiPath() {
        return apiPath;
    }
    
    public String getFilePath() {
        return filePath;
    }
    
    public List<String> getMethods() {
        return methods;
    }
    
    public String getDisplayName() {
        // Extract filename without extension for display
        String[] parts = filePath.split("/");
        String filename = parts[parts.length - 1];
        return filename.replaceAll("\\.(yaml|yml)$", "");
    }
}
