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

        // Проверка и парсинг allOf (слияние схем)
        const allOfMatch = content.match(/^allOf\s*:/m);
        if (allOfMatch) {
            const mergedFields = await this.parseAllOfVariants(
                content, depth, visitedRefs, currentFilePath, projectState
            );
            if (mergedFields.length > 0) {
                return { fields: mergedFields };
            }
        }

        // Проверка и парсинг oneOf / anyOf (составные схемы)
        const compositeMatch = content.match(/^(oneOf|anyOf)\s*:/m);
        if (compositeMatch) {
            const variantFields = await this.parseCompositeVariants(
                content, compositeMatch[1], depth, visitedRefs, currentFilePath, projectState
            );
            if (variantFields.length > 0) {
                return { fields: variantFields };
            }
        }

        // Извлечь required
        const reqSectionMatch = content.match(/^required:\s*$/m);
        if (reqSectionMatch) {
            const reqStartPos = reqSectionMatch.index;
            const afterReq = content.substring(reqStartPos);
            const reqLines = afterReq.split('\n');
            
            // Первая строка - "required:"
            const baseIndent = reqLines[0].length - reqLines[0].trimStart().length;
            
            for (let i = 1; i < reqLines.length; i++) {
                const line = reqLines[i];
                const trimmed = line.trim();
                
                // Пропускаем пустые строки и комментарии
                if (!trimmed || trimmed.startsWith('#')) continue;
                
                const indent = line.length - line.trimStart().length;
                
                // Если отступ меньше или равен базовому - конец секции required
                if (indent <= baseIndent) break;
                
                // Извлекаем значение после дефиса
                const match = trimmed.match(/^-\s+(\S+)/);
                if (match) {
                    requiredFields.push(match[1]);
                }
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
                    case 'enum':
                        // Парсинг enum значений
                        if (!val) {
                            // Enum как список на следующих строках
                            const enumBaseIndent = indent;
                            for (let j = i + 1; j < lines.length; j++) {
                                const enumRaw = lines[j];
                                const enumTrim = enumRaw.trim();
                                if (enumTrim === '' || enumTrim.startsWith('#')) continue;
                                const enumInd = enumRaw.length - enumRaw.trimStart().length;
                                if (enumInd <= enumBaseIndent) break;
                                if (enumTrim.startsWith('-')) {
                                    let enumVal = enumTrim.substring(1).trim();
                                    // Убрать кавычки если есть
                                    if ((enumVal.startsWith('"') && enumVal.endsWith('"')) || 
                                        (enumVal.startsWith("'") && enumVal.endsWith("'"))) {
                                        enumVal = enumVal.slice(1, -1);
                                    }
                                    currentProp.enumValues.push(enumVal);
                                    i = j;
                                }
                            }
                        } else {
                            // Enum как inline массив (например: enum: [value1, value2])
                            const inlineMatch = val.match(/\[(.*)\]/);
                            if (inlineMatch) {
                                const values = inlineMatch[1].split(',').map(v => v.trim().replace(/['"]/g, ''));
                                currentProp.enumValues = values;
                            }
                        }
                        // Установить первое значение enum как пример, если пример не задан
                        if (currentProp.enumValues.length > 0 && !currentProp.example) {
                            currentProp.example = currentProp.enumValues[0];
                        }
                        break;
                    case '$ref':
                        const refPath = val.replace(/['"]/g, '');
                        const refName = refPath.split('/').pop().replace('.yaml', '').replace('.yml', '');
                        currentProp.refName = refName;
                        currentProp.type = currentProp.type || 'object';
                        
                        const refContent = await this.fileService.resolveSchemaRef(refPath, currentFilePath, projectState);
                        if (refContent) {
                            // Проверить, не является ли это простым enum на верхнем уровне
                            const topLevelEnum = this.parseTopLevelEnum(refContent);
                            if (topLevelEnum) {
                                // Это простой enum - всегда копировать данные (даже если visitedRefs содержит refName)
                                currentProp.type = topLevelEnum.type;
                                currentProp.enumValues = topLevelEnum.enumValues;
                                currentProp.example = topLevelEnum.example;
                                if (topLevelEnum.description && !currentProp.description) {
                                    currentProp.description = topLevelEnum.description;
                                }
                                currentProp.children = [];
                            } else if (!visitedRefs.has(refName)) {
                                // Это сложная схема с properties - парсить только если еще не посещена
                                const newVisited = new Set(visitedRefs);
                                newVisited.add(refName);
                                const schemaPath = this.fileService.resolveRelativePath(currentFilePath, refPath);
                                const nested = await this.parseSchemaDtoRecursive(refContent, depth + 1, newVisited, schemaPath, projectState);
                                currentProp.children = nested.fields;
                            }
                        }
                        break;
                    case 'summary':
                        // summary используется вместо description (например, в примерах с oneOf/anyOf)
                        if (!currentProp.description) currentProp.description = val;
                        break;
                    case 'value':
                        if (!val) {
                            // Вложенный блок — собираем строки и ищем oneOf/anyOf
                            const valueBaseIndent = indent;
                            const subLines = [];
                            while (i + 1 < lines.length) {
                                const nextRaw = lines[i + 1];
                                const nextTrim = nextRaw.trim();
                                if (nextTrim === '' || nextTrim.startsWith('#')) { i++; continue; }
                                const nextInd = nextRaw.length - nextRaw.trimStart().length;
                                if (nextInd <= valueBaseIndent) break;
                                subLines.push(nextRaw);
                                i++;
                            }
                            const subContent = subLines.join('\n');
                            const compositeKwMatch = subContent.match(/^\s*(oneOf|anyOf)\s*:/m);
                            if (compositeKwMatch) {
                                const kw = compositeKwMatch[1];
                                currentProp.type = kw;
                                currentProp.compositeType = kw;
                                const variants = this.parseInlineListVariants(subContent, kw);
                                currentProp.children = variants;
                                if (!currentProp.example) {
                                    currentProp.example = variants
                                        .map(v => v.children && v.children.length
                                            ? v.children.map(c => `${c.name}: ${c.example || '?'}`).join(', ')
                                            : v.name)
                                        .join(' | ');
                                }
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
     * Парсинг инлайн-вариантов oneOf/anyOf из простых пар ключ-значение
     * (используется когда oneOf/anyOf вложен в value: блок внутри свойства)
     */
    parseInlineListVariants(content, keyword) {
        const kwMatch = content.match(/(?:oneOf|anyOf)\s*:/);
        if (!kwMatch) return [];

        const afterKw = content.substring(kwMatch.index + kwMatch[0].length);
        const lines = afterKw.split('\n');

        let itemIndent = -1;
        const variantBlocks = [];
        let currentBlock = null;

        for (const raw of lines) {
            const trimmed = raw.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const ind = raw.length - raw.trimStart().length;

            if (itemIndent === -1) {
                if (trimmed.startsWith('-')) itemIndent = ind;
                else continue;
            }
            if (ind < itemIndent) break;

            if (ind === itemIndent && trimmed.startsWith('-')) {
                if (currentBlock !== null) variantBlocks.push(currentBlock);
                currentBlock = trimmed.substring(1).trim();
            } else if (currentBlock !== null) {
                currentBlock += '\n' + trimmed;
            }
        }
        if (currentBlock !== null) variantBlocks.push(currentBlock);

        const variants = [];
        for (let vi = 0; vi < variantBlocks.length; vi++) {
            const blockContent = variantBlocks[vi];
            const groupField = new Field(`${keyword}_variant_${vi + 1}`, 0);
            groupField.type = '__group__';
            groupField.compositeType = keyword;
            groupField.name = `Вариант ${vi + 1}`;

            const children = [];
            for (const line of blockContent.split('\n')) {
                const lineTrim = line.trim();
                if (!lineTrim) continue;
                const colonIdx = lineTrim.indexOf(':');
                if (colonIdx !== -1) {
                    const k = lineTrim.substring(0, colonIdx).trim();
                    const v = lineTrim.substring(colonIdx + 1).trim().replace(/^['"']|['"']$/g, '');
                    if (k && k !== 'oneOf' && k !== 'anyOf') {
                        const child = new Field(k, 1);
                        child.type = 'string';
                        child.example = v;
                        children.push(child);
                    }
                }
            }
            groupField.children = children;
            variants.push(groupField);
        }
        return variants;
    }

    /**
     * Парсинг составной схемы (oneOf / anyOf) — извлекает варианты как группы полей
     */
    async parseCompositeVariants(content, keyword, depth, visitedRefs, currentFilePath, projectState) {
        const kwRegex = new RegExp('^' + keyword + '\\s*:', 'm');
        const kwMatch = content.match(kwRegex);
        if (!kwMatch) return [];

        const afterKw = content.substring(kwMatch.index + kwMatch[0].length);
        const lines = afterKw.split('\n');

        // Определить отступ первого элемента списка
        let itemIndent = -1;
        for (let i = 0; i < lines.length; i++) {
            const t = lines[i].trim();
            if (t === '' || t.startsWith('#')) continue;
            if (t.startsWith('-')) {
                itemIndent = lines[i].length - lines[i].trimStart().length;
            }
            break;
        }
        if (itemIndent === -1) return [];

        // Разбить на блоки по дефисам
        const variantBlocks = [];
        let currentBlock = null;
        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const trimmed = raw.trim();
            if (trimmed === '') continue;
            const indent = raw.length - raw.trimStart().length;
            if (indent < itemIndent && trimmed !== '') break; // Конец блока
            if (indent === itemIndent && trimmed.startsWith('-')) {
                if (currentBlock !== null) variantBlocks.push(currentBlock.join('\n'));
                // Заменить ведущий '-' на пробелы для корректного парсинга
                const afterDash = raw.replace(/^(\s*)-\s?/, '$1  ');
                currentBlock = [afterDash];
            } else if (currentBlock !== null) {
                currentBlock.push(raw);
            }
        }
        if (currentBlock !== null && currentBlock.length > 0) {
            variantBlocks.push(currentBlock.join('\n'));
        }

        // Извлечь описание схемы из summary / description (уровень схемы, вне вариантов)
        const summaryM = content.match(/^summary\s*:\s*(.+)/m);
        const descM = content.match(/^description\s*:\s*(.+)/m);
        const schemaDescription = (summaryM || descM)
            ? (summaryM ? summaryM[1] : descM[1]).trim().replace(/^['"]|['"]$/g, '')
            : '';

        // Предварительно собрать имена вариантов для поля example
        const variantNames = variantBlocks.map((block, vi) => {
            const refM = block.match(/\$ref:\s*['"]?([^\s'"]+)['"]?/);
            return refM ? refM[1].split('/').pop().replace(/\.ya?ml$/, '') : `Вариант ${vi + 1}`;
        });
        const variantExampleText = variantNames.join(' | ');

        const fields = [];
        for (let i = 0; i < variantBlocks.length; i++) {
            const block = variantBlocks[i];
            const groupField = new Field(`${keyword}_variant_${i + 1}`, depth);
            groupField.compositeType = keyword;
            groupField.type = '__group__';
            groupField.description = schemaDescription;
            groupField.example = variantExampleText;

            // Проверить наличие $ref внутри варианта
            const refMatch = block.match(/\$ref:\s*['"]?([^\s'"]+)['"]?/);
            if (refMatch) {
                const refPath = refMatch[1];
                const refName = refPath.split('/').pop().replace(/\.ya?ml$/, '');
                groupField.name = `Вариант ${i + 1} (${refName})`;
                groupField.refName = refName;
                if (!visitedRefs.has(refName)) {
                    const refContent = await this.fileService.resolveSchemaRef(refPath, currentFilePath, projectState);
                    if (refContent) {
                        const newVisited = new Set(visitedRefs);
                        newVisited.add(refName);
                        const schemaPath = this.fileService.resolveRelativePath(currentFilePath, refPath);
                        const nested = await this.parseSchemaDtoRecursive(refContent, depth + 1, newVisited, schemaPath, projectState);
                        groupField.children = nested.fields;
                    }
                }
            } else {
                groupField.name = `Вариант ${i + 1}`;
                // Парсинг инлайн properties внутри варианта
                const nested = await this.parseSchemaDtoRecursive(block, depth, visitedRefs, currentFilePath, projectState);
                groupField.children = nested.fields;
            }

            fields.push(groupField);
        }
        return fields;
    }

    /**
     * Парсинг allOf — объединяет все схемы в один набор полей
     */
    async parseAllOfVariants(content, depth, visitedRefs, currentFilePath, projectState) {
        const allOfMatch = content.match(/^allOf\s*:/m);
        if (!allOfMatch) return [];

        const afterAllOf = content.substring(allOfMatch.index + allOfMatch[0].length);
        const lines = afterAllOf.split('\n');

        // Определить отступ первого элемента списка
        let itemIndent = -1;
        for (let i = 0; i < lines.length; i++) {
            const t = lines[i].trim();
            if (t === '' || t.startsWith('#')) continue;
            if (t.startsWith('-')) {
                itemIndent = lines[i].length - lines[i].trimStart().length;
            }
            break;
        }
        if (itemIndent === -1) return [];

        // Разбить на блоки по дефисам
        const allOfBlocks = [];
        let currentBlock = null;
        for (let i = 0; i < lines.length; i++) {
            const raw = lines[i];
            const trimmed = raw.trim();
            if (trimmed === '') continue;
            const indent = raw.length - raw.trimStart().length;
            if (indent < itemIndent && trimmed !== '') break;
            if (indent === itemIndent && trimmed.startsWith('-')) {
                if (currentBlock !== null) allOfBlocks.push(currentBlock.join('\n'));
                const afterDash = raw.replace(/^(\s*)-\s?/, '$1  ');
                currentBlock = [afterDash];
            } else if (currentBlock !== null) {
                currentBlock.push(raw);
            }
        }
        if (currentBlock !== null && currentBlock.length > 0) {
            allOfBlocks.push(currentBlock.join('\n'));
        }

        console.log(`[parseAllOfVariants] Found ${allOfBlocks.length} schemas to merge`);

        // Объединить все поля из всех блоков
        const mergedFields = [];
        const fieldNames = new Set(); // Для предотвращения дублирования

        for (let i = 0; i < allOfBlocks.length; i++) {
            const block = allOfBlocks[i];
            
            // Проверить, есть ли $ref на ВЕРХНЕМ уровне блока (не внутри properties/items)
            // Ищем $ref который идет сразу, без отступов относительно начала блока
            const lines = block.split('\n');
            let topLevelRef = null;
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                
                // Если первая непустая строка начинается с $ref - это топ-уровень
                if (trimmed.startsWith('$ref:')) {
                    const match = trimmed.match(/\$ref:\s*['"]?([^\s'"]+)['"]?/);
                    if (match) {
                        topLevelRef = match[1];
                    }
                    break;
                }
                
                // Если первая строка не $ref (например type:, properties:), то это НЕ топ-уровень $ref
                break;
            }
            
            if (topLevelRef) {
                const refPath = topLevelRef;
                const refName = refPath.split('/').pop().replace(/\.ya?ml$/, '');
                console.log(`[parseAllOfVariants] Block ${i + 1}: Resolving $ref to ${refName}`);
                
                if (!visitedRefs.has(refName)) {
                    const refContent = await this.fileService.resolveSchemaRef(refPath, currentFilePath, projectState);
                    if (refContent) {
                        const newVisited = new Set(visitedRefs);
                        newVisited.add(refName);
                        const schemaPath = this.fileService.resolveRelativePath(currentFilePath, refPath);
                        // Для allOf используем тот же depth - это слияние схем на одном уровне
                        const nested = await this.parseSchemaDtoRecursive(refContent, depth, newVisited, schemaPath, projectState);
                        
                        // Добавить поля, избегая дубликатов
                        for (const field of nested.fields) {
                            if (!fieldNames.has(field.name)) {
                                console.log(`[parseAllOfVariants] Adding field "${field.name}", type: ${field.type}, isArray: ${field.isArray}, depth: ${field.depth}, hasChildren: ${field.children?.length > 0}`);
                                mergedFields.push(field);
                                fieldNames.add(field.name);
                            }
                        }
                        console.log(`[parseAllOfVariants] Block ${i + 1}: Added ${nested.fields.length} fields from ${refName}`);
                    }
                }
            } else {
                // Инлайн схема с properties
                console.log(`[parseAllOfVariants] Block ${i + 1}: Parsing inline schema`);
                const nested = await this.parseSchemaDtoRecursive(block, depth, visitedRefs, currentFilePath, projectState);
                
                // Добавить поля, избегая дубликатов
                for (const field of nested.fields) {
                    if (!fieldNames.has(field.name)) {
                        console.log(`[parseAllOfVariants] Adding field "${field.name}", type: ${field.type}, isArray: ${field.isArray}, hasChildren: ${field.children?.length > 0}, childrenCount: ${field.children?.length || 0}`);
                        mergedFields.push(field);
                        fieldNames.add(field.name);
                    }
                }
                console.log(`[parseAllOfVariants] Block ${i + 1}: Added ${nested.fields.length} inline fields`);
            }
        }

        console.log(`[parseAllOfVariants] Total merged fields: ${mergedFields.length}`);
        return mergedFields;
    }

    /**
     * Разрезолвить вложенную ссылку
     */
    async resolveNestedRef(prop, refPath, depth, visitedRefs, fieldsArray, currentFilePath, projectState) {
        const refName = refPath.split('/').pop().replace('.yaml', '').replace('.yml', '');
        prop.refName = refName;
        
        const refContent = await this.fileService.resolveSchemaRef(refPath, currentFilePath, projectState);
        if (refContent) {
            // Проверить, не является ли это простым enum на верхнем уровне
            const topLevelEnum = this.parseTopLevelEnum(refContent);
            if (topLevelEnum) {
                // Это простой enum - всегда копировать данные (даже если visitedRefs содержит refName)
                prop.type = topLevelEnum.type || prop.type || 'string';
                prop.enumValues = topLevelEnum.enumValues;
                prop.example = topLevelEnum.example;
                if (topLevelEnum.description && !prop.description) {
                    prop.description = topLevelEnum.description;
                }
                prop.children = [];
            } else if (!visitedRefs.has(refName)) {
                // Это сложная схема с properties - парсить только если еще не посещена
                const newVisited = new Set(visitedRefs);
                newVisited.add(refName);
                const schemaPath = this.fileService.resolveRelativePath(currentFilePath, refPath);
                const nested = await this.parseSchemaDtoRecursive(refContent, depth + 1, newVisited, schemaPath, projectState);
                prop.children = nested.fields;
            }
        }
    }

    /**
     * Парсит enum на верхнем уровне схемы (без properties)
     * Возвращает объект с type, enumValues, example, description или null если это не простой enum
     */
    parseTopLevelEnum(content) {
        // Проверить, есть ли properties - если да, это не простой enum
        if (content.includes('properties:')) {
            return null;
        }

        // Проверить наличие enum на верхнем уровне
        const enumMatch = content.match(/^enum:\s*$/m);
        if (!enumMatch) {
            return null;
        }

        const result = {
            enumValues: [],
            type: 'string',
            example: '',
            description: ''
        };

        // Извлечь type
        const typeMatch = content.match(/^type:\s*(\w+)/m);
        if (typeMatch) {
            result.type = typeMatch[1];
        }

        // Извлечь description
        const descMatch = content.match(/^description:\s*(.+)/m);
        if (descMatch) {
            result.description = descMatch[1].trim();
        }

        // Извлечь enum значения
        const enumIdx = content.indexOf('enum:');
        if (enumIdx !== -1) {
            const afterEnum = content.substring(enumIdx + 5);
            const lines = afterEnum.split('\n');
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                if (trimmed.startsWith('-')) {
                    let enumVal = trimmed.substring(1).trim();
                    // Убрать кавычки если есть
                    if ((enumVal.startsWith('"') && enumVal.endsWith('"')) || 
                        (enumVal.startsWith("'") && enumVal.endsWith("'"))) {
                        enumVal = enumVal.slice(1, -1);
                    }
                    result.enumValues.push(enumVal);
                } else if (!trimmed.startsWith('type') && !trimmed.startsWith('description')) {
                    // Встретили другое поле на том же уровне - конец enum
                    break;
                }
            }
        }

        // Установить первое значение как пример
        if (result.enumValues.length > 0) {
            result.example = result.enumValues[0];
            return result;
        }

        return null;
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
