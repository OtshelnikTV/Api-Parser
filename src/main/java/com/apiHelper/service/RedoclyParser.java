package com.apiHelper.service;

import com.apiHelper.model.ApiProject;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.project.ProjectUtil;
import com.intellij.openapi.vfs.VirtualFile;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Parses redocly.yaml to discover API projects
 */
public class RedoclyParser {
    private static final Logger LOG = Logger.getInstance(RedoclyParser.class);
    
    /**
     * Find and parse redocly.yaml files recursively in project
     */
    @SuppressWarnings("unchecked")
    public static List<ApiProject> discoverProjects(Project project) {
        List<ApiProject> projects = new ArrayList<>();
        
        VirtualFile baseDir = ProjectUtil.guessProjectDir(project);
        if (baseDir == null) {
            LOG.warn("Project base directory is null");
            return projects;
        }
        
        // Find all redocly.yaml files recursively
        List<VirtualFile> redoclyFiles = findRedoclyFiles(baseDir);
        
        for (VirtualFile redoclyFile : redoclyFiles) {
            try {
                String content = new String(redoclyFile.contentsToByteArray(), redoclyFile.getCharset());
                Yaml yaml = new Yaml();
                Map<String, Object> data = yaml.load(content);
                
                if (data == null || !data.containsKey("apis")) {
                    LOG.warn("No 'apis' section in " + redoclyFile.getPath());
                    continue;
                }
                
                Map<String, Object> apis = (Map<String, Object>) data.get("apis");
                
                for (Map.Entry<String, Object> entry : apis.entrySet()) {
                    String projectName = entry.getKey();
                    Map<String, Object> projectData = (Map<String, Object>) entry.getValue();
                    
                    if (projectData.containsKey("root")) {
                        String rootPath = (String) projectData.get("root");
                        // Make rootPath relative to the redocly.yaml directory
                        String redoclyDir = redoclyFile.getParent().getPath();
                        String fullRootPath = redoclyDir + "/" + rootPath;
                        // Make it relative to project root
                        String relativePath = fullRootPath.substring(baseDir.getPath().length() + 1);
                        LOG.info("Project " + projectName + ": rootPath=" + rootPath + ", redoclyDir=" + redoclyDir + ", fullRootPath=" + fullRootPath + ", baseDir=" + baseDir.getPath() + ", relativePath=" + relativePath);
                        projects.add(new ApiProject(projectName, relativePath));
                    }
                }
                
                LOG.info("Discovered projects from " + redoclyFile.getPath());
                
            } catch (IOException e) {
                LOG.error("Error reading " + redoclyFile.getPath(), e);
            } catch (Exception e) {
                LOG.error("Error parsing " + redoclyFile.getPath(), e);
            }
        }
        
        LOG.info("Total discovered " + projects.size() + " API projects");
        return projects;
    }
    
    private static List<VirtualFile> findRedoclyFiles(VirtualFile dir) {
        List<VirtualFile> files = new ArrayList<>();
        
        if (dir.isDirectory()) {
            // Check for redocly.yaml in current directory
            VirtualFile redoclyFile = dir.findChild("redocly.yaml");
            if (redoclyFile == null) {
                redoclyFile = dir.findChild("redocly.yml");
            }
            if (redoclyFile != null) {
                files.add(redoclyFile);
            }
            
            // Recursively search subdirectories
            for (VirtualFile child : dir.getChildren()) {
                if (child.isDirectory()) {
                    files.addAll(findRedoclyFiles(child));
                }
            }
        }
        
        return files;
    }
}
