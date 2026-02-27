import { Field } from '../models/Field.js';

/**
 * Сервис для работы с файлами и индексацией проекта
 * Может работать в двух режимах:
 * 1) локальном - когда пользователь выбирает папку через input (файлы передаются в методах)
 * 2) прокси - когда сервер на джаве предоставляет файл по пути (/api/file?path=...)
 */
export class FileService {
    constructor() {
        this.httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
        this.allFiles = []; // используется только в локальном режиме
    }

    /**
     * Общий fetch-метод для получения содержимого файла (proxy режим)
     * возвращает null если файл не найден
     */
    async getFileContent(path) {
        const url = '/api/file?path=' + encodeURIComponent(path);
        console.log('[FileService] fetching', url);
        const res = await fetch(url);
        if (!res.ok) {
            console.warn('[FileService] failed to fetch', url, res.status);
            return null;
        }
        return await res.text();
    }

    /**
     * Выяснить, в каком режиме работаем (есть ли у нас файловая коллекция)
     */
    hasLocalFiles() {
        return this.allFiles && this.allFiles.length > 0;
    }

    /**
     * Обнаружить проекты. В локальном режиме сканируем переданные файлы.
     * В прокси-режиме загружаем redocly.yaml с сервера и парсим.
     * @param {FileList=} files
     */
    async discoverProjects(files) {
        if (files && files.length > 0) {
            // старый режим - сканирование локальной папки
            this.allFiles = Array.from(files);
            const projects = [];
            const projectMap = new Map();

            for (const file of this.allFiles) {
                const rel = file.webkitRelativePath;
                const parts = rel.split('/');
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
            for (const file of this.allFiles) {
                const rel = file.webkitRelativePath;
                for (const [projectName, project] of projectMap.entries()) {
                    if (rel.startsWith(project.rootPath + '/')) {
                        project.fileCount++;
                    }
                }
            }
            return Array.from(projectMap.values());
        } else {
            // прокси-режим: получить redocly.yaml и распарсить проекты
            const yaml = await this.getFileContent('redocly.yaml');
            if (!yaml) {
                throw new Error('redocly.yaml не найден в проекте');
            }
            return this.parseRedocly(yaml);
        }
    }

    /**
     * Прочитать файл как текст. Принимает либо File объект (локальный режим), либо строку пути (прокси).
     */
    async readFile(fileOrPath) {
        if (typeof fileOrPath === 'string') {
            const content = await this.getFileContent(fileOrPath);
            if (content === null) throw new Error('Не удалось загрузить файл: ' + fileOrPath);
            return content;
        }
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(fileOrPath);
        });
    }

    /**
     * Проверяет существование файла или папки на сервере (прокси-режим).
     * Возвращает true если ресурс найден, false при 404.
     * В локальном режиме всегда возвращает false, т.к. мы не можем
     * записывать в локальную файловую систему из браузера.
     */
    async fileExists(path) {
        if (this.hasLocalFiles()) return false;
        const url = '/api/exists?path=' + encodeURIComponent(path);
        const res = await fetch(url);
        return res.ok;
    }

    /**
     * Сохраняет markdown-контент на сервере по относительному пути.
     * В теле запроса передаётся сам markdown; метод возвращает промис,
     * который резолвится при успешном сохранении и реджектится при ошибке.
     */
    async saveMarkdown(path, content) {
        if (this.hasLocalFiles()) {
            // в локальном режиме сохраняем через скачивание
            const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = path.split('/').pop();
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return;
        }

        const url = '/api/save?path=' + encodeURIComponent(path);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
            body: content
        });
        if (!res.ok) {
            throw new Error('status ' + res.status);
        }
    }

    /**
     * Индексировать конкретный проект в режиме прокси
     */
    async indexProject(projectName, projectState) {
        projectState.reset();

        if (!projectState.availableProjects || projectState.availableProjects.length === 0) {
            throw new Error('Проекты не загружены');
        }

        const proj = projectState.availableProjects.find(p => p.name === projectName);
        if (!proj) {
            throw new Error('Проект ' + projectName + ' не найден');
        }

        projectState.selectedProjectName = projectName;
        projectState.projectRoot = proj.rootPath;

        // Получить openapi.yaml с сервера
        const openapiPath = projectState.projectRoot + '/openapi.yaml';
        let openapiContent = await this.getFileContent(openapiPath);
        if (openapiContent === null) {
            // попробовать .yml
            openapiContent = await this.getFileContent(projectState.projectRoot + '/openapi.yml');
            if (openapiContent === null) {
                throw new Error('Не найден openapi.yaml в корне проекта');
            }
        }

        const pathEntries = this.parsePathsFromOpenapi(openapiContent);

        const promises = [];
        for (const [apiPath, refPath] of Object.entries(pathEntries)) {
            const fullPath = projectState.projectRoot + '/' + refPath;
            promises.push(
                this.getFileContent(fullPath).then(content => {
                    if (!content) {
                        console.warn(`Файл не найден: ${fullPath} (для ${apiPath})`);
                        return;
                    }
                    const foundMethods = [];
                    for (const m of this.httpMethods) {
                        if (new RegExp('^' + m + '\\s*:', 'm').test(content)) {
                            foundMethods.push(m);
                        }
                    }
                    const endpointName = refPath.split('/').pop().replace(/\.(yaml|yml)$/, '');
                    // directory containing the yaml file, relative to project root
                    const slash = refPath.lastIndexOf('/');
                    const folderPath = slash !== -1 ? refPath.substring(0, slash) : endpointName;
                    projectState.pathsFolders[endpointName] = {
                        apiPath: apiPath,
                        methods: foundMethods,
                        flat: true,
                        flatContent: content,
                        folderPath: folderPath
                    };
                })
            );
        }

        await Promise.all(promises);

        // schemasCount можно посчитать из openapiContent
        const schemasCount = (openapiContent.match(/^[ \t]*schemas\s*:/gm) || []).length;

        return {
            endpointsCount: Object.keys(pathEntries).length,
            schemasCount
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
     * Распарсить содержимое redocly.yaml и вернуть массив проектов
     */
    parseRedocly(content) {
        const projects = [];
        const lines = content.split('\n');
        let currentName = null;
        for (let line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const nameMatch = trimmed.match(/^([\w-]+):\s*$/);
            if (nameMatch) {
                currentName = nameMatch[1];
                continue;
            }
            if (currentName) {
                const rootMatch = trimmed.match(/^root:\s*(\S+)/);
                if (rootMatch) {
                    let rootPath = rootMatch[1];
                    // если указан файл openapi.yaml, убираем его
                    rootPath = rootPath.replace(/\/openapi\.ya?ml$/i, '');
                    projects.push({ name: currentName, rootPath });
                    currentName = null;
                }
            }
        }
        return projects;
    }

    /**
     * Разрезолвить схему по пути, загружая файл с сервера
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

        const content = await this.getFileContent(absolutePath);
        if (content !== null) return content;

        // попытка по имени
        const fileName = refPath.split('/').pop();
        // тут можно попробовать несколько вариантов, но для прокси режима
        // достаточно получить точный путь из YAML
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
