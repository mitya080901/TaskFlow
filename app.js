/**
 * TaskFlow — Локальный трекер задач
 * Основной модуль приложения (app.js)
 *
 * Архитектура: модульный JS без сторонних зависимостей.
 * Хранилище: localStorage (персистентность без бэкенда).
 */

/* ===== КОНСТАНТЫ ===== */
const STORAGE_KEY = 'taskflow_tasks';

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

const STATUS_LABELS = {
  todo: 'К выполнению',
  inprogress: 'В процессе',
  done: 'Выполнено'
};

const PRIORITY_LABELS = {
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий'
};

/* ===== МОДЕЛЬ ДАННЫХ =====
 * Task {
 *   id        : string   — уникальный идентификатор (UUID-like)
 *   title     : string   — название задачи (обязательно)
 *   description: string  — подробное описание
 *   tags      : string[] — массив тегов
 *   priority  : 'high'|'medium'|'low'
 *   status    : 'todo'|'inprogress'|'done'
 *   deadline  : string   — ISO date string или ''
 *   createdAt : string   — ISO datetime
 *   updatedAt : string   — ISO datetime
 * }
 */

/* ===== СОСТОЯНИЕ ПРИЛОЖЕНИЯ ===== */
const state = {
  tasks: [],          // массив задач
  editingId: null,    // ID редактируемой задачи (null = создание)
  viewingId: null,    // ID просматриваемой задачи
  formStatus: 'todo'  // выбранный статус в форме
};

/* ===== УТИЛИТЫ ===== */

/**
 * Генерирует псевдо-UUID для идентификации задач.
 * @returns {string}
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Форматирует дату в читаемый вид (ru-RU).
 * @param {string} isoDate
 * @returns {string}
 */
function formatDate(isoDate) {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Определяет, просрочена ли задача.
 * @param {string} isoDate
 * @param {string} status
 * @returns {boolean}
 */
function isOverdue(isoDate, status) {
  if (!isoDate || status === 'done') return false;
  return new Date(isoDate) < new Date(new Date().toDateString());
}

/**
 * Экранирует HTML-спецсимволы для безопасного вывода.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, m => map[m]);
}

/* ===== ХРАНИЛИЩЕ ===== */

/** Загружает задачи из localStorage. */
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state.tasks = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('[TaskFlow] Ошибка чтения localStorage:', e);
    state.tasks = [];
  }
}

/** Сохраняет задачи в localStorage. */
function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  } catch (e) {
    console.error('[TaskFlow] Ошибка записи localStorage:', e);
    showToast('Не удалось сохранить данные', 'error');
  }
}

/* ===== CRUD ОПЕРАЦИИ ===== */

/**
 * Создаёт новую задачу и добавляет в массив.
 * @param {object} data — поля задачи
 * @returns {object} созданная задача
 */
function createTask(data) {
  const now = new Date().toISOString();
  const task = {
    id: generateId(),
    title: data.title.trim(),
    description: (data.description || '').trim(),
    tags: parseTags(data.tags),
    priority: data.priority || 'medium',
    status: data.status || 'todo',
    deadline: data.deadline || '',
    createdAt: now,
    updatedAt: now
  };
  state.tasks.unshift(task);
  saveTasks();
  return task;
}

/**
 * Обновляет существующую задачу по ID.
 * @param {string} id
 * @param {object} data — новые значения полей
 * @returns {object|null} обновлённая задача или null
 */
function updateTask(id, data) {
  const index = state.tasks.findIndex(t => t.id === id);
  if (index === -1) return null;

  const task = state.tasks[index];
  state.tasks[index] = {
    ...task,
    title: (data.title || task.title).trim(),
    description: (data.description !== undefined ? data.description : task.description).trim(),
    tags: parseTags(data.tags !== undefined ? data.tags : task.tags.join(', ')),
    priority: data.priority || task.priority,
    status: data.status || task.status,
    deadline: data.deadline !== undefined ? data.deadline : task.deadline,
    updatedAt: new Date().toISOString()
  };
  saveTasks();
  return state.tasks[index];
}

/**
 * Удаляет задачу по ID.
 * @param {string} id
 * @returns {boolean} успех операции
 */
function deleteTask(id) {
  const before = state.tasks.length;
  state.tasks = state.tasks.filter(t => t.id !== id);
  if (state.tasks.length < before) {
    saveTasks();
    return true;
  }
  return false;
}

/**
 * Удаляет все задачи со статусом 'done'.
 * @returns {number} количество удалённых задач
 */
function clearDoneTasks() {
  const count = state.tasks.filter(t => t.status === 'done').length;
  state.tasks = state.tasks.filter(t => t.status !== 'done');
  saveTasks();
  return count;
}

/* ===== ФИЛЬТРАЦИЯ И СОРТИРОВКА ===== */

/**
 * Возвращает отфильтрованный и отсортированный массив задач.
 * @returns {Task[]}
 */
function getFilteredTasks() {
  const query = document.getElementById('searchInput').value.toLowerCase();
  const priority = document.getElementById('filterPriority').value;
  const sort = document.getElementById('sortSelect').value;

  let tasks = [...state.tasks];

  // Фильтр по тексту (по заголовку, описанию и тегам)
  if (query) {
    tasks = tasks.filter(t =>
      t.title.toLowerCase().includes(query) ||
      t.description.toLowerCase().includes(query) ||
      t.tags.some(tag => tag.toLowerCase().includes(query))
    );
  }

  // Фильтр по приоритету
  if (priority) {
    tasks = tasks.filter(t => t.priority === priority);
  }

  // Сортировка
  tasks.sort((a, b) => {
    switch (sort) {
      case 'created_asc':
        return new Date(a.createdAt) - new Date(b.createdAt);
      case 'priority':
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      case 'deadline': {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline) - new Date(b.deadline);
      }
      default: // created_desc
        return new Date(b.createdAt) - new Date(a.createdAt);
    }
  });

  return tasks;
}

/* ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===== */

/**
 * Парсит строку тегов в массив.
 * @param {string|string[]} input
 * @returns {string[]}
 */
function parseTags(input) {
  if (Array.isArray(input)) return input.filter(Boolean);
  return input.split(',').map(t => t.trim()).filter(Boolean);
}

/* ===== РЕНДЕРИНГ ===== */

/**
 * Генерирует HTML карточки задачи.
 * @param {object} task
 * @returns {string}
 */
function renderTaskCard(task) {
  const overdueFlag = isOverdue(task.deadline, task.status);
  const dateLabel = task.deadline
    ? `<span class="task-date ${overdueFlag ? 'overdue' : ''}">
         <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
           <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
         </svg>
         ${overdueFlag ? '⚠ ' : ''}${formatDate(task.deadline)}
       </span>`
    : '<span class="task-date">Без дедлайна</span>';

  const tagsHtml = task.tags.length
    ? `<div class="task-tags">${task.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`
    : '';

  const descHtml = task.description
    ? `<div class="task-desc">${escapeHtml(task.description)}</div>`
    : '';

  return `
    <div class="task-card priority-${task.priority} ${task.status === 'done' ? 'done-card' : ''}"
         data-id="${task.id}">
      <div class="task-top">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <span class="priority-badge ${task.priority}">${PRIORITY_LABELS[task.priority]}</span>
      </div>
      ${descHtml}
      ${tagsHtml}
      <div class="task-footer">
        ${dateLabel}
        <div class="task-actions">
          <button class="icon-btn edit-btn" data-id="${task.id}" title="Редактировать">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="icon-btn delete btn delete-btn" data-id="${task.id}" title="Удалить">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6m4-6v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>`;
}

/**
 * Генерирует пустое состояние колонки.
 * @returns {string}
 */
function renderEmptyState() {
  return `<div class="empty-state">
    <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
      <rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 12l2 2 4-4"/>
    </svg>
    <p>Нет задач</p>
  </div>`;
}

/**
 * Основной метод рендеринга — перерисовывает всю доску.
 */
function render() {
  const tasks = getFilteredTasks();

  const columns = { todo: [], inprogress: [], done: [] };

  // Распределяем задачи по колонкам
  tasks.forEach(task => {
    if (columns[task.status]) columns[task.status].push(task);
  });

  // Отрисовываем каждую колонку
  Object.entries(columns).forEach(([status, colTasks]) => {
    const list = document.getElementById(`list-${status}`);
    const count = document.getElementById(`cnt-${status}`);

    count.textContent = colTasks.length;
    list.innerHTML = colTasks.length
      ? colTasks.map(renderTaskCard).join('')
      : renderEmptyState();
  });

  // Обновляем статистику в шапке
  const total = state.tasks.length;
  const done = state.tasks.filter(t => t.status === 'done').length;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statDone').textContent = done;

  // Обновляем прогресс-бар
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressPct').textContent = pct + '%';
}

/* ===== ФОРМА СОЗДАНИЯ / РЕДАКТИРОВАНИЯ ===== */

/** Открывает модальное окно формы. */
function openFormModal(task = null) {
  state.editingId = task ? task.id : null;
  state.formStatus = task ? task.status : 'todo';

  document.getElementById('modalTitle').textContent = task ? 'Редактировать задачу' : 'Новая задача';
  document.getElementById('fTitle').value = task ? task.title : '';
  document.getElementById('fDesc').value = task ? task.description : '';
  document.getElementById('fTags').value = task ? task.tags.join(', ') : '';
  document.getElementById('fPriority').value = task ? task.priority : 'medium';
  document.getElementById('fDeadline').value = task ? task.deadline : '';

  updateStatusButtons(state.formStatus);

  document.getElementById('formModal').classList.add('open');
  document.getElementById('fTitle').focus();
}

/** Закрывает модальное окно формы. */
function closeFormModal() {
  document.getElementById('formModal').classList.remove('open');
  state.editingId = null;
}

/** Обновляет визуальное состояние кнопок выбора статуса. */
function updateStatusButtons(activeStatus) {
  document.querySelectorAll('#statusGroup .status-opt').forEach(btn => {
    btn.className = 'status-opt';
    if (btn.dataset.value === activeStatus) {
      btn.classList.add(`active-${activeStatus}`);
    }
  });
}

/** Обрабатывает сохранение формы. */
function handleSave() {
  const title = document.getElementById('fTitle').value.trim();

  // Валидация: обязательное поле
  if (!title) {
    document.getElementById('fTitle').style.borderColor = 'var(--danger)';
    showToast('Введите название задачи', 'error');
    setTimeout(() => document.getElementById('fTitle').style.borderColor = '', 1500);
    return;
  }

  const data = {
    title,
    description: document.getElementById('fDesc').value,
    tags: document.getElementById('fTags').value,
    priority: document.getElementById('fPriority').value,
    status: state.formStatus,
    deadline: document.getElementById('fDeadline').value
  };

  if (state.editingId) {
    updateTask(state.editingId, data);
    showToast('Задача обновлена', 'success');
  } else {
    createTask(data);
    showToast('Задача создана', 'success');
  }

  closeFormModal();
  render();
}

/* ===== МОДАЛЬНОЕ ОКНО ПРОСМОТРА ===== */

/** Открывает карточку просмотра задачи. */
function openViewModal(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  state.viewingId = id;
  document.getElementById('viewTitle').textContent = task.title;

  const overdueFlag = isOverdue(task.deadline, task.status);
  document.getElementById('viewBody').innerHTML = `
    <div class="view-field">
      <div class="field-label">Статус</div>
      <div class="field-value">${STATUS_LABELS[task.status]}</div>
    </div>
    <div class="view-field">
      <div class="field-label">Приоритет</div>
      <div class="field-value">${PRIORITY_LABELS[task.priority]}</div>
    </div>
    ${task.description ? `<div class="view-field">
      <div class="field-label">Описание</div>
      <div class="field-value">${escapeHtml(task.description)}</div>
    </div>` : ''}
    ${task.tags.length ? `<div class="view-field">
      <div class="field-label">Теги</div>
      <div class="field-value task-tags">${task.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>
    </div>` : ''}
    <div class="view-field">
      <div class="field-label">Дедлайн</div>
      <div class="field-value ${overdueFlag ? 'overdue' : ''}">${task.deadline ? formatDate(task.deadline) + (overdueFlag ? ' — просрочено!' : '') : 'Не установлен'}</div>
    </div>
    <div class="view-field">
      <div class="field-label">Создана</div>
      <div class="field-value">${formatDate(task.createdAt)}</div>
    </div>
  `;

  document.getElementById('viewModal').classList.add('open');
}

/** Закрывает окно просмотра. */
function closeViewModal() {
  document.getElementById('viewModal').classList.remove('open');
  state.viewingId = null;
}

/* ===== УВЕДОМЛЕНИЯ ===== */

let toastTimer = null;

/**
 * Показывает всплывающее уведомление.
 * @param {string} message
 * @param {'success'|'error'|''} type
 */
function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

/* ===== ДЕМО-ДАННЫЕ ===== */

/**
 * Загружает демонстрационные задачи при первом запуске.
 * Позволяет пользователю сразу увидеть работу приложения.
 */
function loadDemoData() {
  const demo = [
    {
      title: 'Провести встречу с инвестором',
      description: 'Подготовить презентацию MVP, собрать метрики, сформулировать roadmap.',
      tags: ['встреча', 'инвесторы', 'важно'],
      priority: 'high',
      status: 'todo',
      deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    },
    {
      title: 'Разработать дизайн главной страницы',
      description: 'Figma-макет + адаптив для мобильных устройств.',
      tags: ['дизайн', 'ui'],
      priority: 'high',
      status: 'inprogress',
      deadline: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
    },
    {
      title: 'Написать unit-тесты для модуля авторизации',
      description: '',
      tags: ['тесты', 'бэкенд'],
      priority: 'medium',
      status: 'todo',
      deadline: ''
    },
    {
      title: 'Настроить CI/CD pipeline',
      description: 'GitHub Actions — автодеплой на staging-сервер.',
      tags: ['devops', 'ci'],
      priority: 'medium',
      status: 'inprogress',
      deadline: ''
    },
    {
      title: 'Зарегистрировать домен и хостинг',
      description: 'Купить домен .ru или .io на REG.RU',
      tags: ['инфра'],
      priority: 'low',
      status: 'done',
      deadline: ''
    }
  ];

  demo.forEach(d => createTask(d));
}

/* ===== ИНИЦИАЛИЗАЦИЯ И ОБРАБОТЧИКИ СОБЫТИЙ ===== */

function init() {
  loadTasks();

  // Загружаем демо-данные при первом запуске
  if (state.tasks.length === 0) {
    loadDemoData();
  }

  render();

  // --- Кнопки открытия/закрытия формы ---
  document.getElementById('openCreateBtn').addEventListener('click', () => openFormModal());
  document.getElementById('cancelBtn').addEventListener('click', closeFormModal);
  document.getElementById('saveBtn').addEventListener('click', handleSave);

  // Закрытие по клику на overlay
  document.getElementById('formModal').addEventListener('click', e => {
    if (e.target === document.getElementById('formModal')) closeFormModal();
  });

  // --- Выбор статуса в форме ---
  document.querySelectorAll('#statusGroup .status-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      state.formStatus = btn.dataset.value;
      updateStatusButtons(state.formStatus);
    });
  });

  // --- Enter в поле названия ---
  document.getElementById('fTitle').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSave();
  });

  // --- Просмотр/редактирование/удаление через делегирование событий ---
  document.querySelector('.board').addEventListener('click', e => {
    const editBtn = e.target.closest('.edit-btn');
    const deleteBtn = e.target.closest('.delete-btn');
    const card = e.target.closest('.task-card');

    if (editBtn) {
      e.stopPropagation();
      const task = state.tasks.find(t => t.id === editBtn.dataset.id);
      if (task) openFormModal(task);
      return;
    }

    if (deleteBtn) {
      e.stopPropagation();
      if (confirm('Удалить задачу?')) {
        deleteTask(deleteBtn.dataset.id);
        render();
        showToast('Задача удалена');
      }
      return;
    }

    if (card) {
      openViewModal(card.dataset.id);
    }
  });

  // --- Окно просмотра ---
  document.getElementById('viewCloseBtn').addEventListener('click', closeViewModal);
  document.getElementById('viewModal').addEventListener('click', e => {
    if (e.target === document.getElementById('viewModal')) closeViewModal();
  });

  document.getElementById('viewEditBtn').addEventListener('click', () => {
    const task = state.tasks.find(t => t.id === state.viewingId);
    closeViewModal();
    if (task) openFormModal(task);
  });

  document.getElementById('viewDeleteBtn').addEventListener('click', () => {
    if (confirm('Удалить задачу?')) {
      deleteTask(state.viewingId);
      closeViewModal();
      render();
      showToast('Задача удалена');
    }
  });

  // --- Фильтры и поиск ---
  document.getElementById('searchInput').addEventListener('input', render);
  document.getElementById('filterPriority').addEventListener('change', render);
  document.getElementById('sortSelect').addEventListener('change', render);

  // --- Очистить выполненные ---
  document.getElementById('clearDoneBtn').addEventListener('click', () => {
    const count = clearDoneTasks();
    if (count > 0) {
      render();
      showToast(`Удалено ${count} выполненных задач`, 'success');
    } else {
      showToast('Нет выполненных задач');
    }
  });

  // --- Горячие клавиши ---
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeFormModal();
      closeViewModal();
    }
    // Ctrl+N — новая задача
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      openFormModal();
    }
  });
}

// Запуск приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', init);
