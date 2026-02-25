package com.apiHelper.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Fully parsed endpoint data
 */
public class ParsedEndpoint {
    private String method;
    private String url;
    private String operationId;
    private String tag;
    private String summary;
    private boolean requestBodyRequired;
    
    private List<Field> requestFields = new ArrayList<>();
    private List<Field> responseFields = new ArrayList<>();
    private List<Field> parameters = new ArrayList<>();
    
    private String algorithm;
    private String notes;
    private String requestSchemaName;
    
    public String getMethod() {
        return method;
    }
    
    public void setMethod(String method) {
        this.method = method;
    }
    
    public String getUrl() {
        return url;
    }
    
    public void setUrl(String url) {
        this.url = url;
    }
    
    public String getOperationId() {
        return operationId;
    }
    
    public void setOperationId(String operationId) {
        this.operationId = operationId;
    }
    
    public String getTag() {
        return tag;
    }
    
    public void setTag(String tag) {
        this.tag = tag;
    }
    
    public String getSummary() {
        return summary;
    }
    
    public void setSummary(String summary) {
        this.summary = summary;
    }
    
    public boolean isRequestBodyRequired() {
        return requestBodyRequired;
    }
    
    public void setRequestBodyRequired(boolean requestBodyRequired) {
        this.requestBodyRequired = requestBodyRequired;
    }
    
    public List<Field> getRequestFields() {
        return requestFields;
    }
    
    public void setRequestFields(List<Field> requestFields) {
        this.requestFields = requestFields;
    }
    
    public List<Field> getResponseFields() {
        return responseFields;
    }
    
    public void setResponseFields(List<Field> responseFields) {
        this.responseFields = responseFields;
    }
    
    public List<Field> getParameters() {
        return parameters;
    }
    
    public void setParameters(List<Field> parameters) {
        this.parameters = parameters;
    }
    
    public String getAlgorithm() {
        return algorithm;
    }
    
    public void setAlgorithm(String algorithm) {
        this.algorithm = algorithm;
    }
    
    public String getNotes() {
        return notes;
    }
    
    public void setNotes(String notes) {
        this.notes = notes;
    }
    
    public String getRequestSchemaName() {
        return requestSchemaName;
    }
    
    public void setRequestSchemaName(String requestSchemaName) {
        this.requestSchemaName = requestSchemaName;
    }
}
