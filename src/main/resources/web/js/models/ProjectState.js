/**
 * Состояние проекта - файлы, схемы, endpoints
 */
export class ProjectState {
    constructor() {
        this.availableProjects = []; // Список доступных проектов
        this.selectedProjectName = null; // Имя выбранного проекта
        this.projectRoot = '';
        this.pathsFolders = {}; // endpoint name -> { methods, apiPath, ... }
        this.selectedRequest = null;
        this.selectedMethod = null;
        this.schemaCache = {}; // Кэш уже спарсенных схем
    }

    /**
     * Сброс состояния
     */
    reset() {
        this.projectRoot = '';
        this.pathsFolders = {};
        this.selectedRequest = null;
        this.selectedMethod = null;
        this.schemaCache = {};
    }

    /**
     * Проверка готовности проекта
     */
    isProjectReady() {
        return this.projectRoot && Object.keys(this.pathsFolders).length > 0;
    }

    /**
     * Получить folder info для выбранного запроса
     */
    getSelectedRequestFolder() {
        if (!this.selectedRequest) return null;
        return this.pathsFolders[this.selectedRequest];
    }

    /**
     * Получить список всех endpoints с методами
     */
    getEndpointsList() {
        return Object.entries(this.pathsFolders)
            .map(([name, data]) => ({
                name,
                methods: data.methods || [],
                apiPath: data.apiPath || ''
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }
}
