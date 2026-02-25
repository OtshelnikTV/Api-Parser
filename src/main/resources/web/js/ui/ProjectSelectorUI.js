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
        this.projects = []; // Сохраняем список проектов
        
        this.setupEventListeners();
        this.loadProjects();
    }

    setupEventListeners() {
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

    async loadProjects() {
        LoadingOverlay.show('Загрузка проектов...');

        try {
            this.projects = await this.fileService.discoverProjects();
            this.displayProjects(this.projects);
            LoadingOverlay.hide();
        } catch (error) {
            console.error('Error loading projects:', error);
            NotificationService.show('Ошибка загрузки проектов: ' + error.message, 'error');
            LoadingOverlay.hide();
        }
    }

    displayProjects(projects) {
        const container = document.getElementById('project-list-container');
        const list = document.getElementById('project-list');
        
        if (projects.length === 0) {
            container.style.display = 'none';
            NotificationService.show('Проекты не найдены', 'warning');
            return;
        }

        container.style.display = 'block';
        list.innerHTML = '';

        projects.forEach(project => {
            const item = document.createElement('div');
            item.className = 'project-item';
            item.dataset.projectName = project.name;
            item.innerHTML = `
                <div class="project-name">${project.name}</div>
                <div class="project-path">${project.rootPath}</div>
                <div class="project-files">${project.fileCount} файлов</div>
            `;
            list.appendChild(item);
        });
    }

    onProjectSelected(projectName) {
        // Снять выделение с предыдущего
        document.querySelectorAll('.project-item').forEach(item => {
            item.classList.remove('selected');
        });

        // Выделить выбранный
        const selectedItem = document.querySelector(`[data-project-name="${projectName}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }

        this.projectState.selectedProject = projectName;
        document.getElementById('btn-save-project').disabled = false;
    }

    saveAndProceed() {
        if (!this.projectState.selectedProject) return;
        
        this.projectState.projectRoot = this.projectState.selectedProject;
        this.onNext();
    }

    show() {
        DOMHelpers.showModal('setup-project');
    }

    hide() {
        DOMHelpers.hideModal('setup-project');
    }
}

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

        // Найти объект проекта
        const selectedProject = this.projects.find(p => p.name === projectName);
        if (!selectedProject) {
            NotificationService.error('Проект не найден');
            return;
        }

        this.projectState.selectedProjectName = projectName;

        LoadingOverlay.show('Индексация проекта...');
        LoadingOverlay.updateProgress(`Загрузка ${projectName}...`);

        setTimeout(async () => {
            try {
                const result = await this.fileService.indexProject(selectedProject, this.projectState);

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
