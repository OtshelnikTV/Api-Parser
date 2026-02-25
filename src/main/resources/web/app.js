class ApiDocApp {
    constructor() {
        this.projects = [];
        this.endpoints = [];
        this.selectedProject = null;
        this.selectedEndpoint = null;
        this.selectedMethod = null;
    }

    async init() {
        await this.loadProjects();
    }

    async loadProjects() {
        console.log('Loading projects...');
        
        try {
            const response = await fetch('/api/projects');
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const text = await response.text();
            console.log('Projects response:', text);
            
            this.projects = JSON.parse(text);
            console.log('Parsed projects:', this.projects);
            
            const projectList = document.getElementById('projectList');
            
            if (this.projects.length === 0) {
                projectList.innerHTML = `
                    <div style="padding: 40px; text-align: center; color: #8b949e;">
                        No redocly.yaml found in project root
                    </div>
                `;
                return;
            }
            
            projectList.innerHTML = '';
            this.projects.forEach(project => {
                const item = document.createElement('div');
                item.className = 'request-item';
                item.innerHTML = `
                    <div class="request-item-name">
                        <strong>${this.escapeHtml(project.name)}</strong><br>
                        <small style="color: #8b949e;">${this.escapeHtml(project.rootPath)}</small>
                    </div>
                `;
                item.onclick = () => this.selectProject(project);
                projectList.appendChild(item);
            });
            
        } catch (error) {
            console.error('Error loading projects:', error);
            document.getElementById('projectList').innerHTML = `
                <div style="padding: 40px; text-align: center; color: #f85149;">
                    Error loading projects: ${this.escapeHtml(error.message)}
                </div>
            `;
        }
    }

    async selectProject(project) {
        this.selectedProject = project;
        document.getElementById('selectedProjectName').textContent = 
            `Project: ${project.name}`;
        
        this.showEndpointSelector();
        await this.loadEndpoints();
    }

    async loadEndpoints() {
        console.log('Loading endpoints for project:', this.selectedProject);
        
        try {
            const url = `/api/endpoints?project=${encodeURIComponent(this.selectedProject.name)}&rootPath=${encodeURIComponent(this.selectedProject.rootPath)}`;
            console.log('Fetching:', url);
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const text = await response.text();
            console.log('Endpoints response:', text);
            
            this.endpoints = JSON.parse(text);
            console.log('Parsed endpoints:', this.endpoints);
            
            this.renderEndpoints();
            
        } catch (error) {
            console.error('Error loading endpoints:', error);
            document.getElementById('endpointList').innerHTML = `
                <div style="padding: 40px; text-align: center; color: #f85149;">
                    Error loading endpoints: ${this.escapeHtml(error.message)}
                </div>
            `;
        }
    }

    renderEndpoints(filter = '') {
        const endpointList = document.getElementById('endpointList');
        
        const filtered = filter 
            ? this.endpoints.filter(ep => 
                ep.apiPath.toLowerCase().includes(filter.toLowerCase()) ||
                ep.filePath.toLowerCase().includes(filter.toLowerCase())
              )
            : this.endpoints;
        
        if (filtered.length === 0) {
            endpointList.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #8b949e;">
                    No endpoints found
                </div>
            `;
            return;
        }
        
        endpointList.innerHTML = '';
        filtered.forEach(endpoint => {
            const item = document.createElement('div');
            item.className = 'request-item';
            
            const methodsHtml = endpoint.methods.map(m => 
                `<span class="method-tag method-tag-${m.toLowerCase()}">${m.toUpperCase()}</span>`
            ).join('');
            
            item.innerHTML = `
                <div class="request-item-name">
                    <strong>${this.escapeHtml(endpoint.apiPath)}</strong>
                </div>
                <div class="request-item-methods">${methodsHtml}</div>
            `;
            item.onclick = () => this.selectEndpoint(endpoint);
            endpointList.appendChild(item);
        });
    }

    selectEndpoint(endpoint) {
        this.selectedEndpoint = endpoint;
        document.getElementById('selectedEndpointPath').textContent = 
            `Endpoint: ${endpoint.apiPath}`;
        
        this.showMethodSelector();
        this.renderMethods();
    }

    renderMethods() {
        const methodList = document.getElementById('methodList');
        methodList.innerHTML = '';
        
        this.selectedEndpoint.methods.forEach(method => {
            const item = document.createElement('div');
            item.className = 'request-item';
            item.innerHTML = `
                <span class="method-badge method-${method.toLowerCase()}">
                    ${method.toUpperCase()}
                </span>
                <div class="request-item-name">
                    <strong>${this.escapeHtml(this.selectedEndpoint.apiPath)}</strong>
                </div>
            `;
            item.onclick = () => this.selectMethod(method);
            methodList.appendChild(item);
        });
    }

    async selectMethod(method) {
        this.selectedMethod = method;
        
        document.getElementById('editorMethod').textContent = method.toUpperCase();
        document.getElementById('editorPath').textContent = this.selectedEndpoint.apiPath;
        document.getElementById('editorFile').textContent = this.selectedEndpoint.filePath;
        
        this.showEditor();
        await this.loadEndpointDetails();
    }

    async loadEndpointDetails() {
        const editorContent = document.getElementById('editorContent');
        
        try {
            editorContent.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #8b949e;">
                    <h3>Loading...</h3>
                </div>
            `;
            
            const response = await fetch(`/api/parse-endpoint?projectRoot=${encodeURIComponent(this.selectedProject.rootPath)}&endpointPath=${encodeURIComponent(this.selectedEndpoint.filePath)}&method=${encodeURIComponent(this.selectedMethod)}`);
            const data = await response.json();
            
            if (data.error) {
                console.error('Error parsing endpoint:', data.error);
                this.renderError(data.error);
                return;
            }
            
            this.renderEditorUI(data);
        } catch (error) {
            console.error('Error loading endpoint details:', error);
            this.renderError(error.message);
        }
    }
    
    renderError(message) {
        const editorContent = document.getElementById('editorContent');
        editorContent.innerHTML = `
            <div style="padding: 40px; text-align: center; color: #f85149;">
                <h3>Ошибка</h3>
                <p style="margin-top: 10px;">${this.escapeHtml(message)}</p>
                <button class="btn-secondary" style="margin-top: 20px;" onclick="app.backToMethods()">Назад</button>
            </div>
        `;
    }
    
    renderEditorUI(data) {
        const editorContent = document.getElementById('editorContent');
        
        let html = `
            <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
                <div></div>
                <button class="btn-secondary" onclick="app.exportMarkdown()">📄 Экспорт Markdown</button>
            </div>
            
            <div style="margin-bottom: 20px; padding: 15px; background: #161b22; border-radius: 6px;">
                <p><strong>Operation ID:</strong> ${this.escapeHtml(data.operationId || 'N/A')}</p>
                <p><strong>Tag:</strong> ${this.escapeHtml(data.tag || 'N/A')}</p>
                <p><strong>Summary:</strong> ${this.escapeHtml(data.summary || 'N/A')}</p>
            </div>
        `;
        
        // Request fields
        if (data.requestFields && data.requestFields.length > 0) {
            html += '<h3>Request Body 📝</h3>';
            html += this.renderFieldsTable(data.requestFields);
        } else {
            html += '<p style="color: #8b949e; margin: 20px 0;">No request body</p>';
        }
        
        // Response fields
        if (data.responseFields && data.responseFields.length > 0) {
            html += '<h3 style="margin-top: 30px;">Response 📦</h3>';
            html += this.renderFieldsTable(data.responseFields);
        } else {
            html += '<p style="color: #8b949e; margin: 20px 0;">No response body defined</p>';
        }
        
        editorContent.innerHTML = html;
    }
    
    renderFieldsTable(fields) {
        let html = `
            <table class="endpoint-table">
                <thead>
                    <tr>
                        <th>Поле</th>
                        <th>Тип</th>
                        <th>Описание</th>
                        <th>Required</th>
                        <th>Пример</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        fields.forEach(field => {
            html += this.renderFieldRow(field);
        });
        
        html += '</tbody></table>';
        return html;
    }
    
    renderFieldRow(field) {
        const indent = '&nbsp;'.repeat(field.depth * 4);
        const fieldName = field.hasChildren ? `${field.name} ▼` : field.name;
        const typeDisplay = field.format ? `${field.type} (${field.format})` : field.type;
        
        let html = `
            <tr>
                <td>${indent}${this.escapeHtml(fieldName)}</td>
                <td><code>${this.escapeHtml(typeDisplay)}</code></td>
                <td>${this.escapeHtml(field.description || '')}</td>
                <td>${field.required ? '<span style="color: #f85149;">✓</span>' : ''}</td>
                <td><code>${this.escapeHtml(field.example || '')}</code></td>
            </tr>
        `;
        
        if (field.hasChildren && field.children) {
            field.children.forEach(child => {
                html += this.renderFieldRow(child);
            });
        }
        
        return html;
    }
    
    exportMarkdown() {
        alert('Markdown export coming soon!');
    }

    // Navigation
    showProjectSelector() {
        this.hideAllScreens();
        document.getElementById('projectSelectorScreen').style.display = 'flex';
    }

    showEndpointSelector() {
        this.hideAllScreens();
        document.getElementById('endpointSelectorScreen').style.display = 'flex';
    }

    showMethodSelector() {
        this.hideAllScreens();
        document.getElementById('methodSelectorScreen').style.display = 'flex';
    }

    showEditor() {
        this.hideAllScreens();
        document.getElementById('editorScreen').style.display = 'block';
        document.getElementById('exportBtn').disabled = false;
    }

    hideAllScreens() {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.style.display = 'none';
        });
    }

    reset() {
        this.selectedProject = null;
        this.selectedEndpoint = null;
        this.selectedMethod = null;
        this.endpoints = [];
        document.getElementById('exportBtn').disabled = true;
        this.showProjectSelector();
    }

    exportMarkdown() {
        alert('Markdown export coming soon!');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize app
const app = new ApiDocApp();

document.addEventListener('DOMContentLoaded', () => {
    app.init();
    
    // Setup search
    document.getElementById('endpointSearch')?.addEventListener('input', (e) => {
        app.renderEndpoints(e.target.value);
    });
});

// Make app globally accessible
window.app = app;
