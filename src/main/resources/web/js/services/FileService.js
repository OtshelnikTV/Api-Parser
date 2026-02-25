import { Field } from '../models/Field.js';

/**
 * Сервис для работы с файлами через API сервера
 */
export class FileService {
    constructor() {
        this.httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
    }

    /**
     * Обнаружить все проекты через API
     */
    async discoverProjects() {
        try {
            const response = await fetch('/api/projects');
            if (!response.ok) {
                throw new Error('Failed to fetch projects');
            }
            const projects = await response.json();
            return projects.map(p => ({
                name: p.name,
                rootPath: p.rootPath,
                fileCount: p.fileCount || 0
            }));
        } catch (error) {
            console.error('Error discovering projects:', error);
            return [];
        }
    }

    /**
     * Получить endpoints для проекта
     */
    async getProjectEndpoints(projectName, rootPath) {
        try {
            const response = await fetch(`/api/endpoints?project=${encodeURIComponent(projectName)}&rootPath=${encodeURIComponent(rootPath)}`);
            if (!response.ok) {
                throw new Error('Failed to fetch endpoints');
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching endpoints:', error);
            return [];
        }
    }

    /**
     * Прочитать файл (через API, если нужно)
     */
    async readFile(file) {
        // Для IntelliJ виджета файлы читаются на сервере
        // Этот метод может быть не нужен, если парсинг происходит на сервере
        return '';
    }

    /**
     * Извлечь метод из полного содержимого файла
     */
    extractTopLevelMethod(fullContent, method) {
        // Логика извлечения метода из YAML
        // Это может быть упрощено, так как парсинг происходит на сервере
        return fullContent;
    }

        return Array.from(projectMap.values());
    }

    /**
     * Прочитать файл как текст
     */
    async readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    /**
     * Индексировать конкретный проект через API
     */
    async indexProject(project, projectState) {
        projectState.reset();

        // Получить список эндпоинтов через API
        const endpoints = await this.getProjectEndpoints(project.name, project.rootPath);

        if (endpoints.length === 0) {
            throw new Error('Эндпоинты не найдены для проекта ' + project.name);
        }

        projectState.projectRoot = project.rootPath;

        // Обработать эндпоинты
        const result = {
            endpointsCount: 0,
            schemasCount: 0
        };

        for (const endpoint of endpoints) {
            const endpointInfo = {
                apiPath: endpoint.apiPath,
                filePath: endpoint.filePath,
                methods: endpoint.methods || []
            };

            projectState.endpoints.push(endpointInfo);
            result.endpointsCount++;
        }

        // Для совместимости с существующим кодом
        result.schemasCount = 0; // Пока не получаем схемы через API

        return result;
    }

    /**
     * Парсить секцию paths из openapi.yaml
     */
    parsePathsFromOpenapi(content) {
        const result = {};
        const lines = content.split('\n');
        let inPaths = false;
        let pathsIndent = -1;
        let currentPath = null;

        for (const line of lines) {
            const trimmed = line.trimStart();
            const indent = line.length - trimmed.length;

            if (/^paths\s*:/.test(trimmed)) {
                inPaths = true;
                pathsIndent = indent;
                currentPath = null;
                continue;
            }

            if (!inPaths) continue;

            if (indent <= pathsIndent && trimmed.length > 0 && !trimmed.startsWith('#')) {
                break;
            }

            const pathMatch = trimmed.match(/^(\/[^\s:]+)\s*:/);
            if (pathMatch) {
                currentPath = pathMatch[1];
                const inlineRef = trimmed.match(/\$ref:\s*['"]?([^\s'"#]+)['"]?/);
                if (inlineRef) {
                    result[currentPath] = inlineRef[1];
                    currentPath = null;
                }
                continue;
            }

            if (currentPath) {
                const refMatch = trimmed.match(/^\$ref:\s*['"]?([^\s'"#]+)['"]?/);
                if (refMatch) {
                    result[currentPath] = refMatch[1];
                    currentPath = null;
                }
            }
        }

        return result;
    }

    /**
     * Разрезолвить схему по пути
     */
    async resolveSchemaRef(refPath, currentFilePath, projectState) {
        let absolutePath;

        if (refPath.startsWith('../') || refPath.startsWith('./')) {
            absolutePath = this.resolveRelativePath(currentFilePath, refPath);
        } else if (refPath.startsWith('/')) {
            absolutePath = projectState.projectRoot + refPath;
        } else {
            const currentDir = currentFilePath.substring(0, currentFilePath.lastIndexOf('/'));
            absolutePath = currentDir + '/' + refPath;
        }

        if (projectState.relevantFiles[absolutePath]) {
            return await this.readFile(projectState.relevantFiles[absolutePath]);
        }

        // Fallback: поиск по имени
        const fileName = refPath.split('/').pop();
        for (const [p, f] of Object.entries(projectState.relevantFiles)) {
            if (p.endsWith('/' + fileName)) {
                return await this.readFile(f);
            }
        }

        return null;
    }

    /**
     * Разрезолвить относительный путь
     */
    resolveRelativePath(fromPath, relativePath) {
        const fromDir = fromPath.substring(0, fromPath.lastIndexOf('/'));

        let targetPath = relativePath;
        let currentDir = fromDir;

        while (targetPath.startsWith('../')) {
            targetPath = targetPath.substring(3);
            const lastSlash = currentDir.lastIndexOf('/');
            if (lastSlash > 0) {
                currentDir = currentDir.substring(0, lastSlash);
            }
        }

        while (targetPath.startsWith('./')) {
            targetPath = targetPath.substring(2);
        }

        return currentDir + '/' + targetPath;
    }

    /**
     * Извлечь метод верхнего уровня из плоского файла
     */
    extractTopLevelMethod(content, method) {
        const lines = content.split('\n');
        const methodRegex = new RegExp('^' + method + '\\s*:');
        let capturing = false;
        let methodLines = [];
        let baseIndent = -1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trimStart();
            const indent = line.length - trimmed.length;

            if (!capturing) {
                if (indent === 0 && methodRegex.test(trimmed)) {
                    capturing = true;
                    continue;
                }
            } else {
                if (indent === 0 && trimmed.length > 0 && !trimmed.startsWith('#')) {
                    break;
                }

                if (baseIndent === -1 && trimmed.length > 0) {
                    baseIndent = indent;
                }

                if (baseIndent > 0 && line.length >= baseIndent) {
                    methodLines.push(line.substring(baseIndent));
                } else {
                    methodLines.push(line);
                }
            }
        }

        if (methodLines.length === 0) return null;
        return methodLines.join('\n');
    }
}
