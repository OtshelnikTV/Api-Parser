package com.apiHelper.service;

import com.apiHelper.model.ApiProject;
import com.apiHelper.model.EndpointInfo;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.project.ProjectUtil;
import com.intellij.openapi.vfs.VirtualFile;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Indexes openapi.yaml to get list of endpoints WITHOUT full parsing
 * This is a lightweight operation even with 10000+ endpoints
 */
public class OpenapiIndexer {
    private static final Logger LOG = Logger.getInstance(OpenapiIndexer.class);
    private static final List<String> HTTP_METHODS = Arrays.asList("get", "post", "put", "delete", "patch", "head", "options");
    private static final Pattern REF_PATTERN = Pattern.compile("\\$ref:\\s*['\"]?([^'\"\\s]+)['\"]?");
    
    /**
     * Index endpoints from openapi.yaml
     * Returns lightweight EndpointInfo objects with methods detected
     */
    public static List<EndpointInfo> indexEndpoints(Project project, ApiProject apiProject) {
        List<EndpointInfo> endpoints = new ArrayList<>();
        
        VirtualFile baseDir = ProjectUtil.guessProjectDir(project);
        if (baseDir == null) {
            return endpoints;
        }
        
        // Find openapi.yaml file
        VirtualFile openapiFile = baseDir.findFileByRelativePath(apiProject.getRootPath());
        if (openapiFile == null) {
            LOG.warn("openapi.yaml not found at: " + apiProject.getRootPath());
            return endpoints;
        }
        
        try {
            String content = new String(openapiFile.contentsToByteArray(), openapiFile.getCharset());
            
            // Parse paths section
            Map<String, String> pathToFile = parsePathsSection(content);
            
            if (pathToFile.isEmpty()) {
                LOG.warn("No paths found in openapi.yaml for project: " + apiProject.getName());
            }
            
            // For each endpoint file, detect HTTP methods
            for (Map.Entry<String, String> entry : pathToFile.entrySet()) {
                String apiPath = entry.getKey();
                String filePath = entry.getValue();
                
                // Resolve file path relative to openapi.yaml location
                VirtualFile endpointFile = findEndpointFile(openapiFile.getParent(), filePath);
                
                if (endpointFile != null) {
                    List<String> methods = detectMethods(endpointFile);
                    LOG.info("Endpoint " + apiPath + " has methods: " + methods);
                    endpoints.add(new EndpointInfo(apiPath, filePath, methods));
                } else {
                    LOG.warn("Endpoint file not found: " + filePath + " (full path would be: " + 
                            openapiFile.getParent().getPath() + "/" + filePath + ")");
                    // Add endpoint anyway with empty methods
                    endpoints.add(new EndpointInfo(apiPath, filePath, Collections.emptyList()));
                }
            }
            
            LOG.info("Indexed " + endpoints.size() + " endpoints from " + apiProject.getName());
            
        } catch (IOException e) {
            LOG.error("Error reading openapi.yaml", e);
        }
        
        return endpoints;
    }
    
    /**
     * Parse paths section and extract API path -> file path mapping
     */
    private static Map<String, String> parsePathsSection(String content) {
        Map<String, String> result = new HashMap<>();
        
        try {
            Yaml yaml = new Yaml();
            Map<String, Object> root = yaml.load(content);
            
            if (root == null || !root.containsKey("paths")) {
                LOG.warn("No 'paths' section in openapi.yaml");
                return result;
            }
            
            @SuppressWarnings("unchecked")
            Map<String, Object> paths = (Map<String, Object>) root.get("paths");
            
            for (Map.Entry<String, Object> entry : paths.entrySet()) {
                String path = entry.getKey();
                Object pathDef = entry.getValue();
                
                if (pathDef instanceof Map) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> pathMap = (Map<String, Object>) pathDef;
                    
                    if (pathMap.containsKey("$ref")) {
                        String ref = (String) pathMap.get("$ref");
                        result.put(path, ref);
                        LOG.info("Mapped " + path + " -> " + ref);
                    } else {
                        // Inline definition - no file reference
                        LOG.info("Path " + path + " has inline definition, no file mapping");
                    }
                }
            }
            
        } catch (Exception e) {
            LOG.error("Error parsing YAML paths section", e);
        }
        
        LOG.info("Parsed " + result.size() + " paths from openapi.yaml");
        return result;
    }
    
    /**
     * Detect HTTP methods in endpoint file
     * Returns list of methods found
     */
    private static List<String> detectMethods(VirtualFile file) {
        List<String> methods = new ArrayList<>();
        
        try {
            String content = new String(file.contentsToByteArray(), file.getCharset());
            
            // Check for each HTTP method at the start of a line
            for (String method : HTTP_METHODS) {
                Pattern pattern = Pattern.compile("^" + method + "\\s*:", Pattern.MULTILINE);
                if (pattern.matcher(content).find()) {
                    methods.add(method);
                }
            }
            
        } catch (IOException e) {
            LOG.warn("Error reading endpoint file: " + file.getPath(), e);
        }
        
        return methods;
    }
    
    /**
     * Find endpoint file relative to openapi.yaml location
     */
    private static VirtualFile findEndpointFile(VirtualFile baseDir, String relativePath) {
        // relativePath is like: paths/api_v1_cashback_score/api_v1_cashback_score.yaml
        return baseDir.findFileByRelativePath(relativePath);
    }
}
