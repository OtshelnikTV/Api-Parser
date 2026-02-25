import { DOMHelpers } from '../utils/DOMHelpers.js';
import { LoadingOverlay } from '../utils/LoadingOverlay.js';
import { NotificationService } from '../utils/NotificationService.js';

/**
 * UI компонент для выбора проекта (Шаг 1)
 */
export class ProjectSelectorUI {
    constructor(fileService, projectState, onNext) {
        this.fileService = fileService;
        this.projectState = projectState;
        this.onNext = onNext;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Обработчик выбора папки
        document.getElementById('project-folder-input').addEventListener('change', (e) => {
            this.onFolderSelected(e.target.files);
        });

        // Обработчик кнопки "Далее"
        document.getElementById('btn-save-project').addEventListener('click', () => {
            this.saveAndProceed();
        });

        // Обработчик выбора проекта
        document.addEventListener('click', (e) => {
            const projectItem = e.target.closest('.project-item');
            if (projectItem && projectItem.dataset.projectName) {
                this.onProjectSelected(projectItem.dataset.projectName);
            }
        });
    }

    async onFolderSelected(files) {
        if (!files || files.length === 0) return;

        LoadingOverlay.show('Сканирование проектов...');
        LoadingOverlay.updateProgress(`Анализ ${files.length} файлов...`);

        // Небольшая задержка для показа индикатора
        setTimeout(async () => {
            try {
                // Обнаружить все проекты
                const projects = this.fileService.discoverProjects(files);

                if (projects.length === 0) {
                    throw new Error('Не найдено ни одного проекта с openapi.yaml');
                }

                this.projectState.availableProjects = projects;

                // Отобразить список проектов
                this.displayProjects(projects);

                document.getElementById('project-folder-path').textContent = 
                    files[0].webkitRelativePath.split('/')[0];
                document.getElementById('project-folder-picker').classList.add('active');

                LoadingOverlay.hide();
            } catch (error) {
                console.error(error);
                NotificationService.error('Ошибка: ' + error.message);
                LoadingOverlay.hide();
            }
        }, 50);
    }

    displayProjects(projects) {
        const container = document.getElementById('project-list-container');
        const projectList = document.getElementById('project-list');

        projectList.innerHTML = '';

        for (const project of projects) {
            const projectItem = document.createElement('div');
            projectItem.className = 'project-item';
            projectItem.dataset.projectName = project.name;
            projectItem.innerHTML = `
                <div class="project-item-icon">📦</div>
                <div class="project-item-content">
                    <div class="project-item-name">${DOMHelpers.escape(project.name)}</div>
                    <div class="project-item-info">${project.fileCount} файлов</div>
                </div>
            `;
            projectList.appendChild(projectItem);
        }

        container.style.display = 'block';
    }

    async onProjectSelected(projectName) {
        // Убрать предыдущее выделение
        document.querySelectorAll('.project-item').forEach(el => {
            el.classList.remove('selected');
        });

        // Выделить выбранный проект
        const selectedEl = document.querySelector(`[data-project-name="${projectName}"]`);
        if (selectedEl) {
            selectedEl.classList.add('selected');
        }

        this.projectState.selectedProjectName = projectName;

        LoadingOverlay.show('Индексация проекта...');
        LoadingOverlay.updateProgress(`Загрузка ${projectName}...`);

        setTimeout(async () => {
            try {
                const result = await this.fileService.indexProject(projectName, this.projectState);

                document.getElementById('project-file-count').textContent =
                    `${result.endpointsCount} endpoints, ${result.schemasCount} schemas`;
                document.getElementById('btn-save-project').disabled = false;

                LoadingOverlay.hide();
                NotificationService.success(`Проект ${projectName} загружен`);
            } catch (error) {
                console.error(error);
                NotificationService.error('Ошибка: ' + error.message);
                LoadingOverlay.hide();
            }
        }, 50);
    }

    saveAndProceed() {
        if (!this.projectState.isProjectReady()) {
            NotificationService.error('Не найдены endpoints');
            return;
        }
        
        this.onNext();
    }

    show() {
        DOMHelpers.hideAllScreens();
        DOMHelpers.show('setup-project');
    }
}
