// Admin Sidebar Notification Badges
// Adds unread count bubbles to Feedback, Questions & Refunds nav links
(function () {
  const style = document.createElement('style');
  style.textContent = `
    aside nav a { display: flex; align-items: center; position: relative; }
    .sidebar-badge {
      margin-left: auto;
      background: #ef4444;
      color: #fff;
      font-size: 0.7rem;
      font-weight: 700;
      min-width: 18px;
      height: 18px;
      line-height: 18px;
      text-align: center;
      border-radius: 9px;
      padding: 0 5px;
      box-shadow: 0 1px 3px rgba(239,68,68,0.4);
      animation: badgePop 0.3s ease-out;
    }
    @keyframes badgePop {
      0% { transform: scale(0); }
      100% { transform: scale(1); }
    }
  `;
  document.head.appendChild(style);

  // Find nav links for Feedback, Questions, Refunds
  const badges = {};
  document.querySelectorAll('aside nav a').forEach(link => {
    const text = link.textContent.trim();
    const targets = {
      'Feedback': 'feedback',
      'Questions': 'questions',
      'Refunds': 'refunds',
      'Registration Requests': 'registrations',
      'Location Requests': 'locations'
    };
    if (targets[text]) {
      const key = targets[text];
      const span = document.createElement('span');
      span.className = 'sidebar-badge';
      span.style.display = 'none';
      link.appendChild(span);
      badges[key] = span;
    }
  });

  // Auto-mark as read when admin is on that page
  const page = window.location.pathname.split('/').pop();
  if (page === 'feedback-admin.html') {
    fetch(window.API_BASE_URL + '/api/admin/mark-read/feedback', { method: 'POST' }).catch(() => { });
  }
  if (page === 'questions-admin.html') {
    fetch(window.API_BASE_URL + '/api/admin/mark-read/questions', { method: 'POST' }).catch(() => { });
  }

  function updateBadges() {
    fetch(window.API_BASE_URL + '/api/admin/sidebar-counts')
      .then(r => r.json())
      .then(data => {
        Object.keys(badges).forEach(key => {
          const count = data[key] || 0;
          const badge = badges[key];
          // Hide badge on the page that was just marked read
          if (key === 'feedback' && page === 'feedback-admin.html') { badge.style.display = 'none'; return; }
          if (key === 'questions' && page === 'questions-admin.html') { badge.style.display = 'none'; return; }
          if (key === 'refunds' && page === 'refund-approval.html') { badge.style.display = 'none'; return; }
          if (key === 'registrations' && page === 'new-registration.html') { badge.style.display = 'none'; return; }
          if (key === 'locations' && page === 'location-requests.html') { badge.style.display = 'none'; return; }

          if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = '';
          } else {
            badge.style.display = 'none';
          }
        });
      })
      .catch(() => { });
  }

  updateBadges();
  setInterval(updateBadges, 30000);
})();
