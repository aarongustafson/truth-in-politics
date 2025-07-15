// Main application JavaScript

class TruthInPoliticsApp {
  constructor() {
    this.init();
  }

  init() {
    this.setupAccessibility();
    this.setupNavigation();
    this.setupServiceWorker();
  }

  setupAccessibility() {
    // Announce page changes to screen readers
    this.announcePageChange();
    
    // Enhanced keyboard navigation
    this.setupKeyboardNavigation();
    
    // Focus management
    this.setupFocusManagement();
  }

  announcePageChange() {
    const pageTitle = document.title;
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = `Page loaded: ${pageTitle}`;
    document.body.appendChild(announcement);
    
    // Remove after announcement
    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }

  setupKeyboardNavigation() {
    // Escape key to close any open modals or expanded elements
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // Close mobile menu if open
        const navToggle = document.querySelector('.nav-toggle');
        const navMenu = document.querySelector('.nav-menu');
        if (navToggle && navToggle.getAttribute('aria-expanded') === 'true') {
          this.toggleMobileMenu(navToggle, navMenu);
        }
        
        // Close any open details elements
        const openDetails = document.querySelectorAll('details[open]');
        openDetails.forEach(detail => detail.removeAttribute('open'));
      }
    });
  }

  setupFocusManagement() {
    // Skip link functionality
    const skipLink = document.querySelector('.skip-link');
    if (skipLink) {
      skipLink.addEventListener('click', (e) => {
        e.preventDefault();
        const target = document.querySelector(skipLink.getAttribute('href'));
        if (target) {
          target.focus();
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }
  }

  setupNavigation() {
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('.nav-menu');
    
    if (navToggle && navMenu) {
      navToggle.addEventListener('click', () => {
        this.toggleMobileMenu(navToggle, navMenu);
      });

      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
          if (navToggle.getAttribute('aria-expanded') === 'true') {
            this.toggleMobileMenu(navToggle, navMenu);
          }
        }
      });

      // Close menu on window resize
      window.addEventListener('resize', () => {
        if (window.innerWidth > 768 && navToggle.getAttribute('aria-expanded') === 'true') {
          this.toggleMobileMenu(navToggle, navMenu);
        }
      });
    }
  }

  toggleMobileMenu(button, menu) {
    const isExpanded = button.getAttribute('aria-expanded') === 'true';
    
    button.setAttribute('aria-expanded', !isExpanded);
    menu.classList.toggle('open', !isExpanded);
    
    // Manage focus
    if (!isExpanded) {
      // Menu is opening, focus first link
      const firstLink = menu.querySelector('a');
      if (firstLink) {
        setTimeout(() => firstLink.focus(), 100);
      }
    }
  }

  setupServiceWorker() {
    // Register service worker for offline functionality
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then(registration => {
            console.log('SW registered: ', registration);
          })
          .catch(registrationError => {
            console.log('SW registration failed: ', registrationError);
          });
      });
    }
  }
}

// Utility functions
const utils = {
  // Debounce function for search inputs
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  // Format dates consistently
  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  },

  // Sanitize HTML to prevent XSS
  sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
  },

  // Calculate alignment score
  calculateAlignmentScore(statements, votes, positions) {
    // This would be implemented with actual comparison logic
    // For now, returning a placeholder
    return Math.floor(Math.random() * 100) + 1;
  },

  // Format politician name for URLs
  slugify(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  },

  // Show loading state
  showLoading(element, message = 'Loading...') {
    element.setAttribute('data-loading', 'true');
    element.setAttribute('aria-busy', 'true');
    
    const loadingEl = document.createElement('div');
    loadingEl.className = 'loading-indicator';
    loadingEl.setAttribute('aria-live', 'polite');
    loadingEl.textContent = message;
    
    element.appendChild(loadingEl);
  },

  // Hide loading state
  hideLoading(element) {
    element.removeAttribute('data-loading');
    element.removeAttribute('aria-busy');
    
    const loadingEl = element.querySelector('.loading-indicator');
    if (loadingEl) {
      loadingEl.remove();
    }
  },

  // Announce to screen readers
  announce(message, priority = 'polite') {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', priority);
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    
    document.body.appendChild(announcement);
    
    setTimeout(() => {
      if (document.body.contains(announcement)) {
        document.body.removeChild(announcement);
      }
    }, 1000);
  }
};

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new TruthInPoliticsApp();
});

// Export for use in other modules
window.TruthInPoliticsApp = TruthInPoliticsApp;
window.utils = utils;
