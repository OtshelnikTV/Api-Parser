import { ProjectState } from './models/ProjectState.js';
import { ParsedData } from './models/ParsedData.js';
import { FileService } from './services/FileService.js';
import { YamlParserService } from './services/YamlParserService.js';
import { EndpointParserService } from './services/EndpointParserService.js';
import { MarkdownGeneratorService } from './services/MarkdownGeneratorService.js';
import { ProjectSelectorUI } from './ui/ProjectSelectorUI.js';
import { RequestSelectorUI } from './ui/RequestSelectorUI.js';
import { MethodSelectorUI } from './ui/MethodSelectorUI.js';
import { EditorUI } from './ui/EditorUI.js';
import { DOMHelpers } from './utils/DOMHelpers.js';
import { ConfirmDialog } from './utils/ConfirmDialog.js';
import { LoadingOverlay } from './utils/LoadingOverlay.js';
import { NotificationService } from './utils/NotificationService.js';
import { HistoryManager } from './utils/HistoryManager.js';
import themeSwitcher from './utils/ThemeSwitcher.js';

/**
 * Главный класс приложения - координирует работу всех компонентов
 */
export class App {
    constructor() {
        // Модели
        this.projectState = new ProjectState();
        this.parsedData = new ParsedData();

        // История для undo/redo
        this.historyManager = new HistoryManager();
        this.saveStateTimeout = null;

        // Сервисы
        this.fileService = new FileService();
        this.yamlParserService = new YamlParserService(this.fileService);
        this.endpointParserService = new EndpointParserService(this.fileService, this.yamlParserService);
        this.markdownGenerator = new MarkdownGeneratorService();

        // UI компоненты
        this.projectSelectorUI = new ProjectSelectorUI(
            this.fileService,
            this.projectState,
            () => this.showRequestSelector()
        );

        this.requestSelectorUI = new RequestSelectorUI(
            this.projectState,
            () => this.showProjectSelector(),
            () => this.showMethodSelector()
        );

        this.methodSelectorUI = new MethodSelectorUI(
            this.projectState,
            () => this.showRequestSelector(),
            () => this.startParsing()
        );

        this.editorUI = new EditorUI(
            this.parsedData,
            this.markdownGenerator,
            () => this.showRequestSelector(),
            () => this.showProjectSelector()
        );

        this.setupGlobalEventHandlers();
    }

    /**
     * Инициализация приложения
     */
    init() {
        this.showProjectSelector();
    }

    /**
     * Навигация между экранами
     */
    showProjectSelector() {
        this.projectSelectorUI.show();
        // Очищаем историю при смене проекта
        this.historyManager.clear();
    }

    showRequestSelector() {
        this.requestSelectorUI.show();
        // Очищаем историю при смене запроса
        this.historyManager.clear();
    }

    showMethodSelector() {
        this.methodSelectorUI.show();
    }

    showEditor() {
        this.editorUI.show();
        // Инициализируем состояние кнопок
        this.updateHistoryButtons();
    }

    /**
     * Запустить парсинг endpoint
     */
    async startParsing() {
        if (!this.projectState.selectedRequest) return;

        LoadingOverlay.show('Парсинг YAML...');

        // Небольшая задержка для показа индикатора
        setTimeout(async () => {
            try {
                await this.endpointParserService.parseEndpoint(this.projectState, this.parsedData);
                
                LoadingOverlay.hide();
                
                // Очищаем историю и сохраняем начальное состояние
                this.historyManager.clear();
                this.historyManager.push(this.parsedData);
                
                this.showEditor();
                
                NotificationService.success(
                    `${this.parsedData.method} ${this.parsedData.url} — спарсено`
                );
            } catch (error) {
                console.error(error);
                NotificationService.error('Ошибка: ' + error.message);
                LoadingOverlay.hide();
            }
        }, 50);
    }

    /**
     * Сохранить текущее состояние в историю (с debounce)
     */
    saveState() {
        // Отменяем предыдущий таймер
        if (this.saveStateTimeout) {
            clearTimeout(this.saveStateTimeout);
        }

        // Сохраняем с задержкой 500мс
        this.saveStateTimeout = setTimeout(() => {
            this.historyManager.push(this.parsedData);
            this.updateHistoryButtons();
        }, 500);
    }

    /**
     * Сохранить состояние немедленно (без debounce)
     */
    saveStateImmediately() {
        if (this.saveStateTimeout) {
            clearTimeout(this.saveStateTimeout);
        }
        this.historyManager.push(this.parsedData);
        this.updateHistoryButtons();
    }

    /**
     * Отменить последнее изменение
     */
    undo() {
        const state = this.historyManager.undo();
        if (state) {
            this.restoreState(state);
        }
    }

    /**
     * Повторить отмененное изменение
     */
    redo() {
        const state = this.historyManager.redo();
        if (state) {
            this.restoreState(state);
        }
    }

    /**
     * Восстановить состояние из истории
     */
    restoreState(state) {
        // Копируем все свойства из сохраненного состояния
        Object.keys(state).forEach(key => {
            this.parsedData[key] = state[key];
        });

        // Перерисовываем UI
        this.editorUI.render();
        this.updateHistoryButtons();
    }

    /**
     * Обновить состояние кнопок undo/redo
     */
    updateHistoryButtons() {
        const undoBtn = document.getElementById('btn-undo');
        const redoBtn = document.getElementById('btn-redo');

        if (undoBtn) {
            undoBtn.disabled = !this.historyManager.canUndo();
        }
        if (redoBtn) {
            redoBtn.disabled = !this.historyManager.canRedo();
        }
    }

    /**
     * Установка глобальных обработчиков событий
     */
    setupGlobalEventHandlers() {
        // Theme Toggle
        const themeToggleBtn = document.getElementById('theme-toggle');
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', () => {
                themeSwitcher.toggle();
            });
        }

        // Горячие клавиши для Undo/Redo
        document.addEventListener('keydown', (e) => {
            // Ctrl+Z - Undo
            if (e.ctrlKey && e.key.toLowerCase() === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.undo();
            }
            // Ctrl+Y или Ctrl+Shift+Z - Redo
            else if ((e.ctrlKey && e.key.toLowerCase() === 'y') || 
                     (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z')) {
                e.preventDefault();
                this.redo();
            }
        });

        // Data binding для всех input/textarea с data-bind
        document.addEventListener('change', (e) => {
            const target = e.target;
            if (target.matches('[data-bind]')) {
                this.handleDataBinding(target);
                // Сохраняем состояние при изменении
                this.saveState();
            }
            DOMHelpers.updateCellFilled(e.target);
        });

        document.addEventListener('input', (e) => {
            DOMHelpers.updateCellFilled(e.target);
        });

        // Обработка кнопок действий
        document.addEventListener('click', (e) => {
            const target = e.target;
            
            // Кнопки Undo/Redo
            if (target.id === 'btn-undo' || target.closest('#btn-undo')) {
                e.preventDefault();
                this.undo();
                return;
            } else if (target.id === 'btn-redo' || target.closest('#btn-redo')) {
                e.preventDefault();
                this.redo();
                return;
            }
            
            // Кнопки с data-action
            if (target.matches('[data-action]')) {
                e.preventDefault();
                this.handleAction(target.dataset.action, target);
            }

            // Кнопки в редакторе
            if (target.id === 'btn-editor-back-to-requests') {
                e.preventDefault();
                this.showRequestSelector();
            } else if (target.id === 'btn-editor-back-to-project') {
                e.preventDefault();
                this.showProjectSelector();
            }

            // Предпросмотр и генерация
            if (target.id === 'btn-preview-markdown') {
                e.preventDefault();
                this.previewMarkdown();
            } else if (target.id === 'btn-generate-save') {
                e.preventDefault();
                this.generateAndSave();
            }

            // Модальное окно предпросмотра
            if (target.id === 'btn-preview-save') {
                e.preventDefault();
                this.generateAndSave();
            } else if (target.id === 'btn-close-preview') {
                e.preventDefault();
                this.closePreview();
            }
        });
    }

    /**
     * Обработка data-binding
     */
    handleDataBinding(element) {
        const path = element.dataset.bind;
        const value = element.value;

        // Простой парсинг пути (поддержка вложенности)
        // Например: parsedData.url, parsedData.requestFields[0].source
        try {
            const pathParts = path.split('.');
            if (pathParts[0] === 'parsedData') {
                pathParts.shift(); // Убираем 'parsedData'
                
                let obj = this.parsedData;
                for (let i = 0; i < pathParts.length - 1; i++) {
                    const part = pathParts[i];
                    // Обработка массивов и вложенных полей: requestFields[0], children[1]
                    const match = part.match(/(\w+)\[(\d+)\]/);
                    if (match) {
                        obj = obj[match[1]][parseInt(match[2])];
                    } else {
                        obj = obj[part];
                    }
                }
                
                // Установить значение
                const lastPart = pathParts[pathParts.length - 1];
                const match = lastPart.match(/(\w+)\[(\d+)\]/);
                if (match) {
                    obj[match[1]][parseInt(match[2])] = value;
                } else {
                    obj[lastPart] = value;
                }

                // Обновить счётчик незаполненных
                if (path.includes('requestFields') && path.includes('.source') || path.includes('algorithm') || path.includes('notes')) {
                    this.editorUI.updateUnfilledCount();
                }

                // Обновить название зависимости
                if (path.includes('dependencies') && path.includes('.name')) {
                    const indexMatch = path.match(/dependencies\[(\d+)\]/);
                    if (indexMatch) {
                        const index = parseInt(indexMatch[1]);
                        const titleEl = document.querySelector(`#dep-${index} .dep-card-title`);
                        if (titleEl) {
                            titleEl.textContent = value || `Зависимость #${index + 1}`;
                        }
                    }
                }

                // Обновить тип зависимости и перерендерить
                if (path.includes('dependencies') && path.includes('.type')) {
                    this.editorUI.render();
                }
            }
        } catch (error) {
            console.error('Error in data binding:', error);
        }
    }

    /**
     * Обработка действий (кнопки)
     */
    handleAction(action, element) {
        switch (action) {
            case 'addErrorResp':
                this.parsedData.errorResponses.push({ code: '', description: '' });
                this.editorUI.render();
                this.editorUI.updateUnfilledCount();
                this.saveStateImmediately();
                break;

            case 'removeErrorResp':
                const errorIndex = parseInt(element.dataset.index);
                this.parsedData.errorResponses.splice(errorIndex, 1);
                this.editorUI.render();
                this.editorUI.updateUnfilledCount();
                this.saveStateImmediately();
                break;

            case 'addDep': {
                this.parsedData.dependencies.push({
                    type: 'external',     // по умолчанию "Внешний запрос"
                    name: '',
                    description: '',
                    method: 'GET',
                    url: '',
                    when: '',
                    logic: '',            // для "Вычисляемое значение"
                    inputParams: [],      // ← сразу массив, не строка
                    outputFields: []       // ← сразу массив, не строка
                });
                this.editorUI.render();
                this.editorUI.updateUnfilledCount();
                this.saveStateImmediately();
                break;
            }

            case 'removeDep': {
                const depIndex = parseInt(element.dataset.index);
                this.parsedData.dependencies.splice(depIndex, 1);
                this.editorUI.render();
                this.editorUI.updateUnfilledCount();
                this.saveStateImmediately();
                break;
            }

            case 'addInputParam': {
                const depIndex = parseInt(element.dataset.depIndex);
                const dep = this.parsedData.dependencies[depIndex];
                if (dep) {
                    if (!Array.isArray(dep.inputParams)) {
                        dep.inputParams = typeof dep.inputParams === 'string'
                            ? dep.inputParams.split('\n').filter(l => l.trim()).map(l => {
                                const parts = l.split('|').map(s => s.trim());
                                return { param: parts[0] || '', source: parts[1] || '', transform: parts[2] || '' };
                            })
                            : [];
                    }
                    dep.inputParams.push({ param: '', source: '', transform: '' });
                    this.editorUI.render();
                    this.editorUI.updateUnfilledCount();
                    this.saveStateImmediately();
                }
                break;
            }

            case 'insertInputParam': {
                const depIndex = parseInt(element.dataset.depIndex);
                const paramIndex = parseInt(element.dataset.paramIndex);
                const dep = this.parsedData.dependencies[depIndex];
                if (dep && Array.isArray(dep.inputParams)) {
                    dep.inputParams.splice(paramIndex + 1, 0, { param: '', source: '', transform: '' });
                    this.editorUI.render();
                    this.editorUI.updateUnfilledCount();
                    this.saveStateImmediately();
                }
                break;
            }

            case 'removeInputParam': {
                const depIndex = parseInt(element.dataset.depIndex);
                const paramIndex = parseInt(element.dataset.paramIndex);
                const dep = this.parsedData.dependencies[depIndex];
                if (dep && Array.isArray(dep.inputParams)) {
                    dep.inputParams.splice(paramIndex, 1);
                    this.editorUI.render();
                    this.editorUI.updateUnfilledCount();
                    this.saveStateImmediately();
                }
                break;
            }

            case 'addOutputField': {
                const depIndex = parseInt(element.dataset.depIndex);
                const dep = this.parsedData.dependencies[depIndex];
                if (dep) {
                    if (!Array.isArray(dep.outputFields)) {
                        dep.outputFields = typeof dep.outputFields === 'string'
                            ? dep.outputFields.split('\n').filter(l => l.trim()).map(l => {
                                const parts = l.split('|').map(s => s.trim());
                                return { field: parts[0] || '', usedIn: parts[1] || '', transform: parts[2] || '' };
                            })
                            : [];
                    }
                    dep.outputFields.push({ field: '', usedIn: '', transform: '' });
                    this.editorUI.render();
                    this.editorUI.updateUnfilledCount();
                    this.saveStateImmediately();
                }
                break;
            }

            case 'insertOutputField': {
                const depIndex = parseInt(element.dataset.depIndex);
                const fieldIndex = parseInt(element.dataset.fieldIndex);
                const dep = this.parsedData.dependencies[depIndex];
                if (dep && Array.isArray(dep.outputFields)) {
                    dep.outputFields.splice(fieldIndex + 1, 0, { field: '', usedIn: '', transform: '' });
                    this.editorUI.render();
                    this.editorUI.updateUnfilledCount();
                    this.saveStateImmediately();
                }
                break;
            }

            case 'removeOutputField': {
                const depIndex = parseInt(element.dataset.depIndex);
                const fieldIndex = parseInt(element.dataset.fieldIndex);
                const dep = this.parsedData.dependencies[depIndex];
                if (dep && Array.isArray(dep.outputFields)) {
                    dep.outputFields.splice(fieldIndex, 1);
                    this.editorUI.render();
                    this.editorUI.updateUnfilledCount();
                    this.saveStateImmediately();
                }
                break;
            }
        }
    }

    /**
     * Предпросмотр Markdown
     */
    previewMarkdown() {
        const markdown = this.markdownGenerator.generate(this.parsedData);
        document.getElementById('preview-content').textContent = markdown;
        DOMHelpers.show('preview-modal');
    }

    /**
     * Закрыть предпросмотр
     */
    closePreview() {
        DOMHelpers.hide('preview-modal');
    }

    /**
     * Сгенерировать и сохранить Markdown
     */
    async generateAndSave() {
        const markdown = this.markdownGenerator.generate(this.parsedData);

        // if working with local files, fall back to simple download
        if (this.fileService.hasLocalFiles()) {
            const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const fileName = this.parsedData.method.toUpperCase() + '_' + this.projectState.selectedRequest + '.md';
            a.download = fileName;
            a.style.display = 'none';
            document.body.appendChild(a);
            setTimeout(() => {
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 1000);
            }, 100);
            NotificationService.success(fileName + ' сохранён!');
            this.closePreview();
            return;
        }

        // proxy mode: compute target folder and file name relative to project root
        const folder = this.projectState.getSelectedRequestFolder();
        if (!folder) {
            NotificationService.error('Не выбрана папка для сохранения');
            return;
        }
        const yamlName = this.projectState.selectedRequest;
        const method = this.parsedData.method.toUpperCase();
        // determine folder path (matches logic in EndpointParserService)
        let relFolder;
        if (folder.flat) {
            relFolder = folder.folderPath || ('paths/' + yamlName);
        } else {
            relFolder = 'paths/' + yamlName;
        }
        const fileName = `${method}_${yamlName}.md`;
        const relPath = relFolder + '/' + fileName;

        // prepend projectRoot if defined (frontend keeps it relative)
        const prefix = this.projectState.projectRoot ? this.projectState.projectRoot + '/' : '';
        const serverPath = prefix + relPath;

        // if markdown already exists, ask before overwrite
        const fileExists = await this.fileService.fileExists(serverPath);
        if (fileExists) {
            const yes = await ConfirmDialog.show(`Файл ${fileName} уже существует. Перезаписать?`);
            if (!yes) return;
        }

        try {
            await this.fileService.saveMarkdown(serverPath, markdown);
            NotificationService.success(fileName + ' сохранён!');
        } catch (err) {
            console.error('save error', err);
            NotificationService.error('Ошибка сохранения: ' + err.message);
        }
        this.closePreview();
    }
}

// Запуск приложения при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
