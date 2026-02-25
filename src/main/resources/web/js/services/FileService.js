import { Field } from '../models/Field.js';

/**
 * Сервис для работы с файлами и индексацией проекта
 */
export class FileService {
    constructor() {
        this.httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
        this.allFiles = []; // Все файлы из выбранной папки
    }

    /**
     * Обнаружить все проекты (подпапки с openapi.yaml)
     */
    discoverProjects(files) {
        this.allFiles = Array.from(files);
        const projects = [];
        const projectMap = new Map();

        // Найти все openapi.yaml файлы
        for (const file of this.allFiles) {
            const rel = file.webkitRelativePath;
            const parts = rel.split('/');
            
            // Ищем openapi.yaml на втором уровне (например, test_requests/Main/openapi.yaml)
            if (parts.length >= 3 && 
                (parts[2] === 'openapi.yaml' || parts[2] === 'openapi.yml')) {
                const projectName = parts[1];
                
                if (!projectMap.has(projectName)) {
                    projectMap.set(projectName, {
                        name: projectName,
                        rootPath: parts[0] + '/' + projectName,
                        openapiFile: file,
                        fileCount: 0
                    });
                }
            }
        }

        // Подсчитать файлы для каждого проекта
        for (const file of this.allFiles) {
            const rel = file.webkitRelativePath;
            for (const [projectName, project] of projectMap.entries()) {
                if (rel.startsWith(project.rootPath + '/')) {
                    project.fileCount++;
                }
            }
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
     * Индексировать конкретный проект
     */
    async indexProject(projectName, projectState) {
        projectState.reset();
        
        if (!this.allFiles || this.allFiles.length === 0) {
            throw new Error('Файлы не найдены');
        }

        // Определяем корневую папку проекта
        const rootParts = this.allFiles[0].webkitRelativePath.split('/');
        const baseFolder = rootParts[0]; // например, "test_requests"
        projectState.projectRoot = baseFolder + '/' + projectName;
        const schemasPrefix = projectState.projectRoot + '/components/schemas/';

        // Построить карту файлов только для данного проекта
        const fileMap = {};
        let openapiFile = null;

        for (const file of this.allFiles) {
            const rel = file.webkitRelativePath;
            
            // Пропускаем файлы, не относящиеся к выбранному проекту
            if (!rel.startsWith(projectState.projectRoot + '/')) {
                continue;
            }
            
            fileMap[rel] = file;

            if (rel === projectState.projectRoot + '/openapi.yaml' ||
                rel === projectState.projectRoot + '/openapi.yml') {
                openapiFile = file;
            }

            // Индексация схем
            const isYaml = rel.endsWith('.yaml') || rel.endsWith('.yml');
            if (isYaml && rel.startsWith(schemasPrefix)) {
                projectState.relevantFiles[rel] = file;
                const fileName = rel.substring(schemasPrefix.length);
                projectState.schemaFiles[fileName] = file;
                projectState.schemaFiles[fileName.split('/').pop()] = file;
            }
        }

        if (!openapiFile) {
            throw new Error('Не найден openapi.yaml в корне проекта');
        }

        // Парсинг openapi.yaml
        const openapiContent = await this.readFile(openapiFile);
        const pathEntries = this.parsePathsFromOpenapi(openapiContent);

        // Чтение endpoint файлов
        const promises = [];

        for (const [apiPath, refPath] of Object.entries(pathEntries)) {
            const fullPath = projectState.projectRoot + '/' + refPath;
            const file = fileMap[fullPath];

            if (!file) {
                console.warn(`Файл не найден: ${fullPath} (для ${apiPath})`);
                continue;
            }

            projectState.relevantFiles[fullPath] = file;
            const endpointName = refPath.split('/').pop().replace(/\.(yaml|yml)$/, '');

            promises.push(
                this.readFile(file).then(content => {
                    const foundMethods = [];
                    for (const m of this.httpMethods) {
                        if (new RegExp('^' + m + '\\s*:', 'm').test(content)) {
                            foundMethods.push(m);
                        }
                    }

                    projectState.pathsFolders[endpointName] = {
                        files: {},
                        methods: foundMethods,
                        flat: true,
                        flatFile: file,
                        flatContent: content,
                        apiPath: apiPath
                    };

                    // Виртуальные файлы
                    projectState.pathsFolders[endpointName].files[endpointName + '.yaml'] = file;
                    for (const m of foundMethods) {
                        projectState.pathsFolders[endpointName].files[m + '.yaml'] = file;
                    }
                })
            );
        }

        await Promise.all(promises);

        return {
            endpointsCount: Object.keys(pathEntries).length,
            schemasCount: Object.keys(projectState.schemaFiles).length
        };
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
