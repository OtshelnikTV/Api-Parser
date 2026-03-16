/**
 * Модель для хранения спарсенных данных API endpoint
 */
export class ParsedData {
    constructor() {
        this.method = '';
        this.url = '';
        this.tag = '';
        this.operationId = '';
        this.summary = '';
        
        // Request
        this.requestSchemaName = '';
        this.requestFields = [];
        this.requestBodyRequired = false;
        this.parameters = [];
        
        // Response
        this.responseSchemas = [];
        this.responses = {};
        
        // Other
        this.dependencies = [];
        this.algorithm = '';
        this.algorithmFromMd = false;          // true if overridden by existing readme
        this.mermaidDiagram = '';
        this.notes = '';
        this.errorResponses = [];
        this.exampleRequest = '';
        this.exampleRequestFromMd = false;
        this.exampleResponse = '';
        this.exampleResponseFromMd = false;
    }

    /**
     * Сброс данных к дефолтным значениям
     */
    reset() {
        this.method = '';
        this.url = '';
        this.tag = '';
        this.operationId = '';
        this.summary = '';
        this.requestSchemaName = '';
        this.requestFields = [];
        this.requestBodyRequired = false;
        this.parameters = [];
        this.responseSchemas = [];
        this.responses = {};
        this.dependencies = [];
        this.algorithm = '';
        this.algorithmFromMd = false;
        this.mermaidDiagram = '';
        this.notes = '';
        this.errorResponses = [];
        this.exampleRequest = '';
        this.exampleRequestFromMd = false;
        this.exampleResponse = '';
        this.exampleResponseFromMd = false;
    }

    /**
     * Валидация заполненности обязательных полей
     * @returns {number} Количество незаполненных полей
     */
    getUnfilledCount() {
        let count = 0;
        
        // Проверка заполненности источников для Request Body
        const checkFieldsSource = (fields) => {
            for (const f of fields) {
                if (!f.source || f.source.trim() === '') {
                    count++;
                }
                if (f.children && f.children.length > 0) {
                    checkFieldsSource(f.children);
                }
            }
        };
        
        checkFieldsSource(this.requestFields);
        
        if (!this.notes) {
            count++;
        }
        
        return count;
    }

    /**
     * Сохранить пользовательские данные перед обновлением DTO
     * @returns {Object} Объект с пользовательскими данными
     */
    captureUserData() {
        const userData = {
            // Сохраняем основные поля, которые пользователь мог отредактировать
            url: this.url,
            tag: this.tag,
            operationId: this.operationId,
            summary: this.summary,
            
            // Сохраняем source и другие данные для всех полей requestFields
            requestFieldsSources: this.extractFieldsSources(this.requestFields),
            
            // Сохраняем данные для полей ответа
            responseSchemasSources: this.responseSchemas.map(rs => ({
                code: rs.code,
                schemaName: rs.schemaName,
                fieldsSources: this.extractFieldsSources(rs.fields)
            })),
            
            // Сохраняем параметры (на случай если были изменены)
            parameters: JSON.parse(JSON.stringify(this.parameters)),
            
            // Полностью сохраняем пользовательские секции
            dependencies: JSON.parse(JSON.stringify(this.dependencies)),
            errorResponses: JSON.parse(JSON.stringify(this.errorResponses)),
            mermaidDiagram: this.mermaidDiagram,
            notes: this.notes,
            
            // Сохраняем примеры, если они не из MD
            exampleRequest: this.exampleRequestFromMd ? null : this.exampleRequest,
            exampleResponse: this.exampleResponseFromMd ? null : this.exampleResponse,
            
            // Сохраняем алгоритм, если он не из MD
            algorithm: this.algorithmFromMd ? null : this.algorithm
        };
        
        return userData;
    }

    /**
     * Восстановить пользовательские данные после обновления DTO
     * @param {Object} userData - Сохранённые пользовательские данные
     */
    restoreUserData(userData) {
        if (!userData) return;
        
        // Восстанавливаем основные поля (если они не пустые в сохранённых данных)
        if (userData.url) this.url = userData.url;
        if (userData.tag) this.tag = userData.tag;
        if (userData.operationId) this.operationId = userData.operationId;
        if (userData.summary) this.summary = userData.summary;
        
        // Восстанавливаем source и другие данные для полей requestFields
        if (userData.requestFieldsSources) {
            this.restoreFieldsSources(this.requestFields, userData.requestFieldsSources);
        }
        
        // Восстанавливаем данные для полей ответа
        if (userData.responseSchemasSources) {
            for (const savedSchema of userData.responseSchemasSources) {
                // Находим соответствующую схему по коду и имени
                const currentSchema = this.responseSchemas.find(
                    rs => rs.code === savedSchema.code && rs.schemaName === savedSchema.schemaName
                );
                if (currentSchema && savedSchema.fieldsSources) {
                    this.restoreFieldsSources(currentSchema.fields, savedSchema.fieldsSources);
                }
            }
        }
        
        // Восстанавливаем параметры (объединяем с новыми)
        if (userData.parameters && userData.parameters.length > 0) {
            this.mergeParameters(userData.parameters);
        }
        
        // Восстанавливаем пользовательские секции
        if (userData.dependencies) {
            this.dependencies = userData.dependencies;
        }
        
        if (userData.errorResponses) {
            this.errorResponses = userData.errorResponses;
        }
        
        if (userData.mermaidDiagram) {
            this.mermaidDiagram = userData.mermaidDiagram;
        }
        
        if (userData.notes) {
            this.notes = userData.notes;
        }
        
        // Восстанавливаем примеры, если они были пользовательскими
        if (userData.exampleRequest !== null && !this.exampleRequestFromMd) {
            this.exampleRequest = userData.exampleRequest;
        }
        
        if (userData.exampleResponse !== null && !this.exampleResponseFromMd) {
            this.exampleResponse = userData.exampleResponse;
        }
        
        // Восстанавливаем алгоритм, если он был пользовательским
        if (userData.algorithm !== null && !this.algorithmFromMd) {
            this.algorithm = userData.algorithm;
        }
    }

    /**
     * Объединить старые параметры с новыми (сохранить изменения пользователя)
     * @param {Array} oldParams - Старые параметры
     */
    mergeParameters(oldParams) {
        // Создаём мапу старых параметров по имени
        const oldParamsMap = {};
        for (const param of oldParams) {
            const key = `${param.name}_${param.in}`;
            oldParamsMap[key] = param;
        }
        
        // Обновляем текущие параметры данными из старых (если совпадают)
        for (const param of this.parameters) {
            const key = `${param.name}_${param.in}`;
            if (oldParamsMap[key]) {
                const oldParam = oldParamsMap[key];
                // Восстанавливаем пользовательские изменения в описании и примере
                if (oldParam.description && oldParam.description !== param.description) {
                    param.description = oldParam.description;
                }
                if (oldParam.example && oldParam.example !== param.example) {
                    param.example = oldParam.example;
                }
            }
        }
    }

    /**
     * Рекурсивно извлечь source, description и example из всех полей
     * @param {Array} fields - Массив полей
     * @returns {Object} Мапа: путь_поля -> { source, description, example }
     */
    extractFieldsSources(fields, parentPath = '') {
        const sources = {};
        
        for (const field of fields) {
            const fieldPath = parentPath ? `${parentPath}.${field.name}` : field.name;
            
            // Сохраняем все редактируемые данные поля
            sources[fieldPath] = {
                source: field.source || '',
                description: field.description || '',
                example: field.example || ''
            };
            
            // Рекурсивно обрабатываем вложенные поля
            if (field.children && field.children.length > 0) {
                Object.assign(sources, this.extractFieldsSources(field.children, fieldPath));
            }
        }
        
        return sources;
    }

    /**
     * Рекурсивно восстановить source, description и example для полей
     * @param {Array} fields - Массив полей
     * @param {Object} sources - Мапа: путь_поля -> { source, description, example }
     * @param {string} parentPath - Путь к родительскому полю
     */
    restoreFieldsSources(fields, sources, parentPath = '') {
        for (const field of fields) {
            const fieldPath = parentPath ? `${parentPath}.${field.name}` : field.name;
            
            // Восстанавливаем данные, если они были сохранены
            if (sources[fieldPath]) {
                const saved = sources[fieldPath];
                
                // Восстанавливаем source, если он был заполнен
                if (saved.source && saved.source.trim()) {
                    field.source = saved.source;
                }
                
                // Восстанавливаем description, если он был изменён или заполнен
                // (проверяем, что сохранённое описание отличается от текущего или текущее пустое)
                if (saved.description && saved.description.trim() && 
                    (saved.description !== field.description || !field.description)) {
                    field.description = saved.description;
                }
                
                // Восстанавливаем example, если он был изменён или заполнен
                if (saved.example && saved.example.trim() && 
                    (saved.example !== field.example || !field.example)) {
                    field.example = saved.example;
                }
            }
            
            // Рекурсивно обрабатываем вложенные поля
            if (field.children && field.children.length > 0) {
                this.restoreFieldsSources(field.children, sources, fieldPath);
            }
        }
    }
}
