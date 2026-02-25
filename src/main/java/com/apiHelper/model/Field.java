package com.apiHelper.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Represents a field in request/response schema
 */
public class Field {
    private String name;
    private String type;
    private String description;
    private String format;
    private String example;
    private boolean required;
    private boolean isArray;
    private int depth;
    private String refName;
    
    private List<Field> children = new ArrayList<>();
    
    // Editable fields for documentation
    private String editedDescription;
    private String editedExample;
    
    public Field(String name, int depth) {
        this.name = name;
        this.depth = depth;
    }
    
    public String getName() {
        return name;
    }
    
    public void setName(String name) {
        this.name = name;
    }
    
    public String getType() {
        return type;
    }
    
    public void setType(String type) {
        this.type = type;
    }
    
    public String getDescription() {
        return description;
    }
    
    public void setDescription(String description) {
        this.description = description;
    }
    
    public String getFormat() {
        return format;
    }
    
    public void setFormat(String format) {
        this.format = format;
    }
    
    public String getExample() {
        return example;
    }
    
    public void setExample(String example) {
        this.example = example;
    }
    
    public boolean isRequired() {
        return required;
    }
    
    public void setRequired(boolean required) {
        this.required = required;
    }
    
    public boolean isArray() {
        return isArray;
    }
    
    public void setArray(boolean array) {
        isArray = array;
    }
    
    public int getDepth() {
        return depth;
    }
    
    public void setDepth(int depth) {
        this.depth = depth;
    }
    
    public String getRefName() {
        return refName;
    }
    
    public void setRefName(String refName) {
        this.refName = refName;
    }
    
    public List<Field> getChildren() {
        return children;
    }
    
    public void addChild(Field child) {
        this.children.add(child);
    }
    
    public String getEditedDescription() {
        return editedDescription;
    }
    
    public void setEditedDescription(String editedDescription) {
        this.editedDescription = editedDescription;
    }
    
    public String getEditedExample() {
        return editedExample;
    }
    
    public void setEditedExample(String editedExample) {
        this.editedExample = editedExample;
    }
    
    public boolean hasChildren() {
        return !children.isEmpty();
    }
    
    public String getDisplayName() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < depth; i++) {
            sb.append("  ");
        }
        sb.append(name);
        return sb.toString();
    }
    
    public String getDisplayType() {
        if (isArray && type != null) {
            return type + "[]";
        }
        return type != null ? type : "";
    }
}
