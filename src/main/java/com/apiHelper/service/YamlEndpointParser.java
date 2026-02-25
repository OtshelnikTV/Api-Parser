package com.apiHelper.service;

import com.apiHelper.model.Field;
import com.apiHelper.model.ParsedEndpoint;
import com.intellij.openapi.diagnostic.Logger;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.project.ProjectUtil;
import com.intellij.openapi.vfs.VirtualFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Service to parse YAML endpoint files and extract request/response schemas
 */
public class YamlEndpointParser {
    private static final Logger LOG = Logger.getInstance(YamlEndpointParser.class);
    private static final Pattern REF_PATTERN = Pattern.compile("\\$ref:\\s*['\"]?([^'\"\\s]+)['\"]?");
    
    private final Project project;
    
    public YamlEndpointParser(Project project) {
        this.project = project;
    }
    
    /**
     * Parse endpoint file and return structured data
     * @param projectRoot - path to openapi.yaml file (e.g., "ffl-main/openapi.yaml")
     * @param endpointPath - relative path from openapi.yaml to endpoint file
     * @param method - HTTP method to parse
     */
    public ParsedEndpoint parseEndpoint(String projectRoot, String endpointPath, String method) throws IOException {
        VirtualFile baseDir = ProjectUtil.guessProjectDir(project);
        if (baseDir == null) {
            throw new IOException("Project directory not found");
        }
        
        LOG.info("Parsing endpoint: projectRoot=" + projectRoot + ", endpointPath=" + endpointPath + ", method=" + method);
        LOG.info("Base directory: " + baseDir.getPath());
        
        // projectRoot is path to openapi.yaml, we need the parent directory
        VirtualFile openapiFile = baseDir.findFileByRelativePath(projectRoot);
        if (openapiFile == null) {
            throw new IOException("OpenAPI file not found: " + projectRoot);
        }
        
        VirtualFile apiRootDir = openapiFile.getParent();
        if (apiRootDir == null) {
            throw new IOException("Cannot get parent directory of openapi.yaml");
        }
        
        // Clean up endpointPath (remove ./ prefix if present)
        String cleanPath = endpointPath.startsWith("./") ? endpointPath.substring(2) : endpointPath;
        
        // Find endpoint file relative to openapi.yaml parent
        VirtualFile endpointFile = apiRootDir.findFileByRelativePath(cleanPath);
        if (endpointFile == null) {
            String fullPath = apiRootDir.getPath() + "/" + cleanPath;
            LOG.error("Endpoint file not found: " + cleanPath + " (full path: " + fullPath + ")");
            throw new IOException("Endpoint file not found: " + cleanPath + " (full path: " + fullPath + ")");
        }
        
        LOG.info("Found endpoint file: " + endpointFile.getPath());
        
        String content = new String(endpointFile.contentsToByteArray(), endpointFile.getCharset());
        
        ParsedEndpoint result = new ParsedEndpoint();
        result.setMethod(method.toUpperCase());
        
        // Extract method section
        String methodSection = extractMethodSection(content, method);
        if (methodSection == null) {
            throw new IOException("Method " + method + " not found in file");
        }
        
        // Parse metadata
        parseMetadata(methodSection, result);
        
        // Parse request body
        parseRequestBody(methodSection, endpointFile.getParent(), result);
        
        // Parse responses
        parseResponses(methodSection, endpointFile.getParent(), result);
        
        LOG.info("Parsed endpoint: " + method + " with " + result.getRequestFields().size() + " request fields");
        
        return result;
    }
    
    private String extractMethodSection(String content, String method) {
        Pattern pattern = Pattern.compile("^" + method + ":\\s*$", Pattern.MULTILINE);
        Matcher matcher = pattern.matcher(content);
        
        if (!matcher.find()) {
            return null;
        }
        
        int start = matcher.start();
        String after = content.substring(start);
        String[] lines = after.split("\n");
        
        if (lines.length == 0) return null;
        
        // Get base indentation
        int baseIndent = lines[0].length() - lines[0].trim().length();
        
        StringBuilder section = new StringBuilder();
        section.append(lines[0]).append("\n");
        
        for (int i = 1; i < lines.length; i++) {
            String line = lines[i];
            if (line.trim().isEmpty() || line.trim().startsWith("#")) {
                section.append(line).append("\n");
                continue;
            }
            
            int indent = line.length() - line.trim().length();
            if (indent <= baseIndent && !line.trim().isEmpty()) {
                break; // Next section
            }
            
            section.append(line).append("\n");
        }
        
        return section.toString();
    }
    
    private void parseMetadata(String methodSection, ParsedEndpoint result) {
        // Tags
        Matcher tagMatch = Pattern.compile("tags:\\s*\\n\\s*-\\s*(.+)").matcher(methodSection);
        if (tagMatch.find()) {
            result.setTag(tagMatch.group(1).trim());
        }
        
        // Summary
        Matcher summaryMatch = Pattern.compile("summary:\\s*(.+)").matcher(methodSection);
        if (summaryMatch.find()) {
            result.setSummary(summaryMatch.group(1).trim());
        }
        
        // OperationId
        Matcher opMatch = Pattern.compile("operationId:\\s*(.+)").matcher(methodSection);
        if (opMatch.find()) {
            result.setOperationId(opMatch.group(1).trim());
        }
    }
    
    private void parseRequestBody(String methodSection, VirtualFile baseDir, ParsedEndpoint result) {
        LOG.info("Parsing request body for method section");
        // Find requestBody section
        int reqBodyIdx = methodSection.indexOf("requestBody:");
        if (reqBodyIdx == -1) {
            LOG.info("No requestBody section found");
            return;
        }
        
        String afterReqBody = methodSection.substring(reqBodyIdx);
        LOG.info("Found requestBody section: " + afterReqBody.substring(0, Math.min(100, afterReqBody.length())));
        
        // Find schema $ref
        Matcher refMatcher = REF_PATTERN.matcher(afterReqBody);
        if (refMatcher.find()) {
            String refPath = refMatcher.group(1);
            LOG.info("Found request schema ref: " + refPath);
            
            // Parse schema
            List<Field> fields = parseSchemaFromRef(refPath, baseDir, 0, new HashSet<>());
            result.setRequestFields(fields);
            LOG.info("Parsed " + fields.size() + " request fields");
        } else {
            LOG.info("No $ref found in requestBody");
        }
    }
    
    private void parseResponses(String methodSection, VirtualFile baseDir, ParsedEndpoint result) {
        // Find responses section
        int responsesIdx = methodSection.indexOf("responses:");
        if (responsesIdx == -1) {
            return;
        }
        
        String afterResponses = methodSection.substring(responsesIdx);
        
        // Find first success response (200, 201, etc.)
        Matcher refMatcher = REF_PATTERN.matcher(afterResponses);
        if (refMatcher.find()) {
            String refPath = refMatcher.group(1);
            LOG.info("Found response schema ref: " + refPath);
            
            // Parse schema
            List<Field> fields = parseSchemaFromRef(refPath, baseDir, 0, new HashSet<>());
            result.setResponseFields(fields);
        }
    }
    
    private List<Field> parseSchemaFromRef(String refPath, VirtualFile baseDir, int depth, Set<String> visited) {
        LOG.info("=== parseSchemaFromRef called with refPath: " + refPath + ", baseDir: " + baseDir.getPath() + " ===");
        List<Field> fields = new ArrayList<>();
        
        if (depth > 10 || visited.contains(refPath)) {
            LOG.warn("Max depth or circular reference detected: " + refPath);
            return fields;
        }
        
        visited.add(refPath);
        
        LOG.info("Resolving schema ref: " + refPath + " from baseDir: " + baseDir.getPath());
        
        // Resolve ref path (e.g., ../schemas/ClientDto.yaml or ../../components/schemas/ClientDto.yaml)
        VirtualFile schemaFile = baseDir.findFileByRelativePath(refPath);
        LOG.info("Looking for schema file: " + refPath + " -> " + (schemaFile != null ? schemaFile.getPath() : "NOT FOUND"));
        if (schemaFile == null) {
            LOG.warn("Schema file not found: " + refPath + " (baseDir: " + baseDir.getPath() + ")");
            return fields;
        }
        
        try {
            String content = new String(schemaFile.contentsToByteArray(), schemaFile.getCharset());
            fields = parseSchemaContent(content, schemaFile.getParent(), depth, visited);
        } catch (IOException e) {
            LOG.error("Error reading schema file: " + refPath, e);
        }
        
        return fields;
    }

    private List<Field> parseSchemaContent(String content, VirtualFile baseDir, int depth, Set<String> visited) {
        List<Field> fields = new ArrayList<>();

        LOG.info("Parsing schema content, length: " + content.length());

        // Find properties section
        int propsIdx = content.indexOf("properties:");
        if (propsIdx == -1) {
            LOG.warn("No 'properties:' section found in schema");
            return fields;
        }

        // Determine indentation of "properties:" itself
        String beforeProps = content.substring(0, propsIdx);
        int lastNewline = beforeProps.lastIndexOf('\n');
        int propsIndent = propsIdx - lastNewline - 1; // indentation of "properties:"

        // Property names are at propsIndent + 2
        int propNameIndent = propsIndent + 2;
        // Property attributes are at propsIndent + 4
        int propAttrIndent = propsIndent + 4;

        LOG.info("properties: indent=" + propsIndent + ", propName indent=" + propNameIndent + ", attr indent=" + propAttrIndent);

        String afterProps = content.substring(propsIdx);
        String[] lines = afterProps.split("\n");

        // Parse required fields
        Set<String> requiredFields = new HashSet<>();
        Matcher reqMatcher = Pattern.compile("required:\\s*\\n((?:\\s*-\\s*\\S+\\n?)*)").matcher(content);
        if (reqMatcher.find()) {
            String reqSection = reqMatcher.group(1);
            Matcher fieldMatcher = Pattern.compile("-\\s+(\\S+)").matcher(reqSection);
            while (fieldMatcher.find()) {
                requiredFields.add(fieldMatcher.group(1));
            }
        }
        LOG.info("Required fields: " + requiredFields);

        // Parse properties
        Field currentField = null;

        for (int i = 1; i < lines.length; i++) {
            String line = lines[i];
            String trimmed = line.trim();

            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                continue;
            }

            // Calculate actual indentation
            int lineIndent = line.length() - line.stripLeading().length();

            // If we hit something at same or lower indent as "properties:", we're done
            if (lineIndent <= propsIndent && !trimmed.isEmpty()) {
                break;
            }

            // Property name: exactly at propNameIndent level, has format "name:" or "name: ..."
            if (lineIndent == propNameIndent && trimmed.matches("\\w+:.*")) {
                // Save previous field
                if (currentField != null) {
                    fields.add(currentField);
                }

                String propName = trimmed.substring(0, trimmed.indexOf(":")).trim();
                currentField = new Field(propName, depth);
                currentField.setRequired(requiredFields.contains(propName));
                LOG.info("Found property: " + propName + " at indent " + lineIndent);
            }
            // Property attributes: at propAttrIndent level
            else if (currentField != null && lineIndent >= propAttrIndent) {
                if (trimmed.startsWith("type:")) {
                    String type = trimmed.substring(5).trim();
                    currentField.setType(type);
                } else if (trimmed.startsWith("description:")) {
                    String desc = trimmed.substring(12).trim();
                    if ((desc.startsWith("'") && desc.endsWith("'")) ||
                            (desc.startsWith("\"") && desc.endsWith("\""))) {
                        desc = desc.substring(1, desc.length() - 1);
                    }
                    currentField.setDescription(desc);
                } else if (trimmed.startsWith("format:")) {
                    String format = trimmed.substring(7).trim();
                    currentField.setFormat(format);
                } else if (trimmed.startsWith("example:")) {
                    String example = trimmed.substring(8).trim();
                    currentField.setExample(example);
                } else if (trimmed.startsWith("$ref:")) {
                    Matcher refMatcher2 = REF_PATTERN.matcher(trimmed);
                    if (refMatcher2.find()) {
                        String refPath = refMatcher2.group(1);
                        List<Field> nestedFields = parseSchemaFromRef(refPath, baseDir, depth + 1, new HashSet<>(visited));
                        for (Field nested : nestedFields) {
                            nested.setDepth(depth + 1);
                            currentField.addChild(nested);
                        }
                    }
                }
            }
        }

        // Add last field
        if (currentField != null) {
            fields.add(currentField);
        }

        LOG.info("Parsed " + fields.size() + " fields from schema");
        return fields;
    }
}
