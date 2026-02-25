package com.apiHelper.model;

/**
 * Represents an API project from redocly.yaml
 */
public class ApiProject {
    private final String name;
    private final String rootPath; // path to openapi.yaml
    
    public ApiProject(String name, String rootPath) {
        this.name = name;
        this.rootPath = rootPath;
    }
    
    public String getName() {
        return name;
    }
    
    public String getRootPath() {
        return rootPath;
    }
    
    @Override
    public String toString() {
        return name;
    }
}
