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
}
