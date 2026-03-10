import { ParsedData } from '../models/ParsedData.js';
import { Field } from '../models/Field.js';

/**
 * Сервис для парсинга endpoint и генерации данных
 */
export class EndpointParserService {
    constructor(fileService, yamlParserService) {
        this.fileService = fileService;
        this.yamlParser = yamlParserService;
    }

    /**
     * Парсить endpoint и заполнить parsedData
     */
    async parseEndpoint(projectState, parsedData) {
        const folder = projectState.getSelectedRequestFolder();
        if (!folder) {
            throw new Error('Папка не найдена');
        }

        const methodToUse = projectState.selectedMethod || folder.methods[0];
        if (!methodToUse) {
            throw new Error('Не найден метод');
        }

        parsedData.reset();
        parsedData.method = methodToUse.toUpperCase();

        // URL
        if (folder.apiPath) {
            parsedData.url = folder.apiPath;
        } else {
            parsedData.url = '/' + projectState.selectedRequest.replace(/_/g, '/');
        }

        let methodContent;
        let methodFilePath;

        // determine actual base directory for this endpoint
        // folder.folderPath already includes any 'paths/...' prefix coming from openapi ref
        const baseDir = projectState.projectRoot + '/' + (folder.folderPath || ('paths/' + projectState.selectedRequest));

        if (folder.flat) {
            // плоский файл при этом может находиться внутри подпапки
            methodFilePath = baseDir + '/' + projectState.selectedRequest + '.yaml';
            const fullContent = folder.flatContent || await this.fileService.getFileContent(methodFilePath);
            methodContent = this.fileService.extractTopLevelMethod(fullContent, methodToUse);
            if (!methodContent) {
                throw new Error('Метод ' + methodToUse + ' не найден в файле');
            }
        } else {
            // вложенная структура (не должно случаться сейчас)
            methodFilePath = baseDir + '/' + methodToUse + '.yaml';
            methodContent = await this.fileService.getFileContent(methodFilePath);
            if (!methodContent) {
                throw new Error('Не найден файл метода ' + methodToUse);
            }
        }

        // Parse metadata
        this.parseMetadata(methodContent, parsedData);

        // Parse parameters
        await this.parseParameters(methodContent, parsedData);

        // Parse request body
        await this.parseRequestBody(methodContent, methodFilePath, parsedData, projectState);

        // Parse responses
        await this.parseResponses(methodContent, methodFilePath, parsedData, projectState);

        // Generate defaults
        this.generateDefaults(parsedData);

        // Try merge with existing read.md
        await this.tryMergeExistingReadme(folder, methodToUse, projectState, parsedData);
    }

    /**
     * Парсить метаданные (tags, summary, operationId)
     */
    parseMetadata(methodContent, parsedData) {
        const tagMatch = methodContent.match(/tags:\s*\n\s*-\s*(.+)/);
        if (tagMatch) parsedData.tag = tagMatch[1].trim();

        const summaryMatch = methodContent.match(/^summary:\s*(.+)/m);
        if (summaryMatch) parsedData.summary = summaryMatch[1].trim();

        const opMatch = methodContent.match(/^operationId:\s*(.+)/m);
        if (opMatch) parsedData.operationId = opMatch[1].trim();

        const reqMatch = methodContent.match(/^\s*required:\s*(true|false)\s*$/m);
        if (reqMatch) parsedData.requestBodyRequired = reqMatch[1] === 'true';
    }

    /**
     * Парсить параметры (query, path, header)
     */
    async parseParameters(methodContent, parsedData) {
        const parametersSection = this.yamlParser.extractSection(methodContent, 'parameters');
        if (!parametersSection) return;

        const paramMatches = [...parametersSection.matchAll(/- name:\s*(.+)/g)];
        for (const pm of paramMatches) {
            const paramName = pm[1].trim();
            const paramStart = pm.index;
            const paramBlock = this.yamlParser.extractIndentedBlock(parametersSection, paramStart);

            const inMatch = paramBlock.match(/in:\s*(\w+)/);
            const requiredMatch = paramBlock.match(/required:\s*(true|false)/);
            const descMatch = paramBlock.match(/description:\s*(.+)/);
            const typeMatch = paramBlock.match(/type:\s*(\w+)/);
            const formatMatch = paramBlock.match(/format:\s*(\w+)/);
            const exampleMatch = paramBlock.match(/example:\s*(.+)/);

            parsedData.parameters.push({
                name: paramName,
                in: inMatch ? inMatch[1] : 'query',
                required: requiredMatch ? requiredMatch[1] === 'true' : false,
                type: typeMatch ? typeMatch[1] : 'string',
                format: formatMatch ? formatMatch[1] : '',
                description: descMatch ? descMatch[1].trim() : '',
                example: exampleMatch ? exampleMatch[1].trim() : ''
            });
        }
    }

    /**
     * Парсить request body
     */
    async parseRequestBody(methodContent, methodFilePath, parsedData, projectState) {
        const requestBodySection = this.yamlParser.extractSection(methodContent, 'requestBody');
        if (!requestBodySection) return;

        const reqSchemaRef = this.yamlParser.findSchemaRef(requestBodySection);
        if (reqSchemaRef) {
            parsedData.requestSchemaName = reqSchemaRef.split('/').pop().replace('.yaml', '').replace('.yml', '');
            const schemaContent = await this.fileService.resolveSchemaRef(reqSchemaRef, methodFilePath, projectState);
            if (schemaContent) {
                const schemaPath = this.fileService.resolveRelativePath(methodFilePath, reqSchemaRef);
                const parsed = await this.yamlParser.parseSchemaDtoRecursive(
                    schemaContent, 0, new Set([parsedData.requestSchemaName]), schemaPath, projectState
                );
                parsedData.requestFields = parsed.fields;
            }
        }
    }

    /**
     * Парсить responses
     */
    async parseResponses(methodContent, methodFilePath, parsedData, projectState) {
        const responsesSection = this.yamlParser.extractSection(methodContent, 'responses');
        if (!responsesSection) return;

        const codeMatches = [...responsesSection.matchAll(/['"]?(\d{3})['"]?\s*:/g)];
        for (const cm of codeMatches) {
            const code = cm[1];
            const codeBlockStart = cm.index;
            const codeBlock = this.yamlParser.extractIndentedBlock(responsesSection, codeBlockStart);

            const descMatch = codeBlock.match(/description:\s*(.+)/);
            const description = descMatch ? descMatch[1].trim() : 'OK';

            parsedData.responses[code] = { description };

            const respSchemaRef = this.yamlParser.findSchemaRef(codeBlock);
            if (respSchemaRef) {
                const respSchemaName = respSchemaRef.split('/').pop().replace('.yaml', '').replace('.yml', '');
                const respContent = await this.fileService.resolveSchemaRef(respSchemaRef, methodFilePath, projectState);
                let respFields = [];
                if (respContent) {
                    const schemaPath = this.fileService.resolveRelativePath(methodFilePath, respSchemaRef);
                    const parsed = await this.yamlParser.parseSchemaDtoRecursive(
                        respContent, 0, new Set([respSchemaName]), schemaPath, projectState
                    );
                    respFields = parsed.fields;
                }
                parsedData.responseSchemas.push({
                    code, description, schemaName: respSchemaName, fields: respFields
                });
            }
        }

        // Fallback
        if (Object.keys(parsedData.responses).length === 0) {
            const respMatches = methodContent.matchAll(/['"]?(\d{3})['"]?\s*:\s*\n?\s*description:\s*(.+)/g);
            for (const m of respMatches) {
                parsedData.responses[m[1]] = { description: m[2].trim() };
            }
        }
    }

    /**
     * Генерация дефолтных значений
     */
    generateDefaults(parsedData) {
        // Установить дефолтное значение источника для всех полей Request Body
        const setDefaultSource = (fields) => {
            for (const f of fields) {
                if (!f.source || f.source.trim() === '') {
                    f.source = '📥 Прямой ввод';
                }
                if (f.children && f.children.length > 0) {
                    setDefaultSource(f.children);
                }
            }
        };
        
        setDefaultSource(parsedData.requestFields);

        // Error responses
        const flatRequest = this.flattenFields(parsedData.requestFields);
        const reqFields = flatRequest.filter(f => f.required && f.depth === 0).map(f => f.name);
        parsedData.errorResponses = [];
        if (reqFields.length) {
            parsedData.errorResponses.push({
                code: '400',
                description: `Не передан обязательный параметр (${reqFields.join(', ')})`
            });
        }
        parsedData.errorResponses.push({ code: '404', description: 'Ресурс не найден' });
        parsedData.errorResponses.push({ code: '500', description: 'Внутренняя ошибка сервера' });

        // Examples
        parsedData.exampleRequest = JSON.stringify(this.generateExampleFromFields(parsedData.requestFields), null, 2);
        parsedData.exampleRequestFromMd = false;

        if (parsedData.responseSchemas.length) {
            const firstResp = parsedData.responseSchemas[0];
            parsedData.exampleResponse = JSON.stringify(this.generateExampleFromFields(firstResp.fields), null, 2);
            parsedData.exampleResponseFromMd = false;
        }

        // Algorithm
        parsedData.algorithm = this.generateDefaultAlgorithm(parsedData);
        // mark as generated by YAML; later merge may override
        parsedData.algorithmFromMd = false;
    }

    /**
     * Попытка мержа с существующим read.md
     */
    async tryMergeExistingReadme(folder, methodToUse, projectState, parsedData) {
        let readMdContent = null;
        // Попытка загрузить существующий read.md, игнорируем ошибки 404
        async function tryLoad(path) {
            try {
                const c = await this.fileService.getFileContent(path);
                return c;
            } catch (e) {
                return null;
            }
        }

        // attempt to find markdown alongside the YAML; try both case variants of the method
        const tryPaths = async (...paths) => {
            for (const p of paths) {
                console.log('[EndpointParserService] trying readme', p);
                const c = await tryLoad.call(this, p);
                if (c) return c;
            }
            return null;
        };

        const methodLower = methodToUse.toLowerCase();
        const methodUpper = methodToUse.toUpperCase();

        if (folder.flat) {
            // compute actual directory containing the openapi yaml;
            // folder.folderPath may already include 'paths/...'
            let base;
            if (folder.folderPath) {
                base = projectState.projectRoot + '/' + folder.folderPath;
            } else {
                base = projectState.projectRoot + '/paths/' + projectState.selectedRequest;
            }
            const candidates = [
                `${base}_${methodLower}_read.md`,
                `${base}_${methodUpper}_read.md`,
                `${base}_read.md`,
                `${base}.md`,
                `${base}_${methodLower}.md`,
                `${base}_${methodUpper}.md`,
                `${base}/${methodLower}_${projectState.selectedRequest}.md`,
                `${base}/${methodUpper}_${projectState.selectedRequest}.md`,
                `${base}/${methodLower}_${projectState.selectedRequest}_read.md`,
                `${base}/${methodUpper}_${projectState.selectedRequest}_read.md`
            ];
            readMdContent = await tryPaths(...candidates);
        } else {
            const dir = projectState.projectRoot + '/paths/' + projectState.selectedRequest + '/';
            const candidates = [
                `${dir}${methodLower}_${projectState.selectedRequest}.md`,
                `${dir}${methodUpper}_${projectState.selectedRequest}.md`,
                `${dir}${projectState.selectedRequest}.md`,
                `${dir}${methodLower}_read.md`,
                `${dir}${methodUpper}_read.md`,
                `${dir}${projectState.selectedRequest}_${methodLower}.md`,
                `${dir}${projectState.selectedRequest}_${methodUpper}.md`
            ];
            readMdContent = await tryPaths(...candidates);
        }

        if (readMdContent) {
            try {
                const existingData = this.parseExistingMarkdown(readMdContent);
                this.mergeWithExistingData(existingData, parsedData);
            } catch (e) {
                console.warn('Не удалось прочитать существующий read.md:', e);
            }
        }
    }

    /**
     * Парсинг существующего read.md
     */
    parseExistingMarkdown(content) {
        const data = {
            requestFieldsSources: {}, // Маппинг field name -> source
            errorResponses: [],          // Из таблицы "Ошибки" (код + описание)
            dependencies: [],
            algorithm: '',
            notes: '',
            exampleRequest: '',
            exampleResponse: ''
        };

        // Парсинг таблицы ошибок из секции "Response". Это позволяет
        // сохранить изменения в .md, например в описании 404.
        const errorsMatch = content.match(/##\s*3\. Response[\s\S]*?### Ошибки([\s\S]*?)(?=\n##|\n###|$)/i);
        if (errorsMatch) {
            const tableMatch = errorsMatch[1].match(/\|[^\n]+\|\n\|[-|]+\|\n([\s\S]*?)(?=\n\n|$)/);
            if (tableMatch) {
                const rows = tableMatch[1].trim().split('\n');
                for (const row of rows) {
                    const cells = row.split('|').map(c => c.trim()).filter((c, i) => i > 0 && i <= 2);
                    if (cells.length === 2) {
                        data.errorResponses.push({ code: cells[0], description: cells[1] });
                    }
                }
            }
        }

        // Парсинг источников из Request Body таблицы
        const requestBodyMatch = content.match(/### Request Body[\s\S]*?\n\n([\s\S]*?)(?=\n###|\n##|$)/i);
        if (requestBodyMatch) {
            const tableMatch = requestBodyMatch[1].match(/\|[^\n]+\|\n\|[-|]+\|\n([\s\S]*?)(?=\n\n|$)/);
            if (tableMatch) {
                const rows = tableMatch[1].trim().split('\n');
                for (const row of rows) {
                    const cells = row.split('|').map(c => c.trim()).filter((c, i) => i > 0 && i <= 6);
                    if (cells.length >= 6) {
                        // cells: [Поле, Тип, Обязательный, Формат, Описание, Источник]
                        const fieldName = cells[0].replace(/`/g, '').replace(/^[│├└─\s]+/, '').trim();
                        const source = cells[5];
                        if (fieldName && source && source !== '—') {
                            data.requestFieldsSources[fieldName] = source;
                        }
                    }
                }
            }
        }

        // Зависимости - обновлённая нумерация (было 5, стало 4)
        // The lookahead must only stop at a *level‑2* heading ("## ") so it
        // doesn't treat a "###" subsection as the end of the block.  Use
        // `\r?\n##\s` rather than plain "\n##" to avoid matching the first
        // two hashes of a third‑level header and to handle Windows newlines.
        const depsMatch = content.match(/## (?:4|5)\. Внешние зависимости([\s\S]*?)(?=\r?\n##\s|$)/i);
        if (depsMatch && !depsMatch[1].includes('Нет.')) {
            // when splitting dependencies we must not stop at "####"
        // sub‑headers like "#### Входные параметры"; those should remain part
        // of the section.  The lookahead therefore only considers another
        // numbered dependency or a level‑2 heading.
        // only stop on a new numbered dependency (### 4.x/5.x) or a
        // *true* level‑2 section (`## `).  using `\n##\s` prevents the
        // lookahead from firing on `####` sub‑headers.
        const depSections = [...depsMatch[1].matchAll(/### (?:4|5)\.\d+ `([^`]+)` — ([^\n]+)([\s\S]*?)(?=(?:### (?:4|5)\.\d+)|\n##\s|$)/g)];
            for (const depMatch of depSections) {
                const dep = {
                    name: depMatch[1],
                    description: depMatch[2],
                    method: '',
                    url: '',
                    when: '',
                    inputParams: '',
                    outputFields: ''
                };

                // Универсальный парсер мета‑таблицы (Параметр | Значение)
                // use \r?\n everywhere to handle Windows line endings; otherwise a CR before the \n
                const metaTable = depMatch[3].match(/\|[\s\S]*?\|\r?\n\|[-|]+\|\r?\n([\s\S]*?)(?=(?:\r?\n){2}|####|###|##|$)/);
                if (metaTable) {
                    const rows = metaTable[1].trim().split(/\r?\n/);
                    for (const row of rows) {
                        const cells = row.split('|').map(c => c.trim());
                        if (cells.length >= 3) {
                            const key = cells[1].replace(/\*\*/g, '').trim();
                            const val = cells[2];
                            if (/Метод/i.test(key)) dep.method = val.replace(/`/g, '');
                            if (/URL/i.test(key)) dep.url = val.replace(/`/g, '');
                            if (/Когда/i.test(key)) dep.when = val;
                            if (/Тип/i.test(key)) {
                                // translate human-readable Russian labels back to the
                                // internal type codes used by the generator.
                                const map = {
                                    'шлюз': 'gateway',
                                    'внешний запрос': 'external',
                                    'таблица ффл': 'ffl_table',
                                    'кафка': 'kafka',
                                    'вычисляемое значение': 'calculated'
                                };
                                const norm = val.trim().toLowerCase();
                                dep.type = map[norm] || val;
                            }
                        }
                    }
                }

                const inputMatch = depMatch[3].match(/#### Входные параметры[\s\S]*?\|[-|]+\|\r?\n([\s\S]*?)(?=(?:\r?\n){2}|####|###|##|$)/);
                if (inputMatch) {
                    // convert to array of {param, source, transform}
                    const rows = inputMatch[1].trim().split(/\r?\n/).map(l => {
                        const cells = l.split('|').map(s => s.trim()).filter(s => s !== '');
                        return {
                            param: cells[0] || '',
                            source: cells[1] || '',
                            transform: cells[2] || ''
                        };
                    });
                    dep.inputParams = rows;
                }

                const outputMatch = depMatch[3].match(/#### Параметры ответа[\s\S]*?\|[-|]+\|\r?\n([\s\S]*?)(?=(?:\r?\n)---|###|##|$)/);
                if (outputMatch) {
                    const rows = outputMatch[1].trim().split(/\r?\n/).map(l => {
                        const cells = l.split('|').map(s => s.trim()).filter(s => s !== '');
                        return {
                            field: cells[0] || '',
                            usedIn: cells[1] || '',
                            transform: cells[2] || ''
                        };
                    });
                    dep.outputFields = rows;
                }

                data.dependencies.push(dep);
            }
        }

        // Алгоритм уже парсился ранее; ищем диаграмму mermaid (пункт 6)
        const diagramMatch = content.match(/##\s*6\.\s*Блок-схема[\s\S]*?```mermaid([\s\S]*?)```/i);
        if (diagramMatch) {
            data.mermaidDiagram = diagramMatch[1].trim();
        }

        // Алгоритм - номер раздела остается 6, но ищем также старую нумерацию
        const algoMatch = content.match(/### Алгоритм\s*\n\s*```([\s\S]*?)```/i);
        if (algoMatch) data.algorithm = algoMatch[1].trim();

        // Примечания - обновленная нумерация (было 9, стало 7)
        const notesMatch = content.match(/## (?:7|9)\. Примечания\s*\n([\s\S]*?)$/i);
        if (notesMatch) {
            const notes = notesMatch[1].trim();
            if (notes !== 'Нет.') data.notes = notes;
        }

        // Примеры
        const reqExampleMatch = content.match(/### Пример запроса\s*\n\s*```json\s*\n([\s\S]*?)```/);
        if (reqExampleMatch) data.exampleRequest = reqExampleMatch[1].trim();

        const respExampleMatch = content.match(/### Пример ответа\s*\n\s*```json\s*\n([\s\S]*?)```/);
        if (respExampleMatch) data.exampleResponse = respExampleMatch[1].trim();

        return data;
    }

    /**
     * Мерж с существующими данными
     */
    mergeWithExistingData(existing, parsedData) {
        // Мерж источников для полей
        const mergeFieldSources = (fields) => {
            for (const f of fields) {
                if (existing.requestFieldsSources && existing.requestFieldsSources[f.name]) {
                    f.source = existing.requestFieldsSources[f.name];
                }
                if (f.children && f.children.length > 0) {
                    mergeFieldSources(f.children);
                }
            }
        };
        
        mergeFieldSources(parsedData.requestFields);

        // Dependencies deserve a smarter merge: allow the markdown to
        // override or add entries, but keep any existing items that the
        // parser didn't touch.  We also fall back to existing only when the
        // markdown produced nothing at all (e.g. user removed the section).
        if (existing.dependencies.length > 0) {
            if (parsedData.dependencies.length === 0) {
                parsedData.dependencies = existing.dependencies;
            } else {
                const map = new Map(existing.dependencies.map(d => [d.name, d]));
                // parsed entries should override existing ones
                parsedData.dependencies = parsedData.dependencies.map(d => {
                    if (map.has(d.name)) {
                        return { ...map.get(d.name), ...d };
                    }
                    return d;
                });
                // append any remaining existing entries that weren't in parsed
                for (const [name, e] of map) {
                    if (!parsedData.dependencies.some(d => d.name === name)) {
                        parsedData.dependencies.push(e);
                    }
                }
            }
        }

        // Error responses need to merge by code so that a custom description
        // in markdown replaces the generated one, but generated codes remain.
        if (existing.errorResponses && existing.errorResponses.length > 0) {
            const parsedMap = new Map(parsedData.errorResponses.map(e => [e.code, e]));
            for (const e of existing.errorResponses) {
                if (parsedMap.has(e.code)) {
                    parsedMap.get(e.code).description = e.description;
                } else {
                    parsedData.errorResponses.push(e);
                }
            }
        }

        // Mermaid diagram should also be carried over if the generator didn't
        // produce one (parsedData is blank by default).
        if ((!parsedData.mermaidDiagram || parsedData.mermaidDiagram.trim() === '')
            && existing.mermaidDiagram && existing.mermaidDiagram.trim()) {
            parsedData.mermaidDiagram = existing.mermaidDiagram;
        }

        // Free‑text sections from markdown always win over generated data.
        if (existing.algorithm) {
            parsedData.algorithm = existing.algorithm;
            parsedData.algorithmFromMd = true;
        }
        if (existing.notes) parsedData.notes = existing.notes;
        if (existing.exampleRequest) {
            parsedData.exampleRequest = existing.exampleRequest;
            parsedData.exampleRequestFromMd = true;
        }
        if (existing.exampleResponse) {
            parsedData.exampleResponse = existing.exampleResponse;
            parsedData.exampleResponseFromMd = true;
        }
    }

    /**
     * Flatten fields tree
     */
    flattenFields(fields, prefix = '', depth = 0) {
        const result = [];
        for (const f of fields) {
            const displayName = prefix ? `${prefix}.${f.name}` : f.name;
            result.push({
                name: f.name,
                displayName: displayName,
                type: f.isArray ? `array<${f.refName || f.type}>` : (f.refName && f.type !== 'array' ? f.refName : f.type),
                description: f.description,
                format: f.format,
                example: f.example,
                required: f.required,
                depth: depth,
                refName: f.refName,
                isArray: f.isArray,
                hasChildren: f.children && f.children.length > 0
            });
            if (f.children && f.children.length > 0) {
                const childPrefix = f.isArray ? `${displayName}[]` : displayName;
                result.push(...this.flattenFields(f.children, childPrefix, depth + 1));
            }
        }
        return result;
    }

    /**
     * Генерация примера JSON из полей
     */
    generateExampleFromFields(fields) {
        const obj = {};

        // Составная схема (oneOf / anyOf): использовать поля первого варианта
        const firstGroup = fields.find(f => f.type === '__group__');
        if (firstGroup) {
            const compositeType = firstGroup.compositeType;
            const variantNames = fields
                .filter(f => f.type === '__group__')
                .map(f => f.refName || f.name)
                .join(' | ');
            obj[`_${compositeType}`] = `Один из вариантов: ${variantNames}`;
            if (firstGroup.children && firstGroup.children.length > 0) {
                Object.assign(obj, this.generateExampleFromFields(firstGroup.children));
            }
            return obj;
        }

        for (const f of fields) {
            if (f.children && f.children.length > 0) {
                const childObj = this.generateExampleFromFields(f.children);
                obj[f.name] = f.isArray ? [childObj] : childObj;
            } else if (f.example !== undefined && f.example !== '') {
                if (f.type === 'integer') {
                    const n = parseInt(f.example, 10);
                    obj[f.name] = isNaN(n) ? f.example : n;
                } else if (f.type === 'number') {
                    const n = parseFloat(f.example);
                    obj[f.name] = isNaN(n) ? f.example : n;
                } else if (f.type === 'boolean') {
                    obj[f.name] = f.example === 'true';
                } else {
                    obj[f.name] = f.example;
                }
            } else {
                switch (f.type) {
                    case 'integer':
                        obj[f.name] = f.format === 'int64' ? 100000 : 12345;
                        break;
                    case 'number':
                        obj[f.name] = 99.99;
                        break;
                    case 'boolean':
                        obj[f.name] = true;
                        break;
                    case 'string':
                        if (f.format === 'date-time') obj[f.name] = '2024-01-15T10:30:00Z';
                        else if (f.format === 'date') obj[f.name] = '2024-01-15';
                        else if (f.format === 'uuid') obj[f.name] = '550e8400-e29b-41d4-a716-446655440000';
                        else obj[f.name] = 'string_value';
                        break;
                    case 'array':
                        obj[f.name] = [];
                        break;
                    case 'object':
                        obj[f.name] = {};
                        break;
                    default:
                        obj[f.name] = null;
                }
            }
        }
        return obj;
    }

    /**
     * Генерация дефолтного алгоритма
     */
    generateDefaultAlgorithm(parsedData) {
        const lines = [`ВХОД: ${parsedData.requestSchemaName || 'RequestDto'} от клиента\n`];
        let s = 1;
        for (const f of parsedData.requestFields) {
            lines.push(`ШАГ ${s}: ${f.name} — используется напрямую`);
            s++;
        }
        lines.push(`\nВЫХОД: ${Object.keys(parsedData.responses)[0] || '200'} OK`);
        return lines.join('\n');
    }
}
