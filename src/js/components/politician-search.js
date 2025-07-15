// Politician Search Web Component

class PoliticianSearch extends HTMLElement {
  constructor() {
    super();
    this.politicians = [];
    this.searchTimeout = null;
    this.isLoading = false;
    this.dataLoaded = false;
    this.utils = this.getUtils();
  }

  // Local utilities in case global utils isn't available yet
  getUtils() {
    if (window.utils) {
      return window.utils;
    }
    
    // Fallback utilities
    return {
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
      
      sanitizeHTML(str) {
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
      },
      
      slugify(name) {
        return name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
      },
      
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
  }

  connectedCallback() {
    console.log('PoliticianSearch component connected');
    console.log('Component ready to initialize...');
    
    // Wait a tick to ensure DOM is ready
    setTimeout(() => {
      this.setupEventListeners();
      this.loadPoliticians();
    }, 0);
  }

  setupEventListeners() {
    const form = this.querySelector('.search-form');
    const input = this.querySelector('#politician-name');
    const resultsContainer = this.querySelector('.search-results');

    console.log('Setting up event listeners...', { form, input, resultsContainer });

    if (form && input) {
      // Handle form submission
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        console.log('Form submitted with value:', input.value.trim());
        this.handleSearch(input.value.trim());
      });

      // Handle input changes for live search
      input.addEventListener('input', this.utils.debounce((e) => {
        const query = e.target.value.trim();
        console.log('Input changed:', query);
        if (query.length >= 2) {
          this.performSearch(query);
        } else {
          this.clearResults();
        }
      }, 300));

      // Handle keyboard navigation in results
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.focusNextResult();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.focusPreviousResult();
        }
      });
    }
  }

  async loadPoliticians() {
    if (this.isLoading) {
      console.log('Already loading politicians, skipping...');
      return;
    }
    
    this.isLoading = true;
    console.log('Loading politicians from database...');
    console.log('Current URL:', window.location.href);
    console.log('Base URL:', window.location.origin);
    
    try {
      // Try multiple possible paths for the API endpoint
      const possiblePaths = [
        '/api/politicians.json',
        './api/politicians.json',
        `${window.location.origin}/api/politicians.json`
      ];
      
      let response = null;
      let successfulPath = null;
      
      for (const path of possiblePaths) {
        console.log(`Trying to fetch from: ${path}`);
        try {
          response = await fetch(path);
          console.log(`Response from ${path}:`, response.status, response.statusText);
          
          if (response.ok) {
            successfulPath = path;
            break;
          }
        } catch (fetchError) {
          console.log(`Failed to fetch from ${path}:`, fetchError.message);
        }
      }
      
      if (!response || !response.ok) {
        throw new Error(`All API paths failed. Last status: ${response?.status}`);
      }
      
      console.log(`✅ Successfully fetched from: ${successfulPath}`);
      const data = await response.json();
      console.log('Raw response data type:', typeof data);
      console.log('Raw response data length:', Array.isArray(data) ? data.length : 'Not an array');
      console.log('First few characters of response:', JSON.stringify(data).substring(0, 200));
      
      this.politicians = Array.isArray(data) ? data : [];
      this.dataLoaded = true;
      console.log(`✅ Loaded ${this.politicians.length} politicians from database`);
      
      if (this.politicians.length > 0) {
        console.log('Sample politician:', this.politicians[0]);
        
        // Check if Hawley is in the data
        const hawley = this.politicians.find(p => p.name && p.name.toLowerCase().includes('hawley'));
        console.log('Hawley found:', hawley);
        
        // Count total politicians by name search
        const hawleyMatches = this.politicians.filter(p => p.name && p.name.toLowerCase().includes('hawley'));
        console.log('Total Hawley matches:', hawleyMatches.length, hawleyMatches);
      }
    } catch (error) {
      console.error('Failed to load politicians:', error);
      console.error('Error details:', error.message, error.stack);
      this.utils.announce('Failed to load politician data. Please try again later.', 'assertive');
      
      // Fallback to empty array
      this.politicians = [];
      this.dataLoaded = false;
    } finally {
      this.isLoading = false;
    }
  }

  async fetchPoliticians() {
    // This method is deprecated - now using loadPoliticians() with API endpoint
    return [];
  }

  handleSearch(query) {
    if (!query) {
      this.utils.announce('Please enter a politician name to search.', 'assertive');
      return;
    }

    const results = this.performSearch(query);
    
    if (results.length === 1) {
      // If only one result, navigate directly
      this.navigateToPolitician(results[0]);
    } else if (results.length === 0) {
      this.utils.announce('No politicians found. Please try a different name.', 'assertive');
    } else {
      this.utils.announce(`Found ${results.length} politicians. Use arrow keys to navigate results.`, 'polite');
    }
  }

  performSearch(query) {
    console.log('Performing search for:', query);
    console.log('Politicians array length:', this.politicians.length);
    console.log('Data loaded:', this.dataLoaded);
    console.log('Is loading:', this.isLoading);
    
    const resultsContainer = this.querySelector('.search-results');
    
    if (!query || query.length < 2) {
      this.clearResults();
      return [];
    }

    // Check if data is still loading
    if (this.isLoading) {
      console.log('Data is still loading, showing loading message');
      resultsContainer.innerHTML = '<div class="loading">Loading politician data...</div>';
      return [];
    }

    // Check if data is loaded but empty
    if (!this.dataLoaded || this.politicians.length === 0) {
      console.warn('Politicians data not loaded yet or empty, retrying load...');
      resultsContainer.innerHTML = '<div class="loading">Loading politician data...</div>';
      
      // Retry loading data
      this.loadPoliticians().then(() => {
        if (this.politicians.length > 0) {
          console.log('Data loaded successfully on retry, performing search again');
          this.performSearch(query);
        }
      });
      return [];
    }

    const searchTerms = query.toLowerCase().split(' ');
    console.log('Search terms:', searchTerms);
    
    const results = this.politicians.filter(politician => {
      const fullName = politician.name.toLowerCase();
      const matches = searchTerms.every(term => fullName.includes(term));
      if (fullName.includes('hawley')) {
        console.log(`Testing ${fullName} against ${searchTerms}:`, matches);
      }
      return matches;
    });

    console.log('Search results:', results);
    this.displayResults(results);
    return results;
  }

  displayResults(results) {
    const resultsContainer = this.querySelector('.search-results');
    
    if (!resultsContainer) return;

    resultsContainer.innerHTML = '';

    if (results.length === 0) {
      resultsContainer.innerHTML = `
        <div class="no-results" role="status" aria-live="polite">
          <p>No politicians found. Please check the spelling and try again.</p>
          <p><small>Searching 554 current members of the 118th Congress (House & Senate)</small></p>
        </div>
      `;
      return;
    }

    results.forEach((politician, index) => {
      const resultElement = this.createResultElement(politician, index);
      resultsContainer.appendChild(resultElement);
    });

    // Announce results to screen readers
    this.utils.announce(`Found ${results.length} politician${results.length === 1 ? '' : 's'}.`);
  }

  createResultElement(politician, index) {
    const resultElement = document.createElement('button');
    resultElement.className = 'politician-result';
    resultElement.setAttribute('type', 'button');
    resultElement.setAttribute('data-politician-id', politician.id);
    resultElement.setAttribute('aria-label', 
      `Select ${politician.name}, ${politician.title} from ${politician.state}`);
    
    // Format district information
    const district = politician.district ? `, ${politician.district}` : '';
    const chamber = politician.chamber === 'House' ? 'Rep.' : 'Sen.';
    
    resultElement.innerHTML = `
      <span class="politician-result__name">${this.utils.sanitizeHTML(politician.name)}</span>
      <span class="politician-result__details">
        ${chamber} (${this.utils.sanitizeHTML(politician.party)}) - ${this.utils.sanitizeHTML(politician.state)}${this.utils.sanitizeHTML(district)}
      </span>
    `;

    resultElement.addEventListener('click', () => {
      this.navigateToPolitician(politician);
    });

    resultElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.navigateToPolitician(politician);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.focusNextResult(index);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.focusPreviousResult(index);
      }
    });

    return resultElement;
  }

  navigateToPolitician(politician) {
    // Use the politician's slug/id for the URL
    const url = `/politician/${politician.slug || politician.id}/`;
    
    this.utils.announce(`Loading profile for ${politician.name}...`);
    
    // Store politician data for the next page
    sessionStorage.setItem('currentPolitician', JSON.stringify(politician));
    
    // Navigate to politician page
    window.location.href = url;
  }

  focusNextResult(currentIndex = -1) {
    const results = this.querySelectorAll('.politician-result');
    if (results.length === 0) return;

    const nextIndex = currentIndex + 1;
    if (nextIndex < results.length) {
      results[nextIndex].focus();
    } else {
      // Loop back to first result
      results[0].focus();
    }
  }

  focusPreviousResult(currentIndex = 0) {
    const results = this.querySelectorAll('.politician-result');
    if (results.length === 0) return;

    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      results[prevIndex].focus();
    } else {
      // Loop to last result
      results[results.length - 1].focus();
    }
  }

  clearResults() {
    const resultsContainer = this.querySelector('.search-results');
    if (resultsContainer) {
      resultsContainer.innerHTML = '';
    }
  }
}

// Register the custom element
customElements.define('politician-search', PoliticianSearch);
