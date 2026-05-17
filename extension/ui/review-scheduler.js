const reviewsKey = 'scheduledReviews';

function getSelectedFrequency() {
  return document.querySelector('.option-card.selected')?.dataset.frequency;
}

function calculateNextRun(frequency, time) {
  const now = new Date();
  const [hours, minutes] = time.split(':').map(Number);

  const nextRun = new Date(now);
  nextRun.setHours(hours, minutes, 0, 0);

  if (frequency === 'daily') {
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
  } else if (frequency === 'weekly') {
    nextRun.setDate(nextRun.getDate() + 7);
  } else if (frequency === 'biweekly') {
    nextRun.setDate(nextRun.getDate() + 14);
  } else if (frequency === 'monthly') {
    nextRun.setMonth(nextRun.getMonth() + 1);
  }

  return nextRun.toISOString();
}

function clearForm() {
  document.getElementById('site-url').value = '';
  document.getElementById('review-name').value = '';
  document.getElementById('review-notes').value = '';
  document.getElementById('schedule-time').value = '09:00';
  document.querySelectorAll('.option-card').forEach(card => card.classList.remove('selected'));
  document.querySelector('[data-frequency="weekly"]')?.classList.add('selected');
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #28a745;
    color: white;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 1000;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  window.setTimeout(() => {
    notification.remove();
  }, 3000);
}

function renderEmptyState(listContainer) {
  listContainer.innerHTML = `
    <div class="empty-state">
      <p>No reviews scheduled yet. Create your first review above!</p>
    </div>
  `;
}

function renderReviews(reviews) {
  const listContainer = document.getElementById('reviews-list');
  if (!listContainer) {
    return;
  }

  if (reviews.length === 0) {
    renderEmptyState(listContainer);
    return;
  }

  listContainer.replaceChildren(...reviews.map(review => {
    const item = document.createElement('div');
    item.className = 'review-item';

    const info = document.createElement('div');
    info.className = 'review-info';

    const title = document.createElement('h4');
    title.textContent = review.name;

    const details = document.createElement('p');
    details.textContent = `${review.url} • ${review.frequency} at ${review.time} • Next: ${new Date(review.nextRun).toLocaleDateString()}`;

    info.append(title, details);

    const actions = document.createElement('div');
    actions.className = 'review-actions';

    const editButton = document.createElement('button');
    editButton.className = 'btn btn-small btn-secondary';
    editButton.dataset.action = 'edit-review';
    editButton.dataset.reviewId = review.id;
    editButton.textContent = 'Edit';

    const deleteButton = document.createElement('button');
    deleteButton.className = 'btn btn-small btn-danger';
    deleteButton.dataset.action = 'delete-review';
    deleteButton.dataset.reviewId = review.id;
    deleteButton.textContent = 'Delete';

    actions.append(editButton, deleteButton);
    item.append(info, actions);

    return item;
  }));
}

function loadReviews() {
  chrome.storage.local.get([reviewsKey], (result) => {
    renderReviews(result[reviewsKey] || []);
  });
}

function scheduleReview() {
  const url = document.getElementById('site-url').value;
  const name = document.getElementById('review-name').value;
  const frequency = getSelectedFrequency();
  const time = document.getElementById('schedule-time').value;
  const notes = document.getElementById('review-notes').value;

  if (!url || !name || !frequency) {
    window.alert('Please fill in all required fields');
    return;
  }

  const review = {
    id: Date.now().toString(),
    url,
    name,
    frequency,
    time,
    notes,
    createdAt: new Date().toISOString(),
    nextRun: calculateNextRun(frequency, time),
  };

  chrome.storage.local.get([reviewsKey], (result) => {
    const reviews = result[reviewsKey] || [];
    chrome.storage.local.set({ [reviewsKey]: [...reviews, review] }, () => {
      clearForm();
      loadReviews();
      showNotification('Review scheduled successfully!');
    });
  });
}

function deleteReview(id) {
  if (!window.confirm('Are you sure you want to delete this scheduled review?')) {
    return;
  }

  chrome.storage.local.get([reviewsKey], (result) => {
    const reviews = result[reviewsKey] || [];
    const filtered = reviews.filter(review => review.id !== id);
    chrome.storage.local.set({ [reviewsKey]: filtered }, () => {
      loadReviews();
      showNotification('Review deleted');
    });
  });
}

function editReview() {
  showNotification('Edit functionality coming soon!');
}

function initializeFrequencySelection() {
  document.querySelectorAll('.option-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.option-card').forEach(item => item.classList.remove('selected'));
      card.classList.add('selected');
    });
  });

  document.querySelector('[data-frequency="weekly"]')?.classList.add('selected');
}

function initializeActions() {
  document.getElementById('schedule-review-button')?.addEventListener('click', scheduleReview);
  document.getElementById('clear-review-form-button')?.addEventListener('click', clearForm);
  document.getElementById('reviews-list')?.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const button = event.target.closest('button[data-action]');
    if (!button) {
      return;
    }

    if (button.dataset.action === 'delete-review') {
      deleteReview(button.dataset.reviewId);
    }

    if (button.dataset.action === 'edit-review') {
      editReview(button.dataset.reviewId);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initializeFrequencySelection();
  initializeActions();
  loadReviews();
});
