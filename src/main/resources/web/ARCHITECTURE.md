# Архитектура API Doc Parser

## Диаграмма компонентов

```
┌─────────────────────────────────────────────────────────────────┐
│                            App.js                                │
│                   (Главный координатор)                          │
│  - Инициализация всех компонентов                               │
│  - Управление навигацией между экранами                         │
│  - Глобальная обработка событий (data-binding, actions)         │
│  - Координация взаимодействия между компонентами                │
└───────────────────┬─────────────────────────────────────────────┘
                    │
        ┌───────────┴──────────┬──────────────┬──────────────┐
        │                      │              │              │
        ▼                      ▼              ▼              ▼
┌──────────────┐      ┌──────────────┐  ┌────────────┐  ┌────────────┐
│   Models     │      │   Services   │  │   UI       │  │   Utils    │
└──────────────┘      └──────────────┘  └────────────┘  └────────────┘
```

## Детальная структура

### 1. Models (Модели данных)

```
┌─────────────────────────────────────────────┐
│           ParsedData                        │
│  - method, url, operationId                 │
│  - requestFields: Field[]                   │
│  - responseSchemas: ResponseSchema[]        │
│  - mapping: MappingEntry[]                  │
│  - dependencies: Dependency[]               │
│  - algorithm, notes                         │
│                                             │
│  + reset()                                  │
│  + getUnfilledCount(): number               │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│              Field                          │
│  - name, type, description                  │
│  - format, example, required                │
│  - depth, isArray, refName                  │
│  - children: Field[]                        │
│                                             │
│  + hasChildren(): boolean                   │
│  + getDisplayName(prefix): string           │
│  + getDisplayType(): string                 │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│          ProjectState                       │
│  - relevantFiles: Map<path, File>           │
│  - projectRoot: string                      │
│  - pathsFolders: Map<name, FolderInfo>      │
│  - schemaFiles: Map<name, File>             │
│  - selectedRequest, selectedMethod          │
│                                             │
│  + isProjectReady(): boolean                │
│  + getSelectedRequestFolder()               │
│  + getEndpointsList()                       │
└─────────────────────────────────────────────┘
```

### 2. Services (Бизнес-логика)

```
┌──────────────────────────────────────────────────────────┐
│                   FileService                            │
│  Работа с файлами и индексацией проекта                 │
│                                                          │
│  + readFile(file): Promise<string>                       │
│  + indexProject(files, state): Promise<IndexResult>      │
│  + parsePathsFromOpenapi(content): PathsMap              │
│  + resolveSchemaRef(refPath, currentFile, state)         │
│  + resolveRelativePath(from, relative): string           │
│  + extractTopLevelMethod(content, method): string        │
└──────────────────────────────────────────────────────────┘
                            ▲
                            │ использует
                            │
┌──────────────────────────────────────────────────────────┐
│              YamlParserService                           │
│  Парсинг YAML файлов и DTO схем                          │
│                                                          │
│  + parseSchemaDtoRecursive(content, depth, ...)          │
│  + resolveNestedRef(prop, refPath, ...)                  │
│  + extractSection(content, key): string                  │
│  + extractIndentedBlock(content, pos): string            │
│  + findSchemaRef(text): string                           │
└──────────────────────────────────────────────────────────┘
                            ▲
                            │ использует
                            │
┌──────────────────────────────────────────────────────────┐
│            EndpointParserService                         │
│  Парсинг endpoint и генерация данных                     │
│                                                          │
│  + parseEndpoint(state, parsedData)                      │
│  + parseMetadata(content, parsedData)                    │
│  + parseParameters(content, parsedData)                  │
│  + parseRequestBody(content, filePath, ...)              │
│  + parseResponses(content, filePath, ...)                │
│  + generateDefaults(parsedData)                          │
│  + parseExistingMarkdown(content): ExistingData          │
│  + mergeWithExistingData(existing, parsedData)           │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│          MarkdownGeneratorService                        │
│  Генерация Markdown документации                         │
│                                                          │
│  + generate(parsedData): string                          │
│  + buildAlignedTable(headers, rows): string              │
│  + fieldsToMdRows(fields, prefix, depth): Row[]          │
└──────────────────────────────────────────────────────────┘
```

### 3. UI Components (Компоненты интерфейса)

```
┌──────────────────────────────────────────────────────────┐
│              ProjectSelectorUI                           │
│  Шаг 1: Выбор проекта                                    │
│                                                          │
│  + show()                                                │
│  + onFolderSelected(files)                               │
│  + saveAndProceed()                                      │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│              RequestSelectorUI                           │
│  Шаг 2: Выбор запроса                                    │
│                                                          │
│  + show()                                                │
│  + renderRequestList(filter)                             │
│  + selectRequest(name)                                   │
│  + proceedToNext()                                       │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│              MethodSelectorUI                            │
│  Шаг 3: Выбор метода                                     │
│                                                          │
│  + show()                                                │
│  + renderMethodSelector(methods)                         │
│  + selectMethod(method)                                  │
│  + startParsing()                                        │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                   EditorUI                               │
│  Редактор спарсенных данных                              │
│                                                          │
│  + show()                                                │
│  + render()                                              │
│  + renderSection(id, title, type, content)               │
│  + renderGeneralInfo()                                   │
│  + renderRequestBody()                                   │
│  + renderFieldsTable(fields)                             │
│  + renderResponses()                                     │
│  + renderMapping()                                       │
│  + renderDependencies()                                  │
│  + renderLogic()                                         │
│  + renderNotes()                                         │
│  + updateUnfilledCount()                                 │
└──────────────────────────────────────────────────────────┘
```

### 4. Utils (Утилиты)

```
┌──────────────────────────────────────────────────────────┐
│                  DOMHelpers                              │
│  Работа с DOM                                            │
│                                                          │
│  + escape(string): string                                │
│  + show(element)                                         │
│  + hide(element)                                         │
│  + hideAllScreens()                                      │
│  + autoResize(textarea)                                  │
│  + enableAutoResizeForAll()                              │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│            NotificationService                           │
│  Уведомления                                             │
│                                                          │
│  + show(message, type)                                   │
│  + success(message)                                      │
│  + error(message)                                        │
│  + info(message)                                         │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│               LoadingOverlay                             │
│  Индикатор загрузки                                      │
│                                                          │
│  + show(message)                                         │
│  + hide()                                                │
│  + updateProgress(message)                               │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│               FieldHelpers                               │
│  Работа с полями                                         │
│                                                          │
│  + flattenFields(fields, prefix, depth): FlatField[]     │
│  + generateExampleFromFields(fields): Object             │
└──────────────────────────────────────────────────────────┘
```

## Поток данных

### Инициализация проекта

```
User selects folder
       │
       ▼
ProjectSelectorUI.onFolderSelected()
       │
       ▼
FileService.indexProject()
       │
       ├─► FileService.readFile(openapi.yaml)
       │   └─► FileService.parsePathsFromOpenapi()
       │
       ├─► FileService.readFile(endpoint files)
       │   └─► Detect HTTP methods
       │
       └─► Update ProjectState
           └─► Show success notification
```

### Парсинг endpoint

```
User selects endpoint & method
       │
       ▼
MethodSelectorUI.startParsing()
       │
       ▼
EndpointParserService.parseEndpoint()
       │
       ├─► FileService.extractTopLevelMethod()
       │   └─► Get method content
       │
       ├─► EndpointParserService.parseMetadata()
       │   └─► Extract tags, summary, operationId
       │
       ├─► EndpointParserService.parseParameters()
       │   └─► Extract query/path/header params
       │
       ├─► EndpointParserService.parseRequestBody()
       │   └─► YamlParserService.parseSchemaDtoRecursive()
       │       └─► Recursive parsing with nested refs
       │
       ├─► EndpointParserService.parseResponses()
       │   └─► YamlParserService.parseSchemaDtoRecursive()
       │
       ├─► EndpointParserService.generateDefaults()
       │   └─► Generate mapping, examples, algorithm
       │
       └─► Update ParsedData
           └─► EditorUI.show()
```

### Редактирование и сохранение

```
User edits fields
       │
       ▼
Data-binding (change event)
       │
       ▼
App.handleDataBinding()
       │
       └─► Update ParsedData
           └─► EditorUI.updateUnfilledCount()

User clicks "Сформировать read.md"
       │
       ▼
App.generateAndSave()
       │
       ▼
MarkdownGeneratorService.generate()
       │
       ├─► buildAlignedTable() for each section
       ├─► fieldsToMdRows() for nested fields
       │
       └─► Return Markdown string
           └─► Download file
```

## Принципы проектирования

### SOLID

1. **S**ingle Responsibility - каждый класс имеет одну ответственность
2. **O**pen/Closed - открыто для расширения, закрыто для модификации
3. **L**iskov Substitution - соблюдается через интерфейсы
4. **I**nterface Segregation - классы не зависят от неиспользуемых методов
5. **D**ependency Inversion - зависимости через конструктор (DI)

### Паттерны

- **MVC/MVVM** - разделение на Models, Views (UI), Controllers (Services)
- **Facade** - App.js скрывает сложность взаимодействия компонентов
- **Strategy** - разные сервисы для разных задач парсинга
- **Observer** - data-binding через события

### Модульность

- ES6 modules для чёткой изоляции
- Явные зависимости через import/export
- Отсутствие глобальных переменных

## Метрики

### Старая версия (монолит)
- **1 файл** - 1770 строк
- **Сложность** - высокая, всё связано
- **Тестируемость** - низкая
- **Расширяемость** - низкая

### Новая версия (модули)
- **15 файлов** - 100-500 строк каждый
- **Сложность** - низкая, изолированные модули
- **Тестируемость** - высокая
- **Расширяемость** - высокая
- **Поддерживаемость** - высокая
