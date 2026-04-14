// Seller Navbar Notification Badge
// Adds unread refund count bubble to the Refunds nav link
(function () {
  const style = document.createElement('style');
  style.textContent = `
    .navbar-nav .navbar-link { position: relative; }
    .seller-badge {
      position: absolute;
      top: -4px;
      right: -8px;
      background: #ef4444;
      color: #fff;
      font-size: 0.65rem;
      font-weight: 700;
      min-width: 16px;
      height: 16px;
      line-height: 16px;
      text-align: center;
      border-radius: 8px;
      padding: 0 4px;
      border: 2px solid #0a0a0a;
      animation: sellerBadgePop 0.3s ease-out;
    }
    @keyframes sellerBadgePop {
      0% { transform: scale(0); }
      100% { transform: scale(1); }
    }
  `;
  document.head.appendChild(style);

  // Get seller info from session
  const user = JSON.parse(sessionStorage.getItem('user') || '{}');
  if (!user.id || user.role !== 'seller') return;

  // Find the Refunds nav link
  let refundBadge = null;
  document.querySelectorAll('.navbar-link').forEach(link => {
    if (link.textContent.trim() === 'Refunds') {
      link.style.position = 'relative';
      const span = document.createElement('span');
      span.className = 'seller-badge';
      span.style.display = 'none';
      link.appendChild(span);
      refundBadge = span;
    }
  });

  if (!refundBadge) return;

  // Hide badge if currently on seller-refunds page
  const page = window.location.pathname.split('/').pop();

  function updateBadge() {
    fetch(`${window.API_BASE_URL}/api/seller/sidebar-counts/${user.id}`)
      .then(r => r.json())
      .then(data => {
        const count = data.refunds || 0;
        if (page === 'seller-refunds.html') { refundBadge.style.display = 'none'; return; }
        if (count > 0) {
          refundBadge.textContent = count > 99 ? '99+' : count;
          refundBadge.style.display = '';
        } else {
          refundBadge.style.display = 'none';
        }
      })
      .catch(() => {});
  }

  updateBadge();
  setInterval(updateBadge, 30000);
})();
