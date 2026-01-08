// Modal Management Functions
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        // Focus on first input if exists
        const input = modal.querySelector('.input-field');
        if (input) {
            setTimeout(() => input.focus(), 100);
        }
    }
}

// Confirmation Modal
function showConfirmation(message, onConfirm, onCancel, icon = '⚠️') {
    const modal = document.getElementById('confirmation-modal');
    const msgEl = document.getElementById('confirmation-message');
    const iconEl = document.getElementById('confirmation-icon');
    const actionBtn = document.getElementById('confirmation-action-btn');

    if (msgEl) msgEl.textContent = message;
    if (iconEl) iconEl.textContent = icon;

    actionBtn.onclick = function() {
        if (onConfirm) onConfirm();
        closeModal('confirmation-modal');
    };

    const closeBtn = modal.querySelector('.modal-close');
    closeBtn.onclick = function() {
        if (onCancel) onCancel();
        closeModal('confirmation-modal');
    };

    openModal('confirmation-modal');
}

// Alert Modal
function showAlert(title, message, icon = 'ℹ️') {
    const modal = document.getElementById('alert-modal');
    const titleEl = document.getElementById('alert-title');
    const msgEl = document.getElementById('alert-message');
    const iconEl = document.getElementById('alert-icon');

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (iconEl) iconEl.textContent = icon;

    openModal('alert-modal');
}

// Input Modal
function showInputModal(title, label, placeholder, onSubmit, defaultValue = '') {
    const modal = document.getElementById('input-modal');
    const titleEl = document.getElementById('input-modal-title');
    const labelEl = document.getElementById('input-modal-label');
    const inputField = document.getElementById('input-modal-field');
    const submitBtn = document.getElementById('input-modal-submit-btn');

    if (titleEl) titleEl.textContent = title;
    if (labelEl) labelEl.textContent = label;
    if (inputField) {
        inputField.placeholder = placeholder;
        inputField.value = defaultValue;
    }

    submitBtn.onclick = function() {
        const value = inputField.value.trim();
        if (!value) {
            const errorEl = document.getElementById('input-modal-error');
            if (errorEl) {
                errorEl.textContent = `${label} is required`;
                errorEl.classList.add('show');
            }
            return;
        }
        if (onSubmit) onSubmit(value);
        closeModal('input-modal');
    };

    inputField.onkeypress = function(e) {
        if (e.key === 'Enter') submitBtn.click();
    };

    openModal('input-modal');
}

// Delete Modal
function showDeleteConfirmation(itemName, onConfirm) {
    const modal = document.getElementById('delete-modal');
    const nameEl = document.getElementById('delete-item-name');
    const confirmBtn = document.getElementById('delete-confirm-btn');

    if (nameEl) nameEl.textContent = itemName;

    confirmBtn.onclick = function() {
        if (onConfirm) onConfirm();
        closeModal('delete-modal');
    };

    openModal('delete-modal');
}

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.style.display = 'none';
    }
});

// Prevent modal close on inner content click
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
        e.stopPropagation();
    }
});

console.log('[Modals] Modal functions loaded and available globally');
// Ensure functions are explicitly available on the window object for callers
try {
    window.openModal = openModal;
    window.closeModal = closeModal;
    window.showConfirmation = showConfirmation;
    window.showAlert = showAlert;
    window.showInputModal = showInputModal;
    window.showDeleteConfirmation = showDeleteConfirmation;
    console.log('[Modals] Modal functions attached to window object');
} catch (e) {
    console.warn('[Modals] Unable to attach modal functions to window', e);
}
