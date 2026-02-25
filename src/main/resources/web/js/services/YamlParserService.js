import { Field } from '../models/Field.js';

/**
 * Сервис для парсинга YAML файлов и DTO схем
 */
export class YamlParserService {
    constructor(fileService) {
        this.fileService = fileService;
    }

    /**
     * Рекурсивно парсить DTO схему
     */
    async parseSchemaDtoRecursive(content, depth, visitedRefs, currentFilePath, projectState) {
        if (depth > 10) return { fields: [] }; // Защита от зацикливания

        const fields = [];
        const requiredFields = [];

        // Извлечь required
        const reqMatch = content.match(/^required:\s*\n((?:[ \t]+-[ \t]+\S+\n?)*)/m);
        if (reqMatch) {
            for (const m of reqMatch[1].matchAll(/-\s+(\S+)/g)) {
                requiredFields.push(m[1]);
            }
        }

        // Найти properties:
        const propsIdx = content.indexOf('properties:');
        if (propsIdx === -1) return { fields };

        const afterProps = content.substring(propsIdx);
        const lines = afterProps.split('\n');
        const propsLineIndent = lines[0].length - lines[0].trimStart().length;

        // Найти отступ имён полей
        let propNameIndent = -1;
        for (let i = 1; i < lines.length; i++) {
            const t = lines[i].trim();
            if (t === '' || t.startsWith('#')) continue;
            const ind = lines[i].length - lines[i].trimStart().length;
            if (ind <= propsLineIndent) break;
            propNameIndent = ind;
            break;
        }
        if (propNameIndent === -1) return { fields };

        const attrKeys = new Set(['type', 'description', 'format', 'enum', 'example', 'items',
            'minimum', 'maximum', 'pattern', 'default', 'nullable', 'minLength', 'maxLength',
            'minItems', 'maxItems', 'uniqueItems', 'readOnly', 'writeOnly', 'deprecated',
            'allOf', 'oneOf', 'anyOf', '$ref', 'additionalProperties', 'required']);

        let currentProp = null;
        let currentPropItemsRef = null;

        for (let i = 1; i < lines.length; i++) {
            const raw = lines[i];
            const trimmed = raw.trim();
            if (trimmed === '' || trimmed.startsWith('#')) continue;
            const indent = raw.length - raw.trimStart().length;
            if (indent <= propsLineIndent) break;

            const colonIdx = trimmed.indexOf(':');
            if (colonIdx === -1) continue;
            const key = trimmed.substring(0, colonIdx).trim();
            let val = trimmed.substring(colonIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }

            if (indent === propNameIndent && !attrKeys.has(key)) {
                // Сохранить предыдущее поле
                if (currentProp && currentPropItemsRef) {
                    await this.resolveNestedRef(currentProp, currentPropItemsRef, depth, visitedRefs, fields, currentFilePath, projectState);
                }
                currentPropItemsRef = null;

                currentProp = new Field(key, depth);
                currentProp.required = requiredFields.includes(key);
                fields.push(currentProp);
            } else if (indent > propNameIndent && currentProp) {
                switch (key) {
                    case 'type':
                        currentProp.type = val;
                        if (val === 'array') currentProp.isArray = true;
                        break;
                    case 'description':
                        currentProp.description = val;
                        break;
                    case 'format':
                        currentProp.format = val;
                        break;
                    case 'example':
                        currentProp.example = val;
                        break;
                    case '$ref':
                        const refPath = val.replace(/['"]/g, '');
                        const refName = refPath.split('/').pop().replace('.yaml', '').replace('.yml', '');
                        currentProp.refName = refName;
                        currentProp.type = currentProp.type || 'object';
                        if (!visitedRefs.has(refName)) {
                            const refContent = await this.fileService.resolveSchemaRef(refPath, currentFilePath, projectState);
                            if (refContent) {
                                const newVisited = new Set(visitedRefs);
                                newVisited.add(refName);
                                const schemaPath = this.fileService.resolveRelativePath(currentFilePath, refPath);
                                const nested = await this.parseSchemaDtoRecursive(refContent, depth + 1, newVisited, schemaPath, projectState);
                                currentProp.children = nested.fields;
                            }
                        }
                        break;
                }

                // Обработка items.$ref для массивов
                if (key === '$ref' && currentProp.isArray) {
                    const refPath = val.replace(/['"]/g, '');
                    currentPropItemsRef = refPath;
                }
            }

            // Обработка items: с $ref на следующей строке
            if (currentProp && currentProp.isArray && key === 'items' && !val) {
                for (let j = i + 1; j < lines.length && j < i + 3; j++) {
                    const nextT = lines[j].trim();
                    if (nextT.startsWith('$ref:')) {
                        currentPropItemsRef = nextT.replace('$ref:', '').trim().replace(/['"]/g, '');
                        break;
                    }
                    if (nextT && !nextT.startsWith('#')) break;
                }
            }
        }

        // Обработать последнее поле
        if (currentProp && currentPropItemsRef) {
            await this.resolveNestedRef(currentProp, currentPropItemsRef, depth, visitedRefs, fields, currentFilePath, projectState);
        }

        return { fields };
    }

    /**
     * Разрезолвить вложенную ссылку
     */
    async resolveNestedRef(prop, refPath, depth, visitedRefs, fieldsArray, currentFilePath, projectState) {
        const refName = refPath.split('/').pop().replace('.yaml', '').replace('.yml', '');
        prop.refName = refName;
        if (!visitedRefs.has(refName)) {
            const refContent = await this.fileService.resolveSchemaRef(refPath, currentFilePath, projectState);
            if (refContent) {
                const newVisited = new Set(visitedRefs);
                newVisited.add(refName);
                const schemaPath = this.fileService.resolveRelativePath(currentFilePath, refPath);
                const nested = await this.parseSchemaDtoRecursive(refContent, depth + 1, newVisited, schemaPath, projectState);
                prop.children = nested.fields;
            }
        }
    }

    /**
     * Извлечь секцию из YAML
     */
    extractSection(content, key) {
        const regex = new RegExp('^(' + key + '\\s*:)', 'm');
        const match = content.match(regex);
        if (!match) return null;
        return this.extractIndentedBlock(content, match.index);
    }

    /**
     * Извлечь блок с отступом
     */
    extractIndentedBlock(content, startPos) {
        const lines = content.substring(startPos).split('\n');
        if (!lines.length) return '';
        const firstLine = lines[0];
        const baseIndent = firstLine.length - firstLine.trimStart().length;
        const result = [firstLine];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (trimmed === '') {
                result.push(line);
                continue;
            }
            const indent = line.length - line.trimStart().length;
            if (indent <= baseIndent) break;
            result.push(line);
        }
        return result.join('\n');
    }

    /**
     * Найти первый $ref на схему
     */
    findSchemaRef(text) {
        const match = text.match(/\$ref:\s*['"]?([^\s'"]*(?:Dto|dto|DTO|Response|response|Request|request|Schema|schema|Model|model)[^\s'"]*\.yaml)['"]?/i);
        if (match) return match[1];

        const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
        const allRefs = [...text.matchAll(/\$ref:\s*['"]?([^\s'"]+\.yaml)['"]?/g)];
        for (const r of allRefs) {
            const fn = r[1].split('/').pop().replace('.yaml', '');
            if (!httpMethods.includes(fn)) return r[1];
        }
        return null;
    }
}
